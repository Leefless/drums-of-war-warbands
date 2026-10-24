# Drums of War: Warbands, Roadmap

Possible changes for the future. Nothing here is built yet; each entry says what it
is, why it is worth doing, roughly how big it is, and what to watch out for. Balance
numbers come from computer-vs-computer simulations (`scripts/sim-presets.mjs`), so
treat them as "is anything far out of line", not exact strengths.

## 1. Balance follow-ups

### 1.1 Big games (200+ DP) favour shooting armies

At 100 DP the six armies win 43 to 56% each. At 200 DP the spread opens to 32 to 68%:
gunlines dominate (The Grudge Battery 91%, Powder and Prayer 78%) and melee lists
collapse (The Unbroken Wall 13%). The battlefield grows with DP (900 at 100 up to 1600
at 300), so melee armies spend most of the game crossing open ground under fire; the
first kill comes around round 8 of 12.

Options, cheapest first:

- **Grow the board less.** For example 1100 at 200 DP instead of 1300 (`boardSize` in
  `shared/geometry.js`). Small. Risk: big armies get crowded deploying.
- **Start armies closer.** Deeper deployment zones in big games, or zones that do not
  grow with the board. Small.
- **More cover in big games.** Raise the share of line-of-sight-blocking terrain
  (forests, ruins, rocks) as the board grows (`terrainCount` and battlefield weights in
  `shared/terrain.js` and `shared/battlefield.js`). Small.
- **More rounds by default in big games.** 16 rounds at 200+ DP. Small, but slower games.

Re-run `node scripts/sim-presets.mjs 2 all 200` after any of these.

### 1.2 The Sylvan Courts are the weakest army

Sylvan sits around 42 to 43% at 100 DP even after tuning; it was the weakest army before
items and terrain too. A focused pass on its rosters or its Fleetfoot rule would help.
Medium.

### 1.3 Tune presets at 200 DP

Preset gear shares (`gear` in `shared/presets/*.js`) are tuned at 100 DP only. Once 1.1 is
settled, tune them at 200 DP too.

## 2. Ideas from A Song of Ice and Fire: Tabletop Miniatures Game

Research into CMON's ASOIAF miniatures game (2026-10-24). Its combat (blocks of troops
in ranks, alternating activation) does not fit a secret-dial single-base game, but its
layers around combat do. In priority order:

### 2.1 Objective game modes (recommended first)

**What:** A "Mode" setting next to DP and Rounds. "Classic" stays the default; add 2 or 3
modes, for example **Hold the Ground** (3 markers; a unit whose base centre is on one in
the End phase claims it; +2 VP per marker held each round) and **King of the Hill** (one
central marker).

**Why:** Gives movement and initiative a purpose beyond hunting kills, gives the side
losing the fight a comeback route, and makes fast armies (Sylvan, Greenskin riders) and
anchor units (Holds lines, Umbral thralls) matter in new ways.

**Size:** Medium. **Risks:** armies were balanced for kill points only, so re-run the sims
per mode; the computer opponent needs a "go hold the marker" plan; decide whether markers
are always visible through fog of war.

### 2.2 Flank and rear attacks for every army (recommended second)

**What:** An attack from outside the target's front arc removes 1 defence die; from its
rear arc, 2. Calamity keeps its Rift Ambush (ignore stances, +1 attack die) on top, so it
does this better rather than alone.

**Why:** Makes facing and the dial matter more, rewards Wheel About, Sidestep and Surge,
and gives defensive stances a counterplay.

**Size:** Small to medium (the arc check already exists as `attackSide` in
`shared/engine.js`). **Risks:** Calamity's identity thins if the base rule is too strong;
consider rear only, or flank only against units not in a stance. Needs a full re-sim.

### 2.3 Tactics hand (one-shot trigger cards)

**What:** Each army gets about 8 trigger cards (faction cards plus 2 or 3 tied to the chosen
champion). Deal 3 at deployment, draw 1 each round, hold up to 5. Triggers use existing
moments: when you declare an attack, after a defence roll, when a unit is destroyed, at the
start of the Engagement phase. Effects stay small and reuse tokens: reroll a die, gain a
Steel or Guard token, ignore a stance, a free Surge.

**Why:** Army identity, comeback tools and a bluffing layer, and hidden hands are free in a
browser game.

**Size:** Large (new hand state, a "play card" step in the attack flow, the computer has to
play cards, every card is a balance case). **Risks:** conflicts with "each die is rerolled
only once" and with simultaneous fire at equal initiative. Ship as an optional setting.

### 2.4 Morale

**What:** When a unit loses half its wounds in one round (or a friend dies at range 1), it
tests: on an Omen or blank it gains 1 strain. Deathless and Thrall units are exempt; units
at range 1 to 2 of an Inspire or Master champion pass automatically.

**Why:** Makes losing a champion or a healer more than a points swing, and gives Fear and
Fearless more weight.

**Size:** Medium. **Risks:** overlaps strain and the Shaken critical; can snowball for the
side already losing. Try it behind an on/off setting first.

### 2.5 Mercenaries

**What:** A shared "Free Company" pool of about 6 units any army may spend up to 30% of its
DP on.

**Why:** Much more build variety for little code (a Greenskin army hiring Holds gunners),
and it fills gaps in some armies.

**Size:** Small to medium. **Risks:** faction rules (Discipline, Puppet Strings, Fleetfoot)
were tuned for same-army units; keep mercenaries a little weaker than army units so armies
keep their identity.

### 2.6 Smaller ideas

- **Free commander slot:** a no-DP standard bearer (no weapons, 1 wound) that grants an aura
  (Inspire, Warcry or Command) and is worth points when destroyed. Small. Risk: free power
  breaks the cost model's assumptions.
- **Vulnerable token:** a new "Expose" action puts a token on an enemy at range 1 to 3 that
  removes 1 defence die from its next defence roll. Small. Risk: overlaps Mark.

### Not a fit

- **Ranks and trays** (models removed from the back rank): a second damage model on top of
  wounds.
- **Alternating single-unit activation:** would remove the secret dial planning that defines
  this game.
- **The Tactics Board** (political worker placement with non-combat units): a second game
  with no board presence. A reduced form is the tactics hand (2.3).
- **A separate charge action:** we already have Charge and range 1 bonuses.

### Already covered

Champions (commanders), one upgrade plus one magic item per unit (attachments), Fear,
Fearless and Shaken (morale flavour), DP tiers with scaled battlefields (game sizes), and
Calamity Rift Ambush (flank and rear, one army only).

Sources: rulespal.com ASOIAF rulebook transcription and reviews on meeplemountain.com,
gamingtrend.com, rpg.net and techraptor.net (the official asoiaf.cmon.com site blocked
automated access).

## 3. Other open items

- **Real playtests.** All balance so far is computer against computer; human games are the
  real test of item prices, terrain prices and battlefield strength.
- **Campaign layer.** Linked battles with persistent warbands, an idea from earlier.
- **The computer opponent buys no terrain** and only picks items at random within a reserve;
  it could use the preset shortlists.
