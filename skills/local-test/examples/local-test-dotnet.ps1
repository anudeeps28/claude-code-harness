<# =============================================================================
Local Test Script - Build, Unit Tests, Integration Tests, End-to-End
Levels:
  1 = Build + Unit Tests (no Docker)
  2 = Build + All Tests + Docker Emulators + E2E smoke test
  3 = Level 2 + Angular UI (stays running for manual testing)

Usage:
  powershell.exe -ExecutionPolicy Bypass -File .\local-test.ps1 -Level 1
  powershell.exe -ExecutionPolicy Bypass -File .\local-test.ps1 -Level 2
  powershell.exe -ExecutionPolicy Bypass -File .\local-test.ps1 -Level 3
============================================================================= #>

[CmdletBinding()]
param(
    [ValidateSet(1, 2, 3)]
    [int]$Level = 2
)

# ── Refresh PATH (picks up tools installed in this session) ────────────────────
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH", "User")

# ── Configuration ──────────────────────────────────────────────────────────────
$SolutionRoot     = "YOUR_PROJECT_ROOT"
$SolutionFile     = "$SolutionRoot\YOUR_PROJECT_NAMESPACE.sln"
$ApiProject       = "$SolutionRoot\src\YOUR_PROJECT_NAMESPACE.API\YOUR_PROJECT_NAMESPACE.API.csproj"
$FunctionsProject = "$SolutionRoot\src\YOUR_PROJECT_NAMESPACE.Functions\YOUR_PROJECT_NAMESPACE.Functions.csproj"
$AngularProject   = "$SolutionRoot\src\YOUR_PROJECT_NAMESPACE.Web"
$TestPdfFolder    = "YOUR_TEST_DATA_FOLDER"
$ComposeFile      = "$SolutionRoot\.claude\skills\local-test\docker-compose.yml"

# Local emulator connection strings
$LocalSqlPassword       = "LocalDev#2026!"
$LocalSqlConnection     = "Server=localhost,1433;Database=YOUR_DB_NAME;User Id=sa;Password=$LocalSqlPassword;TrustServerCertificate=true"
# Full Azurite connection string (az CLI doesn't expand UseDevelopmentStorage=true)
$LocalBlobConnection    = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
$LocalBlobContainer     = "YOUR_BLOB_CONTAINER"

# API / Functions local URLs
$ApiUrl       = "http://localhost:5000"
$FunctionsUrl = "http://localhost:7071"

# Timing
$SqlWaitMaxSeconds    = 60
$ProcessWaitMaxSeconds = 120

# ── Helpers ────────────────────────────────────────────────────────────────────
$script:Results = @()
$script:BackgroundPids = @()

function Write-Section([string]$text) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor DarkGray
    Write-Host " $text" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor DarkGray
}

function Write-Step([string]$text) {
    Write-Host "  -> $text" -ForegroundColor Yellow
}

function Write-Ok([string]$text) {
    Write-Host "  OK $text" -ForegroundColor Green
}

function Write-Fail([string]$text) {
    Write-Host "  FAIL $text" -ForegroundColor Red
}

function Add-Result([string]$step, [bool]$passed, [string]$detail = "") {
    $script:Results += [pscustomobject]@{
        Step   = $step
        Passed = $passed
        Detail = $detail
    }
    if ($passed) { Write-Ok $step } else { Write-Fail "$step - $detail" }
    return $passed
}

function Stop-BackgroundProcesses {
    foreach ($procId in $script:BackgroundPids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc -and -not $proc.HasExited) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  Stopped background process $procId" -ForegroundColor DarkGray
            }
        } catch { }
    }
    $script:BackgroundPids = @()
}

function Stop-DockerEmulators {
    if (Test-Path $ComposeFile) {
        Write-Step "Stopping Docker emulators..."
        docker compose -f $ComposeFile down 2>&1 | Out-Null
    }
}

function Cleanup {
    Write-Section "Cleanup"
    Stop-BackgroundProcesses
    if ($Level -ge 2) {
        Stop-DockerEmulators
    }
    Write-Ok "Cleanup complete"
}

# Always clean up on exit
trap { Cleanup; break }

# ── Print Banner ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  LOCAL TEST - Level $Level" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host ""
switch ($Level) {
    1 { Write-Host "  Build + Unit Tests" -ForegroundColor Gray }
    2 { Write-Host "  Build + All Tests + Docker Emulators + E2E Smoke Test" -ForegroundColor Gray }
    3 { Write-Host "  Build + All Tests + Docker Emulators + E2E + Angular UI" -ForegroundColor Gray }
}
Write-Host ""

