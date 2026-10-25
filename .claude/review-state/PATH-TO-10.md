# Path to 10 (Drums of War: Warbands)

Cycle 1, 2026-10-25. Overall 8.1 (weights: engine 25, battle UI 25, map 15, computer 10,
server 10, data 5, tests 5, docs 5). Ordered by consequence to the player first.

## 1. Battle breaks or confuses (Autonomous)

| # | Item | Lifts | Points | Approach |
| --- | --- | --- | --- | --- |
| 1 | Pivots and pile in can leave a base off the table (E1) | engine | +0.5 | insideBoard check in the hold branch of planMove and in pileIn |
| 2 | Knocked-out or removed seat sees a black board (UI-1) | UI | +0.4 | viewFor treats an eliminated seat as a watcher; client fog off |
| 3 | Attacks accepted on a surrendered player's dead units (E2, A1) | engine, ai | +0.5 | declareAttack/act re-check live targets; surrender refreshes other seats' pending |
| 4 | Continue text with no button when the attack is hidden (UI-2) | UI | +0.4 | render the Continue strip without the combat card |
| 5 | Ambushed defender chooses modifiers blind (UI-3) | UI | +0.3 | keep attack/lastAttack for the target's owner, attacker masked |
| 6 | Stale Last attack panel, New battle shown to watchers, terrain mode sticks, Q/E unthrottled (UI-9, 12, 10, 11) | UI | +0.4 | small client fixes |
| 7 | No disconnect banner; focus lost on every update (UI-8, UI-6) | UI | +0.5 | banner while the socket is down; restore focus by data key |
| 8 | Back away can hop a rock and skips terrain on its segment (E5) | engine | +0.2 | sweep the back-away segment |
| 9 | Own log line scrubbed by a hidden unit whose name is a prefix (E4) | engine | +0.2 | whole-name matching, longest first |

## 2. Security and data integrity (Autonomous)

| # | Item | Lifts | Points | Approach |
| --- | --- | --- | --- | --- |
| 10 | Tokenless socket passes host checks on an empty table (S1) | server | +0.3 | require a non-null pid |
| 11 | One bad saved army blanks every screen (S2) | server | +0.3 | validate entries on load |
| 12 | Dead never-seen enemies and hidden mark ids in the view (E3, E6) | engine | +0.4 | drop dead units never seen; null hidden marks |
| 13 | Timer and socket error paths (S3, S5, S6, S7, A2) | server, ai | +0.7 | try around freeSeatLater, ws error handler, beat re-check on close, receive.html ack, AI deploy/plan fallback |

## 3. Correctness, tests, docs (Autonomous)

| # | Item | Lifts | Points | Approach |
| --- | --- | --- | --- | --- |
| 14 | View filter mutations survive (T1) | tests | +1.0 | all-phase token and fog JSON scan test |
| 15 | Pile in, back away, attack reasons, tie pick weakly pinned (T2 to T5) | tests | +1.6 | targeted cases per rule and per `why` |
| 16 | Pile in and strain cap re-derived outside the engine (X1, UI-4, UI-5, D3) | data, UI, docs | +1.1 | export canPileIn and use strainCap everywhere |
| 17 | Rulebook minimum range wording, stale comments and hints (D2, D4, X5) | docs | +0.5 | edits |
| 18 | install-art crash without Art/ (S4, T6 part) | server | +0.2 | mkdir first |
| 19 | mdToHTML render test (T6) | tests | +0.1 | pure function test |
| 20 | Contrast and aria (UI-7, UI-14), muster list height (UI-13), fonts (UI-15) | UI | +0.5 | CSS and markup |
| 21 | Map per-frame work and tiny status text (B-1, B-4, B-5, B-3) | map | +0.8 | cache fog per state, throttle overlay layout, larger text, skip deploy glides |
| 22 | setDials unready on rejection (E7), check-presets DP list (X3), AI rng (A3) | engine, data, ai | +0.5 | small fixes |

## 4. Needs Jesse (Handoff) or later (Deferred)

- Tie pick rule: reword the rulebook to match the engine, or make the engine ask when a tie includes a never-compared unit (D1, decision).
- Start Game.command: Node 20 check and safer port handling (X4), needs a double-click test on the Mac.
- Greenskin balance (ROADMAP 1.4), decision.
- Deferred: roster-check layering (X2), fuzz invariants (T7).

## Honest ceiling

A literal 10 needs real human playtests of the rules and the computer's strength, and a
four-device LAN session (priced as wontfix: engine 0.3, server 0.3, ai 0.3). With every
autonomous item above shipped, the realistic ceiling is about 9.4 overall.
