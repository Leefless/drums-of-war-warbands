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
- Six obstacles are placed at random in the middle of the table: two each of
  Ruins, Thickets, and Rifts (see section 8).
- Each player deploys from one table edge (south, north, west, east, in seat
  order).

## 2. Muster

1. The host (first seat) sets the **budget** (default 100 points) and the
   **round limit** (default 12).
2. Each player picks an army and buys units up to the budget. Up to 10 units.
   Units marked **unique** can be taken once.
3. Each unit may take **one upgrade**. An army may carry **one relic** (the
   faction-specific upgrades).
4. Press **Ready for battle**. Deployment starts when every seated player is
   ready.

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
| Surge | Move a 1-straight or 1-bank. Fails if it would overlap or leave the table. |
| Sidestep | Slide sideways one base width plus 40. Same restriction. |
| Command | A friendly unit at range 1 to 2 (not Strained) takes one free white action. |
| Mend | Restore 1 ward to yourself or a friend at range 1. |
| Rally | Remove 1 strain. |
| Channel | Gain a Calamity charge (max 2). Spend one while attacking to change any die to a Rend. |

## 8. Obstacles

| Obstacle | Effect on a unit that touches it | Also |
| --- | --- | --- |
| Ruins | Roll an attack die: Strike = 1 damage, Rend = 1 critical. Skips its actions. | Blocks line of fire. |
| Thicket | Gain 1 strain. (Sylvan units ignore Thickets.) | Blocks line of fire. |
| Rift | Roll an attack die: Omen = 1 strain, Strike or Rend = damage. (Calamity units gain a charge instead.) | Blocks line of fire. |

An attack whose line between unit centres crosses any obstacle is
**obstructed**: the defender rolls 1 extra die.

## 9. Combat

**Attack dice (8 sided):** 3 Strike, 1 Rend, 2 Omen, 2 blank.
**Defence dice (8 sided):** 3 Parry, 2 Omen, 3 blank.

1. **Declare** a target and weapon.
2. **Roll attack dice:** weapon dice, +1 at range 1 (not for artillery), plus
   abilities (Bane, Brutal, Swarm), minus Broken Arms.
3. **Attacker modifies:** Steel, Mark, Frenzy, Inspire, Channel. Each die may be
   rerolled only once.
4. **Roll defence dice:** Defence, +1 at range 3 or more (not vs artillery), +1
   obstructed, plus Elusive or Shieldwall, minus 1 for Pierce.
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
| Broken Arms | Rolls 1 fewer attack die for the rest of the battle. |

## 10. The six armies

Each army bends the rules above in its own way. The roster, costs and dials
are on the muster screen.

| Army | Dial | Action economy |
| --- | --- | --- |
| **Iron Holds** | Top speed 3, white Stop, every turn red. | **Unyielding:** after a Stop or 1-straight, take a second action (Steel or Brace). Brace action. |
| **Sylvan Courts** | Speeds 1 to 4, blue banks, white turns. | **Fleetfoot:** actions link into red Sidestep or Surge. **Wildwood:** ignore Thickets. |
| **Greenskin Warhorde** | No Stop, blue fast straights, red hard turns. | **Mob Rule:** Strained only at 2. **Momentum:** speed 4+ gives Frenzy. No Guard. |
| **Umbral Covenant** | Speeds 1 to 3, all white, no blue. | **Puppet Strings:** thralls have no actions; masters take 2 and Command thralls to Steel, Guard or Surge. **Deathless:** strain becomes 1 damage instead. |
| **Calamity Host** | Low and white, plus red Rift jumps. | **Overreach:** a second action, then roll Taint (Strike = 1 damage, Rend = critical). **Channel** charges. |
| **Dawnward Concord** | Balanced 1 to 4. | **Rally** while Strained. Commanders and Command. Bane vs undead and Calamity. |

## 11. Abilities

| Ability | Effect |
| --- | --- |
| Inspire | Friendly units at range 1 may reroll 1 attack die. |
| Shieldwall | +1 defence die while another friendly Shieldwall unit is at range 1. |
| Rewarding | Recover 1 ward in the End phase. |
| Pierce | The defender rolls 1 fewer defence die. |
| Ram | When this unit bumps an enemy, that enemy suffers 1 damage. |
| Swarm | +1 attack die if another friendly Swarm unit also has the target in its front arc at range 1 to 2. |
| Regenerate | End phase: roll an attack die; Strike or Rend recovers 1 wound. |
| Master | Takes 2 actions each activation. |
| Raise | Gains a Soul (max 3) whenever a unit dies at range 1 to 2. End phase: spend Souls to heal thralls at range 2. |
| Thrall | No actions of its own. |
| Fear | Start of Engagement: each enemy at range 1 gains 1 strain (undead are immune). |
| Ethereal | Moves through units and obstacles without effect; still cannot end on a unit. |
| Unstable | When destroyed, every unit at range 1 suffers 1 damage. |
| Elusive | +1 defence die at range 2 and 3. |
| Bane | +1 attack die against undead and Calamity units. |
| Brutal | +1 attack die at range 1. |

## 12. Victory

- The battle ends when only one warband remains, or after the round limit.
- **Victory points** = the points cost (with upgrades) of every enemy unit you
  destroyed, plus fleeing enemies.
- On the round limit, the most VP wins; ties go to the most points still on
  the table.
