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
$eventing = Invoke-WebRequest -Uri "$Api/health/eventing" -SkipHttpErrorCheck
if ($eventing.StatusCode -ne 200 -or ($eventing.Content | ConvertFrom-Json).status -ne 'ready') {
    throw "Eventing health returned $($eventing.StatusCode)."
}
$organization = Send-Json 'GET' '/api/v1/organization' $admin $null
if ($organization.StatusCode -eq 404) {
    $createdOrg = Send-Json 'POST' '/api/v1/organization' $admin @{ slug = 'waylorn-local'; name = 'Waylorn Local Lab' }
    if ($createdOrg.StatusCode -ne 201) { throw "Organization creation returned $($createdOrg.StatusCode)." }
} elseif ($organization.StatusCode -ne 200) { throw "Organization lookup returned $($organization.StatusCode)." }
$sites = Send-Json 'GET' '/api/v1/sites' $admin $null
if ($sites.StatusCode -ne 200) { throw "Site list returned $($sites.StatusCode)." }
$existingSite = @($sites.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $site }
if (-not $existingSite) {
    $createdSite = Send-Json 'POST' '/api/v1/sites' $admin @{
        id = $site; code = 'LOCAL-1'; name = 'Local Test Plant'; regionName = 'Local';
        timezone = 'UTC'; environment = 'lab'
    }
    if ($createdSite.StatusCode -ne 201) { throw "Site creation returned $($createdSite.StatusCode): $($createdSite.Content)" }
}
$zones = Send-Json 'GET' "/api/v1/sites/$site/zones" $admin $null
if ($zones.StatusCode -ne 200) { throw "Zone list returned $($zones.StatusCode)." }
$existingZone = @($zones.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $settings.WAYLORN_TEST_ZONE_ID }
if (-not $existingZone) {
    $createdZone = Send-Json 'POST' "/api/v1/sites/$site/zones" $admin @{
        id = $settings.WAYLORN_TEST_ZONE_ID; code = 'LAB-1'; name = 'Test Bench'
    }
    if ($createdZone.StatusCode -ne 201) { throw "Zone creation returned $($createdZone.StatusCode)." }
}
$webMe = Send-Json 'GET' '/api/v0/me' $admin $null
if ($webMe.StatusCode -ne 200 -or ($webMe.Content | ConvertFrom-Json).organizations[0].id -ne $settings.WAYLORN_TEST_ORG_ID) {
    throw 'Frontend identity contract failed.'
}
$webSites = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/sites" $admin $null
if ($webSites.StatusCode -ne 200 -or -not @(($webSites.Content | ConvertFrom-Json).items | Where-Object { $_.id -eq $site }).Count) {
    throw 'Frontend site contract failed.'
}
$webRegions = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/hierarchy" $admin $null
if ($webRegions.StatusCode -ne 200) { throw 'Frontend hierarchy root failed.' }
$regionId = ($webRegions.Content | ConvertFrom-Json).items[0].id
$webSiteNodes = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/hierarchy?parentId=$([uri]::EscapeDataString($regionId))" $admin $null
if ($webSiteNodes.StatusCode -ne 200 -or ($webSiteNodes.Content | ConvertFrom-Json).items[0].id -ne $site) {
    throw 'Frontend hierarchy site level failed.'
}
$unauthenticated = Invoke-WebRequest -Uri "$Api/api/v1/assets?siteId=$site" -SkipHttpErrorCheck
if ($unauthenticated.StatusCode -ne 401) { throw "Unauthenticated request returned $($unauthenticated.StatusCode)." }

