#!/bin/zsh
cd "$(dirname "$0")"
echo "Starting Audity Alpha on http://127.0.0.1:8787"
python3 -m http.server 8787 --bind 127.0.0.1 >/tmp/audity-alpha.log 2>&1 &
sleep 1
open "http://127.0.0.1:8787"
echo "Server is running. Close this window or press Ctrl+C if started in Terminal."
wait
