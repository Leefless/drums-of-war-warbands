// Batch art generator: unit portraits and obstacle sprites via the OpenAI Images API.
//
//   npm run art -- --dry-run     list every prompt, call nothing
//   npm run art                  generate whatever is missing
//   npm run art -- --only=thane,ruins --force
//
// Reads OPENAI_API_KEY from the environment or a gitignored .env file. Full-size
// originals land in art-src/ (gitignored); 256px copies for the game land in
// public/art/. Existing files are skipped, so a failed run can simply be rerun.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FACTIONS } from "../shared/factions.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const force = args.includes("--force");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);

const STYLE = "Painterly high fantasy illustration in the style of a premium tabletop miniatures wargame codex: rich oil-paint brushwork, dramatic warm rim light, deep shadows, muted earthy palette. No text, no letters, no watermark, no border, no frame.";

const PALETTE = {
  holds: "steel blue, iron grey and forge-orange accents",
  sylvan: "deep forest green, teal and silver moonlight",
  greenskin: "olive green, rust and crude bronze",
  umbral: "violet, bone white and cold shadow",
  calamity: "ember red, black and sickly violet glow",
  concord: "dawn gold, cream and royal blue",
};

function jobs() {
  const out = [];
  for (const f of Object.values(FACTIONS)) {
    for (const u of f.units) {
      out.push({
        id: u.id,
        file: `units/${u.id}.png`,
        background: "opaque",
        prompt: `${STYLE} Square head-and-shoulders portrait of a single figure: ${u.name}, ${u.role.toLowerCase()} of ${f.name} (${f.kin}). ${u.flavor} Centered, facing the viewer, readable silhouette at small sizes, dark vignette background. Palette: ${PALETTE[f.id]}.`,
      });
    }
  }
  const sprite = (id, what) => ({
    id,
    file: `terrain/${id}.png`,
    background: "transparent",
    prompt: `${STYLE} Strict top-down orthographic view, as seen from directly above a wargaming table, of ${what}. The object fills a circular footprint centered in the frame with a soft contact shadow, transparent background outside the circle, no ground plane beyond it.`,
  });
  out.push(
    sprite("ruins", "a ruined circular stone watchtower foundation: broken mossy wall segments, fallen blocks, a cracked pillar stump in the middle"),
    sprite("thicket", "a dense thicket of a dozen gnarled trees and brambles, layered leafy canopies of varied greens"),
    sprite("rift", "a jagged glowing chasm torn into scorched earth, molten red-orange light and violet sparks rising from the crack"),
  );
  return only.length ? out.filter((j) => only.includes(j.id)) : out;
}

async function generate(job) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, prompt: job.prompt, size: "1024x1024", quality: QUALITY, background: job.background, output_format: "png", n: 1 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
  return Buffer.from(body.data[0].b64_json, "base64");
}

function save(job, png) {
  const src = join(ROOT, "art-src", job.file);
  const out = join(ROOT, "public/art", job.file);
  for (const p of [src, out]) mkdirSync(dirname(p), { recursive: true });
  writeFileSync(src, png);
  // macOS ships sips; elsewhere keep the full-size file.
  try {
    execFileSync("sips", ["-Z", "256", src, "--out", out], { stdio: "ignore" });
  } catch {
    writeFileSync(out, png);
  }
}

const list = jobs().filter((j) => force || !existsSync(join(ROOT, "public/art", j.file)));
console.log(`${list.length} image(s) to generate with ${MODEL} (${QUALITY}).`);
if (dry) {
  for (const j of list) console.log(`\n[${j.file}] ${j.prompt}`);
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Put it in .env (OPENAI_API_KEY=...) and rerun.");
  process.exit(1);
}

let done = 0;
let failed = 0;
const queue = [...list];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let j = queue.shift(); j; j = queue.shift()) {
    try {
      save(j, await generate(j));
      console.log(`ok   ${j.file} (${++done}/${list.length})`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${j.file}: ${err.message}`);
    }
  }
}));
console.log(`Done: ${done} generated, ${failed} failed.${failed ? " Rerun to retry the failures." : ""}`);
process.exit(failed ? 1 : 0);
