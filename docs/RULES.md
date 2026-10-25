# Drums of War: Warbands, Rules of Play

A maneuver wargame for 2 to 4 players. Each player commands a small warband
from one of six armies and plays on their own computer. Orders are set in
secret and resolved together, in the style of the X-Wing Miniatures Game. The
server enforces every rule below; this document is the reference, and the
Rules button in the game opens it.

For the world and its armies, see [LORE.md](LORE.md). For ideas under
consideration, see [ROADMAP.md](ROADMAP.md).

## 1. The table

- The standard battlefield is 900 x 900 (a 3' x 3' table). The faint grid marks
  one **range band** (100) per square. Bigger games use a bigger battlefield
  (see Bigger games in section 2).
- **Range** is measured base edge to base edge: up to 100 is range 1, up to 200
  is range 2, and so on. Touching bases are range 1.
- Each unit sits on a square **base**: small (40), medium (60), or large (80).
  The thick edge is its front.
- Weapons fire in a **90 degree arc** (front or rear) or all round (full), out
  to the weapon's range band or bands.
- Random terrain pieces are placed in the middle of the table: hills, forests,
  ruins, lava, marsh, rifts and rocks (see section 8). The ground is one of
  three painted battlefields, chosen per battle, and the battlefield decides
  the mix of pieces (see Battlefields in section 2).
- Each player deploys from one table edge (south, north, west, east, in seat
  order). The zone runs from 110 in from each corner to 110 short of the far
  corner along that edge, and is 180 deep on the standard board (deeper on
  bigger boards). Units start in neat ranks. Click a unit and click inside the
  zone to move it, or use the arrow keys to nudge it 10 at a time. Press Q or E
  to rotate it 45 degrees. Units must sit fully inside the zone, cannot stand on
  rocks, and bases may not overlap when you press Ready.
- **Map view.** Scroll or trackpad pinch zooms toward the pointer (pinching on
  a touch screen is not supported). Drag to pan once zoomed, and use the + / - /
  Fit buttons in the corner. A click without dragging still selects as normal.
  During your attack step, clicking an enemy that only one of your weapons can
  hit declares that attack straight away.

## 2. Muster

1. The host (the first human seated) sets the **DP** (deployment points,
   default 100) and the **round limit** (default 12). The menus offer DP of 60,
   100, 150, 200 or 300 and 6, 8, 12 or 16 rounds. The server accepts any DP
   from 40 to 300 and any round limit from 3 to 20.
2. Each player picks an army and builds a warband in the army builder. The
   builder has four tabs: **Champions**, **Units**, **Magic Items** and
   **Terrain**, with a search box, sort and role filters. A prebuilt warband
   (four styles per army) loads units, upgrades, magic items and terrain at the
   current DP in one click, and you can change anything afterwards.
3. Army rules:
   - **Champion (optional):** at most one per army. Every champion has
     leadership (Inspire, Warcry, Master, or the Command action).
   - Up to **12 units** besides the champion, and at most **3 copies** of
     any one unit (more in bigger games).
   - Each unit may take **one upgrade**. An army may carry **one relic** (the
     faction-specific upgrades).
   - Each unit may also carry **one magic item**. Each item names the units
     that may carry it, and can appear only once per army.
   - Terrain bought in the muster counts against your DP (see Terrain to place).
4. **Saved armies:** name a list and press Save. A saved army keeps its units,
   upgrades, magic items and bought terrain, and may hold up to 40 entries.
   Saved armies live on the host computer (`data/armies.json`), survive
   restarts, and can be loaded by anyone at the table. The table holds at most
   300 saved armies and each player at most 40. Only the army's author or the
   host can delete one. A saved list may be over the current DP; it just cannot
   be readied until it fits.
5. Press **Ready for battle** (at the top of the warband panel). It is enabled
   once the list is legal and within your DP. **Edit army** reopens the list
   while the battle has not started. Deployment starts when every seated player
   is ready and at least two are seated.

### Armies at a glance

Every army has at least 25 units and at least 10 champions, plus a catalogue
of magic items drawn from its own lore. The game has 247 units (179 units and
68 champions) and 212 magic items.

