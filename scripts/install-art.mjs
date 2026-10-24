// Move downloaded art from the Art/ drop folder into public/art/.
// Files are named dow-art__<path with __ for />, e.g. dow-art__units__thane.png
// lands at public/art/units/thane.png. The Art/ folder itself is kept.
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DROP = join(ROOT, "Art");
let moved = 0;
for (const name of readdirSync(DROP, { withFileTypes: false }).filter((n) => n.startsWith("dow-art__"))) {
  const rel = name.slice("dow-art__".length).split("__").join("/");
  const dest = join(ROOT, "public/art", rel);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(join(DROP, name), dest);
  moved++;
}
console.log(`Installed ${moved} art file(s) into public/art.`);