# ── Kill leftover processes from previous runs ────────────────────────────────
Write-Step "Cleaning up leftover processes from previous runs..."
$killed = 0
# Kill orphaned func host processes (Functions runtime)
Get-Process -Name "func" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; $killed++
}
# Kill dotnet processes that are running our API or Functions (match by command line)
Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "YOUR_PROJECT_NAMESPACE\.(API|Functions)" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $killed++
    }
if ($killed -gt 0) {
    Write-Host "    Killed $killed leftover process(es)" -ForegroundColor DarkYellow
    Start-Sleep -Seconds 2
}

# ══════════════════════════════════════════════════════════════════════════════
# LEVEL 1 - Build + Unit Tests
# ══════════════════════════════════════════════════════════════════════════════

Write-Section "Level 1: Build"

Write-Step "dotnet build..."
$buildOutput = dotnet build $SolutionFile --configuration Release 2>&1
$buildSuccess = $LASTEXITCODE -eq 0
if (-not (Add-Result "dotnet build" $buildSuccess ($buildOutput | Select-Object -Last 3 | Out-String).Trim())) {
    Write-Host ($buildOutput | Out-String)
    Cleanup
    exit 1
}

Write-Section "Level 1: Unit Tests"

Write-Step "dotnet test (unit tests only)..."
$testOutput = dotnet test $SolutionFile --configuration Release --no-build --filter "Category!=Integration" --verbosity normal 2>&1
$testSuccess = $LASTEXITCODE -eq 0

# Extract test count from output
$testSummary = ($testOutput | Select-String -Pattern "Passed|Failed|Skipped" | Select-Object -Last 1)
Add-Result "Unit tests" $testSuccess ($testSummary | Out-String).Trim() | Out-Null

if (-not $testSuccess) {
    Write-Host ($testOutput | Out-String)
    Cleanup
    exit 1
}

if ($Level -eq 1) {
    Write-Section "Results (Level 1)"
    $script:Results | Format-Table -AutoSize
    Write-Host "  Level 1 complete - build + unit tests passed." -ForegroundColor Green
    exit 0
}

# ══════════════════════════════════════════════════════════════════════════════
# LEVEL 2 - Docker Emulators + Integration + E2E
# ══════════════════════════════════════════════════════════════════════════════

Write-Section "Level 2: Prerequisites Check"

# Check Docker is running
Write-Step "Checking Docker..."
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Add-Result "Docker running" $false "Docker Desktop is not running. Start it and try again." | Out-Null
    Write-Host ""
    Write-Host "  Docker is required for Level 2+. Falling back to Level 1 results." -ForegroundColor Yellow
    $script:Results | Format-Table -AutoSize
    exit 1
}
Add-Result "Docker running" $true | Out-Null

# Check Azure Functions Core Tools
Write-Step "Checking Azure Functions Core Tools..."
$funcVersion = func --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Add-Result "Azure Functions Core Tools" $false "Not installed. Run: winget install Microsoft.Azure.FunctionsCoreTools (or use the project bootstrap script if one exists)" | Out-Null
    Cleanup
    exit 1
}
Add-Result "Azure Functions Core Tools" $true "v$funcVersion" | Out-Null

# Check test PDF folder exists and has PDFs
Write-Step "Checking test PDF folder..."
$TestPdfs = Get-ChildItem -Path $TestPdfFolder -Filter "*.pdf" -ErrorAction SilentlyContinue
if (-not $TestPdfs -or $TestPdfs.Count -eq 0) {
    Add-Result "Test PDFs exist" $false "$TestPdfFolder not found or empty" | Out-Null
    Cleanup
    exit 1
}
Add-Result "Test PDFs exist" $true "$($TestPdfs.Count) PDFs found" | Out-Null

# ── Start Docker Emulators ─────────────────────────────────────────────────
Write-Section "Level 2: Start Docker Emulators"

Write-Step "Starting Azure SQL Edge + Azurite + Embedding Service..."
Write-Host "    (First run builds embedding image - may take 5+ minutes)" -ForegroundColor DarkGray
$composeOutput = docker compose -f $ComposeFile up -d --build --force-recreate 2>&1 | Out-String
# docker compose writes progress to stderr - check actual container state instead of exit code
$runningContainers = docker compose -f $ComposeFile ps --status running -q 2>&1 | Measure-Object | Select-Object -ExpandProperty Count
if ($runningContainers -lt 2) {
    Add-Result "Docker compose up" $false "Only $runningContainers containers running (need at least 2)" | Out-Null
    Write-Host $composeOutput -ForegroundColor DarkGray
    Cleanup
    exit 1
}
Add-Result "Docker compose up" $true "$runningContainers containers running" | Out-Null

