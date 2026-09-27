param([string]$Api = 'http://127.0.0.1:18081', [string]$Keycloak = 'http://127.0.0.1:18080')
$ErrorActionPreference = 'Stop'
$settings = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env')) {
    if ($line -match '^([^#=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}

function Get-TestToken([string]$username, [string]$password) {
    $result = Invoke-RestMethod -Uri "$Keycloak/realms/waylorn/protocol/openid-connect/token" `
        -Method Post -ContentType 'application/x-www-form-urlencoded' `
        -Body @{ client_id = 'waylorn-api'; grant_type = 'password'; username = $username; password = $password }
    return $result.access_token
}

function Send-Json([string]$method, [string]$path, [string]$token, $body, [hashtable]$extra = @{}) {
    $headers = @{ Authorization = "Bearer $token" }
    foreach ($key in $extra.Keys) { $headers[$key] = $extra[$key] }
    $args = @{ Uri = "$Api$path"; Method = $method; Headers = $headers; SkipHttpErrorCheck = $true }
    if ($null -ne $body) { $args.ContentType = 'application/json'; $args.Body = $body | ConvertTo-Json -Depth 8 }
    return Invoke-WebRequest @args
}

$admin = Get-TestToken 'waylorn-admin' $settings.WAYLORN_TEST_ADMIN_PASSWORD
$approver = Get-TestToken 'waylorn-approver' $settings.WAYLORN_TEST_APPROVER_PASSWORD
$site = $settings.WAYLORN_TEST_SITE_ID
$ready = Invoke-WebRequest -Uri "$Api/health/ready" -SkipHttpErrorCheck
if ($ready.StatusCode -ne 200) { throw "Readiness returned $($ready.StatusCode)." }
$unauthenticated = Invoke-WebRequest -Uri "$Api/api/v1/assets?siteId=$site" -SkipHttpErrorCheck
if ($unauthenticated.StatusCode -ne 401) { throw "Unauthenticated request returned $($unauthenticated.StatusCode)." }

$asset = Send-Json 'POST' '/api/v1/assets' $admin @{ siteId = $site; kind = 'Industrial'; name = "smoke-$([Guid]::NewGuid())" }
if ($asset.StatusCode -ne 201) { throw "Asset creation returned $($asset.StatusCode): $($asset.Content)" }
$assetId = ($asset.Content | ConvertFrom-Json).id
foreach ($attempt in 1..2) {
    $fetched = Send-Json 'GET' "/api/v1/assets/$assetId" $admin $null
    if ($fetched.StatusCode -ne 200 -or ($fetched.Content | ConvertFrom-Json).id -ne $assetId) {
        throw "Asset fetch $attempt failed."
    }
}
$listed = Send-Json 'GET' "/api/v1/assets?siteId=$site" $admin $null
if ($listed.StatusCode -ne 200) { throw "Asset listing returned $($listed.StatusCode)." }
$approverList = Send-Json 'GET' "/api/v1/assets?siteId=$site" $approver $null
if ($approverList.StatusCode -ne 403) { throw "Approver asset listing returned $($approverList.StatusCode)." }

$now = [DateTimeOffset]::UtcNow
$request = Send-Json 'POST' '/api/v1/commands' $admin @{
    assetId = $assetId; operation = 'ChangeConfiguration'; changeTicket = 'SMOKE-1'
    windowStartUtc = $now.AddMinutes(-1); windowEndUtc = $now.AddMinutes(5)
} @{ 'Idempotency-Key' = "smoke-$([Guid]::NewGuid())" }
if ($request.StatusCode -ne 201) { throw "Command request returned $($request.StatusCode): $($request.Content)" }
$commandId = ($request.Content | ConvertFrom-Json).id
$approval = Send-Json 'POST' "/api/v1/commands/$commandId/approve" $approver $null
if ($approval.StatusCode -ne 200) { throw "AMBER approval returned $($approval.StatusCode): $($approval.Content)" }
if (($approval.Content | ConvertFrom-Json).state -ne 'Approved') { throw 'Approval state did not persist.' }

$red = Send-Json 'POST' '/api/v1/commands' $admin @{
    assetId = $assetId; operation = 'Write'; changeTicket = 'SMOKE-RED'
    windowStartUtc = $now.AddMinutes(-1); windowEndUtc = $now.AddMinutes(5)
} @{ 'Idempotency-Key' = "smoke-$([Guid]::NewGuid())" }
if ($red.StatusCode -ne 201) { throw "RED request returned $($red.StatusCode)." }
$redId = ($red.Content | ConvertFrom-Json).id
$redApproval = Send-Json 'POST' "/api/v1/commands/$redId/approve" $approver $null
if ($redApproval.StatusCode -ne 409) { throw "RED approval without MFA returned $($redApproval.StatusCode)." }

Write-Output 'Live Keycloak + PostgreSQL smoke passed: readiness, JWT, asset CRUD, role denial, AMBER approval, RED denial.'