| Army | Units | Champions | Magic items |
| --- | --- | --- | --- |
| Iron Holds | 31 | 11 | 35 |
| Sylvan Courts | 29 | 11 | 33 |
| Greenskin Warhorde | 33 | 12 | 38 |
| Umbral Covenant | 27 | 11 | 37 |
| Calamity Host | 28 | 11 | 35 |
| Dawnward Concord | 31 | 12 | 34 |

### Points costs

No cost is set by hand: each unit's price is computed from its profile, and the
builder shows the breakdown.

| Part | What drives it |
| --- | --- |
| Power | Offense multiplied by durability, then softened (power to the 0.6). Offense counts attack dice, reach and arc (all-round arcs are worth the most); durability counts wounds, ward and defence dice. |
| Move | Top speed, number of maneuvers, blue moves (good), red moves (bad), Rift jumps. |
| Init | Higher initiative moves later and shoots first. |
| Actions | Each action on the bar, with red actions and links at reduced value. |
| Abilities | A fixed value per ability (Thrall subtracts). |

Champions cost 15% more than their computed value: one unique, optional slot of
concentrated power. The coefficients were tuned on computer-versus-computer
simulations. In 100 DP simulations of the prebuilt warbands, each army wins
roughly 43 to 56% of its battles; single warbands spread wider.

### Upgrades and relics

Each unit may take one upgrade. Every army shares the five upgrades below, and
each army also has one relic. An army may carry only one relic.

| Upgrade | DP | Effect |
| --- | --- | --- |
| Veteran | 3 | +1 initiative (maximum 6). |
| Hardened | 3 | +1 wound. |
| Warded Standard | 4 | +1 ward. |
| Battle Banner | 4 | Gain the Command action. Not for Thralls or units that already have Command. |
| Keen Eyes | 2 | Gain the Mark action. Not for Thralls or units that already have Mark. |

| Relic | Army | DP | Effect |
| --- | --- | --- | --- |
| Rune of Stone | Iron Holds | 3 | Brace may cancel a Rend when no Strike is left to cancel. Only for units with a Brace action. |
| Cloak of Leaves | Sylvan Courts | 3 | Gain Elusive. |
| Choppa of Krumpin | Greenskin Warhorde | 3 | Gain Brutal (+1 attack die at range 1). |
| Phylactery | Umbral Covenant | 4 | Start the battle with 2 Souls. Only for units with Raise. |
| Eye of the Rift | Calamity Host | 3 | Taint rolls only hurt on a Rend. |
| Dawnblade | Dawnward Concord | 3 | Gain Bane. |

A relic is not offered to a unit that already has the ability it grants.

### Bigger games

Larger DP games field larger armies on a larger battlefield, so space per point
stays about the same.

| DP | Units (plus a champion) | Copies of one unit | Battlefield | Deployment zone depth | Terrain pieces | Terrain you may buy |
| --- | --- | --- | --- | --- | --- | --- |
| 100 or less | 12 | 3 | 900 x 900 | 180 | 10 | 3 |
| 150 | 18 | 5 | 1100 x 1100 | 220 | 12 | 5 |
| 200 | 24 | 6 | 1300 x 1300 | 260 | 17 | 6 |
| 300 | 36 | 9 | 1600 x 1600 | 320 | 26 | 9 |

Between these steps the limits scale with DP (units and copies by DP divided
by 100, terrain you may buy by three per 100 DP, never fewer than 3). Terrain
pieces is the count of random scenery before anything bought is taken out.

**Same army twice.** Several players may pick the same army. The first of them
keeps the army colour; the others' units, name chips and deployment zones are
marked in bone white, cobalt or magenta so every side stays easy to tell apart.

### Magic items

An item changes a unit's profile. An item may add:

- +1 to +3 initiative (the unit's initiative is capped at 6), defence dice,
  wounds or ward;
- +1 to +3 attack dice or maximum range, applied to every weapon on the unit
  (the maximum range is capped at 4);
- an all-round (full) firing arc on the unit's first weapon;
- one or more abilities or actions.

A unit whose item gives a weapon range 2 or more gains the Aim row on its dial
(see section 5).

Items come in seven kinds: Weapon, Armour, Talisman, Banner, Arcane, Mount and
Relic. An item's price comes from the same cost model that prices units: the
unit's cost with the item minus its cost without, times 1.5 (1.0 for the
Greenskin Warhorde), at least 3 DP, and with the 15% champion premium on a
champion. So the same blade costs more on a monster than on a goblin. The 1.5
comes from battle simulations: priced at the plain modelled value, an army that
spent points on items beat the same style spending them on units 63% of the
time; at these prices it is 53%. An item's price counts toward the unit's
points cost in battle, so it also counts as victory points when the unit is
destroyed (section 13).

