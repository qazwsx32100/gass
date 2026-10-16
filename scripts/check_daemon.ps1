$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*shenglong_order_ingest_daemon.py*' }
if ($procs) {
    Write-Host "[OK] Ingest daemon is RUNNING:" -ForegroundColor Green
    foreach ($p in $procs) {
        Write-Host ("   PID: " + $p.ProcessId + " Start: " + $p.CreationDate) -ForegroundColor Cyan
    }
} else {
    Write-Host "[INFO] Ingest daemon is NOT running." -ForegroundColor Yellow
}
