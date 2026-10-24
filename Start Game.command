#!/bin/zsh
# Double-click to start Drums of War: Warbands.
# Starts the game server, opens it in your browser, and prints the address
# other players at the table should open. Close this window to stop the game.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=3000

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (version 20 or newer), then double-click this again."
  read -k1 "?Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing game files..."
  npm install --silent || { read -k1 "?Install failed. Press any key to close."; exit 1; }
fi

# Already running? Just open it.
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "The game is already running."
  open "http://localhost:$PORT/"
  exit 0
fi

node server/index.js &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM

for i in {1..50}; do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.2
done
open "http://localhost:$PORT/"

echo ""
echo "Leave this window open while you play. Close it (or press Ctrl+C) to stop the game."
wait $SERVER