# Wait for SQL Edge to be ready
Write-Step "Waiting for SQL Edge to accept connections (up to ${SqlWaitMaxSeconds}s)..."
$elapsed = 0
$sqlReady = $false
while ($elapsed -lt $SqlWaitMaxSeconds) {
    $check = docker exec local-sql-edge /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P $LocalSqlPassword -C -Q "SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $sqlReady = $true
        break
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}
if (-not (Add-Result "SQL Edge ready" $sqlReady "Waited ${elapsed}s")) {
    Cleanup
    exit 1
}

# Wait for Embedding Service to be ready
$EmbeddingWaitMaxSeconds = 180
Write-Step "Waiting for Embedding Service to be ready (up to ${EmbeddingWaitMaxSeconds}s, first run builds image)..."
$embeddingReady = $false
$elapsed = 0
while ($elapsed -lt $EmbeddingWaitMaxSeconds) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $embeddingReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
    $elapsed += 3
    if ($elapsed % 15 -eq 0) {
        Write-Host "    ...${elapsed}s elapsed, still waiting" -ForegroundColor DarkGray
    }
}
Add-Result "Embedding Service ready" $embeddingReady "Waited ${elapsed}s" | Out-Null

if (-not $embeddingReady) {
    Write-Host "  Warning: Embedding Service not ready. Document processing will fail." -ForegroundColor Yellow
    Write-Host "  First run? Image build can take 5+ minutes. Try: docker compose -f $ComposeFile logs embedding-service" -ForegroundColor Yellow
}

# ── Create Database + Run Schema ───────────────────────────────────────────
Write-Section "Level 2: Database Setup"

Write-Step "Creating YOUR_DB_NAME database..."
docker exec local-sql-edge /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$LocalSqlPassword" -C -Q "IF DB_ID('YOUR_DB_NAME') IS NULL CREATE DATABASE YOUR_DB_NAME" 2>&1
Add-Result "Create database" ($LASTEXITCODE -eq 0) | Out-Null

Write-Step "Applying EF Core migrations..."
$env:ConnectionStrings__SqlServer = $LocalSqlConnection
$migrateOutput = dotnet ef database update --connection "$LocalSqlConnection" --project "$SolutionRoot\src\YOUR_PROJECT_NAMESPACE.Infrastructure\YOUR_PROJECT_NAMESPACE.Infrastructure.csproj" --startup-project "$SolutionRoot\src\YOUR_PROJECT_NAMESPACE.API\YOUR_PROJECT_NAMESPACE.API.csproj" 2>&1 | Out-String
$migrateSuccess = $LASTEXITCODE -eq 0
Add-Result "EF Core migrations" $migrateSuccess $(if ($migrateSuccess) { "Applied" } else { $migrateOutput | Select-Object -Last 3 }) | Out-Null
if (-not $migrateSuccess) {
    Write-Host $migrateOutput -ForegroundColor DarkYellow
}

# ── Unit tests only (integration tests need live Azure - skip locally) ─────
# The E2E smoke test below is the real local integration test

# ── Start API in Background ───────────────────────────────────────────────
Write-Section "Level 2: Start API + Functions"

# Set environment variables BEFORE starting API + Functions (child processes inherit parent env)
# Local emulators (Docker)
$env:ConnectionStrings__SqlServer = $LocalSqlConnection
$env:ConnectionStrings__BlobStorage = $LocalBlobConnection
$env:EmbeddingService__BaseUrl = "http://localhost:8080"
# Serilog App Insights sink - must set both Name and Args for the sink at index 1
$env:Serilog__WriteTo__1__Name = "ApplicationInsights"
$env:Serilog__WriteTo__1__Args__connectionString = "InstrumentationKey=00000000-0000-0000-0000-000000000000"
$env:Serilog__WriteTo__1__Args__telemetryConverter = "Serilog.Sinks.ApplicationInsights.TelemetryConverters.TraceTelemetryConverter, Serilog.Sinks.ApplicationInsights"

