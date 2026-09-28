param([string]$BaseUrl = 'http://127.0.0.1:18080')
$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Create deploy/dev/.env first.' }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^([^#=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
foreach ($key in @('WAYLORN_TEST_ADMIN_PASSWORD', 'WAYLORN_TEST_APPROVER_PASSWORD', 'WAYLORN_TEST_PASSWORD_APPROVER_PASSWORD',
    'WAYLORN_TEST_APPROVER_TOTP_SECRET', 'WAYLORN_WEB_CLIENT_SECRET', 'WAYLORN_AGENT_CLIENT_SECRET')) {
    if (-not $settings.ContainsKey($key)) {
        $settings[$key] = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        Add-Content -LiteralPath $envPath -Value "$key=$($settings[$key])"
    }
}
foreach ($key in @('WAYLORN_TEST_ORG_ID', 'WAYLORN_TEST_SITE_ID', 'WAYLORN_TEST_ZONE_ID')) {
    if (-not $settings.ContainsKey($key)) {
        $settings[$key] = [Guid]::NewGuid().ToString()
        Add-Content -LiteralPath $envPath -Value "$key=$($settings[$key])"
    }
}

$token = Invoke-RestMethod -Uri "$BaseUrl/realms/master/protocol/openid-connect/token" `
    -Method Post -ContentType 'application/x-www-form-urlencoded' `
    -Body @{ client_id = 'admin-cli'; grant_type = 'password'; username = 'admin'; password = $settings.WAYLORN_KC_ADMIN_PASSWORD }
$headers = @{ Authorization = "Bearer $($token.access_token)" }

