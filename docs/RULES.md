# Drums of War: Warbands, Rules of Play

A maneuver wargame for 2 to 4 players. Each player commands a small warband
from one of six armies and plays on their own computer. Orders are set in
secret and resolved together, in the style of the X-Wing Miniatures Game. The
server enforces every rule below; this document is the reference.

For the world and its armies, see [LORE.md](LORE.md).

## 1. The table

- The battlefield is 900 x 900 (a 3' x 3' table). The faint grid marks one
  **range band** (100) per square.
- **Range** is measured base edge to base edge: up to 100 is range 1, up to 200
  is range 2, and so on. Touching bases are range 1.
- Each unit sits on a square **base**: small (40), medium (60), or large (80).
  The thick edge is its front.
- Ten terrain pieces are placed at random in the middle of the table: hills,
  forests, ruins, lava, marsh, a rift and rocks (see section 8). The ground is
  one of several painted battlefields, chosen per battle.
- Each player deploys from one table edge (south, north, west, east, in seat
  order), in a zone 180 deep. Units start in neat ranks; move them by clicking
  inside the zone (or with the arrow keys) and rotate with Q and E. Bases may
  not overlap when you press Ready.
- **Map view.** Scroll (or pinch) to zoom toward the pointer, drag to pan once zoomed, and use the + / − / Fit buttons in the corner. A click without dragging still selects as normal.

## 2. Muster

1. The host (first seat) sets the **budget** (default 100 points) and the
   **round limit** (default 12).
2. Each player picks an army and builds a warband in the army builder. Every
   army offers at least 25 units and at least 10 champions.
3. Army rules:
   - **Champion (optional):** at most one per army. Every champion has
     leadership (Inspire, Warcry, Master, or the Command action).
   - Up to **12 units** besides the champion, and at most **3 copies** of
     any one unit.
   - Each unit may take **one upgrade**. An army may carry **one relic** (the
     faction-specific upgrades).
4. **Saved armies:** name a list and press Save. Saved armies live on the host
   computer (`data/armies.json`), survive restarts, and can be loaded by anyone
   at the table. A saved list may be over the current budget; it just cannot
   be readied until it fits.
5. Press **Ready for battle**. Deployment starts when every seated player is
   ready.

### Points costs

No cost is set by hand: each unit's price is computed from its profile
(`shared/cost.js`), and the builder shows the breakdown.

| Part | What drives it |
| --- | --- |
| Power | Offense multiplied by durability, then softened (power to the 0.6). Offense counts attack dice, reach and arc (all-round arcs are worth the most); durability counts wounds, ward and defence dice. |
| Move | Top speed, number of maneuvers, blue moves (good), red moves (bad), Rift jumps. |
| Init | Higher initiative moves later and shoots first. |
| Actions | Each action on the bar, with red actions and links at reduced value. |
| Abilities | A fixed value per ability (Thrall subtracts). |

Champions cost 15% more than their computed value: one unique, optional slot of
concentrated power. The coefficients were tuned on 1,440-game bot simulations so
that each army wins roughly 47 to 55% of random 100-point battles.


### Bigger games

Larger budgets field larger armies on a larger battlefield, so space per point stays about the same.

| Budget | Units (plus a champion) | Copies of one unit | Battlefield | Terrain pieces |
| --- | --- | --- | --- | --- |
| 100 or less | 12 | 3 | 900 x 900 | 10 |
| 150 | 18 | 5 | 1100 x 1100 | 12 |
| 200 | 24 | 6 | 1300 x 1300 | 17 |
| 300 | 36 | 9 | 1600 x 1600 | 26 |

Deployment zones deepen with the battlefield. Prebuilt warbands scale to the budget in the same proportions.

**Same army twice.** Several players may pick the same army. The first of them
keeps the army colour; the others' units, name chips and deployment zones are
marked in bone white, cobalt or magenta so every side stays easy to tell apart.

## 3. Unit profile

| Stat | Meaning |
| --- | --- |
| Initiative (1 to 6) | Low moves first; high attacks first. |
| Weapons | Dice, firing arc (front 90°, rear 90°, or full), range band(s). |
| Defence | Defence dice rolled when attacked. |
| Wounds | Damage it can take. At 0 it is destroyed. |
| Ward | Magical shielding. Every point of damage removes a ward first. |
| Action bar | The actions it may take. Red actions give 1 strain. |
| Dial | The maneuvers it can plan, coloured blue, white, or red. |

## 4. The round

Every round has four phases.

### 4.1 Planning (secret, simultaneous)

Every player sets one maneuver on the dial of each of their units. Other
players see only that a dial is set, never which one. Press **Lock in
orders**; the round continues when everyone has locked in.

A **Strained** unit (section 6) cannot plan a red maneuver.