### Terrain to place

Armies may buy terrain in the muster and place it before the battle.

| Terrain | DP | Bought piece radius |
| --- | --- | --- |
| Hill | 8 | 83 |
| Forest | 5 | 55 |
| Ruins | 5 | 48 |
| Lava | 5 | 45 |
| Rift | 5 | 42 |
| Marsh | 4 | 53 |
| Rocks | 3 | 27 |

You may buy up to 3 pieces at 100 DP or less (more in bigger games, see the
table above). Opponents' terrain purchases stay hidden until deployment shows
them; the DP each army spent is announced in the log when it musters.

During deployment each piece is placed with a click and shows a green or red
outline: green when the spot is legal. A legal spot is on the battlefield, at
least the piece's radius plus 5 outside every seated player's deployment zone,
and more than 10 from any other piece. You can pick a placed piece up and move
it until you press Ready. Any piece not placed when you ready is placed for
you, leaning toward your side. A piece with no legal spot left is lost. Each
piece bought replaces one and a half pieces of random scenery (rounded up
across the whole table, and never fewer than 4 random pieces).

### Battlefields

The player with the **most DP left unspent** chooses the battlefield during
deployment (ties go to the lowest seat), so keeping DP in reserve is a real
choice. Until they choose, the battle is set for a random one, and the choice
can be made once. Choosing re-lays the random terrain for that battlefield.
The battlefield sets the ground and the mix of random terrain, and gives two
armies an edge and two a handicap. Every army is favoured on exactly one
battlefield and hindered on exactly one. A battlefield's effect on initiative
applies when the battle starts (initiative stays between 1 and 6).

| Battlefield | Favoured | Hindered |
| --- | --- | --- |
| **Greenmeadow** (open grass, hills) | Concord **Swift** (+1 initiative), Greenskin **Fury** (+1 attack die at range 1) | Sylvan **Exposed** (-1 defence die against attacks from range 2+), Holds **Sluggish** (-1 initiative) |
| **Grey Moor** (mist, marsh, rocks) | Umbral **Stalwart** (+1 defence die against attacks from range 2+), Sylvan **Swift** | Concord **Sluggish**, Calamity **Blunted** (-1 attack die at range 1) |
| **Riftscar Waste** (rifts, lava) | Calamity **Fury**, Holds **Stalwart** | Umbral **Blunted**, Greenskin **Sluggish** |

The random scenery is shared out by the battlefield's weights. At the standard
ten pieces:

| Battlefield | Hills | Forests | Ruins | Marsh | Lava | Rifts | Rocks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Greenmeadow | 3 | 1 | 1 | 1 | 1 | 1 | 2 |
| Grey Moor | 1 | 1 | 2 | 3 | 0 | 1 | 2 |
| Riftscar Waste | 1 | 1 | 2 | 1 | 2 | 2 | 1 |

Bigger boards keep the same proportions.

### Matchups

The armies form a ring. Each army **hunts** the next one and rolls **+1 attack
die** against it:

Iron Holds hunt the Sylvan Courts, who hunt the Calamity Host, who hunts the
Dawnward Concord, who hunt the Greenskin Warhorde, who hunt the Umbral Covenant,
who hunt the Iron Holds.

So every army has one army it is strong against and one it is weak against. The
ring order was chosen from measured results so no hunter was already dominant
against its prey: in simulated battles each hunter has a clear edge over its
prey without winning every game.

## 3. Unit profile

| Stat | Meaning |
| --- | --- |
| Initiative (1 to 6) | Low moves first; high attacks first. |
| Weapons | Dice, firing arc (front 90°, rear 90°, or full), range band(s). A weapon has a minimum range as well as a maximum. |
| Defence | Defence dice rolled when attacked. |
| Wounds | Damage it can take. At 0 it is destroyed. |
| Ward | Magical shielding. Every point of damage removes a ward first. |
| Action bar | The actions it may take. Red actions give 1 strain. |
| Dial | The maneuvers it can plan, coloured blue, white, or red. |

## 4. The round

Every round has four phases.

### 4.1 Planning (secret, simultaneous)