try { $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn" -Headers $headers }
catch {
    if ($_.Exception.Response.StatusCode -ne 404) { throw }
    $realm = @{ realm = 'waylorn'; enabled = $true; sslRequired = 'none' } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms" -Method Post -Headers $headers -ContentType 'application/json' -Body $realm
}

# Local test attributes are administrator-managed. Production realms should
# define each attribute and its validation in the user profile schema.
$profile = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/profile" -Headers $headers
$profile | Add-Member -NotePropertyName unmanagedAttributePolicy -NotePropertyValue 'ADMIN_EDIT' -Force
$null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/profile" -Method Put -Headers $headers -ContentType 'application/json' -Body ($profile | ConvertTo-Json -Depth 20)

# The amr claim lists the reference values of the authenticators that actually ran (below), so the API
# can require a verified second factor for approval instead of trusting a role (ADR 0032).
$amrMapper = @{ name = 'waylorn-amr'; protocol = 'openid-connect'; protocolMapper = 'oidc-amr-mapper'; config = @{ 'access.token.claim' = 'true'; 'id.token.claim' = 'false'; 'introspection.token.claim' = 'true' } }
$mappers = @(
    @{ name = 'waylorn-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper'; config = @{ 'included.client.audience' = 'waylorn-api'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' } },
    $amrMapper
)
foreach ($attribute in @('org_id', 'site_id', 'waylorn_role', 'principal_type')) {
    $mappers += @{ name = "waylorn-$attribute"; protocol = 'openid-connect'; protocolMapper = 'oidc-usermodel-attribute-mapper'; config = @{ 'user.attribute' = $attribute; 'claim.name' = $attribute; 'jsonType.label' = 'String'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false'; 'multivalued' = 'false' } }
}
if (-not $settings.ContainsKey('WAYLORN_AUDIT_KEY_ID')) {
    $settings.WAYLORN_AUDIT_KEY_ID = 'local-v1'
    Add-Content -LiteralPath $envPath -Value "WAYLORN_AUDIT_KEY_ID=$($settings.WAYLORN_AUDIT_KEY_ID)"
}
if (-not $settings.ContainsKey('WAYLORN_AUDIT_SIGNING_KEY')) {
    $settings.WAYLORN_AUDIT_SIGNING_KEY = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    Add-Content -LiteralPath $envPath -Value "WAYLORN_AUDIT_SIGNING_KEY=$($settings.WAYLORN_AUDIT_SIGNING_KEY)"
}

$clients = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients?clientId=waylorn-api" -Headers $headers | Where-Object { $_.clientId -eq 'waylorn-api' })
if ($clients.Count -eq 0) {
    $client = @{ clientId = 'waylorn-api'; enabled = $true; protocol = 'openid-connect'; publicClient = $true; directAccessGrantsEnabled = $true; standardFlowEnabled = $false; protocolMappers = $mappers } | ConvertTo-Json -Depth 12
    $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients" -Method Post -Headers $headers -ContentType 'application/json' -Body $client
}

$webClients = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients?clientId=waylorn-web" -Headers $headers | Where-Object { $_.clientId -eq 'waylorn-web' })
if ($webClients.Count -eq 0) {
    $webClient = @{
        clientId = 'waylorn-web'; enabled = $true; protocol = 'openid-connect'
        publicClient = $false; secret = $settings.WAYLORN_WEB_CLIENT_SECRET
        directAccessGrantsEnabled = $false; standardFlowEnabled = $true
        redirectUris = @('http://localhost:3000/auth/callback')
        webOrigins = @('http://localhost:3000')
        protocolMappers = $mappers
    } | ConvertTo-Json -Depth 12
    $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients" -Method Post -Headers $headers -ContentType 'application/json' -Body $webClient
}

$agentClients = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients?clientId=waylorn-agent" -Headers $headers | Where-Object { $_.clientId -eq 'waylorn-agent' })
if ($agentClients.Count -eq 0) {
    $agentClient = @{
        clientId = 'waylorn-agent'; enabled = $true; protocol = 'openid-connect'
        publicClient = $false; secret = $settings.WAYLORN_AGENT_CLIENT_SECRET
        serviceAccountsEnabled = $true; directAccessGrantsEnabled = $false; standardFlowEnabled = $false
        protocolMappers = $mappers
    } | ConvertTo-Json -Depth 12
    $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients" -Method Post -Headers $headers -ContentType 'application/json' -Body $agentClient
    $agentClients = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients?clientId=waylorn-agent" -Headers $headers | Where-Object { $_.clientId -eq 'waylorn-agent' })
}
foreach ($clientId in @('waylorn-api', 'waylorn-web')) {
    $existing = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients?clientId=$clientId" -Headers $headers | Where-Object { $_.clientId -eq $clientId })[0]
    # Invoke-RestMethod emits a JSON array as one object; assigning it first makes the pipeline enumerate items.
    $models = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients/$($existing.id)/protocol-mappers/models" -Headers $headers
    if (-not @($models | Where-Object { $_.protocolMapper -eq 'oidc-amr-mapper' }).Count) {
        $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients/$($existing.id)/protocol-mappers/models" -Method Post -Headers $headers -ContentType 'application/json' -Body ($amrMapper | ConvertTo-Json -Depth 5)
    }
}

# Keycloak emits amr values only for authenticators with an authentication reference configured.
foreach ($flow in @(
    @{ alias = 'direct%20grant'; name = 'direct'; references = @{ 'direct-grant-validate-password' = 'pwd'; 'direct-grant-validate-otp' = 'otp' } },
    @{ alias = 'browser'; name = 'browser'; references = @{ 'auth-username-password-form' = 'pwd'; 'auth-otp-form' = 'otp' } }
)) {
    $executions = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/authentication/flows/$($flow.alias)/executions" -Headers $headers
    foreach ($execution in $executions) {
        if (-not $execution.providerId -or $execution.authenticationConfig) { continue }
        $reference = $flow.references[$execution.providerId]
        if (-not $reference) { continue }
        $config = @{ alias = "waylorn-amr-$($flow.name)-$reference"; config = @{ 'default.reference.value' = $reference } } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/authentication/executions/$($execution.id)/config" -Method Post -Headers $headers -ContentType 'application/json' -Body $config
    }
}

$serviceUser = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/clients/$($agentClients[0].id)/service-account-user" -Headers $headers
$serviceUser | Add-Member -NotePropertyName attributes -NotePropertyValue @{
    org_id = @($settings.WAYLORN_TEST_ORG_ID)
    site_id = @($settings.WAYLORN_TEST_SITE_ID)
    waylorn_role = @('SiteAgent')
    principal_type = @('workload')
} -Force
$null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/$($serviceUser.id)" -Method Put -Headers $headers -ContentType 'application/json' -Body ($serviceUser | ConvertTo-Json -Depth 12)

foreach ($entry in @(
    @{ username = 'waylorn-admin'; role = 'Administrator'; password = $settings.WAYLORN_TEST_ADMIN_PASSWORD },
    @{ username = 'waylorn-approver'; role = 'Approver'; password = $settings.WAYLORN_TEST_APPROVER_PASSWORD },
    @{ username = 'waylorn-password-approver'; role = 'Approver'; password = $settings.WAYLORN_TEST_PASSWORD_APPROVER_PASSWORD }
)) {
    $users = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users?username=$($entry.username)&exact=true" -Headers $headers | Where-Object { $_.username -eq $entry.username })
    if ($users.Count -eq 0) {
        $user = @{
            username = $entry.username; enabled = $true; firstName = 'Waylorn'; lastName = 'Test'
            email = "$($entry.username)@example.test"; emailVerified = $true; requiredActions = @()
            attributes = @{ org_id = @($settings.WAYLORN_TEST_ORG_ID); site_id = @($settings.WAYLORN_TEST_SITE_ID); waylorn_role = @($entry.role); principal_type = @('human') }
            credentials = @(@{ type = 'password'; value = $entry.password; temporary = $false })
        } | ConvertTo-Json -Depth 12
        $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users" -Method Post -Headers $headers -ContentType 'application/json' -Body $user
    }
    else {
        $user = @{
            username = $entry.username; enabled = $true; firstName = 'Waylorn'; lastName = 'Test'
            email = "$($entry.username)@example.test"; emailVerified = $true; requiredActions = @()
            attributes = @{ org_id = @($settings.WAYLORN_TEST_ORG_ID); site_id = @($settings.WAYLORN_TEST_SITE_ID); waylorn_role = @($entry.role); principal_type = @('human') }
        } | ConvertTo-Json -Depth 12
        $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/$($users[0].id)" -Method Put -Headers $headers -ContentType 'application/json' -Body $user
    }
}

# The approver has a TOTP second factor, so Keycloak demands a code at every login and the token carries
# amr ["pwd","otp"]. The seeded secret replaces any earlier OTP credential so the smoke test can compute codes.
# The password-only approver stays without one to prove that a weak session is still denied.
$approverUser = @(Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users?username=waylorn-approver&exact=true" -Headers $headers | Where-Object { $_.username -eq 'waylorn-approver' })[0]
$credentials = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/$($approverUser.id)/credentials" -Headers $headers
foreach ($credential in @($credentials | Where-Object { $_.type -eq 'otp' })) {
    $null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/$($approverUser.id)/credentials/$($credential.id)" -Method Delete -Headers $headers
}
$otp = @{ credentials = @(@{
    type = 'otp'; userLabel = 'local smoke TOTP'
    secretData = (@{ value = $settings.WAYLORN_TEST_APPROVER_TOTP_SECRET } | ConvertTo-Json -Compress)
    credentialData = (@{ subType = 'totp'; digits = 6; period = 30; algorithm = 'HmacSHA1'; counter = 0 } | ConvertTo-Json -Compress)
}) } | ConvertTo-Json -Depth 5
$null = Invoke-RestMethod -Uri "$BaseUrl/admin/realms/waylorn/users/$($approverUser.id)" -Method Put -Headers $headers -ContentType 'application/json' -Body $otp

$webEnvPath = Join-Path $PSScriptRoot '../../apps/web/.env.development.local'
@"
WAYLORN_PUBLIC_ORIGIN=http://localhost:3000
WAYLORN_API_BASE_URL=http://127.0.0.1:18081
WAYLORN_OIDC_ISSUER=http://127.0.0.1:18080/realms/waylorn
WAYLORN_OIDC_CLIENT_ID=waylorn-web
WAYLORN_OIDC_CLIENT_SECRET=$($settings.WAYLORN_WEB_CLIENT_SECRET)
WAYLORN_HSTS_MAX_AGE=0
"@ | Set-Content -LiteralPath $webEnvPath

Write-Output "Keycloak realm, web client, site agent, and TOTP approver ready. Test organization: $($settings.WAYLORN_TEST_ORG_ID); site: $($settings.WAYLORN_TEST_SITE_ID)."
