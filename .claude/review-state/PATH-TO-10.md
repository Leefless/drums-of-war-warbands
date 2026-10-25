# Path to 10 (Drums of War: Warbands)

After cycle 1, 2026-10-25: overall 9.6, up from 8.1 (weights: engine 25, battle UI 25, map 15,
computer 10, server 10, data 5, tests 5, docs 5).

## Shipped in cycle 1

All 47 autonomous deductions from the first review and the 7 regressions the re-review found in
those fixes: off-table pivots and pile in (36837ae), knocked-out seats see all (5ba284c),
surrender refreshes choices (ec39fe4), pauses wait only on viewers (a86025e), ambushed defenders
see dice (f8fa878), server hardening (f1ee9d4), tie picks (714bf1d, 1231c1c), one pile in rule and
strain cap (6adae99), engine log/back-away/marks/dials (d3cdee0), privacy test (586847b), client
polish (e501f3b), map performance (41bd8c2), seeded AI (fa87a20), rules tests (875a75e), docs
and renderer test (c1d7e94), Greenskin balance (a79f49d), server test (7a1ae09), re-review fixes
(126b55f, 1231c1c).

## Remaining, ordered by consequence

| # | Item | Lifts | Points | Bucket | Approach |
| --- | --- | --- | --- | --- | --- |
| 1 | Map rendering verified only by eye (BRD-E2E) | map | +0.3 | Deferred | Screenshot comparisons in the e2e harness (now built: `npm run e2e`) for the board at fixed seeds |
| 2 | Client logic has no unit tests (T8) | tests | +0.3 | Deferred | Extract pure helpers (turnInfo, reachMarks, spentUnits) into `shared/` and test them, or cover them via the e2e harness |
| 3 | roster-check imports `../public/art.js`; no cross-army name checks (X2) | data | +0.2 | Deferred | Move ICONS to shared or pass them in |
| 4 | Fuzz tests assert only that games finish (T7) | tests | +0.1 | Deferred | Add invariants: no overlaps, units on the table, DP conservation |
| 5 | Balance: Iron Holds 41% at 100 DP, Calamity 37% at 200 DP | engine, data | n/a | Handoff (decision) | ROADMAP 1.4: rules or roster levers, after a human playtest |

## Honest ceiling

A literal 10 needs real human playtests of the rules, the UI and the computer's strength, and a
four-device LAN session (priced as wontfix: engine 0.3, server 0.3, ai 0.3, UI 0.2, docs 0.2).
With items 1, 2, 4 and 5 shipped, the realistic ceiling is about 9.8.