$asset = Send-Json 'POST' '/api/v1/assets' $admin @{ siteId = $site; kind = 'Industrial'; name = "smoke-$([Guid]::NewGuid())" }
if ($asset.StatusCode -ne 201) { throw "Asset creation returned $($asset.StatusCode): $($asset.Content)" }
$assetId = ($asset.Content | ConvertFrom-Json).id
$webAssets = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets?siteId=$site&limit=1" $admin $null
if ($webAssets.StatusCode -ne 200 -or ($webAssets.Content | ConvertFrom-Json).items.Count -ne 1) {
    throw 'Frontend asset-list contract failed.'
}
$webAsset = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets/$assetId" $admin $null
if ($webAsset.StatusCode -ne 200 -or ($webAsset.Content | ConvertFrom-Json).lifecycle -ne 'unknown') {
    throw 'Frontend asset-detail contract failed.'
}
$actions = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets/$assetId/actions" $admin $null
if ($actions.StatusCode -ne 200 -or ($actions.Content | ConvertFrom-Json).items.Count -ne 0) {
    throw 'Asset action availability must be empty until dispatch exists.'
}
$deniedWebAssets = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets?siteId=$site" $approver $null
if ($deniedWebAssets.StatusCode -ne 403) { throw 'Frontend asset-list role enforcement failed.' }
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
$compute = Send-Json 'POST' '/api/v1/assets' $admin @{ siteId = $site; kind = 'Compute'; name = "smoke-edge-$([Guid]::NewGuid())" }
if ($compute.StatusCode -ne 201) { throw "Compute asset creation returned $($compute.StatusCode)." }
$computeId = ($compute.Content | ConvertFrom-Json).id
$request = Send-Json 'POST' '/api/v1/commands' $admin @{
    assetId = $computeId; operation = 'ChangeConfiguration'; changeTicket = 'SMOKE-1'
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
if ($red.StatusCode -ne 403) { throw "RED request returned $($red.StatusCode)." }
$industrialConfig = Send-Json 'POST' '/api/v1/commands' $admin @{
    assetId = $assetId; operation = 'ChangeConfiguration'; changeTicket = 'SMOKE-OT'
    windowStartUtc = $now.AddMinutes(-1); windowEndUtc = $now.AddMinutes(5)
} @{ 'Idempotency-Key' = "smoke-$([Guid]::NewGuid())" }
if ($industrialConfig.StatusCode -ne 403) { throw "Industrial configuration request returned $($industrialConfig.StatusCode)." }

$dependency = Send-Json 'POST' '/api/v1/relationships' $admin @{
    sourceAssetId = $computeId; targetAssetId = $assetId; kind = 'DependsOn'
}
if ($dependency.StatusCode -ne 201) { throw "Dependency creation returned $($dependency.StatusCode)." }
$graph = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/topology/neighborhood?focus=$assetId&depth=1&nodeLimit=10" $admin $null
if ($graph.StatusCode -ne 200 -or -not @(($graph.Content | ConvertFrom-Json).nodes | Where-Object { $_.id -eq $computeId }).Count) {
    throw 'Topology neighborhood did not include the compute dependency.'
}
$impact = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/topology/impact?assetId=$assetId&direction=downstream" $admin $null
if ($impact.StatusCode -ne 200 -or -not @(($impact.Content | ConvertFrom-Json).affected | Where-Object { $_.node.id -eq $computeId }).Count) {
    throw 'Dependency impact did not include the compute asset.'
}

$auditPage = Send-Json 'GET' "/api/v1/audit?siteId=$site&limit=1" $admin $null
if ($auditPage.StatusCode -ne 200) { throw "Audit query returned $($auditPage.StatusCode): $($auditPage.Content)" }
$firstAudit = $auditPage.Content | ConvertFrom-Json
if ($firstAudit.items.Count -ne 1 -or -not $firstAudit.nextCursor) { throw 'Audit pagination failed.' }
$integrity = Send-Json 'GET' "/api/v1/audit/$($firstAudit.items[0].id)/verify" $admin $null
if ($integrity.StatusCode -ne 200 -or ($integrity.Content | ConvertFrom-Json).state -ne 'verified') {
    throw 'New audit record did not verify with the local signing key.'
}
$nextAudit = Send-Json 'GET' "/api/v1/audit?siteId=$site&limit=1&cursor=$($firstAudit.nextCursor)" $admin $null
if ($nextAudit.StatusCode -ne 200) { throw "Audit cursor returned $($nextAudit.StatusCode): $($nextAudit.Content)" }
if (($nextAudit.Content | ConvertFrom-Json).items[0].id -eq $firstAudit.items[0].id) { throw 'Audit cursor repeated a row.' }
$deniedAudit = Send-Json 'GET' "/api/v1/audit?siteId=$site" $approver $null
if ($deniedAudit.StatusCode -ne 403) { throw "Approver audit query returned $($deniedAudit.StatusCode)." }

$incident = Send-Json 'POST' '/api/v1/incidents' $admin @{
    siteId = $site; assetIds = @($assetId); title = 'Local smoke incident'; severity = 'Notice'
}
if ($incident.StatusCode -ne 201) { throw "Incident creation returned $($incident.StatusCode): $($incident.Content)" }
$incidentId = ($incident.Content | ConvertFrom-Json).id
$overview = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/overview" $admin $null
$siteOverview = ($overview.Content | ConvertFrom-Json).sites | Where-Object { $_.site.id -eq $site }
if ($overview.StatusCode -ne 200 -or -not $siteOverview -or $siteOverview.openIncidents.notice -lt 1 -or
    $siteOverview.assetHealth.unknown -lt 1) {
    throw 'Live overview did not reflect registered assets and incidents.'
}
$incidentPage = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/incidents?status=open" $admin $null
$incidentItems = ($incidentPage.Content | ConvertFrom-Json).items
if ($incidentPage.StatusCode -ne 200 -or -not @($incidentItems | Where-Object { $_.id -eq $incidentId }).Count) {
    throw 'Incident frontend list failed.'
}
$acknowledged = Send-Json 'PATCH' "/api/v1/incidents/$incidentId" $admin @{ state = 'Acknowledged'; version = 1 }
if ($acknowledged.StatusCode -ne 200) { throw "Incident transition returned $($acknowledged.StatusCode)." }
$order = Send-Json 'POST' '/api/v1/work-orders' $admin @{
    assetId = $assetId; title = 'Inspect local simulator asset'; type = 'Inspection'
}
if ($order.StatusCode -ne 201) { throw "Work-order creation returned $($order.StatusCode)." }
$orderId = ($order.Content | ConvertFrom-Json).id
$scheduled = Send-Json 'PATCH' "/api/v1/work-orders/$orderId" $admin @{ state = 'Scheduled'; version = 1 }
if ($scheduled.StatusCode -ne 200) { throw "Work-order transition returned $($scheduled.StatusCode)." }
$maintenance = Send-Json 'GET' "/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets/$assetId/maintenance" $admin $null
if ($maintenance.StatusCode -ne 200 -or ($maintenance.Content | ConvertFrom-Json).items[0].status -ne 'scheduled') {
    throw 'Maintenance frontend list failed.'
}

Write-Output 'Live Keycloak + PostgreSQL smoke passed: readiness, JWT, inventory, approval, audit, incident, maintenance, topology and overview.'
