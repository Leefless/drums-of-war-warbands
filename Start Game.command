#!/bin/zsh
# Double-click to start Drums of War: Warbands.
# Starts the game server, opens it in your browser, and prints the address
# other players at the table should open. Close this window to stop the game.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=${PORT:-3000}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (version 20 or newer), then double-click this again."
  read -k1 "?Press any key to close."
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 20 ]]; then
  echo "This game needs Node.js 20 or newer, and this Mac has $(node --version 2>/dev/null || echo 'an unknown version')."
  echo "Get the current version from https://nodejs.org, then double-click this again."
  read -k1 "?Press any key to close."
  exit 1
fi

# Is this game (not some other program) answering on a port? The page title says so.
is_game() { curl -s --max-time 2 "http://localhost:$1/" | grep -q "<title>Drums of War: Warbands</title>"; }
# Is anything at all listening on a port?
port_busy() { lsof -tiTCP:$1 -sTCP:LISTEN >/dev/null 2>&1; }
# Process ids of this game's server listening on a port (never another program's).
game_pids() {
  for pid in $(lsof -tiTCP:$1 -sTCP:LISTEN 2>/dev/null); do
    ps -o command= -p $pid 2>/dev/null | grep -q "server/index.js" && echo $pid
  done
}

if [ ! -d node_modules ]; then
  echo "First run: installing game files..."
  npm install --silent || { read -k1 "?Install failed. Press any key to close."; exit 1; }
fi

# Port taken by another program? Use the next free one instead of touching it.
if port_busy $PORT && ! is_game $PORT; then
  FIRST=$PORT
  for (( p = FIRST + 1; p <= FIRST + 20; p++ )); do
    if ! port_busy $p || is_game $p; then
      echo "Port $FIRST is in use by another program, so the game will use port $p."
      PORT=$p
      break
    fi
  done
  if port_busy $PORT && ! is_game $PORT; then
    echo "Ports $FIRST to $((FIRST + 20)) are all in use. Close another program, then double-click this again."
    read -k1 "?Press any key to close."
    exit 1
  fi
fi
export PORT

# Already running? Open it, or restart it to load the latest rules.
if is_game $PORT; then
  echo "The game is already running."
  read -k1 "reply?Press R to restart it with the latest rules (this ends the current battle), or any other key to just open it. "
  echo ""
  if [[ "$reply" != [rR] ]]; then
    open "http://localhost:$PORT/"
    exit 0
  fi
  echo "Restarting the game server..."
  game_pids $PORT | xargs kill 2>/dev/null # only this game's server, never another program
  for i in {1..25}; do
    port_busy $PORT || break
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
    is_game $PORT && return 0
    kill -0 $SERVER 2>/dev/null || return 1 # the server stopped (it prints why)
    sleep 0.2
  done
  return 1
}
if ! start_server; then
  echo "The game server did not start. See the message above."
  read -k1 "?Press any key to close."
  exit 1
fi
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
