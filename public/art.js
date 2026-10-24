// Vector art shared by the canvas (as Path2D) and the DOM (as inline SVG).
// Every path is authored on a 24 x 24 grid and filled with the even-odd rule,
// so inner shapes (eye sockets, leaf veins) cut holes.

export const ICONS = {
  crown: "M3 18h18v3H3z M3 16.5L2 6.5l5 4 5-7 5 7 5-4-1 10z",
  sword: "M11 1.5h2v13h-2z M6.5 14.5h11v2h-11z M11 16.5h2v4h-2z M10 20.5h4v2h-4z",
  dagger: "M11 5l1-4 1 4v9h-2z M7.5 14h9v2h-9z M11 16h2v5h-2z",
  axe: "M11 2h2v20h-2z M13 3.5c5 0 7.5 3.5 7.5 7s-2.5 7-7.5 7z M11 3.5c-3 0-5 2.5-5 5s2 5 5 5z",
  hammer: "M4 3.5h13v7H4z M17 5.5h3v3h-3z M9.5 10.5h2.5v12H9.5z",
  bow: "M5 2c7.5 3.5 7.5 16.5 0 20l1.4 1c8.6-4.5 8.6-17.5 0-22z M6 2.5h1v19H6z M7.5 11.4h11v1.2h-11z M22 12l-4-2.6v5.2z",
  lance: "M11 1.5l3 6.5h-2v14.5h-2V8H8z M12.5 9h7.5l-2.2 2.2 2.2 2.3h-7.5z",
  staff: "M11 8h2v14.5h-2z M12 0.5l1.6 3.7 4 .3-3 2.6.9 3.9-3.5-2.1-3.5 2.1.9-3.9-3-2.6 4-.3z",
  gun: "M1.5 8.5h15l3-2h3v4.5h-4l-1.2 2h-4l-1.3 3.5H8.5l1.2-3.5H1.5z",
  cannon: "M2 10.5l14.5-5.5 1.6 4.4-14.5 5.5z M18 5.2l3-1 1.3 3.8-3 1z M10 18a4 4 0 1 0 8 0a4 4 0 1 0-8 0z M12.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0z",
  boulder: "M6 5l7-2.5 6.5 3.5 2 7-3.5 7-8 1.5-6-4.5-1-7z M9 9l3 2-1 3 3 2",
  claw: "M4 3h3l6 18H10z M9.5 2h3l5.5 17h-3z M15 3.5h3l3.5 12.5h-3z",
  skull: "M12 1.5c-5 0-8.5 3.5-8.5 8.5 0 3 1.5 5 3 6.2V20h11v-3.8c1.5-1.2 3-3.2 3-6.2 0-5-3.5-8.5-8.5-8.5z M6.8 10.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z M12.6 10.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z M11 13.5h2l-1 2.5z M9 20h1.4v3H9z M11.3 20h1.4v3h-1.4z M13.6 20H15v3h-1.4z",
  ghost: "M12 1.5a7.5 7.5 0 0 0-7.5 7.5v13.5l2.5-2 2.5 2 2.5-2 2.5 2 2.5-2 2.5 2V9A7.5 7.5 0 0 0 12 1.5z M8 9a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z M12.8 9a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z",
  flame: "M12 1c1 4.5 6.5 6.5 6.5 13a6.5 6.5 0 0 1-13 0c0-3.5 2-5.5 3.2-7.8.2 2.3 1.2 3.6 2.3 3.6 0-3.5-.2-5.8 1-8.8z M12 13c.6 2 2.5 2.8 2.5 5a2.5 2.5 0 0 1-5 0c0-1.5 1.3-2.5 2.5-5z",
  sun: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0z M11.2 1h1.6v4h-1.6z M11.2 19h1.6v4h-1.6z M1 11.2h4v1.6H1z M19 11.2h4v1.6h-4z M4.2 3.1l2.8 2.8-1.1 1.1-2.8-2.8z M17 16l2.8 2.8-1.1 1.1-2.8-2.8z M3.1 19.8L5.9 17l1.1 1.1-2.8 2.8z M16 7l2.8-2.8 1.1 1.1L17 8.1z",
  shield: "M12 1.5l8.5 3.2v6.3c0 5.3-3.7 9.6-8.5 11.5-4.8-1.9-8.5-6.2-8.5-11.5V4.7z",
  eye: "M1.5 12C4.5 6.8 8.2 5 12 5s7.5 1.8 10.5 7c-3 5.2-6.7 7-10.5 7S4.5 17.2 1.5 12z M8.6 12a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0z",
  burst: "M12 .5l2.2 7.2 6.6-3.8-3.6 6.7 6.3 2.2-6.4 2 3.7 6.7-6.6-3.9L12 23.5l-2.2-7.9-6.6 3.9 3.7-6.7-6.4-2 6.3-2.2-3.6-6.7 6.6 3.8z",
  blank: "",
};