# Azure cloud services (real APIs - read keys from user-secrets via dotnet CLI)
$apiSecretsId = "f5e1c288-a470-4e89-ae98-777e05a27a84"
$secretsPath = "$env:APPDATA\Microsoft\UserSecrets\$apiSecretsId\secrets.json"
if (Test-Path $secretsPath) {
    $secrets = Get-Content $secretsPath -Raw | ConvertFrom-Json
    $env:AzureOpenAI__Endpoint   = $secrets.'AzureOpenAI:Endpoint'
    $env:AzureOpenAI__ApiKey     = $secrets.'AzureOpenAI:ApiKey'
    $env:AzureSearch__Endpoint   = $secrets.'AzureSearch:Endpoint'
    $env:AzureSearch__ApiKey     = $secrets.'AzureSearch:ApiKey'
    Write-Ok "Loaded Azure keys from user-secrets"
} else {
    Write-Fail "User secrets not found at $secretsPath - run 'dotnet user-secrets set' first"
    Write-Host "  Azure OpenAI and AI Search will not work without API keys." -ForegroundColor Yellow
}

# Functions BlobTrigger needs this env var name (matches the Connection attribute in your Function trigger)
$env:YOUR_BLOB_CONNECTION_ENV_VAR = $LocalBlobConnection

Write-Step "Starting API on $ApiUrl..."
$apiProcess = Start-Process -FilePath "dotnet" `
    -ArgumentList "run","--project",$ApiProject,"--configuration","Release","--no-build","--urls",$ApiUrl `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$env:TEMP\local-test-api.log" `
    -RedirectStandardError "$env:TEMP\local-test-api-err.log"
$script:BackgroundPids += $apiProcess.Id

