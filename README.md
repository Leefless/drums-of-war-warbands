# Drums of War: Warbands

A high fantasy maneuver wargame set in the world of the Drums of War TTRPG.
Movement and turn structure follow the X-Wing Miniatures Game: secret
maneuver dials, templates, initiative order, and dice with token modifiers.
2 to 4 players each play from their own computer on the same Wi-Fi.

Six armies of 25+ units and 10+ champions each, an army builder with saved
lists, terrain with tactical upsides and downsides, and fog of war (you only see
what your units can see). Armies can carry magic items and buy terrain in a
terrain shop, and the battlefield (one of three, chosen by whoever keeps the
most DP in reserve) favours some armies and hinders others. A matchup ring gives each army an edge against one rival.
Prebuilt warbands get you playing fast, computer opponents fill empty seats,
and quick orders speed up the dial phase. Games run from 60 to 300 DP, any
player can surrender, and the rulebook is available in game.

- **Rules:** [docs/RULES.md](docs/RULES.md)
- **Lore:** [docs/LORE.md](docs/LORE.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

## Play

One computer hosts. Node 20 or newer.

**Easiest:** double-click **`Start Game.command`** in this folder. It installs
on first run, starts the server, opens the game in your browser, and prints the
Wi-Fi address for the other players. Close that window to stop the game. It
needs Node.js 20 or newer and says so if this Mac has an older one. If another
program already uses port 3000, the game takes the next free port and prints its
address; it never stops another program.

Or from a terminal:

```bash
npm install
npm start
```

The server prints two addresses. Everyone at the table opens the **Same Wi-Fi**
address (for example `http://192.168.68.55:3000`) in a browser, enters a name,
and takes a seat. A TV or extra laptop can choose **Watch only**. On macOS,
allow incoming connections if the firewall asks.

Each browser remembers its seat, so a refresh or dropped connection rejoins
automatically. Use a different browser (or a private window) per player when
testing on one machine.

## Art

Painted art lives in `public/art/` (portraits, banners, three battlefield maps
in `ground/`, six variants per terrain kind in `terrain/`, ground `decor/`): unit portraits (`units/`), faction banners
(`banners/`), terrain sprites (`terrain/`), `title.jpg` and `ground.jpg`. It was
generated with ChatGPT (image generation on a Plus subscription), then sliced
and resized for the game. Every file is optional: delete one and the game falls
back to its built-in vector art. New art can be dropped into the `Art/` folder
(named `dow-art__<path with __>`) and installed with `npm run install-art`;
`receive.html` lets a browser tab on this computer hand files to the server. `npm run art` can regenerate the portraits
and sprites through the OpenAI Images API instead, if a key is set in `.env`.

## Layout

| Path | Role |
| --- | --- |
| `shared/geometry.js` | Board, maneuver templates, bases, range, arcs, overlap. |
| `shared/factions.js` | The six armies: rules, upgrades, list validation; assembles the rosters. |
| `shared/rosters/` | One file per army: champions and units (25+ units, 10+ champions each). |
| `shared/cost.js` | Computes every unit's points cost from its profile. |
| `shared/dials.js` | Maneuver dial library, per army. |
| `shared/roster-check.js` | Roster rules; `node scripts/check-roster.mjs <army>` while authoring. |
| `shared/engine.js` | Authoritative rules engine and phase state machine. |
| `server/index.js` | HTTP + WebSocket server; one process is one table. |
| `public/` | Browser client (vanilla JS, canvas board). |
| `shared/terrain.js` | Terrain kinds and effects, line of sight, fog-of-war vision. |
| `shared/battlefield.js` | Battlefields, the matchup ring and the terrain shop. |
| `shared/items.js`, `shared/items/` | Magic items: schema, pricing from the unit profile, and one item file per army. |
| `shared/presets.js`, `shared/presets/` | Prebuilt warbands tuned at 100 DP and scaled to any budget, one file per army. |
| `shared/ai.js` | Computer opponent; plays through the same commands as a person and obeys fog of war. |
| `scripts/` | `check-roster` (roster rules), `check-items` (item prices), `check-presets` (preset legality at every DP), `sim-items` (item balance), `sim-presets` (computer-vs-computer win rates), `gen-art` (OpenAI Images art), `install-art` (move `Art/` drops into `public/art/`). |
| `test/` | `npm test` runs the rules, roster, terrain, battlefield, preset and computer-opponent tests, including random battles with all 247 units. |
| `data/armies.json` | Saved armies (created on first save, not in git). |

The server is authoritative: browsers send intents, the engine validates them,
and every seat receives its own filtered view (other players' dials stay
hidden until revealed).