export const EMBLEMS = {
  holds: "M1.5 20.5l7-13 3.2 5.2 3.3-7.7 7.5 15.5z M7.2 20.5l1.8-3.3 1.8 3.3z",
  sylvan: "M12 1.5c6.5 3.2 8.8 9.8 6.4 15.6C16.6 20.5 14.3 22.5 12 22.5s-4.6-2-6.4-5.4C3.2 11.3 5.5 4.7 12 1.5z M11.4 6h1.2v15.5h-1.2z M12.6 10.5l3-2.4.7.9-3.7 3z M11.4 14l-3.3-2.5-.7.9 4 3.1z",
  greenskin: "M4 3c0 9 3.4 13.5 8 13.5S20 12 20 3c-1.6 5.4-4.5 8.3-8 8.3S5.6 8.4 4 3z M8.5 17.5h7l-3.5 5z",
  umbral: "M15.5 1.5a10.5 10.5 0 1 0 7 18.2A8.6 8.6 0 0 1 15.5 1.5z M14.5 9.5l.9 2 2.1.2-1.6 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.2z",
  calamity: ICONS.burst + " M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0z",
  concord: ICONS.sun,
};

/** Which icon a unit wears on its token, by unit id (falls back to its role). */
export const UNIT_ICON = {
  thane: "crown", ironbreakers: "hammer", gunners: "gun", runepriest: "staff", grudgecannon: "cannon", hurlers: "boulder",
  lady: "crown", wardens: "bow", thornriders: "lance", starweaver: "staff", bladesingers: "sword",
  warboss: "crown", goblins: "dagger", boyz: "axe", boarriders: "lance", trolls: "claw", shaman: "staff",
  shade: "crown", necromancer: "staff", skeletons: "skull", ghouls: "claw", wraiths: "ghost", colossus: "skull",
  demon: "flame", spawn: "claw", mutants: "axe", mage: "staff", stalker: "eye",
  captain: "crown", halberdiers: "axe", crossbows: "bow", outriders: "dagger", hunters: "gun", lightbearer: "sun",
};

export const DIE_ICON = { strike: "sword", rend: "burst", omen: "eye", parry: "shield", blank: "blank" };

const svgPath = (d, cls, title) =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="${title ? "false" : "true"}"${title ? ` role="img"><title>${title}</title` : ""}><path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>`;

export const iconSVG = (name, cls = "icon") => svgPath(ICONS[name] ?? "", cls);
export const emblemSVG = (faction, cls = "emblem") => svgPath(EMBLEMS[faction] ?? "", cls);

const pathCache = new Map();
/** Cached Path2D for an icon or emblem, on the 24 x 24 grid. */
export function path2d(d) {
  if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
  return pathCache.get(d);
}

// ── Painted art (optional) ───────────────────────────────────────────────────
// Generated images live in public/art/. Each is loaded once; until it loads (or
// if the file does not exist) callers get null and fall back to vector art.
const images = new Map();
let index = null; // Set of existing art paths, once loaded

/** Fetch the list of art files that exist (call once before rendering). */
export async function loadArtIndex() {
  try {
    index = new Set(await (await fetch("/art-index.json")).json());
  } catch {
    index = null;
  }
}
const missing = (path) => index && !index.has(path);

/** The loaded image for an art path such as "units/thane.png", or null. */
export function artImage(path) {
  if (missing(path)) return null;
  let rec = images.get(path);
  if (!rec) {
    rec = { img: new Image(), ok: false };
    rec.img.onload = () => {
      rec.ok = true;
    };
    rec.img.src = `/art/${path}`;
    images.set(path, rec);
  }
  return rec.ok ? rec.img : null;
}

/** Inline <img> for the DOM that removes itself if the file is missing. */
export const artTag = (path, cls) => missing(path) ? "" : `<img class="${cls}" src="/art/${path}" alt="" loading="lazy" onerror="this.remove()">`;
