# Silkroad Web Macro Bot Pro - Tek Satir Guncelleme Betigi
$ErrorActionPreference = "Stop"
Write-Host "[Silkroad Bot Pro] Guncellemeler denetleniyor..." -ForegroundColor Cyan

# Hedef klasorleri tespit et
$targetDirs = [System.Collections.Generic.List[string]]::new()

if ($PSScriptRoot -and (Test-Path "$PSScriptRoot\manifest.json")) {
    $targetDirs.Add($PSScriptRoot)
}
if ((Test-Path "$PWD\manifest.json") -and !$targetDirs.Contains("$PWD")) {
    $targetDirs.Add("$PWD")
}

$candidatePaths = @(
    "$HOME\Desktop\SilkroadBot",
    "$HOME\Desktop\blackbox\jadesrobot"
)

foreach ($cp in $candidatePaths) {
    if ((Test-Path $cp) -and !$targetDirs.Contains($cp)) {
        $targetDirs.Add($cp)
    }
}

if ($targetDirs.Count -eq 0) {
    $defaultDir = "$HOME\Desktop\SilkroadBot"
    New-Item -ItemType Directory -Path $defaultDir -Force | Out-Null
    $targetDirs.Add($defaultDir)
}

$repoUrl = "https://github.com/asherathegod/zubafke"
$zipUrl = "$repoUrl/archive/refs/heads/main.zip"

Write-Host "[*] Buluttan son surum indiriliyor..." -ForegroundColor Cyan
$zipPath = "$env:TEMP\sro_bot_update.zip"
$extDir = "$env:TEMP\sro_bot_update_ext"

Remove-Item $extDir -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $extDir -Force

$extractedFolder = Get-ChildItem $extDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1

if ($extractedFolder) {
    foreach ($targetDir in $targetDirs) {
        Write-Host "[*] Guncellenen klasor: $targetDir" -ForegroundColor Yellow
        Get-ChildItem -Path $extractedFolder.FullName | ForEach-Object {
            $destItem = Join-Path $targetDir $_.Name
            if ($_.PSIsContainer) {
                if (!(Test-Path $destItem)) {
                    New-Item -ItemType Directory -Path $destItem -Force | Out-Null
                }
                Copy-Item -Path "$($_.FullName)\*" -Destination $destItem -Recurse -Force
            } else {
                Copy-Item -Path $_.FullName -Destination $destItem -Force
            }
        }
    }
}

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item $extDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[OK] Guncelleme tamamlandi! chrome://extensions sayfasindan 'Yenile' butonuna basin." -ForegroundColor Green
