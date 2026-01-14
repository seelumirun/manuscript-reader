# Manuscript Sync Script
# Copies your manuscript to the repo and pushes to GitHub

$sourceFile = "C:\Users\seelu\OneDrive\OP Drafts\OP1 v3.1.docx"
$repoPath = "\\wsl$\Ubuntu\home\seelumirun\manuscript-reader"
$destFile = "$repoPath\manuscript.docx"

Write-Host "Syncing manuscript..." -ForegroundColor Cyan

# Copy file to repo
Copy-Item -Path $sourceFile -Destination $destFile -Force
Write-Host "Copied to repo" -ForegroundColor Gray

# Push to GitHub via WSL
wsl -d Ubuntu -e bash -c "cd /home/seelumirun/manuscript-reader && git add manuscript.docx && git commit -m 'Update manuscript' && git push"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Pushed to GitHub!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Done (may have had nothing new to push)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
