You are running a complete review-and-harden cycle on this repository. The cycle is STATEFUL: it loads a persistent ledger from the last run, only re-does work that changed, and writes an improved ledger back at the end. It ends with a scored review artifact, every safely-fixable issue fixed and pushed, a re-review artifact showing deltas, and a clear hand-off list of what only the user can do. Execute the phases in order.

This is the PROJECT-LEVEL command for this repo (seeded 2026-10-25 from the generic `~/.claude/commands/full-review.md` template and specialized). It is canonical here and wins wherever it differs from the template.

## This repo (Drums of War: Warbands) facts and gates

- **What it is:** a LAN multiplayer, X-Wing-style fantasy wargame. 2 to 4 players in browsers on the same Wi-Fi, one Node process hosts one table. Public repo: github.com/Leefless/drums-of-war-warbands.
- **Stack:** Node 20+ ES modules, one runtime dependency (`ws`). No framework, no bundler, no TypeScript, no database.
  - `shared/` is isomorphic (server and browser import it): `engine.js` (authoritative rules + phase state machine + per-seat `viewFor` fog filter), `geometry.js`, `terrain.js` (LOS, vision), `battlefield.js`, `factions.js` (army rules, upgrades, `validateArmy`), `cost.js` (points model), `dials.js`, `items.js` + `items/*.js`, `presets.js` + `presets/*.js`, `rosters/*.js`, `roster-check.js`, `ai.js` (computer opponent).
  - `server/index.js`: HTTP static server + WebSocket, saved armies in `data/armies.json` (gitignored), AI timer, pause-after-attack beat, art upload endpoint (localhost only).
  - `public/`: vanilla JS client. `app.js` (all DOM/UI), `board.js` (canvas renderer, camera, animations), `art.js`, `styles.css`, `index.html`, `receive.html` (art pipeline receiver).
  - `scripts/`: `check-roster.mjs`, `check-items.mjs`, `check-presets.mjs`, `sim-presets.mjs`, `sim-items.mjs` (balance sims, AI vs AI), `gen-art.mjs`, `install-art.mjs`.
  - `docs/RULES.md` is the player rulebook and is RENDERED IN-GAME by `mdToHTML` in `public/app.js` (supports only #-#### headings, pipe tables, -/*/1. lists one level deep, **bold**, `code`, links; no italics, blockquotes, fences or rules). `docs/ROADMAP.md` is the design backlog. `docs/STATUS.html` is a historical snapshot.
- **Gates (all must be clean before every commit; there is NO typecheck and NO build):**
  1. Syntax: `for f in public/*.js server/*.js shared/*.js shared/*/*.js scripts/*.mjs; do node --check "$f" || echo BAD "$f"; done` (no `BAD` lines).
  2. Tests: `npm test` (node:test over `test/*.test.js`; read the `ℹ pass` / `ℹ fail` counts; fail must be 0).
  3. Data checks: `for a in calamity concord greenskin holds sylvan umbral; do node scripts/check-roster.mjs $a | tail -1; done` (6x `Roster OK.`), `node scripts/check-items.mjs | tail -1` (`Items OK.`), `node scripts/check-presets.mjs | tail -1` (`Presets OK.`).
  4. Rules or AI changes: also run `node scripts/sim-presets.mjs 4 all 100` (about 4 minutes) and compare the "By army" spread to the last recorded figures in `docs/ROADMAP.md` section 1. Sims are noisy (about plus or minus 5 points per army at 4 games per preset); compare like-for-like settings.
- **E2E harness:** none committed. When a UI surface changed, drive it live: start `PORT=<spare> node server/index.js` from the repo, drive seats with a small `ws` script (import `node_modules/ws/wrapper.mjs`) and inspect the page in Chrome via the claude-in-chrome tools; a browser tab's seat token is `localStorage["dow.token"]`. Kill the server afterward. Never run tests that write `data/armies.json` against the repo copy: copy `server shared docs package.json public` to the session scratchpad and symlink `node_modules`.
- **Deploy target:** none. The host runs `Start Game.command` (supervises the server; exit code 75 = restart) or `npm start`. No secrets except an optional `OPENAI_API_KEY` in `.env` (gitignored, only for `npm run art`).
- **Commit convention (overrides the global CLAUDE.md email):** `git -c user.name="Claude (Jesse Moure)" -c user.email="289867359+Leefless@users.noreply.github.com" commit ...`. The @formic.co email must NEVER appear in this repo (files or commit fields). Trailer: `Co-Authored-By: <model that did the work> <noreply@anthropic.com>`. Branch: `main`, trunk-based. Stage explicit paths only.
- **Push:** `gh auth switch -h github.com -u Leefless && git push -q origin main; gh auth switch -h github.com -u JesseMoure-Formic` (always switch back). No `.claude/settings.json` hooks: push explicitly.
- **House style:** never use em dashes or en dashes in code comments, UI text, docs, commits or the artifact (`grep -c "—\|–"` must be 0 on touched docs). Plain, precise English.
- **Phase 0 surface enumeration:**
  - Engine commands: `grep -n "^export function" shared/engine.js`
  - Server message types: `grep -n 'case "' server/index.js`
  - Client screens/renderers: `grep -n "^function render\|^function .*HTML(" public/app.js`
  - Board renderers: `grep -n "^function draw\|^export function" public/board.js`
  - Data: `ls shared/rosters shared/items shared/presets`
  - Tests: `ls test/`
- **Repo-specific review classes to always check (from past cycles):**
  - Private session tokens (player ids) must never reach `viewFor` output: every pid stored on state (units, log `who`, players) must be mapped to `p<seat>` or deleted. A poison `bleedingBy` leak once let any watcher hijack a seat.
  - Fog of war: anything about a hidden unit (log text, pending options, queue, prefs) must be scrubbed per viewer.
  - The rules exist in ONE place (`attackCheck`, `attackOptions`, `planMove`) and the client, AI and map markers must call them rather than re-deriving; flag any inline re-implementation (single source of truth).
  - Every rules change must be reflected in `docs/RULES.md` (rendered in-game) and checked against balance sims.
  - Server robustness: no throw outside a try in request/WS/timer paths; malformed input must never crash the process.

- **Cycle 1 efficiency notes (fold-in, keep current):**
  - Keep `gate.sh` and `commit.sh` helpers in the session scratchpad (the four gates in one call; the Leefless commit identity, push and account switch-back in another). They kept 22 commits consistent.
  - Mutation-check every new test immediately (copy the file to the scratchpad, plant the bug, run only that test file, restore, confirm with `git diff --stat`). Four new tests in cycle 1 passed for the wrong reason until this was done.
  - The Phase 6 re-review of this cycle's own diff is the highest-yield step after the first review (7 regressions in cycle 1). Scope it to `git diff <cycle start>..HEAD` and give the reviewers the list of fixes made.
  - Highest-yield reviewer instruction: a mutation run on a scratch copy of `shared/engine.js` (survivors name the missing tests directly).
  - Low yield, skip unless that area changed: re-auditing roster data, item prices and preset legality (the check scripts and the 40 to 300 DP range check cover them).
  - The client has no unit tests: UI fixes need one live Chrome drive per batch (seat the browser by setting `localStorage` `dow.joined=1`, drive the rest with a `ws` script on the same token, read positions back with a spectator socket).

## Persistent review state (the ledger)

State lives in `.claude/review-state/` and is committed, so score trends and findings history travel with the repo:

- `state.json`: the machine-readable ledger:
  - `lastRun`: `{ commit, date, overallScore, cycleCounter }`
  - `artifactUrl`: the published scorecard URL (the Artifact host mints a URL per artifact; redeploy by the same `file_path` in-session, or pass this `url` from a new session).
  - `siblingSync`: `{ path, lastSeenHash, lastSeenDate, ported }`, the fingerprint of the sibling (generic template) last reconciled.
  - `areas[]`: `{ key, name, globs[], score, lastReviewedCommit, lastReviewedDate, notes, deductions[] }`.
  - `findings[]`: `{ id, title, ref (file:line), severity, bucket (autonomous|handoff|deferred), status (open|fixed|handoff|deferred|wontfix), firstSeen, resolved }`
  - `hardened[]`: intentional designs and confirmed false-positive classes that must NOT be re-reported.
  - `learnings[]`: durable notes that make the next run smarter.
- `log.md`: append-only human run log.
- `PATH-TO-10.md`: the ordered roadmap (Phase 4).

### The deduction ledger (scores are priced, not vibes)

Each area's score is mechanical: `score = 10 − sum(open deductions)`. `deductions[]` per area: `{ id, desc, points, bucket (autonomous|handoff|deferred|wontfix), unlock, status (open|burned) }`, points 0.1 to 1.0; `unlock` names what would make a blocked deduction fixable. Permanent ceiling items (real-human playtest validation, multi-machine LAN soak) are priced as `wontfix` so the honest ceiling is visible.

**Anti-goalpost rule:** when a pinned deduction is burned (shipped + gated), the area score MUST rise by its points. A reviewer may add a NEW deduction only for a genuinely new observation, priced and justified in one line. If an area's deductions are all burned/wontfix, it IS at its ceiling.

**Seeding pass (first run):** each area's reviewer enumerates the specific deductions keeping the area below 9.5, with a point value each.

The artifact lives at the STABLE path `artifacts/review-scorecard.html`, fed from `state.json`. Every run reads this ledger first and writes an improved one last.

**Keep all improvements inside the project** (`.claude/` and `artifacts/`, committed), including refinements to this command (Phase 7 step 3b).

## Standing conventions (every commit and action)

- Trunk-based on `main`. Sync first: `git fetch -q && git pull -q --rebase`. Never `git add -A`; stage explicit paths.
- Gate before EVERY commit: the four gates above. Add or extend tests for any behavior change. Never commit broken or half-finished work. Never weaken tests to force green.
- One coherent commit per task with the commit convention above. If a push is rejected, rebase and retry.
- No CI exists; adding a workflow is a HANDOFF (paste-ready).
- Add no runtime dependencies casually (the only one is `ws`). Local tooling stays out of `dependencies`.

## Run cadence: full vs light cycles

Increment `lastRun.cycleCounter` each cycle. FULL every 3rd cycle (`cycleCounter % 3 === 0`), when the diff is large, or on request; LIGHT otherwise (one scoped delta-reviewer over changed code; most effort on the fix loop, highest points-per-effort first). Per-commit rigor is unchanged. This repo is still young: stay on FULL while reviews keep surfacing real defects.

## Cross-command sync (every run, before Phase 0)

The sibling is the generic template `~/.claude/commands/full-review.md`. Fingerprint it (`git hash-object ~/.claude/commands/full-review.md`) and compare to `state.json.siblingSync.lastSeenHash`; on a match skip. If it changed, pull in any new GENERAL discipline (specialized to this repo), and push generalized improvements from this file back up. Record the reconcile in `siblingSync`.

## Phase 0, Load and reconcile state

1. Read `.claude/review-state/state.json` (sync first). If absent, first run: full review.
2. Reconcile areas against the live code (surface commands above): NEW areas (stub + full review), CHANGED (`git diff --name-only <lastReviewedCommit> HEAD -- <globs>`), RETIRED, UNCHANGED (carry forward).
3. Carry forward open findings; brief reviewers with `hardened[]` and `learnings[]`. Report a one-line plan.

## Phase 1, Review

LIGHT: one scoped delta-reviewer. FULL (and seeding): 3 read-only review agents in parallel, default model Sonnet (Opus orchestrates and verifies, per the global agent strategy): (1) client UX (`public/`), (2) rules engine + server + AI (`shared/engine.js`, `shared/ai.js`, `server/`, `shared/terrain.js`, `shared/geometry.js`), (3) tests/tooling/data/docs (`test/`, `scripts/`, data modules, `docs/`). Each returns `file:line` citations, a candid weakness list, and priced `deductions[]` per area. Re-score each reviewed area 0 to 10 (8+ strong, 7 to 7.9 solid, 5 to 6.9 watch, below 5 act now).

- **Verify every reviewer claim against the current code** (Opus, main thread) before it becomes a finding or deduction. Reviewers miscount and flag intended designs.
- **Verify an agent's FIX against the real thing:** reproduce the original failure on the real code, watch the fix pass, break it deliberately and watch it fail.
- **A scheduled job can be a promotion inside another job:** here, check `scheduleAI`, `watchBeat`, `freeSeatLater` and the `setInterval` stale check before concluding a timer does not exist.
- **A dry run / preview must apply the writer's own conditions:** here, the map target markers and the AI's `hasShot` must go through `attackCheck`, and dial previews through `planMove`.
- **Weight the overall score by user-facing value:** the battle experience (engine rules + client battle UI) carries the most weight; state the weights.
- **Single-source-of-truth cross-surface verification (every run):** trace one non-trivial value end-to-end across surfaces. Here: an attack's dice count (engine `attackOptions` -> pending options -> attack list -> combat card), and a unit's attackability (engine `attackCheck` -> server options -> map markers -> AI).
- **A placeholder score is a guess:** say which scores are measured.
- **Point a lens at the test suite itself periodically:** name the specific mutation each weak test misses.
- **Drive the flows, but scope the harness** (see E2E harness above): only when a UI surface changed; one session for all affected journeys.

## Phase 2, Review artifact

Self-contained, responsive HTML scorecard at `artifacts/review-scorecard.html`, published with the Artifact tool. Visual identity: the official Formic brand (Jesse's design default; spec in `~/.claude/formic-brand.md`): Formic Black `#091517` ground, Formic White `#F0F5F1`, teal-infused greys (`#333E3C`, `#767D79`, `#D1D5D4`), ONE accent Formic Orange `#FF9100` (only the overall score, section markers; orange with black text, never white), desaturated status colors, Untitled Sans / Helvetica stack for headings and body, GT America Mono / SF Mono stack for labels, hairline rules, slim monochrome score bars, both themes at token level. Once the first version ships, LOCK its layout and tokens and edit only data on later runs. Content: overall score + one-paragraph verdict with stated weights, band legend, Engineering Dimensions grid and Features grid (name, score, one-line read, bar, delta), top risk classes, "fix first" list with a triage pill (Autonomous / Handoff / Deferred). No external assets.

## Phase 3, Triage

Every finding becomes a `findings[]` entry in exactly one bucket: AUTONOMOUS (verifiable here with the gates + live drive), HANDOFF (needs Jesse: real human playtest calls, GitHub settings, CI workflow, design decisions; paste-ready), DEFERRED (risky or needs infra). Convert DEFERRED to AUTONOMOUS when it can ship behind a default-off flag. Order AUTONOMOUS by payoff: (1) breaks/blocks/confuses the player mid-battle, wrong value on a surface, broken SSOT; (2) security/data integrity (token leaks, fog leaks, crash paths); (3) hygiene. Deductions join ordered by points-per-effort.

Note: design and balance decisions (rules changes) are the user's; surface them as questions, never decide them silently.

## Phase 4, Path-to-10 plan (BEFORE any repair loop)

Read the prior `.claude/review-state/PATH-TO-10.md`, carry forward open items, drop shipped ones, and rewrite it as the single ordered roadmap: area lifted, expected score movement, bucket, one-line approach; honest ceiling. When the user is present ask first: "any friction or wrong behavior from your latest use?" (playtest reports are the top-weighted input in this repo; most of its best fixes came from them). Ask blocking decisions via AskUserQuestion before the loop.

## Phase 5, Autonomous fix loop (until the AUTONOMOUS bucket is empty)

One task per iteration, smallest root-cause change, full gate, commit, push. Enumerate "all X of a kind" structurally and verify the count. Large mechanical work can go to a fork that leaves the change uncommitted for review. Flip findings to `fixed` with the commit; burn deductions and raise scores by their points. Revert anything that proves unsafe and reclassify it.

Disciplines (each has cost a real session somewhere):
1. A test that passes with the fix reverted is not a test: mutate the fix and watch it fail. In this repo, temporarily edit the engine (keep a copy in the scratchpad, restore with `git checkout <file>` or the copy) and confirm the restore with `git status`.
2. When you move code, prove the bodies moved verbatim mechanically.
3. A guard whose correctness lives in a condition needs the condition pinned, not just the call.
4. A rule enforced over a hand-written list will grow a gap: walk the tree.
5. An alarm recalibrated three times is telling you about the thing it measures.
6. A surface asserting state it has not read is the defect.
7. A per-process guard is N guards on autoscale (here: one process is one table, so per-process is acceptable; note it if multi-table ever lands).
8. A mutation that does not land reads like a test that does not bite: confirm the mutation landed in code, not a comment.
9. THE GATE IS ITS OWN STEP, AND YOU READ ITS RESULT BEFORE STAGING ANYTHING.
10. A predicate that gates a user-facing flow must not depend on a fact the app sets mid-flow.
11. When an expression has been wrong twice, pin the property, not the text.
12. Before accepting "a human reviews this first", find the path where nobody does (here: computer-only tables run with no human; timers auto-advance pauses).
13. Check a finding's stated consequence, not only its premise.
14. A document is an artifact: verify every load-bearing claim in RULES.md against the code before writing it.
15. (Repo) Balance sims are noisy: never call a 3-point move a result; compare like-for-like and say the sample size.
16. (Repo) Test-geometry setups lie easily: when a test places units by hand, assert the premise (range band, contact, overlap) before asserting the behavior, or it can pass for the wrong reason (a pile-in "blocked" test once passed only because the unit was at range 2).

Leave nothing incomplete: every iteration ends committed+pushed or fully reverted.

## Phase 6, Re-review

Fresh agents against the changed code; re-score; redeploy the same artifact with deltas, "what shipped", and remaining HANDOFF/DEFERRED.

## Phase 7, Persist state and self-improve

1. `state.json`: `lastRun`, area scores/deductions, findings statuses.
2. Append `hardened[]` and `learnings[]`.
3. 3b. Make this command leaner: fold in this cycle's efficiency lessons.
4. Append to `log.md`.
5. Refresh `PATH-TO-10.md`.
6. Commit ledger + artifact + roadmap in one commit and push.

Then post a final summary: before/after score, what shipped, HANDOFF steps, DEFERRED items.

## Stop condition

Complete only when the roadmap was presented, the AUTONOMOUS bucket is empty, the tree is clean, the ledger and roadmap are persisted, and the artifact and summary are delivered. Security and data-integrity items must be resolved or explicitly reclassified. Under `/loop`, a cycle's completion rolls straight into the next cycle (fix, or a fresh adversarial review on rotated lenses); the loop ends only on an explicit user stop or token exhaustion.
