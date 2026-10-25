# Review log

Append-only. One dated entry per /full-review cycle.

## 2026-10-25, cycle 1 (FULL, seeding pass)

- Overall 8.1 -> 9.6. Engine 7.9 -> 9.7, battle UI 7.1 -> 9.4, map 9.1 -> 9.7, computer 9.1 -> 9.7, server 8.4 -> 9.7, data 8.9 -> 9.6, tests 7.1 -> 9.6, docs 9.3 -> 9.8.
- Reviewed with 3 Sonnet reviewers (UI; engine/server/AI; tests/data/docs), verified on Opus; re-reviewed with 2 fresh reviewers, which found 7 regressions in this cycle's own fixes (all fixed).
- Shipped 22 commits: off-table pivots and pile in, knocked-out seats see all, surrender refreshes choices, pauses wait only on viewers, ambushed defenders see dice, server hardening, tie picks with explicit chosen-over pairs, one pile in rule and strain cap, log name matching, back-away sweep, seeded AI, client and map polish, Greenskin +10% cost, and tests (83 from 60: privacy scan, rules reasons, docs renderer, live server).
- Decisions by Jesse: tie picks ask about never-ranked units; dead enemies stay visible under fog; Greenskin +10% kept (65 -> 55% at 100 DP).
- Handoff: Start Game.command Node and port handling. Deferred: e2e harness, client unit tests, roster-check layering, fuzz invariants.