Every player sets one maneuver on the dial of each of their units. Opponents see
that a player is ready (the ready marker by their name), never which units have
dials set or which maneuver is chosen. Press **Lock in orders**; the round
continues when everyone has locked in. You cannot lock in until every unit has a
maneuver. A unit that somehow has none moves a 1-straight (or the first
maneuver on its dial if it has no 1-straight).

A **Strained** unit (section 6) cannot plan a red maneuver.

**Quick orders.** Three buttons at the top of the planning panel set dials for
your whole warband at once, replacing every dial. You can change any unit
afterwards; dragging the Charge banner re-plans the charge but leaves units you
set by hand alone. Quick orders never choose an Aim maneuver, and Charge never
chooses a stance.

| Order | What it does |
| --- | --- |
| **Charge** | Each unit takes the maneuver that ends nearest the target, facing it, at the densest group of enemies you can see (or their deployment zone if none are in sight). Red maneuvers and bumps are penalised, so it is not always top speed. A banner marks the target: drag it on the map to redirect the charge. |
| **Scatter** | Every unit breaks away from the enemy mass and spreads out, keeping off the table edges. |
| **Defend** | The warband closes ranks on the most defensible ground nearby (cover or high ground, away from the enemy) and units that have arrived take a defensive stance facing the enemy. |

### 4.2 Activation (lowest initiative first)

Units activate one at a time from initiative 1 upward. Ties go in seat order,
and the first seat rotates every round. When a unit activates:

1. **Reveal and move.** It executes its maneuver (section 5).
2. **Check difficulty.** Red: gain 1 strain. Blue: remove 1 strain.
3. **Take actions** (section 7), unless it bumped, was stopped by rocks, hit
   Ruins, or is Staggered.

### 4.3 Engagement (highest initiative first)

At the start of Engagement, Fear and Warcry take effect (section 12). Then units
attack from initiative 6 downward. Each unit may make **one attack** with one
weapon against one enemy in that weapon's arc and range. Units with the **same
initiative fire simultaneously**: a unit destroyed by an attacker of equal
initiative still makes its own attack before it is removed.

### 4.4 End

In this order:

1. Bleeding units take 1 damage (ward absorbs it first, as for any damage).
2. For each unit: Regenerate rolls, Rewarding recovers a ward, Healer tends a
   friend, and Raise spends Souls to heal thralls.
3. Steel, Guard, Brace and Frenzy tokens are discarded. Marks, Calamity charges
   and Souls stay.
4. A warband with no units left is **broken** and out of the battle.
5. Victory is checked (section 13).

Stances and Aim last until the end of the round and clear when the next round
begins.

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
(including a range given by a magic item) have a second bottom row, **Aim**
(← ↖ ◎ ↗ → ↓). Like a stance, the unit stays in place and pivots, but instead
of bracing it lines up its shots. Aim is worth the same number of dice as that
unit's stance (+1 or +2), and it only ever cancels a defensive stance: when an
aimed unit attacks a target in a stance, it rolls extra attack dice equal to the
smaller of its Aim and the target's stance bonus. Against a target that is not
in a stance, Aim adds nothing, so it never changes the normal attack and
defence numbers.

**Calamity Rift Ambush.** The Calamity Host strikes around a braced line: when a
Calamity unit attacks from outside the target's front arc (its flank or rear,
judged from the attacker's base centre), the target's defensive stance does not
count and the attacker rolls +1 attack die. Aim adds nothing on such an attack,
since there is no stance left to cancel.

The base travels its own length plus the template, exactly like X-Wing.

- **Bumping.** If the unit would end overlapping another base, it backs up
  along its path until it no longer overlaps. A bumped unit skips its actions.
  A Wheel About that bumps does not turn around.
- **Fleeing.** A unit whose base ends partly off the table is lost. Its points
  score for every opponent still fighting.
- **Obstacles** apply as the unit moves (section 8).

## 6. Strain

Red maneuvers and red actions give 1 strain. A unit is **Strained** when its
strain reaches its cap (1 for most units, 2 for Greenskins). A Strained unit:

- cannot plan red maneuvers, and
- cannot take actions (except Concord units, which may still Rally).

Blue maneuvers and Rally remove strain.

Umbral units are **Deathless**: they never gain strain. Anything that would
strain them deals 1 damage instead, which scores for nobody. Deathless units can
still be given a Command, and ignore Fear.

