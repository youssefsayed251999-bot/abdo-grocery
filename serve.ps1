# تشغيل الموقع محلياً (PowerShell)
# الاستخدام:  .\serve.ps1    ثم افتح http://localhost:8080

$port = 8080
Write-Host ""
Write-Host "  بقالة عم عبده — تشغيل الموقع محلياً" -ForegroundColor Green
Write-Host "  العنوان:  http://localhost:$port" -ForegroundColor Cyan
Write-Host "  للإيقاف:  اضغط Ctrl + C" -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://localhost:$port"
python -m http.server $port
