@echo off
cd /d "%~dp0"
echo Starting Audity Alpha on http://127.0.0.1:8787
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" http://127.0.0.1:8787
  python -m http.server 8787 --bind 127.0.0.1
) else (
  where py >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    start "" http://127.0.0.1:8787
    py -m http.server 8787 --bind 127.0.0.1
  ) else (
    echo Python not found. Install Python or open index.html directly for limited testing.
    pause
  )
)
