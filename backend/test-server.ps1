# Test script to check if server is running
Write-Host "Testing backend server..."
Start-Sleep -Seconds 2

try {
    $response = Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing -TimeoutSec 5
    Write-Host "Server is running! Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Server is not responding: $_"
    Write-Host "Please check if the server is running on port 3000"
}