**Quick orders.** Three buttons at the top of the planning panel set every
dial at once. You can change any unit afterwards, and the order leaves units
you set by hand alone.

| Order | What it does |
| --- | --- |
| **Charge** | Every unit drives as fast as it can at the densest group of enemies you can see (or their deployment zone if none are in sight). A banner marks the target: drag it on the map to redirect the charge. |
| **Scatter** | Every unit breaks away from the enemy mass and spreads out, keeping off the table edges. |
| **Defend** | The warband closes ranks on the most defensible ground nearby (cover or high ground, away from the enemy) and units that have arrived take a defensive stance facing the enemy. |

### 4.2 Activation (lowest initiative first)

Units activate one at a time from initiative 1 upward. Ties go in seat order,
and the first seat rotates every round. When a unit activates:

1. **Reveal and move.** It executes its maneuver (section 5).
2. **Check difficulty.** Red: gain 1 strain. Blue: remove 1 strain.
3. **Take actions** (section 7), unless it bumped, hit Ruins, or is Staggered.

### 4.3 Engagement (highest initiative first)

Units attack from initiative 6 downward. Each unit may make **one attack**
with one weapon against one enemy in that weapon's arc and range. Units with
the **same initiative fire simultaneously**: a unit destroyed by an attacker
of equal initiative still makes its own attack before it is removed.

### 4.4 End

Bleeding units take 1 damage. Regeneration, ward recovery and Souls resolve.
Steel, Guard, Brace and Frenzy tokens are discarded. Marks and Calamity
charges stay. Then check for victory.

## 5. Movement

| Glyph | Maneuver | Template |
| --- | --- | --- |
| ↑ | Straight | Speed x 40 forward. |
| ↖ ↗ | Bank | 45° arc (gentle). |
| ↰ ↱ | Turn | 90° arc (hard). |
| U | Wheel About | Straight, then the unit faces its rear. |
| Rift | Rift | Straight teleport that ignores units and obstacles on the way. |
| ■ | Stop | Stays in place. |
| ← ↖ ◆ ↗ → ↓ | Defensive stance | Every unit's bottom row (**Def**). Stays in place and pivots to a new facing (90° or 45° left or right, hold, or face the rear), then gains extra defence dice until the end of the round. |

**Defensive stance.** The unit gives up its movement for defence, so faster
units gain more: top speed 1 to 3 gives **+1 defence die**, top speed 4 or 5
gives **+2**. If pivoting would overlap another base or rocks, the unit keeps
its old facing but still gains the bonus. A stance is white: it neither adds
nor removes strain, and the unit still takes its actions and attacks.

**Aim (ranged units only).** Units with a weapon that reaches range 2 or more
have a second bottom row, **Aim** (← ↖ ◎ ↗ → ↓). Like a stance, the unit stays
in place and pivots, but instead of bracing it lines up its shots. Aim is worth
the same number of dice as that unit's stance (+1 or +2), and it only ever
cancels a defensive stance: when an aimed unit attacks a target in a stance, it
rolls extra attack dice equal to the smaller of its Aim and the target's stance
bonus. Against a target that is not in a stance, Aim adds nothing, so it never
changes the normal attack and defence numbers.

**Calamity Rift Ambush.** The Calamity Host strikes around a braced line: when a
Calamity unit attacks from outside the target's front arc (its flank or rear,
judged from the attacker's base centre), the target's defensive stance does not
count and the attacker rolls +1 attack die.

The base travels its own length plus the template, exactly like X-Wing.

- **Bumping.** If the unit would end overlapping another base, it backs up
  along its path until it no longer overlaps. A bumped unit skips its actions.
  A Wheel About that bumps does not turn around.
- **Fleeing.** A unit whose base ends partly off the table is lost. Its points
  score for every opponent still fighting.
- **Obstacles** apply when a unit moves through or ends on one (section 8).

## 6. Strain

Red maneuvers and red actions give 1 strain. A unit is **Strained** when its
strain reaches its cap (1 for most units, 2 for Greenskins). A Strained unit:

- cannot plan red maneuvers, and
- cannot take actions (except Concord units, which may still Rally).

Blue maneuvers and Rally remove strain.

## 7. Actions

A unit normally takes **one action** per activation, and never the same action
twice. Some actions are **linked** (`Steel → red Sidestep`): after the first,
it may immediately take the second as part of the same action.

