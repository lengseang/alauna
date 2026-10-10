$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "CHIWIWI SOVEREIGN APK RELEASE BUILD PIPELINE"
Write-Host "=========================================="

$env:ANDROID_HOME = "C:\Users\BAMBOO\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\BAMBOO\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

$androidDir = "D:\1111-Works\CHIWIWI\mobile\android"
Set-Location $androidDir

$apkSource = "D:\1111-Works\CHIWIWI\mobile\android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkSource) {
    Remove-Item -Path $apkSource -Force
}

Write-Host "[1/3] Running gradlew.bat assembleRelease (--max-workers=2, --no-parallel)..."
& .\gradlew.bat assembleRelease --no-daemon --max-workers=2 --no-parallel
if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

if (-not (Test-Path $apkSource)) {
    Write-Error "Release APK not found at $apkSource"
    exit 1
}

$apkDestMobile = "D:\1111-Works\CHIWIWI\mobile\chiwiwi-v0.10.apk"
$apkDestRoot = "D:\1111-Works\CHIWIWI\chiwiwi-v0.10.apk"

Write-Host "[2/3] Copying APK to destination releases..."
Copy-Item -Path $apkSource -Destination $apkDestMobile -Force
Copy-Item -Path $apkSource -Destination $apkDestRoot -Force

Write-Host "[3/3] Generating Artifact Checksums & Telemetry..."
$fileItem = Get-Item $apkDestMobile
$fileSizeMb = [math]::Round($fileItem.Length / 1MB, 2)
$sha256 = (Get-FileHash -Path $apkDestMobile -Algorithm SHA256).Hash

Write-Host "------------------------------------------"
Write-Host "APK BUILD SUCCESSFUL"
Write-Host "File:       chiwiwi-v0.10.apk"
Write-Host "Size:       $fileSizeMb MB ($($fileItem.Length) bytes)"
Write-Host "SHA256:     $sha256"
Write-Host "Mobile Path: $apkDestMobile"
Write-Host "Root Path:   $apkDestRoot"
Write-Host "------------------------------------------"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkDestMobile)
$soEntries = $zip.Entries | Where-Object { $_.FullName -like "*.so" }
Write-Host "Native libraries bundled in APK:"
$soEntries | ForEach-Object { Write-Host " - $($_.FullName) ($([math]::Round($_.Length / 1MB, 2)) MB)" }
$zip.Dispose()