## 7. Actions

A unit normally takes **one action** per activation, and never the same action
twice. Some actions are **linked** (`Steel → red Sidestep`): after the first,
it may immediately take the second as part of the same action.

| Action | Effect |
| --- | --- |
| Steel | Gain a Steel token. Spend it to turn every Omen into a Strike (attacking) or a Parry (defending). |
| Guard | Gain a Guard token. Spend it while defending to add one Parry. |
| Brace | Gain a Brace token. Spend it after defence dice to cancel one Strike. |
| Mark | Mark an enemy at range 1 to 3 that you can see. When attacking it, spend the Mark to reroll any attack dice. The Mark stays until used. |
| Surge | Move a 1-straight or 1-bank. Fails if it would overlap a unit or rocks, or leave the table. Terrain it enters still applies (including a hill climb). |
| Sidestep | Slide sideways one base width plus 40. Same restriction. |
| Command | A friendly unit at range 1 to 2 (not Strained) takes one free white action of its own (never a red action, and never Command). |
| Mend | Restore 1 ward to yourself or a friend at range 1. |
| Rally | Remove 1 strain. |
| Channel | Gain a Calamity charge (max 2). Spend one while attacking to change any die to a Rend. |

## 8. Terrain and line of sight

Each battle lays out random terrain in the middle of the table (the mix comes
from the battlefield, section 2) and any pieces the players bought. Every piece
is a circle. A unit is **in** a piece when the centre of its base is inside it,
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

Random pieces vary in size. Radius by terrain:

| Terrain | Random piece radius | Bought piece radius |
| --- | --- | --- |
| Hill | 70 to 95 | 83 |
| Forest | 45 to 65 | 55 |
| Ruins | 40 to 55 | 48 |
| Lava | 38 to 52 | 45 |
| Marsh | 45 to 60 | 53 |
| Rift | 35 to 48 | 42 |
| Rocks | 22 to 32 | 27 |

Random terrain stays clear of every deployment zone. The random scenery count is
10, 12, 17 or 26 pieces (standard, 150, 200 and 300 DP boards) minus one and a
half pieces for every piece bought at the table, never fewer than 4.

**When effects trigger.** Terrain effects trigger when a unit **touches** a
piece it was not already touching at the start of its move, at any point along
its path (not only where it ends). They do not repeat every round the unit
stays there. For Surge, Sidestep and Rift maneuvers only the final position
counts. Climbing a hill needs the unit's centre to end on the hill. Standing
effects (cover, high ground, concealment, marsh footing) apply for as long as
the unit's centre is in the piece.

Flying and Ethereal units ignore terrain while moving (no strain, slowing,
damage or climbing), but still cannot end a move on rocks.

**Line of sight** runs centre to centre. Rocks always block it. Forests and
ruins block it unless one of the two units stands in that piece, or either unit
is on a hill.

## 9. Fog of war

From deployment onward, each player only sees the enemy units their own units
can spot; the others are not shown on that player's board. In the log, anything
line about what an unseen enemy did reads only "An unseen enemy acts." (no
maneuver, action or name), and an unseen enemy named in any other line appears
as "an unseen enemy". Watchers (**Watch only**, or **Watch instead of playing**)
always see every unit, so a watching screen works as a table TV. Seated players
should not keep a watching tab open.

- A unit spots enemies within **3 range bands** (4 from a hill) in line of
  sight.
- **Concealed** enemies can only be spotted from **range 1**. A Stealthy unit is
  concealed, and so is any unit in a forest, unless it stands on a hill.
- A unit that **attacks** is revealed to everyone for the rest of the round.
- You can only attack an enemy your side has spotted, and only with line of
  sight from the attacking unit.
- **Stealthy** units can never be attacked from range 3 or more, even when
  they are spotted.
- **Ambush:** attacking an enemy whose side cannot currently see the attacker
  adds 1 attack die.
- Opponents' army lists and terrain purchases stay hidden until deployment
  shows them.

## 10. Combat

**Attack dice (8 sided):** 3 Strike, 1 Rend, 2 Omen, 2 blank.
**Defence dice (8 sided):** 3 Parry, 2 Omen, 3 blank.