| Action | Effect |
| --- | --- |
| Steel | Gain a Steel token. Spend it to turn every Omen into a Strike (attacking) or a Parry (defending). |
| Guard | Gain a Guard token. Spend it while defending to add one Parry. |
| Brace | Gain a Brace token. Spend it after defence dice to cancel one Strike. |
| Mark | Mark an enemy at range 1 to 3. When attacking it, spend the Mark to reroll any attack dice. |
| Surge | Move a 1-straight or 1-bank. Fails if it would overlap a unit or rocks, or leave the table. Terrain it enters still applies (including a hill climb). |
| Sidestep | Slide sideways one base width plus 40. Same restriction. |
| Command | A friendly unit at range 1 to 2 (not Strained) takes one free white action. |
| Mend | Restore 1 ward to yourself or a friend at range 1. |
| Rally | Remove 1 strain. |
| Channel | Gain a Calamity charge (max 2). Spend one while attacking to change any die to a Rend. |

## 8. Terrain and line of sight

Each battle lays out ten terrain pieces in the middle of the table: two hills,
two forests, ruins, lava, marsh, a rift and two blocks of rocks. Every piece is
a circle. A unit is **in** a piece when the centre of its base is inside it,
and **touches** it when any part of its base overlaps it. Hover a piece on the
board to see its effects.

| Terrain | Upside | Downside |
| --- | --- | --- |
| **Hill** | High ground: +1 maximum weapon range (up to 4), sees 1 band farther and over forests and ruins, and +1 defence die against attackers not on a hill. | Climbing onto it gives 1 strain. A unit on a hill can never be concealed. |
| **Forest** | Cover: +1 defence die inside. Blocks line of sight. Units inside are concealed. | Entering it gives 1 strain, and attacks made from inside roll 1 fewer die (Sylvan units ignore both). |
| **Ruins** | Cover: +1 defence die inside. Blocks line of sight. | Entering it rolls an attack die (Strike = 1 damage, Rend = 1 damage and a critical) and the unit loses its actions. |
| **Lava** | Heat haze: attacks that cross it give the defender +1 die. | Burns for 1 damage, and a unit that enters it stops 40 into it. Calamity units are not burned and gain a Calamity charge instead. |
| **Marsh** | Mist: attacks that cross it give the defender +1 die. | A unit that enters it stops 40 into it, and units standing in it roll 1 fewer defence die. |
| **Rift** | Calamity units gain a Calamity charge when they touch it. | Others roll an attack die: Omen = 1 strain, Strike or Rend = damage. |
| **Rocks** | Block line of sight completely: hide behind them. | Impassable: a moving unit stops before touching them and loses its actions, like a bump. |

Terrain effects trigger when a unit **enters** a piece (by maneuver, Surge or
Sidestep), not every round it stays there. Standing effects (cover, high
ground, concealment, marsh footing) apply for as long as the unit is in it.

Flying and Ethereal units ignore terrain while moving (no strain, slowing,
damage or climbing), but still cannot end a move on rocks.

**Line of sight** runs centre to centre. Rocks always block it. Forests and
ruins block it unless one of the two units stands in that piece, or either unit
is on a hill.

## 9. Fog of war

From deployment onward, each player only sees the enemy units their own units
can spot; the others are not shown on that player's board or named in their
log. A **Watch only** screen sees only what every player can see, unless the
host ticks **Spectators see all** in the muster settings (for a table TV that
no player can glance at).

- A unit spots enemies within **3 range bands** (4 from a hill) in line of
  sight.
- **Concealed** enemies (Stealthy units, and units in a forest that are not on a
  hill) can only be spotted from **range 1**.
- A unit that **attacks** is revealed to everyone for the rest of the round.
- You can only attack an enemy your side has spotted, and only with line of
  sight from the attacking unit.
- **Ambush:** attacking an enemy whose side cannot currently see the attacker
  adds 1 attack die.

## 10. Combat

**Attack dice (8 sided):** 3 Strike, 1 Rend, 2 Omen, 2 blank.
**Defence dice (8 sided):** 3 Parry, 2 Omen, 3 blank.

1. **Declare** a target and weapon.
2. **Roll attack dice:** weapon dice, +1 at range 1 (not for artillery), +1 for
   an ambush, plus Aim against a target in a stance (never more than its stance
   added), plus abilities (Bane, Brutal, Swarm, Charge, Berserk), minus Broken
   Arms, minus 1 if attacking from inside a forest. Always at least 1 die.
3. **Attacker modifies:** Steel, Mark, Frenzy, Inspire, Channel. Each die may be
   rerolled only once.
4. **Roll defence dice:** Defence, +1 at range 3 or more (not vs artillery),
   +1 for haze (lava or marsh between), +1 in cover, +1 on high ground against
   an attacker below, -1 standing in marsh, plus Elusive, Shieldwall or
   Guardian, +1 for Concord Discipline, plus a defensive stance (+1 or +2),
   minus 1 for Pierce.
5. **Defender modifies:** Steel, Guard, Brace.
6. **Cancel:** each Parry cancels a Strike, then Rends. Brace cancels one more
   Strike.
7. **Damage:** each remaining Strike or Rend removes a ward, or if none, a
   wound. A Rend that reaches wounds also inflicts a **critical**:

