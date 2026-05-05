
$path = "c:\github_projects\email-prioritization\backend\email_cache.json"
if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path)
    $hasLS = $content.Contains([char]0x2028)
    $hasPS = $content.Contains([char]0x2029)
    
    if ($hasLS -or $hasPS) {
        Write-Host "Found unusual line terminators. Cleaning file..."
        $newContent = $content.Replace([char]0x2028, "`n").Replace([char]0x2029, "`n")
        [System.IO.File]::WriteAllText($path, $newContent)
        Write-Host "File cleaned successfully."
    } else {
        Write-Host "No unusual line terminators (LS/PS) found in the file."
    }
} else {
    Write-Host "File not found: $path"
}
