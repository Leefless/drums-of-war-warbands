// Browser tests:  npm run e2e   (or: node scripts/e2e.mjs [test file ...])
// Drives real Chrome against a real game server through the player journeys in test/e2e/.
// The test tool (playwright-core) is installed into .e2e/ on first run, never into the game's own
// dependencies, so a table that runs `npm install` never downloads it. It uses the Chrome already
// on this computer (set CHROME_PATH to use another), so no browser is downloaded either.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOOL = join(ROOT, ".e2e");
const PW = join(TOOL, "node_modules", "playwright-core", "index.mjs");
const PW_VERSION = "1.48.2";

if (!existsSync(PW)) {
  console.log(`Installing the browser test tool (playwright-core ${PW_VERSION}) into .e2e/ ...`);
  execFileSync("npm", ["install", "--prefix", TOOL, "--no-audit", "--no-fund", "--loglevel=error", `playwright-core@${PW_VERSION}`], { stdio: "inherit" });
}

const CANDIDATES = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("Chrome was not found. Install Google Chrome, or set CHROME_PATH to a Chrome or Chromium executable.");
  process.exit(1);
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(ROOT, "test", "e2e")).filter((f) => f.endsWith(".e2e.mjs")).map((f) => join("test", "e2e", f));
const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, E2E_PW: PW, E2E_CHROME: chrome },
});
process.exit(r.status ?? 1);
