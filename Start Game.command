#!/bin/zsh
# Double-click to start Drums of War: Warbands.
# Starts the game server, opens it in your browser, and prints the address
# other players at the table should open. Close this window to stop the game.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PORT=3000

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (version 20 or newer), then double-click this again."
  read -k1 "?Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing game files..."
  npm install --silent || { read -k1 "?Install failed. Press any key to close."; exit 1; }
fi

# Already running? Open it, or restart it to load the latest rules.
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "The game is already running."
  read -k1 "reply?Press R to restart it with the latest rules (this ends the current battle), or any other key to just open it. "
  echo ""
  if [[ "$reply" != [rR] ]]; then
    open "http://localhost:$PORT/"
    exit 0
  fi
  echo "Restarting the game server..."
  lsof -tiTCP:$PORT -sTCP:LISTEN | xargs kill 2>/dev/null
  for i in {1..25}; do
    curl -s -o /dev/null "http://localhost:$PORT/" || break
    sleep 0.2
  done
fi

# The server runs under this window. Press R here (or Restart now in the game's
# banner) to reload the latest rules; exit code 75 from the server means "restart me".
export DOW_SUPERVISED=1
start_server() {
  node server/index.js &
  SERVER=$!
  for i in {1..50}; do
    curl -s -o /dev/null "http://localhost:$PORT/" && break
    sleep 0.2
  done
}
start_server
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
open "http://localhost:$PORT/"

echo ""
echo "Leave this window open while you play."
echo "Press R in this window to restart with the latest rules (ends the current battle)."
echo "Close it (or press Ctrl+C) to stop the game."
while true; do
  if read -s -k1 -t 1 key && [[ "$key" == [rR] ]]; then
    echo "Restarting the game server..."
    kill $SERVER 2>/dev/null
    wait $SERVER 2>/dev/null
    start_server
    echo "Restarted. Refresh the game in your browser if it does not reconnect by itself."
    continue
  fi
  [[ -t 0 ]] || sleep 1 # no keyboard attached: poll gently instead of spinning
  if ! kill -0 $SERVER 2>/dev/null; then
    wait $SERVER
    code=$?
    if [[ $code -eq 75 ]]; then
      echo "Restarting the game server (requested from the game)..."
      start_server
      continue
    fi
    echo "The game server stopped (exit code $code)."
    read -k1 "?Press any key to close."
    exit $code
  fi
done
