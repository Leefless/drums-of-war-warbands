# Drums of War: Warbands

A high fantasy maneuver wargame set in the world of the Drums of War TTRPG.
Movement and turn structure follow the X-Wing Miniatures Game: secret
maneuver dials, templates, initiative order, and dice with token modifiers.
2 to 4 players each play from their own computer on the same Wi-Fi.

- **Rules:** [docs/RULES.md](docs/RULES.md)
- **Lore:** [docs/LORE.md](docs/LORE.md)

## Play

One computer hosts. Node 20 or newer.

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

Painted art lives in `public/art/`: unit portraits (`units/`), faction banners
(`banners/`), terrain sprites (`terrain/`), `title.jpg` and `ground.jpg`. It was
generated with ChatGPT (image generation on a Plus subscription), then sliced
and resized for the game. Every file is optional: delete one and the game falls
back to its built-in vector art. `npm run art` can regenerate the portraits
and sprites through the OpenAI Images API instead, if a key is set in `.env`.

## Layout

| Path | Role |
| --- | --- |
| `shared/geometry.js` | Board, maneuver templates, bases, range, arcs, overlap. |
| `shared/factions.js` | The six armies: units, dials, actions, upgrades, list validation. |
| `shared/engine.js` | Authoritative rules engine and phase state machine. |
| `server/index.js` | HTTP + WebSocket server; one process is one table. |
| `public/` | Browser client (vanilla JS, canvas board). |
| `test/` | `npm test`: rules tests plus a fuzz of 144 full random games. |

The server is authoritative: browsers send intents, the engine validates them,
and every seat receives its own filtered view (other players' dials stay
hidden until revealed).