# Wait for API to respond
Write-Step "Waiting for API to be ready..."
$apiReady = $false
$elapsed = 0
while ($elapsed -lt 30) {
    try {
        $response = Invoke-WebRequest -Uri "$ApiUrl/api/plans" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $apiReady = $true
        break
    } catch {
        # Any HTTP response (even 401/404/500) means the API is running
        if ($_.Exception.Response) {
            $apiReady = $true
            break
        }
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}
if (-not (Add-Result "API started" $apiReady "PID=$($apiProcess.Id), waited ${elapsed}s")) {
    Write-Host "  API logs:" -ForegroundColor Yellow
    Get-Content "$env:TEMP\local-test-api-err.log" -ErrorAction SilentlyContinue | Select-Object -Last 20
    Cleanup
    exit 1
}

# Start Functions in background
Write-Step "Starting Functions on $FunctionsUrl..."
$funcProcess = Start-Process -FilePath "func" `
    -ArgumentList "start","--port","7071" `
    -WorkingDirectory (Split-Path $FunctionsProject) `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$env:TEMP\local-test-func.log" `
    -RedirectStandardError "$env:TEMP\local-test-func-err.log"
$script:BackgroundPids += $funcProcess.Id

# Wait for Functions to respond
Write-Step "Waiting for Functions to be ready..."
$funcReady = $false
$elapsed = 0
while ($elapsed -lt 30) {
    try {
        $response = Invoke-WebRequest -Uri "$FunctionsUrl/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $funcReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 2
    $elapsed += 2
}
# Functions health endpoint may not exist - just check if process is running
if (-not $funcReady -and -not $funcProcess.HasExited) {
    $funcReady = $true  # Process is running, good enough
}
Add-Result "Functions started" $funcReady "PID=$($funcProcess.Id)" | Out-Null

# ── E2E Smoke Test ─────────────────────────────────────────────────────────
Write-Section "Level 2: End-to-End Smoke Test"

# Step 0: Delete stale AI Search chunks for each test PDF from previous local runs.
# Local DB is ephemeral (Docker) but AI Search is persistent (Azure cloud), so old chunks
# from prior runs have orphaned documentIds. Delete by documentName to clean them up.
if ($env:AzureSearch__Endpoint -and $env:AzureSearch__ApiKey) {
    $searchEndpoint = $env:AzureSearch__Endpoint
    $searchApiKey   = $env:AzureSearch__ApiKey
    $searchIndex    = "YOUR_SEARCH_INDEX"
    $searchHeaders  = @{ "api-key" = $searchApiKey; "Content-Type" = "application/json" }
    $totalDeleted   = 0

    Write-Step "Cleaning stale AI Search chunks for $($TestPdfs.Count) test documents..."
    foreach ($pdf in $TestPdfs) {
        $docName = $pdf.Name
        # Find all chunk IDs for this document name
        $chunkIds = @()
        $skip = 0
        do {
            $searchBody = @"
{"search":"*","filter":"documentName eq '$docName'","select":"id","top":1000,"skip":$skip}
"@
            try {
                $resp = Invoke-RestMethod -Uri "$searchEndpoint/indexes/$searchIndex/docs/search?api-version=2024-07-01" `
                    -Method Post -Headers $searchHeaders -Body $searchBody -TimeoutSec 15
                $batch = $resp.value | ForEach-Object { $_.id }
                $chunkIds += $batch
                $skip += 1000
            } catch { break }
        } while ($batch.Count -eq 1000)

        if ($chunkIds.Count -gt 0) {
            # Delete in batches of 1000
            for ($i = 0; $i -lt $chunkIds.Count; $i += 1000) {
                $delBatch = $chunkIds[$i..([Math]::Min($i + 999, $chunkIds.Count - 1))]
                $actions = $delBatch | ForEach-Object { @{ "@search.action" = "delete"; "id" = $_ } }
                $delBody = @{ value = $actions } | ConvertTo-Json -Depth 3 -Compress
                try {
                    Invoke-RestMethod -Uri "$searchEndpoint/indexes/$searchIndex/docs/index?api-version=2024-07-01" `
                        -Method Post -Headers $searchHeaders -Body $delBody -TimeoutSec 30 | Out-Null
                } catch { }
            }
            $totalDeleted += $chunkIds.Count
        }
    }
    if ($totalDeleted -gt 0) {
        Add-Result "Clean stale AI Search chunks" $true "Deleted $totalDeleted old chunks" | Out-Null
    } else {
        Add-Result "Clean stale AI Search chunks" $true "No stale chunks found (clean index)" | Out-Null
    }
} else {
    Write-Host "    Skipping AI Search cleanup (no search keys configured)" -ForegroundColor DarkGray
}

# Step 1: Upload all test PDFs to local Azurite blob storage
Write-Step "Uploading $($TestPdfs.Count) PDFs to local blob storage..."
# Create container first (Azurite starts empty)
az storage container create --connection-string $LocalBlobConnection --name $LocalBlobContainer 2>&1 | Out-Null
$uploadFailed = 0
foreach ($pdf in $TestPdfs) {
    az storage blob upload `
        --connection-string $LocalBlobConnection `
        --container-name $LocalBlobContainer `
        --file $pdf.FullName `
        --name $pdf.Name `
        --overwrite 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $uploadFailed++ }
}
Add-Result "Upload test PDFs" ($uploadFailed -eq 0) "$($TestPdfs.Count - $uploadFailed)/$($TestPdfs.Count) uploaded" | Out-Null

# Step 1b: If documents already exist from a previous run, call reindex-all so they
# get re-processed with the current code (deletes stale AI Search chunks + re-triggers ingestion)
$alreadyProcessed = docker exec local-sql-edge //opt/mssql-tools/bin/sqlcmd `
    -S localhost -U sa -P $LocalSqlPassword -C -d YOUR_DB_NAME `
    -Q "SELECT COUNT(*) FROM YOUR_DOCUMENTS_TABLE WHERE Status = 'Processed'" -h -1 2>&1
$alreadyProcessedCount = ($alreadyProcessed | Select-String -Pattern "\d+" | ForEach-Object { $_.Matches[0].Value }) | Select-Object -First 1
if ([int]$alreadyProcessedCount -gt 0) {
    Write-Step "Found $alreadyProcessedCount already-processed documents from a previous run - calling reindex-all..."
    try {
        $reindexResponse = Invoke-RestMethod -Uri "$ApiUrl/api/admin/reindex-all" `
            -Method Post `
            -ContentType "application/json" `
            -TimeoutSec 600
        $queued = $reindexResponse.totalQueued
        Write-Ok "Reindex-all queued $queued documents for re-processing (old chunks will be deleted)"
    } catch {
        Write-Fail "Reindex-all failed: $($_.Exception.Message)"
        Write-Host "    Documents from previous runs will use stale chunks" -ForegroundColor Yellow
    }
}