1. **Declare** a target and weapon.
2. **Roll attack dice.** Start with the weapon's dice, then:
   - +1 at range 1 (not for weapons marked no range bonus, below);
   - +1 for an ambush;
   - +1 when attacking the army your army hunts (section 2);
   - +1 or -1 at range 1 for a battlefield Fury or Blunted effect;
   - +1 for Calamity Rift Ambush from a flank or rear;
   - plus Aim against a target in a stance (never more than its stance added);
   - plus abilities (Bane, Brutal, Swarm, Charge, Berserk);
   - -1 for each Broken Arms critical, and -1 if attacking from inside a forest.

   Always at least 1 die.
3. **Attacker modifies:** Steel, Mark, Frenzy, Inspire, Channel. Each die may be
   rerolled only once. A reroll with no dice picked rerolls blanks and Omens.
   Inspire works for friends only and rerolls 1 die per attack. Frenzy rerolls
   up to 2 dice.
4. **Roll defence dice.** Start with Defence, then:
   - +1 at range 3 or more (not against weapons marked no range bonus, and not
     against Sniper);
   - +1 for haze (lava or marsh between);
   - +1 in cover (inside a forest or ruins);
   - +1 on high ground against an attacker who is not on a hill;
   - -1 standing in marsh;
   - plus Elusive, Shieldwall or Guardian;
   - +1 for Concord Discipline;
   - plus a defensive stance (+1 or +2; it does not count against Rift Ambush
     from a flank or rear);
   - +1 for a battlefield Stalwart or -1 for Exposed, against attacks from range
     2 or more;
   - -1 for Pierce.

   Defence can drop to 0 dice.
5. **Defender modifies:** Steel, Guard, Brace.
6. **Cancel:** each Parry cancels a Strike, then Rends. Brace cancels one more
   Strike. With a Rune of Stone, Brace may cancel a Rend when no Strike is left.
   Armored then takes 1 off an attack that would deal 2 or more damage.
7. **Damage:** each remaining Strike or Rend removes a ward, or if none, a
   wound. A Rend that reaches wounds and leaves the unit alive also inflicts a
   **critical** (each of the four is equally likely). A Rend that is absorbed by
   ward, or that destroys the unit, inflicts none.

| Critical | Effect |
| --- | --- |
| Shaken | Gain 1 strain. |
| Bleeding | Take 1 damage in the End phase. |
| Staggered | No actions during its next activation. |
| Broken Arms | Rolls 1 fewer attack die for the rest of the battle (stacks). |

**Weapons with no range bonus.** These 15 weapons get no +1 die at range 1 and
give the defender no +1 die at range 3 or more: Ironbrow Handgun (Thane Brokkr
Ironbrow), Grudgeshot (Grudgebreaker Cannon), Barrel Rack (Organ Gun), Great
Bolt (Holds and Concord Bolt Throwers), Dragonfire Jet (Flame Cannon), Mortar
Shell (Grudge Mortar), Great Bows (Waywatchers), Chomping Jaws (Squig Herd),
Screaming Shell (Soul Mortar), Spewed Boulders (Siege Horror), Mind Lash
(Abbot Serene Halloran), Long Pikes (Pike Block), Arquebuses (Handgunner
Company) and Mind Spike (Silent Order Wardens).

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
| Inspire | Friendly units at range 1 may reroll 1 attack die (one die per attack). |
| Shieldwall | +1 defence die while another friendly Shieldwall unit is at range 1. |
| Rewarding | Recover 1 ward in the End phase. |
| Pierce | The defender rolls 1 fewer defence die. |
| Ram | When this unit bumps an enemy, that enemy suffers 1 damage. |
| Swarm | +1 attack die if another friendly Swarm unit also has the target in its front arc at range 1 to 2. |
| Regenerate | End phase: roll an attack die; Strike or Rend recovers 1 wound. |
| Master | Takes 2 actions each activation, and may Command twice (two different units). |
| Raise | Gains a Soul (max 3) whenever a unit dies at range 1 to 2. End phase: spend Souls to heal thralls at range 2 (1 wound per Soul). |
| Thrall | No actions of its own. Can be Commanded to Steel, Guard or Surge. |
| Fear | Start of Engagement: each enemy at range 1 gains 1 strain (undead and Fearless units are immune). |
| Ethereal | Moves through units and obstacles without effect; still cannot end on a unit. |
| Unstable | When destroyed, every unit at range 1 suffers 1 damage. Enemy kills from the burst score for the destroyed unit's owner. |
| Elusive | +1 defence die at range 2 or more. |
| Bane | +1 attack die against undead and Calamity units. |
| Brutal | +1 attack die at range 1. |
| Charge | +1 attack die at range 1 after a maneuver of speed 3 or more this round. |
| Sniper | Targets do not gain the range 3 defence bonus. |
| Armored | An attack that would deal 2 or more damage deals 1 less. |
| Flying | Ignores obstacles when moving. |
| Healer | End phase: heal 1 wound on the friendly unit at range 1 with the lowest share of its wounds left. |
| Berserk | +1 attack die while wounded. |
| Stealthy | Concealed: spotted only from range 1, unless it stands on a hill. Firing reveals it for the rest of the round. It can never be attacked from range 3 or more, even when spotted. |
| Guardian | Other friendly units at range 1 roll 1 extra defence die. |
| Vampiric | Heals 1 wound whenever its attack deals damage. |
| Poison | An attack that deals damage also inflicts Bleeding. |
| Blast | An attack that deals damage also deals 1 damage to every other enemy at range 1 of the target. |
| Fearless | Immune to Fear and to the Shaken critical. |
| Warcry | Start of Engagement: this unit and friendly units at range 1 to 2 each have at least one Steel token. |

