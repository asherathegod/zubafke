# Silkroad Web Macro Bot Pro - Tek Satır Güncelleme Betiği
$ErrorActionPreference = "Stop"
Write-Host "[Silkroad Bot Pro] Guncellemeler denetleniyor..." -ForegroundColor Cyan

$targetDir = "$PSScriptRoot"
if (!$targetDir) { $targetDir = "$HOME\Desktop\SilkroadBot" }
$repoUrl = "https://github.com/REPLACE_WITH_USER/REPLACE_WITH_REPO"
$zipUrl = "$repoUrl/archive/refs/heads/main.zip"

$hasGit = $false
try {
    $gitVer = & git --version 2>$null
    if ($gitVer) { $hasGit = $true }
} catch {}

if ($hasGit -and (Test-Path "$targetDir\.git")) {
    cd $targetDir
    git pull origin main
} else {
    Write-Host "Dosyalar buluttan dogrudan guncelleniyor..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\sro_bot_update.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\sro_bot_update_ext" -Force
    $extractedFolder = Get-ChildItem "$env:TEMP\sro_bot_update_ext" | Select-Object -First 1
    Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $targetDir -Recurse -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\sro_bot_update_ext" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "✓ Guncelleme tamamlandi! chrome://extensions sayfasindan 'Yenile' butonuna basin." -ForegroundColor Green