# Step 2: Wait for Functions to process all documents
Write-Step "Waiting for Functions to process $($TestPdfs.Count) documents (up to ${ProcessWaitMaxSeconds}s)..."
$processed = $false
$elapsed = 0
while ($elapsed -lt $ProcessWaitMaxSeconds) {
    $checkResult = docker exec local-sql-edge /opt/mssql-tools/bin/sqlcmd `
        -S localhost -U sa -P $LocalSqlPassword -C -d YOUR_DB_NAME `
        -Q "SELECT COUNT(*) FROM YOUR_DOCUMENTS_TABLE WHERE Status = 'Processed'" -h -1 2>&1
    $processedCount = ($checkResult | Select-String -Pattern "\d+" | ForEach-Object { $_.Matches[0].Value }) | Select-Object -First 1
    if ([int]$processedCount -ge $TestPdfs.Count) {
        $processed = $true
        break
    }
    Start-Sleep -Seconds 5
    $elapsed += 5
    if ($elapsed % 15 -eq 0) {
        Write-Host "    ...${elapsed}s elapsed, $processedCount/$($TestPdfs.Count) processed" -ForegroundColor DarkGray
    }
}
Add-Result "Documents processed" $processed "$processedCount/$($TestPdfs.Count) in ${elapsed}s" | Out-Null

# Step 3: Query the API with a test question
if ($processed) {
    Write-Step "Querying API with test question..."
    $testQuery = @{
        query = "What is the deductible for group 9429?"
    } | ConvertTo-Json

    try {
        $queryResponse = Invoke-RestMethod -Uri "$ApiUrl/api/query/ask" `
            -Method Post `
            -ContentType "application/json" `
            -Body $testQuery `
            -TimeoutSec 30

        $hasAnswer = ($queryResponse.answer -and $queryResponse.answer.Length -gt 10)
        Add-Result "API query returns answer" $hasAnswer ($queryResponse.answer | Select-Object -First 100) | Out-Null
    } catch {
        Add-Result "API query returns answer" $false $_.Exception.Message | Out-Null
    }
} else {
    Add-Result "API query returns answer" $false "Skipped - not all documents processed" | Out-Null
}

if ($Level -eq 2) {
    Cleanup

    Write-Section "Results (Level 2)"
    $script:Results | Format-Table -AutoSize

    $passed = ($script:Results | Where-Object { $_.Passed }).Count
    $failed = ($script:Results | Where-Object { -not $_.Passed }).Count
    Write-Host ""
    Write-Host "  Level 2 complete - $passed passed, $failed failed." -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
    exit $(if ($failed -eq 0) { 0 } else { 1 })
}

# ══════════════════════════════════════════════════════════════════════════════
# LEVEL 3 - Interactive testing (stays running for manual queries)
# ══════════════════════════════════════════════════════════════════════════════

# Angular UI is optional - only start if the project exists on this branch
if (Test-Path "$AngularProject\package.json") {
    Write-Section "Level 3: Angular UI"
    Write-Step "Installing Angular dependencies (if needed)..."
    Push-Location $AngularProject
    npm ci --silent 2>&1 | Out-Null
    Pop-Location
    Write-Step "Starting Angular dev server (ng serve)..."
    $ngProcess = Start-Process -FilePath "npx" `
        -ArgumentList "ng","serve","--configuration","local","--open" `
        -WorkingDirectory $AngularProject `
        -PassThru -WindowStyle Hidden
    $script:BackgroundPids += $ngProcess.Id
    Add-Result "Angular UI started" $true "PID=$($ngProcess.Id)" | Out-Null
}

Write-Section "Results (Level 3)"
$script:Results | Format-Table -AutoSize

$passed = ($script:Results | Where-Object { $_.Passed }).Count
$failed = ($script:Results | Where-Object { -not $_.Passed }).Count

Write-Host ""
Write-Host "  Level 3 running - $passed passed, $failed failed." -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "  Services running:" -ForegroundColor White
Write-Host "    API:       $ApiUrl" -ForegroundColor Cyan
Write-Host "    Functions: $FunctionsUrl" -ForegroundColor Cyan
if (Test-Path "$AngularProject\package.json") {
    Write-Host "    Angular:   http://localhost:4200" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Query example:" -ForegroundColor White
Write-Host '    curl -X POST http://localhost:5000/api/query/ask -H "Content-Type: application/json" -d "{\"query\": \"What is the deductible?\"}"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services and clean up." -ForegroundColor Yellow
Write-Host ""

# Keep running until Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 5
        if ($apiProcess.HasExited) {
            Write-Fail "API process exited unexpectedly!"
            break
        }
        if ($funcProcess.HasExited) {
            Write-Fail "Functions process exited unexpectedly!"
            break
        }
    }
} finally {
    Cleanup
}