Relics (section 2) carry their own abilities, which appear on a unit's card:

| Relic ability | Effect |
| --- | --- |
| Rune of Stone | Brace may cancel a Rend when no Strike is left to cancel. |
| Phylactery | The unit starts the battle with 2 Souls. |
| Eye of the Rift | Taint rolls only hurt on a Rend. |

## 13. Victory

- The battle ends in the End phase, when only one warband remains or the round
  limit has been played. A surrender can also end it at once (section 14).
- **Victory points** = the points cost (with upgrade and magic item) of every
  enemy unit you destroyed, plus fleeing enemies.
- If one warband remains, it wins.
- On the round limit, the warband with the most VP **among those still on the
  field** wins; ties go to the most points still on the table. If those are
  also exactly equal at the top, the battle is a draw.
- **Mutual destruction.** If every remaining warband is destroyed in the same
  round, the winner is chosen among the warbands that were still fighting at the
  start of that End phase (never one that surrendered or was broken earlier), by
  VP and then points still on the field. If the top two are exactly tied, the
  battle is a draw.
- Deaths in the End phase (Bleeding) count immediately.

**Who scores a kill.**

| Cause of death | Scores for |
| --- | --- |
| An attack | The attacker. Blast kills score for the attacker too. A Bleeding that Poison caused scores for the poisoner. |
| Ram bump | The ramming unit's owner. |
| Unstable burst | The owner of the exploding unit (its own units killed by the burst score for nobody). |
| Fleeing off the table | Every opponent still fighting. |
| Bleeding from a Rend critical | Nobody. |
| Terrain, Taint, Deathless strain damage | Nobody. |
| Surrender | Nobody. |

## 14. Running the table

- **Computer opponents.** The host can add computer opponents in the muster
  (named for their army, such as Thane Brokk (AI)). The host picks each one's
  army or leaves it random; it then musters a random legal warband, with a
  champion about half the time and 15% of its DP held back for magic items.
  They buy no terrain. If one holds the most unspent DP it picks the
  battlefield that helps it most and its opponents least. They only act on what
  their side can see, and never plan Aim. A table of only computer opponents
  (after **End battle**, **New battle**, or once the last person presses
  **Watch instead of playing** in the muster) waits until a watcher presses
  **Start computer battle**. **Take a seat** brings you back before the next
  battle.
- **Rules button.** Opens this rulebook in the game.
- **Surrender.** A seated player whose warband is still fighting can press
  Surrender (two clicks to confirm). Their units leave the field and nobody
  scores. The battle ends when one warband is left, or when only computer
  opponents remain.
- **End battle.** During a battle the host has an **End battle** button (two
  clicks to confirm) that returns everyone to the muster, for example when a
  player has disconnected. On a computer-only table any watcher can end it.
- **New battle.** After a battle, any seated player can press **New battle**.
  It starts a blank muster for people; computer opponents keep their seats and
  armies and muster a fresh warband.
- **Server updates.** If the game code changes while the server is running,
  every screen shows a banner asking the server to restart, because the old
  process would still apply the old rules.
