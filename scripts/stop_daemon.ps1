$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shenglong_order_ingest_daemon.py*' }
if ($procs) {
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host ("[OK] Terminated Ingest daemon PID: " + $p.ProcessId) -ForegroundColor Green
    }
} else {
    Write-Host "[INFO] Ingest daemon is not currently running." -ForegroundColor Yellow
}
