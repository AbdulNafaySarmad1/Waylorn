param([string]$Api = 'http://127.0.0.1:18081')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$settings = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env')) {
    if ($line -match '^([^#=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
$issuer = 'http://127.0.0.1:18080/realms/waylorn'
$admin = Invoke-RestMethod -Uri "$issuer/protocol/openid-connect/token" -Method Post -Body @{
    grant_type = 'password'; client_id = 'waylorn-api'; username = 'waylorn-admin'
    password = $settings.WAYLORN_TEST_ADMIN_PASSWORD
}
$asset = Invoke-RestMethod -Uri "$Api/api/v1/assets" -Method Post -Headers @{ Authorization = "Bearer $($admin.access_token)" } `
    -ContentType 'application/json' -Body (@{
        siteId = $settings.WAYLORN_TEST_SITE_ID; kind = 'Industrial'; name = 'Modbus simulator observation'
    } | ConvertTo-Json)

$env:WAYLORN_OT_READER = Join-Path $root 'crates/ot-core/target/x86_64-pc-windows-gnu/release/ot-observe.exe'
$env:WAYLORN_MODBUS_ADDRESS = '127.0.0.1:15020'
$env:WAYLORN_MODBUS_UNIT = '1'
$env:WAYLORN_MODBUS_KIND = 'holding'
$env:WAYLORN_MODBUS_START = '10'
$env:WAYLORN_MODBUS_COUNT = '1'
$env:WAYLORN_POLL_INTERVAL_MS = '1000'
$env:WAYLORN_SITE_ID = $settings.WAYLORN_TEST_SITE_ID
$env:WAYLORN_ASSET_ID = $asset.id
$env:WAYLORN_API_URL = $Api
$env:WAYLORN_OIDC_ISSUER = $issuer
$env:WAYLORN_OIDC_CLIENT_ID = 'waylorn-agent'
$env:WAYLORN_OIDC_CLIENT_SECRET = $settings.WAYLORN_AGENT_CLIENT_SECRET
$env:WAYLORN_SPOOL_DIR = Join-Path $PSScriptRoot 'spool'
$env:WAYLORN_ALLOW_HTTP_LOOPBACK = 'true'
$gateway = Join-Path $root 'src/network-plane/waylorn-gateway/bin/waylorn-gateway.exe'
if (-not (Test-Path -LiteralPath $gateway) -or -not (Test-Path -LiteralPath $env:WAYLORN_OT_READER)) {
    throw 'Build the Rust ot-observe and Go waylorn-gateway binaries before running this smoke test.'
}
$simulator = Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-File', "`"$(Join-Path $PSScriptRoot 'modbus-sim.ps1')`"") `
    -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Milliseconds 700
    & $gateway --once
    if ($LASTEXITCODE -ne 0) { throw "Go site gateway exited with $LASTEXITCODE." }
    $snapshot = Invoke-RestMethod -Uri "$Api/api/v0/orgs/$($settings.WAYLORN_TEST_ORG_ID)/assets/$($asset.id)/live" `
        -Headers @{ Authorization = "Bearer $($admin.access_token)" }
    $signal = @($snapshot.signals | Where-Object { $_.key -eq 'modbus.holding.10' })
    if ($signal.Count -ne 1 -or $signal[0].value -ne 4660) { throw 'Rust/Go/.NET telemetry value did not round-trip.' }
    Write-Output "OT loopback integration passed: simulator -> Rust -> Go -> Keycloak -> .NET -> PostgreSQL -> API. Asset: $($asset.id)"
} finally {
    if (-not $simulator.HasExited) { Stop-Process -Id $simulator.Id -Force }
}