| Critical | Effect |
| --- | --- |
| Shaken | Gain 1 strain. |
| Bleeding | Take 1 damage in the End phase. |
| Staggered | No actions during its next activation. |
| Broken Arms | Rolls 1 fewer attack die for the rest of the battle (stacks). |

## 11. The six armies

Each army bends the rules above in its own way. The full rosters, computed
costs and dials are in the army builder. Some mechanics belong to one army
only: Brace (Iron Holds), Channel (Calamity Host), and Master, Thrall and
Raise (Umbral Covenant).

| Army | Dial | Action economy |
| --- | --- | --- |
| **Iron Holds** | Mostly top speed 3, white Stop, red hard turns (rams and gyros reach 4). | **Unyielding:** after a Stop or 1-straight, take a second action (Steel or Brace). Brace action. |
| **Sylvan Courts** | Speeds 1 to 4 (cavalry and flyers 5), blue banks, white turns. | **Fleetfoot:** actions link into red Sidestep or Surge. **Wildwood:** forests never hinder them. |
| **Greenskin Warhorde** | No Stop, blue fast straights, red hard turns. | **Mob Rule:** Strained only at 2. **Momentum:** speed 4+ gives Frenzy. No Guard. |
| **Umbral Covenant** | Mostly speeds 1 to 3, white turns, no blue. | **Puppet Strings:** thralls have no actions; masters take 2 (and may Command twice) to drive thralls to Steel, Guard or Surge. **Deathless:** strain becomes 1 damage instead. |
| **Calamity Host** | Low and white, plus Rift jumps (mostly red). | **Overreach:** a second action, then roll Taint (Strike = 1 damage, Rend = 1 damage and a critical). **Channel** charges. **Rift Ambush:** flank and rear attacks ignore a defensive stance and roll +1 die. |
| **Dawnward Concord** | Balanced 1 to 4. | **Discipline:** +1 defence die while another friendly unit is at range 1. **Rally** while Strained. Commanders and Command. Bane vs undead and Calamity. |

## 12. Abilities

| Ability | Effect |
| --- | --- |
| Inspire | Friendly units at range 1 may reroll 1 attack die. |
| Shieldwall | +1 defence die while another friendly Shieldwall unit is at range 1. |
| Rewarding | Recover 1 ward in the End phase. |
| Pierce | The defender rolls 1 fewer defence die. |
| Ram | When this unit bumps an enemy, that enemy suffers 1 damage. |
| Swarm | +1 attack die if another friendly Swarm unit also has the target in its front arc at range 1 to 2. |
| Regenerate | End phase: roll an attack die; Strike or Rend recovers 1 wound. |
| Master | Takes 2 actions each activation, and may Command twice (two different units). |
| Raise | Gains a Soul (max 3) whenever a unit dies at range 1 to 2. End phase: spend Souls to heal thralls at range 2. |
| Thrall | No actions of its own. |
| Fear | Start of Engagement: each enemy at range 1 gains 1 strain (undead are immune). |
| Ethereal | Moves through units and obstacles without effect; still cannot end on a unit. |
| Unstable | When destroyed, every unit at range 1 suffers 1 damage. |
| Elusive | +1 defence die at range 2 or more. |
| Bane | +1 attack die against undead and Calamity units. |
| Brutal | +1 attack die at range 1. |
| Charge | +1 attack die at range 1 after a maneuver of speed 3 or more this round. |
| Sniper | Targets do not gain the range 3 defence bonus. |
| Armored | An attack that would deal 2 or more damage deals 1 less. |
| Flying | Ignores obstacles when moving. |
| Healer | End phase: heal 1 wound on the friendly unit at range 1 with the lowest share of its wounds left. |
| Berserk | +1 attack die while wounded. |
| Stealthy | Cannot be attacked from range 3 or more. |
| Guardian | Other friendly units at range 1 roll 1 extra defence die. |
| Vampiric | Heals 1 wound whenever its attack deals damage. |
| Poison | An attack that deals damage also inflicts Bleeding. |
| Blast | An attack that deals damage also deals 1 damage to every other enemy at range 1 of the target. |
| Fearless | Immune to Fear and to the Shaken critical. |
| Warcry | Start of Engagement: this unit and friendly units at range 1 to 2 each have at least one Steel token. |

## 13. Victory

- The battle ends when only one warband remains, or after the round limit.
- **Victory points** = the points cost (with upgrades) of every enemy unit you
  destroyed, plus fleeing enemies.
- On the round limit, the warband with the most VP **among those still on the
  field** wins; ties go to the most points still on the table.
- Deaths in the End phase (Bleeding) count immediately. A Poison kill scores
  for the poisoner; terrain, Taint and strain deaths score for nobody, and a
  unit that flees scores for every opponent.
