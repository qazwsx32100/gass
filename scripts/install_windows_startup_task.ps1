# ShengLong Gas - Windows Scheduled Task Installer for Order Ingest Daemon

$taskName = "ShengLong_Order_Ingest_Daemon"
$pythonCmd = (Get-Command python.exe -ErrorAction SilentlyContinue)
if (-not $pythonCmd) {
    Write-Host "[ERROR] python.exe not found in PATH." -ForegroundColor Red
    exit 1
}
$pythonPath = $pythonCmd.Source
$scriptPath = "C:\Gass\scripts\shenglong_order_ingest_daemon.py"
$workingDir = "C:\Gass"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  ShengLong Gas - Register Auto-Startup Scheduled Task" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Test-Path $scriptPath)) {
    Write-Host "[ERROR] Daemon script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

$action = New-ScheduledTaskAction -Execute $pythonPath -Argument "`"$scriptPath`" --interval 5" -WorkingDirectory $workingDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "ShengLong Gas LINE Order Ingest Daemon" | Out-Null
    Write-Host "[SUCCESS] Windows Scheduled Task registered: $taskName" -ForegroundColor Green
    Write-Host "The daemon will automatically launch in background upon system reboot." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Registration failed (may require Administrator privilege): $_" -ForegroundColor Yellow
    Write-Host "[TIP] Alternatively, copy start_ingest_daemon.bat shortcut to startup folder (shell:startup)." -ForegroundColor Yellow
}
