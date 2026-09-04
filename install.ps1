# Silkroad Web Macro Bot Pro - Tek Satir Kurulum Betigi
$ErrorActionPreference = "Stop"
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host "  Silkroad Web Macro Bot Pro - Otomatik Kurulum       " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Yellow

$targetDir = "$HOME\Desktop\SilkroadBot"
$repoUrl = "https://github.com/asherathegod/zubafke"
$zipUrl = "$repoUrl/archive/refs/heads/main.zip"

Write-Host "1. Kurulum klasoru olusturuluyor: $targetDir" -ForegroundColor Cyan
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$hasGit = $false
try {
    $gitVer = & git --version 2>$null
    if ($gitVer) { $hasGit = $true }
} catch {}

if ($hasGit) {
    Write-Host "2. Git bulundu, proje klonlaniyor..." -ForegroundColor Cyan
    if (Test-Path "$targetDir\.git") {
        Push-Location $targetDir
        git pull origin main
        Pop-Location
    } else {
        git clone "$repoUrl.git" $targetDir
    }
} else {
    Write-Host "2. Git bulunamadi, dogrudan son surum indiriliyor..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\sro_bot_latest.zip"
    $extDir = "$env:TEMP\sro_bot_extracted"
    
    Remove-Item $extDir -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $extDir -Force
    
    $extractedFolder = Get-ChildItem $extDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if ($extractedFolder) {
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
    
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "3. Kurulum basariyla tamamlandi!" -ForegroundColor Green
Write-Host ""
Write-Host "Chrome'a Eklemek Icin:" -ForegroundColor Yellow
Write-Host "1. Chrome'da chrome://extensions adresini acin." -ForegroundColor White
Write-Host "2. Sag ustteki 'Gelistirici Modu' (Developer Mode) anahtarini acin." -ForegroundColor White
Write-Host "3. 'Paketlenmemis oge yukle' butonuna basip su klasoru secin:" -ForegroundColor White
Write-Host "   $targetDir" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Yellow

Start-Process "chrome.exe" "chrome://extensions" -ErrorAction SilentlyContinue
