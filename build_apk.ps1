$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "ALAUNA PRODUCTION APK RELEASE PIPELINE"
Write-Host "=========================================="

$env:ANDROID_HOME = "C:\Users\BAMBOO\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\BAMBOO\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

$androidDir = "D:\1111-Works\alauna\mobile\android"
Set-Location $androidDir

$apkSource = "D:\1111-Works\alauna\mobile\android\app\build\outputs\apk\release\app-release.apk"
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

$apkDestVersioned = "D:\1111-Works\alauna\alauna-v1.1.1.apk"
$apkDestCanonical = "D:\1111-Works\alauna\alauna.apk"

# Remove any old APK files as requested by user
Get-ChildItem -Path "D:\1111-Works\alauna" -Filter "alauna-v*.apk" | Where-Object { $_.Name -ne "alauna-v1.1.1.apk" } | Remove-Item -Force
Get-ChildItem -Path "D:\1111-Works\alauna\mobile" -Filter "alauna-v*.apk" | Remove-Item -Force
if (Test-Path "D:\1111-Works\alauna\alauna.apk") { Remove-Item -Path "D:\1111-Works\alauna\alauna.apk" -Force }


Write-Host "[2/3] Copying APK to destination release ($apkDestVersioned)..."
Copy-Item -Path $apkSource -Destination $apkDestVersioned -Force
Copy-Item -Path $apkSource -Destination $apkDestCanonical -Force

Write-Host "[3/3] Generating Artifact Checksums & Telemetry..."
$fileItem = Get-Item $apkDestVersioned
$fileSizeMb = [math]::Round($fileItem.Length / 1MB, 2)
$sha256 = (Get-FileHash -Path $apkDestVersioned -Algorithm SHA256).Hash

Write-Host "------------------------------------------"
Write-Host "APK BUILD SUCCESSFUL"
Write-Host "Version:     1.1.1 (versionCode 11)"
Write-Host "Release:     alauna-v1.1.1.apk"
Write-Host "Canonical:   alauna.apk"
Write-Host "Size:        $fileSizeMb MB ($($fileItem.Length) bytes)"
Write-Host "SHA256:      $sha256"
Write-Host "Path:        $apkDestVersioned"
Write-Host "------------------------------------------"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkDestVersioned)
$soEntries = $zip.Entries | Where-Object { $_.FullName -like "*.so" }
Write-Host "Native libraries bundled in APK:"
$soEntries | ForEach-Object { Write-Host " - $($_.FullName) ($([math]::Round($_.Length / 1MB, 2)) MB)" }
$zip.Dispose()
