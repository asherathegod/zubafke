# Silkroad Web Macro Bot Pro - Tek Satır Kurulum Betiği
$ErrorActionPreference = "Stop"
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host "  Silkroad Web Macro Bot Pro - Otomatik Kurulum       " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Yellow

$targetDir = "$HOME\Desktop\SilkroadBot"
$repoUrl = "https://github.com/asherathegod/zubafke"
$zipUrl = "$repoUrl/archive/refs/heads/main.zip"

Write-Host "1. Kurulum klasoru olusturuluyor: $targetDir" -ForegroundColor Cyan
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$hasGit = $false
try {
    $gitVer = & git --version 2>$null
    if ($gitVer) { $hasGit = $true }
} catch {}

if ($hasGit) {
    Write-Host "2. Git bulundu, proje klonlaniyor..." -ForegroundColor Cyan
    if (Test-Path "$targetDir\.git") {
        cd $targetDir
        git pull origin main
    } else {
        git clone "$repoUrl.git" $targetDir
    }
} else {
    Write-Host "2. Git bulunamadi, dogrudan son surum indiriliyor..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\sro_bot_latest.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\sro_bot_extracted" -Force
    $extractedFolder = Get-ChildItem "$env:TEMP\sro_bot_extracted" | Select-Object -First 1
    Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $targetDir -Recurse -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\sro_bot_extracted" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "3. Kurulum basariyla tamamlandi!" -ForegroundColor Green
Write-Host ""
Write-Host "Chrome'a Eklemek Icin:" -ForegroundColor Yellow
Write-Host "1. Chrome'da chrome://extensions adresini acin." -ForegroundColor White
Write-Host "2. Sag ustteki 'Gelistirici Modu' (Developer Mode) anahtarini acin." -ForegroundColor White
Write-Host "3. 'Paketlenmemis Oge Yukle' (Load Unpacked) butonuna basin." -ForegroundColor White
Write-Host "4. Masaustundeki '$targetDir' klasorunu secin." -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Yellow
Start-Process "chrome.exe" "chrome://extensions"
