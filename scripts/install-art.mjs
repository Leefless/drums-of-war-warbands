// Move downloaded art from the Art/ drop folder into public/art/.
// Files are named dow-art__<path with __ for />, e.g. dow-art__units__thane.png
// lands at public/art/units/thane.png. The Art/ folder itself is kept.
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DROP = join(ROOT, "Art");
let moved = 0;
const ART = join(ROOT, "public/art");
// The same names the server accepts: letters, digits and dashes per folder, so nothing lands outside public/art.
const NAME = /^dow-art__[a-z]+(__[A-Za-z0-9-]+)*\.(png|jpg)$/;
for (const name of readdirSync(DROP, { withFileTypes: false }).filter((n) => n.startsWith("dow-art__"))) {
  const rel = name.slice("dow-art__".length).split("__").join("/");
  const dest = resolve(ART, rel);
  if (!NAME.test(name) || !dest.startsWith(ART + sep)) {
    console.warn(`Skipped ${name}: not a dow-art__<folder>__<name>.png|jpg file name.`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(join(DROP, name), dest);
  moved++;
}
console.log(`Installed ${moved} art file(s) into public/art.`);
