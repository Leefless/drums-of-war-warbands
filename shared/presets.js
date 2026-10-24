// Prebuilt warbands: named, balanced lists for each army, built for a 100 point game.
// Each faction's lists live in shared/presets/<faction>.js. Check them with:
//   node scripts/check-presets.mjs [faction]     legality and cost
//   node scripts/sim-presets.mjs [games]         computer-vs-computer win rates
import { presets as calamity } from "./presets/calamity.js";
import { presets as concord } from "./presets/concord.js";
import { presets as greenskin } from "./presets/greenskin.js";
import { presets as holds } from "./presets/holds.js";
import { presets as sylvan } from "./presets/sylvan.js";
import { presets as umbral } from "./presets/umbral.js";

export const PRESET_BUDGET = 100;
export const PRESETS = { holds, sylvan, greenskin, umbral, calamity, concord };
