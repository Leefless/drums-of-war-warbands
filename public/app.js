// Browser client. Holds no game logic beyond previews: the server is
// authoritative and sends a fresh filtered state after every change.
import { ABILITIES, ACTIONS, CATEGORIES, FACTIONS, UPGRADES, armyLimits, categoryOf, unitDef, upgradesFor, validateArmy } from "/shared/factions.js";
import { costBreakdown } from "/shared/cost.js";
import { PRESETS, PRESET_BUDGET, presetList } from "/shared/presets.js";
import { BASE_SIZE, isAim, isHold, isStance, parseManeuver } from "/shared/geometry.js";
import { CRIT_TEXT, parseAction, planMove, stanceBonus, strained, zoneFor } from "/shared/engine.js";
import { healthColor, panBy, playerColor, resetBoard, resetView, sizeCanvas, terrainAt, toBoard, unitAt, updateBoard, zoomAt, zoomLevel } from "/board.js";
import { TERRAIN, onKind, terrainAt as terrainUnder } from "/shared/terrain.js";
import { DIE_ICON, UNIT_ICON, artTag, emblemSVG, iconSVG, loadArtIndex } from "/art.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

let token = store.get("dow.token");
if (!token) {
  token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set("dow.token", token);
}

let S = null; // latest server state
const L = {
  name: store.get("dow.name") || "",
  joined: !!store.get("dow.joined"),
  spectate: store.get("dow.spectate") === "1", // watching survives a reload
  selected: null,
  hover: null,
  draft: [],
  draftFaction: null,
  sub: null, // in-progress choice for a multi-step action
  diceSel: new Set(),
  mode: null,
  order: null, // quick order for this planning phase: { mode, round }
  chargeAt: null, // board point the Charge order drives at (draggable banner)
  manual: new Set(), // units whose dial the player changed by hand after an order
};
let ws;

// ── Connection ───────────────────────────────────────────────────────────────
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  ws.onopen = () => {
    if (L.joined || L.spectate) send("hello", { token, name: L.name, spectate: L.spectate });
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "state") {
      const prevPending = S?.pending && JSON.stringify(S.pending);
      S = m.state;
      // The page or the server was updated: reload so this tab runs the same code (the battle lives on the server).
      if (L.build && S.build && S.build !== L.build) return location.reload();
      L.build ||= S.build;
      if (prevPending !== (S.pending && JSON.stringify(S.pending))) {
        L.sub = null;
        L.diceSel.clear();
        L.hoverTarget = null;
      }
      if (L.selected && !unitById(L.selected)) L.selected = null; // hidden by fog or gone
      if (S.pending?.uid && S.pending.pid === S.you) L.selected = S.pending.uid;
      render();
    } else if (m.t === "error") toast(m.msg);
  };
  ws.onclose = () => setTimeout(connect, 1000);
}
function send(t, payload = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t, ...payload }));
  else toast("Reconnecting to the table, try again in a moment.");
}
function toast(msg, kind = "error") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const me = () => (S?.you ? S.players.find((p) => p.id === S.you) : null);
const unitById = (id) => S.units.find((u) => u.id === id);
const unitName = (id) => unitById(id)?.name ?? "an unseen unit";
const nameOf = (pid) => S.players.find((p) => p.id === pid)?.name ?? "?";
const myUnits = () => S.units.filter((u) => u.owner === S.you && !u.dead);
const PHASES = { muster: "Muster", deploy: "Deployment", plan: "Planning", activation: "Activation", engagement: "Engagement", over: "Battle over" };
const GLYPH = { TL: "↰", BL: "↖", S: "↑", BR: "↗", TR: "↱", A: "U", RF: "Rift", X: "■", DL: "←", DBL: "↖", D: "◆", DBR: "↗", DR: "→", DA: "↓", ML: "←", MBL: "↖", M: "◎", MBR: "↗", MR: "→", MA: "↓" };
const STANCE_NAME = { D: "hold facing", DL: "turn left", DBL: "turn half left", DBR: "turn half right", DR: "turn right", DA: "face the rear" };
const holdName = (m) => STANCE_NAME[m.type.replace(/^M/, "D")];

function header() {
  $("#phase").textContent = S ? `${PHASES[S.phase]}${S.round ? ` · Round ${S.round} of ${S.settings.maxRounds}` : ""}` : "Connecting";
  $("#players").innerHTML = (S?.players || []).map((p) => {
    const f = p.faction ? FACTIONS[p.faction] : null;
    const status = S.phase === "over" ? `${p.vp} VP` : p.surrendered ? "surrendered" : p.eliminated ? "broken" : p.ready && S.phase !== "activation" && S.phase !== "engagement" ? "ready" : "";
    return `<span class="chip ${p.connected ? "" : "off"}" title="${p.surrendered ? "Surrendered" : ""}"><i class="sw" style="background:${f ? playerColor(S, p.id) : "var(--ink-3)"}"></i>${esc(p.name)}${p.id === S.you ? " (you)" : ""}<span class="ok">${status}</span></span>`;
  }).join("");
  $("#stale").hidden = !S?.serverStale;
  if (S?.serverStale) {
    $("#staleMsg").textContent = S.canRestart
      ? "The game has been updated. Restart the server to load the latest rules (the current battle will end)."
      : "The game has been updated. Stop the server and open Start Game again to load the latest rules.";
    $("#restartNow").hidden = !S.canRestart || !me();
  }
  // Surrender: only for a seated player whose warband is still fighting.
  const mine = me();
  const canQuit = !!mine && !mine.eliminated && ["deploy", "plan", "activation", "engagement"].includes(S?.phase);
  const btn = $("#surrender");
  btn.hidden = !canQuit;
  if (!canQuit) L.confirmQuit = false;
  btn.textContent = L.confirmQuit ? "Confirm surrender" : "Surrender";
  btn.classList.toggle("armed", !!L.confirmQuit);
  // Watching a computer-only battle: any watcher may end it and go back to the muster.
  const aiOnly = !!S && S.players.length > 0 && S.players.every((p) => p.ai) && !me();
  $("#endBattle").hidden = !(aiOnly && ["deploy", "plan", "activation", "engagement"].includes(S.phase));
}

/** A watcher takes a seat for the next battle (only during the muster). */
function takeSeat() {
  L.spectate = false;
  store.set("dow.spectate", "");
  L.joined = true;
  L.name ||= store.get("dow.name") || "Warlord";
  store.set("dow.joined", "1");
  send("hello", { token, name: L.name });
  render();
}

// ── Top bar: surrender (two clicks, no browser dialog) and the rulebook ──────
$("#surrender").onclick = () => {
  if (!L.confirmQuit) {
    L.confirmQuit = true;
    clearTimeout(L.quitTimer);
    L.quitTimer = setTimeout(() => { L.confirmQuit = false; header(); }, 4000);
    return header();
  }
  clearTimeout(L.quitTimer);
  L.confirmQuit = false;
  send("surrender");
};

/** Minimal Markdown for the rulebook: headings, tables, lists, bold, code and links. */
function mdToHTML(md) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, h) => `<a href="${/^(https?:|\/|#)/.test(h) ? h : /^[\w-]+\.md$/.test(h) ? `/docs/${h}` : "#"}" target="_blank" rel="noopener">${a}</a>`);
  const lines = md.split("\n");
  let html = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`; continue; }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      html += `<table>${body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("")}</table>`;
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(l);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const base = li[1].length;
      const items = []; // { text, subs: [] }: indented bullets nest under the item above them
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        const last = items[items.length - 1];
        if (m && m[1].length > base && last) last.subs.push(m[3]);
        else if (m) items.push({ text: m[3], subs: [] });
        else if (/^\s{2,}\S/.test(lines[i]) && last) {
          if (last.subs.length) last.subs[last.subs.length - 1] += ` ${lines[i].trim()}`;
          else last.text += ` ${lines[i].trim()}`;
        } else break;
        i++;
      }
      i--;
      html += `<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x.text)}${x.subs.length ? `<ul>${x.subs.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
      continue;
    }
    if (!l.trim()) continue;
    const para = [l];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||\s*([-*]|\d+\.)\s)/.test(lines[i + 1])) para.push(lines[++i]);
    html += `<p>${inline(para.join(" "))}</p>`;
  }
  return html;
}

async function openRules() {
  const host = $("#rulesHost");
  host.innerHTML = `<div class="umodal" data-close><div class="umodal-card rulebook" role="dialog" aria-label="Rulebook">
    <div class="rb-head"><h2>Rulebook</h2><button class="ghost small" data-close>Close</button></div><div class="rb-body"><p class="muted">Loading the rules...</p></div></div></div>`;
  host.querySelectorAll("[data-close]").forEach((x) => (x.onclick = (ev) => { if (ev.target === x) host.innerHTML = ""; }));
  try {
    const md = await (await fetch("/docs/RULES.md", { cache: "no-store" })).text();
    $(".rb-body", host) && ($(".rb-body", host).innerHTML = mdToHTML(md));
  } catch {
    $(".rb-body", host) && ($(".rb-body", host).innerHTML = `<p>Could not load the rules. <a href="/docs/RULES.md" target="_blank">Open them in a new tab.</a></p>`);
  }
}
$("#rulesBtn").onclick = openRules;
$("#endBattle").onclick = () => send("reset");
$("#restartNow").onclick = () => {
  send("restart");
  $("#restartNow").disabled = true;
  $("#staleMsg").textContent = "Restarting the game server...";
  setTimeout(() => location.reload(), 2500);
};
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && $("#rulesHost").innerHTML) $("#rulesHost").innerHTML = "";
});

function render() {
  applyArmyTheme();
  // Broadcasts re-render the page; keep the field being typed in focused.
  const active = document.activeElement;
  const keep = active?.id && (active.tagName === "INPUT" || active.tagName === "SELECT") ? { id: active.id, a: active.selectionStart, b: active.selectionEnd } : null;
  renderInner();
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el && el !== document.activeElement) {
      el.focus();
      try { if (keep.a != null) el.setSelectionRange(keep.a, keep.b); } catch { /* not a text field */ }
    }
  }
}

function renderInner() {
  header();
  const app = $("#app");
  if (!S || (!L.joined && !L.spectate)) return renderJoin(app);
  if (me()) L.rejoinSent = false;
  else if (!L.spectate && S.phase === "muster" && !L.rejoinSent) {
    // Server dropped us (e.g. table reset while away); rejoin once, not on every broadcast.
    L.rejoinSent = true;
    send("hello", { token, name: L.name });
  }
  if (S.phase === "muster") {
    resetBoard(); // a new battle starts with a clean animation timeline
    return renderMuster(app);
  }
  renderBattle(app);
}

// ── Join ─────────────────────────────────────────────────────────────────────
function renderJoin(app) {
  L.mode = "join";
  const full = S && S.players.length >= 4;
  const started = S && S.phase !== "muster";
  app.innerHTML = `<div class="center">
    ${artTag("title.jpg", "hero-img")}
    <div class="label">A high fantasy maneuver wargame</div>
    <h1 class="banner-title">Drums of War: Warbands</h1>
    <p class="muted">Every player opens this page on their own computer. Plan your moves in secret, then watch them play out together.</p>
    <input id="name" placeholder="Your name" value="${esc(L.name)}" maxlength="24">
    <div class="btns">
      <button class="cta" id="join" ${full || started ? "disabled" : ""}>Take a seat</button>
      <button id="watch">Watch only</button>
    </div>
    ${started ? `<p class="muted">A battle is in progress. If you were seated, use the same browser you joined with to rejoin automatically.</p>` : ""}
    <p class="label"><a href="/docs/RULES.md" target="_blank" style="color:inherit">Rules</a> · <a href="/docs/LORE.md" target="_blank" style="color:inherit">Lore</a></p>
  </div>`;
  $("#name").oninput = (e) => (L.name = e.target.value);
  $("#join").onclick = () => {
    L.name = $("#name").value.trim() || "Warlord";
    store.set("dow.name", L.name);
    store.set("dow.joined", "1");
    L.joined = true;
    L.spectate = false;
    store.set("dow.spectate", "");
    send("hello", { token, name: L.name });
  };
  $("#watch").onclick = () => {
    L.spectate = true;
    store.set("dow.spectate", "1");
    send("hello", { token, spectate: true });
    render();
  };
}

// ── Muster: the army builder ─────────────────────────────────────────────────
const unitIcon = (u) => u.icon || UNIT_ICON[u.id] || "sword";
const draftKey = (fid) => `dow.draft.${fid}`;
const unitIn = (fid, id) => FACTIONS[fid]?.units.find((u) => u.id === id);

/** Drop units that no longer exist and upgrades a unit can no longer take. */
/** Prebuilt warbands for the muster screen: one card per play style, loaded with one click. */
function presetsHTML(f, locked) {
  const list = PRESETS[f.id] || [];
  if (!list.length) return "";
  const same = (a, b) => a.length === b.length && a.every((e, i) => e.unit === b[i].unit && (e.upgrade || null) === (b[i].upgrade || null));
  const budget = S.settings.budget;
  return `<div class="presets"><div class="label">Prebuilt warbands · one per play style, ${budget === PRESET_BUDGET ? "tuned at 100 points" : `scaled to ${budget} points`}</div>
    <div class="pgrid">${list.map((pr) => {
      const scaled = presetList(f.id, pr, budget);
      const v = validateArmy(f.id, scaled, budget);
      const counts = new Map();
      for (const e of scaled) {
        const u = unitIn(f.id, e.unit);
        if (u) counts.set(u, (counts.get(u) || 0) + 1);
      }
      const champ = [...counts.keys()].find((u) => u.champion);
      const troops = [...counts].filter(([u]) => !u.champion).map(([u, n]) => `${n > 1 ? `${n} ` : ""}${esc(u.name)}`).join(", ");
      const on = same(L.draft, scaled);
      const capped = v.cost < budget * 0.94; // the 12-unit limit stops a cheap army spending everything
      return `<div class="pcard ${on ? "on" : ""}" style="--fc:${f.color}">
        <div class="lrow"><span class="label">${esc(pr.style)}</span><span class="num muted">${v.cost} pts</span></div>
        <h4>${esc(pr.name)}</h4>
        <p class="pblurb">${esc(pr.blurb)}</p>
        <p class="pcomp">${champ ? `<b>${esc(champ.name)}</b> leads ` : ""}${troops}</p>
        ${capped ? `<p class="pcomp">At the ${armyLimits(budget).units} unit limit: fills ${v.cost} of ${budget} points.</p>` : ""}
        <button class="small ${on ? "" : "cta"}" data-preset="${esc(pr.id)}" ${locked || !v.ok || on ? "disabled" : ""}>${on ? "Loaded" : "Use this army"}</button>
      </div>`;
    }).join("")}</div></div>`;
}

function cleanList(fid, list) {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e && unitIn(fid, e.unit)).map((e) => {
    const ok = e.upgrade && upgradesFor(fid, unitIn(fid, e.unit)).some((g) => g.id === e.upgrade);
    return { unit: e.unit, upgrade: ok ? e.upgrade : null };
  });
}

function loadDraft(p) {
  if (p.army.length) return cleanList(p.faction, p.army);
  try {
    return cleanList(p.faction, JSON.parse(store.get(draftKey(p.faction)) || "[]"));
  } catch {
    return [];
  }
}
function keepDraft() {
  if (L.draftFaction) store.set(draftKey(L.draftFaction), JSON.stringify(L.draft));
}
function draftCost() {
  const p = me();
  return p?.faction ? validateArmy(p.faction, L.draft, S.settings.budget) : { ok: false, cost: 0, errors: [] };
}

// Broad categories for the roster filter (each army has around 30 distinct roles).
const rangeText = (w) => `R${w.range[0]}${w.range[1] > w.range[0] ? `-${w.range[1]}` : ""}`;
function statLine(u) {
  const atk = u.weapons.map((w) => `${w.dice} ${w.arc === "full" ? "all-round" : w.arc} ${rangeText(w)}`).join(" / ");
  return `Init ${u.init} · Atk ${atk} · Def ${u.def} · Wounds ${u.wounds}${u.ward ? ` · Ward ${u.ward}` : ""}`;
}

function rosterRows(f) {
  const q = (L.search || "").trim().toLowerCase();
  let rows = f.units.filter((u) => (L.tab === "champions" ? u.champion : !u.champion));
  if (L.tab !== "champions" && L.role !== "all") rows = rows.filter((u) => categoryOf(u) === L.role);
  if (q) rows = rows.filter((u) => [u.name, u.role, ...u.abilities, ...u.actions, ...u.weapons.map((w) => w.name)].join(" ").toLowerCase().includes(q));
  const by = { cost: (a, b) => a.cost - b.cost, costDesc: (a, b) => b.cost - a.cost, name: (a, b) => a.name.localeCompare(b.name), init: (a, b) => b.init - a.init || a.cost - b.cost }[L.sort || "cost"];
  return rows.sort(by);
}

function detailsHTML(u) {
  const b = costBreakdown(u, u.dial);
  const part = (k, label) => `<span>${label} <b>${b[k].toFixed(1)}</b></span>`;
  return `<div class="urow-details">
    <div class="stats">${u.weapons.map((w) => `<span>${weaponText(w)}</span>`).join("")}</div>
    <div class="tags">${u.actions.map((a) => `<span class="tag">${esc(actionLabel(a))}</span>`).join("") || "<span class='tag'>no actions</span>"}</div>
    ${u.abilities.length ? `<div class="muted" style="font-size:14px">${u.abilities.map((a) => esc(ABILITIES[a] || a)).join("<br>")}</div>` : ""}
    <div style="font-size:14px;color:var(--ink-2)"><i>${esc(u.flavor)}</i></div>
    ${dialHTML(u.dial, null, true)}
    <div class="stats costparts" title="Cost is computed from the profile">${part("power", "Power")}${part("movement", "Move")}${part("initiative", "Init")}${part("actions", "Actions")}${part("abilities", "Abilities")}<span>= <b>${b.total}</b> pts</span></div>
  </div>`;
}

function rowHTML(f, u, locked, counts, champ) {
  const n = counts[u.id] || 0;
  const full = !u.champion && n >= armyLimits(S.settings.budget).copies;
  const label = u.champion ? (champ?.unit === u.id ? "Chosen" : champ ? "Swap in" : "Take") : n ? `Add (${n})` : "Add";
  return `<div class="urow ${L.open === u.id ? "open" : ""}" style="--fc:${f.color}">
    <button class="urow-main" data-open="${u.id}" aria-expanded="${L.open === u.id}">
      <span class="portrait small">${iconSVG(unitIcon(u), "emblem")}${artTag(`units/${u.id}.png`, "")}</span>
      <span class="urow-text"><b>${esc(u.name)}</b> <span class="label">${esc(u.role)} · ${u.base}</span><br><span class="stats">${esc(statLine(u))}</span></span>
      <span class="urow-cost num">${u.cost}</span>
    </button>
    <button class="small ${u.champion && champ?.unit === u.id ? "on" : ""}" data-add="${u.id}" ${locked || full || (u.champion && champ?.unit === u.id) ? "disabled" : ""}>${label}</button>
    ${L.open === u.id ? detailsHTML(u) : ""}
  </div>`;
}

function entryHTML(f, e, i, locked) {
  const u = unitIn(f.id, e.unit);
  const ups = upgradesFor(f.id, u);
  return `<div class="lrow entry"><span class="portrait tiny">${iconSVG(unitIcon(u), "emblem")}${artTag(`units/${u.id}.png`, "")}</span>
    <span style="flex:1">${esc(u.name)} <span class="muted num">${u.cost}${UPGRADES[e.upgrade] ? ` +${UPGRADES[e.upgrade].cost}` : ""}</span></span>
    <select data-up="${i}" ${locked ? "disabled" : ""} aria-label="Upgrade"><option value="">No upgrade</option>${ups.map((g) => `<option value="${g.id}" ${e.upgrade === g.id ? "selected" : ""}>${esc(g.name)} +${g.cost}</option>`).join("")}</select>
    <button class="small ghost" data-rm="${i}" ${locked ? "disabled" : ""} aria-label="Remove">✕</button></div>`;
}

function renderMuster(app) {
  L.mode = "muster";
  const p = me();
  if (!p) {
    app.innerHTML = `<div class="center"><h2>Watching the muster</h2><p class="muted">You are watching. ${S.players.length} warlord(s) seated. The battle starts when every seated player is ready.</p>
      <div class="btns" style="justify-content:center"><button class="cta" id="takeSeat" ${S.players.length >= 4 ? "disabled" : ""}>Take a seat</button>
      ${S.players.length >= 2 && S.players.every((x) => x.ai) ? `<button id="startWatch">Start computer battle</button>` : ""}</div></div>`;
    $("#takeSeat").onclick = takeSeat;
    $("#startWatch") && ($("#startWatch").onclick = () => send("startWatch"));
    return;
  }
  if (L.draftFaction !== p.faction) {
    L.draftFaction = p.faction;
    L.draft = p.faction ? loadDraft(p) : [];
    Object.assign(L, { open: null, tab: "units", role: "all", search: "", armyName: "", loadedId: null });
  }
  const host = S.host === S.you;
  const f = p.faction ? FACTIONS[p.faction] : null;
  const v = draftCost();
  const pct = Math.min(100, (v.cost / S.settings.budget) * 100);
  const locked = p.ready;
  const entries = L.draft.map((e, i) => ({ e, i, u: f && unitIn(f.id, e.unit) })).filter((x) => x.u);
  const champ = entries.find((x) => x.u.champion)?.e;
  const counts = {};
  for (const { e } of entries) counts[e.unit] = (counts[e.unit] || 0) + 1;
  const regs = entries.filter((x) => !x.u.champion);
  const saved = (S.armies || []).filter((a) => f && a.faction === f.id);
  const catCount = {};
  if (f) for (const u of f.units.filter((x) => !x.champion)) catCount[categoryOf(u)] = (catCount[categoryOf(u)] || 0) + 1;
  const roles = ["Infantry", ...CATEGORIES.map(([c]) => c)].filter((c) => catCount[c]);

  app.innerHTML = `<div class="wrap">
    <div class="row" style="display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap">
      <div><div class="label">Step 1</div><h2>Choose your army</h2></div>
      ${host ? `<div class="btns" style="align-items:center">
        <span class="label">Budget</span>
        <select id="budget">${[60, 100, 150, 200, 300].map((b) => `<option ${b === S.settings.budget ? "selected" : ""}>${b}</option>`).join("")}</select>
        <span class="label">Rounds</span>
        <select id="rounds">${[6, 8, 12, 16].map((b) => `<option ${b === S.settings.maxRounds ? "selected" : ""}>${b}</option>`).join("")}</select>
        <label class="label" style="display:flex;gap:6px;align-items:center" title="Watchers (Watch only, or Watch this battle instead) see every unit, ignoring fog of war. This does not take you out of your seat."><input type="checkbox" id="openSpec" ${S.settings.openSpectators ? "checked" : ""}> Watchers see all units</label>
      </div>` : `<div class="label">Budget ${S.settings.budget} · ${S.settings.maxRounds} rounds</div>`}
    </div>
    ${host ? `<div class="btns" style="margin-top:10px;align-items:center">
      <span class="label">Computer opponent</span>
      <select id="aiFaction" aria-label="Computer opponent's army"><option value="">Random army</option>${Object.values(FACTIONS).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
      <button id="addAI" ${S.players.length >= 4 ? "disabled" : ""}>Add computer opponent</button>
      ${S.players.filter((x) => x.ai).map((x) => `<span class="chip">${esc(x.name)} <button class="small ghost" data-rmai="${x.id}" aria-label="Remove ${esc(x.name)}">Remove</button></span>`).join("")}
    </div>` : ""}
    <div class="btns" style="margin-top:8px;align-items:center"><button class="ghost" id="sitOut" title="Give up your seat: the battle runs without you and you watch">Watch instead of playing</button>
      <span class="muted" style="font-size:14px">${S.players.some((x) => x.ai) ? "Leaves the computer opponents to fight each other while you watch." : "Gives up your seat; take it back from the watching screen."}</span></div>
    <div class="factions ${f ? "compact" : ""}" style="margin-top:12px">${Object.values(FACTIONS).map((x) => `
      <button class="fcard ${p.faction === x.id ? "on" : ""}" style="--fc:${x.color}" data-faction="${x.id}" ${locked ? "disabled" : ""}>
        ${artTag(`banners/${x.id}.jpg`, "banner-img")}${emblemSVG(x.id)}<h3>${esc(x.name)}</h3><div class="label">${esc(x.kin)}</div>
        <p>${esc(x.tagline)}</p>
      </button>`).join("")}</div>
    ${f ? `<div class="muster">
      <div class="roster">
        <div><div class="label">Step 2 · Muster</div><h2>${esc(f.name)}</h2></div>
        ${S.players.some((x) => x.id !== S.you && x.faction === f.id) ? `<p style="margin:0"><span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:middle;background:${playerColor(S, S.you)}"></span> Another player has this army too. ${playerColor(S, S.you) === f.color ? "You keep the army colour; theirs are marked in a different colour" : "Your units are marked in this colour"} so both sides are easy to tell apart.</p>` : ""}
        <p style="margin:0"><b>Action economy.</b> ${esc(f.economy)}</p>
        <p style="margin:0" class="muted"><b>Dial.</b> ${esc(f.dialNote)}</p>
        ${presetsHTML(f, locked)}
        <div class="rtabs" role="tablist">
          <button role="tab" data-tab="champions" class="${L.tab === "champions" ? "on" : ""}">Champions <span class="muted">${f.units.filter((u) => u.champion).length}</span></button>
          <button role="tab" data-tab="units" class="${L.tab !== "champions" ? "on" : ""}">Units <span class="muted">${f.units.filter((u) => !u.champion).length}</span></button>
        </div>
        <div class="rfilters">
          <input id="search" type="search" placeholder="Search names, roles, abilities" value="${esc(L.search)}" aria-label="Search the roster">
          <select id="sort" aria-label="Sort">${[["cost", "Cheapest first"], ["costDesc", "Priciest first"], ["init", "Initiative"], ["name", "Name"]].map(([k, t]) => `<option value="${k}" ${(L.sort || "cost") === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        ${L.tab !== "champions" ? `<div class="chips">${["all", ...roles].map((r) => `<button class="small ${L.role === r ? "on" : ""}" data-role="${esc(r)}">${r === "all" ? "All" : `${esc(r)} <span class="muted">${catCount[r]}</span>`}</button>`).join("")}</div>` : `<p class="muted" style="margin:0">One champion per army, optional. A champion leads: Inspire, Warcry, Master or Command.</p>`}
        <div class="rlist">${rosterRows(f).map((u) => rowHTML(f, u, locked, counts, champ)).join("") || `<p class="muted">Nothing matches.</p>`}</div>
      </div>
      <aside class="list">
        <div class="lrow"><span class="label">Your warband</span><span class="num">${v.cost} / ${S.settings.budget}</span></div>
        <div class="budget ${v.cost > S.settings.budget ? "over" : ""}"><i style="width:${pct}%"></i></div>
        <div class="label">Champion (optional)</div>
        ${champ ? entryHTML(f, champ, L.draft.indexOf(champ), locked) : `<div class="slot muted">No champion. Open the Champions tab to take one.</div>`}
        <div class="label">Units <span class="num">${regs.length} / ${armyLimits(S.settings.budget).units}</span>${S.settings.budget > 100 ? ` <span class="muted">· up to ${armyLimits(S.settings.budget).copies} of each · ${S.board} battlefield</span>` : ""}</div>
        ${regs.length ? regs.map((x) => entryHTML(f, x.e, x.i, locked)).join("") : `<div class="slot muted">Add units from the roster.</div>`}
        ${v.errors.length && L.draft.length ? `<p style="margin:0;color:var(--crit)">${esc(v.errors.join(" "))}</p>` : ""}
        ${locked
          ? `<button id="edit">Edit army</button><p class="muted" style="margin:0">Ready. The battle starts when every seated player is ready (at least 2).</p>`
          : `<button class="cta" id="submit" ${v.ok ? "" : "disabled"}>Ready for battle</button>`}
        <hr><div class="label">Saved armies</div>
        <div class="btns"><input id="armyName" placeholder="Army name" maxlength="40" value="${esc(L.armyName)}" style="flex:1;min-width:0">
          <button id="saveArmy" ${L.draft.length ? "" : "disabled"}>${L.loadedId && saved.some((a) => a.id === L.loadedId && a.name === L.armyName) ? "Update" : "Save"}</button>
          <button id="clearArmy" class="ghost" ${L.draft.length && !locked ? "" : "disabled"}>Clear</button></div>
        ${saved.length ? saved.map((a) => `<div class="lrow saved"><span style="flex:1">${esc(a.name)} <span class="muted num">${a.cost} pts · ${esc(a.author)}</span></span>
          <button class="small" data-load="${esc(a.id)}" ${locked ? "disabled" : ""}>Load</button>
          ${a.mine || host ? `<button class="small ghost" data-del="${esc(a.id)}">${L.confirmDel === a.id ? "Confirm" : "Delete"}</button>` : ""}</div>`).join("") : `<p class="muted" style="margin:0">No saved ${esc(f.name)} armies yet.</p>`}
        <hr><div class="label">Upgrades</div>
        ${upgradesFor(f.id, { abilities: [], actions: [] }).map((g) => `<div style="font-size:14px"><b>${esc(g.name)}</b> <span class="muted">+${g.cost}${g.relic ? ", relic" : ""}</span>: ${esc(g.text)}</div>`).join("")}
      </aside>
    </div>` : `<p class="muted" style="margin-top:16px">Pick a faction to see its roster. Each army moves and acts differently.</p>`}
  </div>`;
  wireMuster(app, f);
}

function wireMuster(app, f) {
  const on = (sel, ev, fn) => app.querySelectorAll(sel).forEach((el) => (el[ev] = () => fn(el)));
  const changed = () => {
    keepDraft();
    render();
  };
  on("[data-faction]", "onclick", (b) => send("faction", { faction: b.dataset.faction }));
  on("[data-tab]", "onclick", (b) => { L.tab = b.dataset.tab; L.open = null; render(); });
  on("[data-role]", "onclick", (b) => { L.role = b.dataset.role; render(); });
  on("[data-open]", "onclick", (b) => { L.open = L.open === b.dataset.open ? null : b.dataset.open; render(); });
  on("[data-add]", "onclick", (b) => {
    const u = unitIn(f.id, b.dataset.add);
    if (u.champion) L.draft = L.draft.filter((e) => !unitIn(f.id, e.unit)?.champion);
    L.draft.push({ unit: u.id, upgrade: null });
    changed();
  });
  on("[data-rm]", "onclick", (b) => { L.draft.splice(Number(b.dataset.rm), 1); changed(); });
  on("[data-up]", "onchange", (s) => { L.draft[Number(s.dataset.up)].upgrade = s.value || null; changed(); });
  on("[data-preset]", "onclick", (b) => {
    const pr = (PRESETS[f.id] || []).find((x) => x.id === b.dataset.preset);
    if (!pr) return;
    Object.assign(L, { draft: cleanList(f.id, presetList(f.id, pr, S.settings.budget)), armyName: pr.name, loadedId: null });
    changed();
  });
  on("[data-load]", "onclick", (b) => {
    const a = S.armies.find((x) => x.id === b.dataset.load);
    if (!a) return;
    Object.assign(L, { draft: cleanList(f.id, a.list), armyName: a.name, loadedId: a.id });
    changed();
  });
  on("[data-del]", "onclick", (b) => {
    if (L.confirmDel === b.dataset.del) {
      send("deleteArmy", { id: b.dataset.del });
      L.confirmDel = null;
    } else {
      L.confirmDel = b.dataset.del;
      clearTimeout(L.confirmTimer);
      L.confirmTimer = setTimeout(() => { L.confirmDel = null; render(); }, 4000);
      render();
    }
  });
  const search = $("#search");
  if (search) {
    search.oninput = () => {
      L.search = search.value;
      render();
      const again = $("#search");
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    };
  }
  $("#sort") && ($("#sort").onchange = (e) => { L.sort = e.target.value; render(); });
  $("#armyName") && ($("#armyName").oninput = (e) => { L.armyName = e.target.value; });
  $("#saveArmy") && ($("#saveArmy").onclick = () => {
    const name = (L.armyName || "").trim() || `${f.name} ${new Date().toLocaleDateString()}`;
    const same = (S.armies || []).find((a) => a.id === L.loadedId && a.name === name);
    send("saveArmy", { id: same?.id, name, faction: f.id, list: L.draft });
    L.armyName = name;
    toast(`Saved "${name}".`, "ok");
  });
  $("#clearArmy") && ($("#clearArmy").onclick = () => { Object.assign(L, { draft: [], loadedId: null, armyName: "" }); changed(); });
  $("#submit") && ($("#submit").onclick = () => send("army", { list: L.draft }));
  $("#edit") && ($("#edit").onclick = () => send("unready"));
  $("#budget") && ($("#budget").onchange = (e) => send("settings", { budget: Number(e.target.value) }));
  $("#rounds") && ($("#rounds").onchange = (e) => send("settings", { maxRounds: Number(e.target.value) }));
  $("#openSpec") && ($("#openSpec").onchange = (e) => send("settings", { openSpectators: e.target.checked }));
  $("#sitOut") && ($("#sitOut").onclick = () => {
    L.spectate = true;
    store.set("dow.spectate", "1");
    send("sitOut");
    render();
  });
  $("#addAI") && ($("#addAI").onclick = () => send("addAI", { faction: $("#aiFaction").value || null }));
  on("[data-rmai]", "onclick", (b) => send("removeAI", { seat: b.dataset.rmai }));
}

function actionLabel(entry) {
  const x = parseAction(entry);
  const one = (a, red) => `${red ? "red " : ""}${ACTIONS[a].name}`;
  return x.link ? `${one(x.a, x.red)} → ${one(x.link.a, x.link.red)}` : one(x.a, x.red);
}

function weaponText(w) {
  return `${esc(w.name)} <b>${w.dice}</b> · ${w.arc === "full" ? "all-round" : w.arc} · ${rangeText(w)}`;
}

function dialHTML(dial, current, mini = false, strainedNow = false) {
  const cols = ["TL", "BL", "S", "BR", "TR", "*"];
  const all = dial.map(parseManeuver);
  const ms = all.filter((m) => !isHold(m));
  const stances = all.filter(isStance);
  const aims = all.filter(isAim);
  const speeds = [...new Set(ms.map((m) => m.speed))].sort((a, b) => b - a);
  // The defensive stance row sits under the speeds: hold position, pick a facing, gain defence.
  const STANCE_COL = { TL: "DL", BL: "DBL", S: "D", BR: "DBR", TR: "DR", "*": "DA" };
  const AIM_COL = { TL: "ML", BL: "MBL", S: "M", BR: "MBR", TR: "MR", "*": "MA" };
  const bonus = stances.length ? stanceBonus({ dial }) : 0;
  let html = `<div class="dial" ${mini ? 'style="max-width:260px"' : ""}>`;
  for (const s of [...speeds, ...(stances.length ? ["def"] : []), ...(aims.length ? ["aim"] : [])]) {
    html += s === "def" ? `<span class="sp def" title="Defensive stance: no movement, +${bonus} defence ${bonus === 1 ? "die" : "dice"} this round">Def</span>`
      : s === "aim" ? `<span class="sp aim" title="Aim: no movement; attacks cancel up to ${bonus} of a target's stance dice this round">Aim</span>`
      : `<span class="sp">${s}</span>`;
    for (const c of cols) {
      const m = s === "def"
        ? stances.find((x) => x.type === STANCE_COL[c])
        : s === "aim"
          ? aims.find((x) => x.type === AIM_COL[c])
          : ms.find((x) => x.speed === s && (c === "*" ? ["A", "RF", "X"].includes(x.type) : x.type === c));
      if (!m) { html += `<button class="empty" disabled></button>`; continue; }
      const blocked = strainedNow && m.color === "red";
      html += `<button class="${m.color} ${isStance(m) ? "stance" : isAim(m) ? "aim" : ""} ${current === m.code ? "on" : ""}" ${mini ? "disabled" : `data-man="${m.code}"`} ${blocked ? "disabled" : ""} title="${blocked ? "Strained: no red maneuvers" : isStance(m) ? `Defensive stance, ${holdName(m)}: +${bonus} defence this round` : isAim(m) ? `Aim, ${holdName(m)}: offsets up to ${bonus} of a target's stance dice this round` : m.code}">${GLYPH[m.type]}</button>`;
    }
  }
  return `${html}</div>`;
}

// ── Battle ───────────────────────────────────────────────────────────────────
function renderBattle(app) {
  if (L.mode !== "battle") {
    L.mode = "battle";
    app.innerHTML = `<div class="battle"><div class="boardcol"><div class="boardwrap"><canvas id="board"></canvas>
      <div class="zoomctl" aria-label="Map zoom"><button class="small" id="zoomIn" title="Zoom in (or scroll)">+</button><button class="small" id="zoomOut" title="Zoom out (or scroll)">−</button><button class="small" id="zoomFit" title="Show the whole battlefield">Fit</button><span id="zoomPct" class="label"></span></div></div><div class="unitbar" id="roster"></div></div>
      <aside class="side"><section id="prompt" class="scroll"></section><section id="card" class="scroll"></section><section class="log" id="log"></section></aside></div><div id="umodal"></div>`;
    const canvas = $("#board");
    canvas.onclick = onBoardClick;
    canvas.onpointerdown = (ev) => {
      const pt = toBoard(canvas, ev);
      if (L.order?.mode === "charge" && L.chargeAt && Math.hypot(pt.x - L.chargeAt.x, pt.y - L.chargeAt.y) < 34) {
        L.dragging = true;
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
      // Anywhere else: a drag pans the map (once zoomed); a click without movement still selects.
      L.pan = { x: ev.clientX, y: ev.clientY, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    };
    canvas.onpointerup = () => {
      if (L.pan) {
        if (L.pan.moved) L.dragged = true; // the click that ends a pan is not a selection
        L.pan = null;
        canvas.style.cursor = "";
      }
      if (!L.dragging) return;
      L.dragging = false;
      L.dragged = true; // the click that follows a drag is not a selection
      issueOrder("charge", true);
    };
    // Scroll (or pinch) to zoom toward the pointer.
    canvas.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      zoomAt(canvas, ev, Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
      drawBoard();
    }, { passive: false });
    $("#zoomIn").onclick = () => { zoomAt(canvas, null, 1.4); drawBoard(); };
    $("#zoomOut").onclick = () => { zoomAt(canvas, null, 1 / 1.4); drawBoard(); };
    $("#zoomFit").onclick = () => { resetView(); drawBoard(); };
    canvas.onpointermove = (ev) => {
      if (L.pan && !L.dragging) {
        const dx = ev.clientX - L.pan.x;
        const dy = ev.clientY - L.pan.y;
        if (!L.pan.moved && Math.hypot(dx, dy) > 5) L.pan.moved = true;
        if (L.pan.moved) {
          panBy(canvas, dx, dy);
          Object.assign(L.pan, { x: ev.clientX, y: ev.clientY });
          canvas.style.cursor = "grabbing";
          return drawBoard();
        }
      }
      const pt = toBoard(canvas, ev);
      if (L.dragging) {
        L.chargeAt = { x: Math.max(20, Math.min(S.board - 20, pt.x)), y: Math.max(20, Math.min(S.board - 20, pt.y)) };
        canvas.style.cursor = "grabbing";
        return drawBoard();
      }
      canvas.style.cursor = L.order?.mode === "charge" && L.chargeAt && Math.hypot(pt.x - L.chargeAt.x, pt.y - L.chargeAt.y) < 34 ? "grab" : "";
      const u = unitAt(S, pt);
      const o = u ? null : terrainAt(S, pt);
      const tt = o && TERRAIN[o.kind];
      canvas.title = u ? `${u.name} (${nameOf(u.owner)})` : tt ? `${tt.name}\n+ ${tt.up}\n- ${tt.down}` : "";
    };
    window.onresize = () => {
      clearTimeout(L.resizeTimer);
      L.resizeTimer = setTimeout(drawBoard, 150); // repaint the battlefield once resizing settles
    };
    window.onkeydown = (ev) => {
      if (ev.key === "Escape" && L.cardFor) { L.cardFor = null; return render(); }
      if (S?.phase !== "deploy" || !L.selected) return;
      const u = unitById(L.selected);
      if (!u || u.owner !== S.you) return;
      if (ev.key === "q" || ev.key === "e") send("deploy", { uid: u.id, x: u.x, y: u.y, h: u.h + (ev.key === "e" ? 45 : -45) });
      // Arrow keys nudge the selected unit, so deployment works without a mouse.
      const nudge = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[ev.key];
      if (nudge) {
        ev.preventDefault();
        send("deploy", { uid: u.id, x: u.x + nudge[0], y: u.y + nudge[1], h: u.h });
      }
    };
  }
  try {
    $("#prompt").innerHTML = promptHTML();
  } catch (err) {
    console.error(err);
    L.sub = null;
    $("#prompt").innerHTML = `<p class="muted">Something in this prompt could not be shown.</p>${S.pending?.pid === S.you ? `<button class="cta" id="pass">Done</button>` : ""}`;
  }
  $("#prompt").className = `scroll ${S.pending?.pid === S.you ? "prompt" : ""}`;
  if (L.order && (S.phase !== "plan" || L.order.round !== S.round)) Object.assign(L, { order: null, chargeAt: null, manual: new Set() });
  $("#card").innerHTML = cardHTML();
  renderRoster();
  $("#log").innerHTML = S.log.slice(-80).reverse().map((l) => `<div><span class="label">R${l.round}</span> ${esc(l.msg)}</div>`).join("");
  wirePrompt();
  // Bring a newly opened dial into view once, so it sits under its unit without manual scrolling.
  const dialEl = $("#seldial");
  if (dialEl && L.dialFor !== L.selected) dialEl.scrollIntoView({ block: "nearest" });
  L.dialFor = dialEl ? L.selected : null;
  drawBoard();
}

function drawBoard() {
  const canvas = $("#board");
  if (!canvas || !S) return;
  sizeCanvas(canvas);
  const pct = $("#zoomPct");
  if (pct) pct.textContent = `${Math.round(zoomLevel() * 100)}%`;
  const sel = unitById(L.selected);
  let ghost = null;
  if (S.phase === "plan" && sel && sel.owner === S.you) {
    const code = L.hover || S.dials[sel.id];
    if (code) ghost = { uid: sel.id, code };
  }
  const highlight = new Set();
  const p = S.pending;
  if (p?.pid === S.you) {
    if (p.type === "attack") p.options.forEach((o) => highlight.add(o.target));
    for (const id of stepTargets().ids) highlight.add(id);
  }
  const A = S.attack || null;
  updateBoard(canvas, S, {
    selected: L.selected,
    active: p?.uid || A?.attacker,
    ghost,
    ghosts: L.order && S.phase === "plan" ? myUnits().filter((u) => S.dials[u.id] && u.id !== sel?.id).map((u) => ({ uid: u.id, code: S.dials[u.id] })) : [],
    marker: L.order?.mode === "charge" && S.phase === "plan" ? L.chargeAt : null,
    highlight,
    zones: S.phase === "deploy",
    fog: !S.spectator && !!me() && S.phase !== "over",
    attackLine: A ? { from: A.attacker, to: A.target } : L.hoverTarget ? { from: p?.uid, to: L.hoverTarget } : null,
  });
}

function onBoardClick(ev) {
  if (L.dragged) { L.dragged = false; return; }
  const canvas = $("#board");
  const pt = toBoard(canvas, ev);
  const u = unitAt(S, pt);
  if (S.phase === "deploy" && !u && L.selected) {
    const s = unitById(L.selected);
    if (s?.owner === S.you) return send("deploy", { uid: s.id, x: pt.x, y: pt.y, h: s.h });
  }
  // During a targeted choice, clicking a highlighted unit picks it for the current step.
  const step = stepTargets();
  if (u && step.ids.includes(u.id) && S.pending?.pid === S.you) {
    if (step.kind === "command") {
      L.sub.target = u.id;
      return render();
    }
    return chooseTarget(u.id);
  }
  if (u && S.pending?.type === "attack" && S.pending.pid === S.you) {
    const opts = S.pending.options.filter((o) => o.target === u.id);
    if (opts.length === 1) return send("attack", { target: u.id, weapon: opts[0].weapon });
  }
  L.selected = u?.id || null;
  L.hover = null;
  render();
}

/** The unit ids the current multi-step choice is asking for, and what kind of step it is. */
function stepTargets() {
  const o = L.sub;
  if (!o || S.pending?.pid !== S.you) return { ids: [], kind: null };
  if (o.a === "command" && !o.target) return { ids: o.targets.map((t) => t.id), kind: "command" };
  if (o.a === "command" && !o.subA) return { ids: [], kind: null };
  const spec = o.a === "command" ? o.targets.find((x) => x.id === o.target)?.subs.find((s) => s.a === o.subA) : o;
  return { ids: (spec?.targets || []).filter((id) => typeof id === "string" && unitById(id)), kind: "target" };
}

function waitingText(p) {
  const who = esc(nameOf(p.pid));
  const u = p.uid ? unitById(p.uid) : null;
  return {
    action: `${who} is choosing an action for ${esc(u?.name ?? "an unseen unit")}.`,
    attack: `${who} is choosing a target for ${esc(u?.name ?? "an unseen unit")}.`,
    attackMods: `${who} is modifying attack dice.`,
    defenseMods: `${who} is modifying defence dice.`,
  }[p.type];
}

function promptHTML() {
  const p = S.pending;
  const mine = me();
  let html = "";
  if (S.phase === "deploy") {
    html = `<div class="label">Deployment</div><h3>Place your warband</h3>
      <p class="muted" style="margin:6px 0">Select one of your units (on the board or below), then click inside your shaded zone to move it, or nudge it with the arrow keys. Rotate with Q and E or the buttons.</p>
      ${mine ? `<div class="ulist" style="margin:8px 0">${myUnits().map((u) => `<button data-sel="${u.id}" class="${L.selected === u.id ? "on" : ""}"><span>${esc(u.name)}</span><span class="muted">${u.base}</span></button>`).join("")}</div>
      <div class="btns">
        <button data-rot="-45" ${L.selected ? "" : "disabled"}>Rotate left</button><button data-rot="45" ${L.selected ? "" : "disabled"}>Rotate right</button>
        ${mine.ready ? `<button id="unready">Keep adjusting</button>` : `<button class="cta" id="ready">Ready</button>`}
      </div>` : ""}`;
  } else if (S.phase === "plan") {
    if (!mine || mine.eliminated) html = `<div class="label">Planning</div><p class="muted">Warlords are setting their dials in secret.</p>`;
    else {
      const units = myUnits();
      const sel = unitById(L.selected);
      const allSet = units.every((u) => S.dials[u.id]);
      const ord = L.order?.mode;
      html = `<div class="label">Planning · secret</div><h3>Set a maneuver for every unit</h3>
        <div class="orders"><div class="btns">${Object.entries(ORDERS).map(([k, o]) => `<button data-order="${k}" class="${ord === k ? "on" : ""}" title="${esc(o.hint)}" ${mine.ready ? "disabled" : ""}>${o.name}</button>`).join("")}</div>
          <p class="muted">${ord ? esc(ORDERS[ord].hint) : "Quick orders set every dial at once. You can still change any unit afterwards."}</p></div>
        <div class="ulist" style="margin:8px 0">${units.map((u) => `<button data-sel="${u.id}" class="${L.selected === u.id ? "on" : ""}"><span>${esc(u.name)} <span class="muted">i${u.init}${strained(u) ? " · strained" : ""}</span></span><span class="set">${S.dials[u.id] ? esc(S.dials[u.id].replace(":", " ")) : ""}</span></button>${u === sel ? `<div class="inline-dial" id="seldial"><div class="label">Dial (hover to preview)</div>${dialHTML(sel.dial, S.dials[sel.id], false, strained(sel))}</div>` : ""}`).join("")}</div>
        ${sel && sel.owner === S.you ? "" : `<p class="muted">Select a unit to open its dial.</p>`}
        <div class="btns" style="margin-top:10px">${mine.ready ? `<span class="muted">Orders locked. Waiting for the others.</span><button id="unready">Change orders</button>` : `<button class="cta" id="ready" ${allSet ? "" : "disabled"}>Lock in orders</button>`}</div>`;
    }
  } else if (S.phase === "over") {
    const winner = S.players.find((x) => x.id === S.winner);
    html = `<div class="label">Victory</div><div class="big">${esc(winner?.name ?? "Nobody")}</div>
      <p class="muted">${winner ? `Victory for ${esc(FACTIONS[winner.faction].name)}.` : ""}</p>
      <table class="victory num" style="width:100%">${S.players.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.vp} VP</td><td class="muted">${((n) => `${n} unit${n === 1 ? "" : "s"} left`)(S.units.filter((u) => u.owner === x.id && !u.dead).length)}</td></tr>`).join("")}</table>
      <div class="btns" style="margin-top:10px"><button class="cta" id="reset">New battle</button></div>`;
  } else if (p && p.pid === S.you) {
    html = myPromptHTML(p);
  } else if (p) {
    html = `<div class="label">${PHASES[S.phase]}</div><p class="muted">${waitingText(p)}</p>`;
  } else {
    html = `<div class="label">${PHASES[S.phase]}</div>`;
  }
  if (S.hidden && S.phase !== "over") html += `<div class="label" style="margin-top:8px">Fog of war: ${S.hidden} enemy unit${S.hidden === 1 ? "" : "s"} unseen</div>`;
  if (S.attack || S.lastAttack) html += diceHTML(S.attack || S.lastAttack, !!S.attack);
  return html;
}

function optionLabel(o) {
  const name = ACTIONS[o.a].name;
  return `${o.red ? "Red " : ""}${name}${o.linked ? " (linked)" : ""}${o.taint ? " (Overreach: Taint)" : ""}`;
}

function myPromptHTML(p) {
  const u = unitById(p.uid);
  if (p.type === "action") {
    if (L.sub) return subChoiceHTML(u);
    return `<div class="label">Your action · ${esc(u.name)}</div>
      <div class="btns" style="margin:8px 0">${p.options.map((o, i) => `<button data-opt="${i}" title="${esc(ACTIONS[o.a].text)}">${esc(optionLabel(o))}</button>`).join("")}</div>
      <button class="ghost" id="pass">Done, no more actions</button>`;
  }
  if (p.type === "attack") {
    return `<div class="label">Your attack · ${esc(u.name)}</div>
      <div class="ulist" style="margin:8px 0">${p.options.map((o, i) => {
        const t = unitById(o.target);
        if (!t) return "";
        return `<button data-atk="${i}" data-hover="${t.id}"><span>${esc(t.name)} <span class="muted">${esc(nameOf(t.owner))}</span></span><span class="muted">${esc(u.weapons[o.weapon].name)} · R${o.range}</span></button>`;
      }).join("")}</div><button class="ghost" id="pass">Hold fire</button>`;
  }
  const verb = p.type === "attackMods" ? "Modify your attack" : "Defend";
  const MOD = {
    steel: "Spend Steel: Omens become " + (p.type === "attackMods" ? "Strikes" : "Parries"),
    mark: "Spend Mark: reroll selected dice",
    frenzy: "Spend Frenzy: reroll up to 2",
    inspire: "Inspire: reroll 1 die",
    channel: "Channel: selected die becomes Rend",
    guard: "Spend Guard: +1 Parry",
    brace: "Spend Brace: cancel 1 Strike",
  };
  return `<div class="label">${verb}</div>
    ${p.type === "attackMods" ? `<p class="muted" style="margin:4px 0">Click dice to select them for rerolls (none selected rerolls blanks and omens).</p>` : ""}
    <div class="btns" style="margin:8px 0">${p.options.map((o) => `<button data-mod="${o.op}">${esc(MOD[o.op])}</button>`).join("")}</div>
    <button class="cta" id="pass">Done</button>`;
}

function subChoiceHTML(u) {
  const o = L.sub;
  const back = `<button class="ghost" id="back">Back</button>`;
  if (o.a === "command" && !o.target) {
    return `<div class="label">Command · pick a friendly unit</div><div class="ulist" style="margin:8px 0">${o.targets.map((t) => `<button data-cmdt="${t.id}">${esc(unitName(t.id))}</button>`).join("")}</div>${back}`;
  }
  if (o.a === "command" && !o.subA) {
    const t = o.targets.find((x) => x.id === o.target);
    if (!t) return `<p class="muted">That unit is no longer available.</p>${back}`;
    return `<div class="label">Command ${esc(unitName(t.id))} to</div><div class="btns" style="margin:8px 0">${t.subs.map((s) => `<button data-cmds="${s.a}">${esc(ACTIONS[s.a].name)}</button>`).join("")}</div>${back}`;
  }
  const spec = o.a === "command" ? o.targets.find((x) => x.id === o.target)?.subs.find((s) => s.a === o.subA) : o;
  if (!spec) return `<p class="muted">That choice is no longer available.</p>${back}`;
  if (spec.dirs) {
    const name = { L: spec.a === "surge" ? "Bank left" : "Left", S: "Straight", R: spec.a === "surge" ? "Bank right" : "Right" };
    return `<div class="label">${esc(ACTIONS[spec.a].name)} · direction</div><div class="btns" style="margin:8px 0">${spec.dirs.map((d) => `<button data-dir="${d}">${name[d]}</button>`).join("")}</div>${back}`;
  }
  return `<div class="label">${esc(ACTIONS[spec.a].name)} · pick a unit (or click it on the board)</div><div class="ulist" style="margin:8px 0">${spec.targets.filter((id) => unitById(id)).map((id) => `<button data-tgt="${id}" data-hover="${id}">${esc(unitName(id))} <span class="muted">${esc(nameOf(unitById(id).owner))}</span></button>`).join("") || `<p class="muted">No valid targets in sight.</p>`}</div>${back}`;
}

function chooseTarget(id) {
  const o = L.sub;
  L.hoverTarget = null;
  if (o.a === "command") send("act", { a: "command", params: { target: o.target, sub: o.subA, subParams: { target: id } } });
  else send("act", { a: o.a, params: { target: id } });
}

// A die tumbles once when its face first appears or changes (a roll or reroll).
const seenFaces = new Map();
function rolled(side, i, face) {
  const key = `${side}${i}`;
  const fresh = seenFaces.get(key) !== face;
  seenFaces.set(key, face);
  return fresh ? "roll" : "";
}

function diceHTML(A, live) {
  const sig = `${A.attacker}|${A.target}|${S.round}`;
  if (seenFaces.get("sig") !== sig) {
    seenFaces.clear();
    seenFaces.set("sig", sig);
  }
  const at = unitById(A.attacker);
  const df = unitById(A.target);
  const selectable = live && S.pending?.type === "attackMods" && S.pending.pid === S.you;
  const res = A.result ? ` · ${A.result.strikes} Strike, ${A.result.rends} Rend` : "";
  return `<hr><div class="label">${A.ambush ? "Ambush! · " : ""}${live ? "Attack in progress" : "Last attack"} · R${A.range}${A.obstructed ? " · haze" : ""}${res}</div>
    <div style="font-size:13px;margin:4px 0">${esc(at?.name)} → ${esc(df?.name)}</div>
    <div class="dice">${A.atk.map((f, i) => `${selectable ? `<button class="die atk ${f} ${L.diceSel.has(i) ? "sel" : ""} ${A.rerolled.includes(i) ? "rr" : ""} ${rolled("a", i, f)}" title="${f}" data-die="${i}" aria-pressed="${L.diceSel.has(i)}" aria-label="${f} die">${iconSVG(DIE_ICON[f])}</button>` : `<span class="die atk ${f} ${A.rerolled.includes(i) ? "rr" : ""} ${rolled("a", i, f)}" title="${f}">${iconSVG(DIE_ICON[f])}</span>`}`).join("")}</div>
    <div class="dice" style="margin-top:4px">${A.def.map((f, i) => `<span class="die def ${f} ${rolled("d", i, f)}" title="${f}">${iconSVG(DIE_ICON[f])}</span>`).join("") || (live ? "<span class='muted'>defence not rolled yet</span>" : "<span class='muted'>no defence dice</span>")}${A.brace ? " <span class='tag'>brace</span>" : ""}</div>`;
}

function wirePrompt() {
  const root = $("#prompt");
  const on = (sel, fn) => root.querySelectorAll(sel).forEach((el) => (el.onclick = () => fn(el)));
  on("#ready", () => send("ready"));
  on("#unready", () => send("unready"));
  on("#reset", () => send("reset"));
  on("#pass", () => send("pass"));
  on("#back", () => { L.sub = null; render(); });
  on("[data-rot]", (el) => {
    const u = unitById(L.selected);
    if (u) send("deploy", { uid: u.id, x: u.x, y: u.y, h: u.h + Number(el.dataset.rot) });
  });
  on("[data-sel]", (el) => { L.selected = el.dataset.sel; L.hover = null; render(); });
  on("[data-man]", (el) => {
    if (L.order) L.manual.add(L.selected);
    send("dial", { uid: L.selected, code: el.dataset.man });
  });
  on("[data-order]", (el) => issueOrder(el.dataset.order));
  root.querySelectorAll("[data-man]").forEach((el) => {
    el.onmouseenter = () => { L.hover = el.dataset.man; drawBoard(); };
    el.onmouseleave = () => { L.hover = null; drawBoard(); };
  });
  root.querySelectorAll("[data-hover]").forEach((el) => {
    el.onmouseenter = () => { L.hoverTarget = el.dataset.hover; drawBoard(); };
    el.onmouseleave = () => { L.hoverTarget = null; drawBoard(); };
  });
  on("[data-opt]", (el) => {
    const o = S.pending.options[Number(el.dataset.opt)];
    if (o.targets || o.dirs) { L.sub = { ...o }; render(); }
    else send("act", { a: o.a, params: {} });
  });
  on("[data-cmdt]", (el) => { L.sub.target = el.dataset.cmdt; render(); });
  on("[data-cmds]", (el) => {
    const t = L.sub.targets.find((x) => x.id === L.sub.target);
    const s = t.subs.find((x) => x.a === el.dataset.cmds);
    if (s.targets || s.dirs) { L.sub.subA = s.a; render(); }
    else send("act", { a: "command", params: { target: L.sub.target, sub: s.a } });
  });
  on("[data-dir]", (el) => {
    const o = L.sub;
    if (o.a === "command") send("act", { a: "command", params: { target: o.target, sub: o.subA, subParams: { dir: el.dataset.dir } } });
    else send("act", { a: o.a, params: { dir: el.dataset.dir } });
  });
  on("[data-tgt]", (el) => chooseTarget(el.dataset.tgt));
  on("[data-atk]", (el) => {
    const o = S.pending.options[Number(el.dataset.atk)];
    L.hoverTarget = null;
    send("attack", { target: o.target, weapon: o.weapon });
  });
  on("[data-die]", (el) => {
    const i = Number(el.dataset.die);
    L.diceSel.has(i) ? L.diceSel.delete(i) : L.diceSel.add(i);
    render();
  });
  on("[data-mod]", (el) => send("mod", { op: el.dataset.mod, dice: [...L.diceSel] }));
}

function cardHTML() {
  const u = unitById(L.selected);
  if (!u) return `<p class="muted" style="margin:0">Click any unit for its details.</p>`;
  const t = u.tokens;
  const tokens = [
    t.steel && `Steel ×${t.steel}`, t.guard && `Guard ×${t.guard}`, t.brace && `Brace ×${t.brace}`,
    t.frenzy && "Frenzy", t.charge && `Calamity ×${t.charge}`, t.mark && `Mark: ${unitById(t.mark)?.name ?? "?"}`,
    u.souls && `Souls ×${u.souls}`,
  ].filter(Boolean);
  const conds = Object.keys(u.cond).filter((c) => CRIT_TEXT[c]).map((c) => CRIT_TEXT[c]);
  if (u.cond.broken) conds.push(`Broken Arms ×${u.cond.broken}`);
  return `<div class="row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;--fc:${playerColor(S, u.owner)}"><span style="display:flex;align-items:center;gap:8px"><span class="portrait small">${iconSVG(u.icon || UNIT_ICON[u.type] || "sword", "emblem")}${artTag(`units/${u.type}.png`, "")}</span><h3>${esc(u.name)}</h3></span><span class="label">${esc(nameOf(u.owner))}</span></div>
    <div class="label" style="color:${playerColor(S, u.owner)}">${esc(FACTIONS[u.faction].name)}${u.upgrade ? ` · ${esc(UPGRADES[u.upgrade].name)}` : ""}${u.dead ? " · destroyed" : ""}</div>
    <div class="stats" style="margin:6px 0"><span>Init <b>${u.init}</b></span><span>Def <b>${u.def}</b></span><span>Wounds <b>${u.wounds}/${u.maxWounds}</b></span><span>Ward <b>${u.ward}/${u.maxWard}</b></span><span>Strain <b>${u.strain}</b>/${u.faction === "greenskin" ? 2 : 1}</span></div>
    <div class="stats">${u.weapons.map((w) => `<span>${weaponText(w)}</span>`).join("")}</div>
    ${u.revealed ? `<div class="label" style="margin-top:6px">Revealed ${esc(u.revealed.replace(":", " "))}</div>` : ""}
    ${tokens.length ? `<div class="tags" style="margin-top:6px">${tokens.map((x) => `<span class="tag"><span class="coin"></span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${conds.length ? `<div style="font-size:13px;color:var(--crit);margin-top:6px">${conds.map(esc).join("<br>")}</div>` : ""}
    <div class="tags" style="margin-top:6px">${u.actions.map((a) => `<span class="tag">${esc(actionLabel(a))}</span>`).join("")}</div>
    ${u.abilities.length ? `<div style="font-size:13px;margin-top:6px" class="muted">${u.abilities.map((a) => esc(ABILITIES[a] || a)).join("<br>")}</div>` : ""}`;
}

// ── Quick orders (planning) ─────────────────────────────────────────────────
const ORDERS = {
  charge: { name: "Charge", hint: "Every unit drives as fast as it can at the thickest knot of enemies. Drag the banner on the map to redirect the charge." },
  scatter: { name: "Scatter", hint: "Every unit breaks away from the enemy mass and spreads out, keeping off the table edges." },
  defend: { name: "Defend", hint: "The warband closes ranks on the most defensible ground nearby, takes cover, and braces in defensive stances once it arrives." },
};

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = (ps) => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length });
const facingOff = (pose, to) => Math.abs(((((Math.atan2(to.x - pose.x, -(to.y - pose.y)) * 180) / Math.PI) - pose.h + 540) % 360) - 180);

/** Where your side believes the enemy is thickest: the densest visible group, else their deployment zones. */
function enemyFocus() {
  const foes = S.units.filter((u) => !u.dead && u.owner !== S.you);
  if (foes.length) {
    const near = (f) => foes.filter((o) => gap(o, f) <= 200);
    const core = foes.reduce((a, f) => (near(f).length > near(a).length ? f : a));
    return centroid(near(core));
  }
  const zones = S.players.filter((p) => p.id !== S.you && !p.eliminated).map((p) => zoneFor(p.seat, S.board)).filter(Boolean);
  return zones.length ? centroid(zones.map((z) => ({ x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }))) : { x: S.board / 2, y: S.board / 2 };
}

/** The best nearby ground to hold: cover or high ground close to the warband and away from the enemy. */
function rallyPoint(units, focus) {
  const home = centroid(units);
  const spots = [home, ...S.obstacles.filter((o) => ["hill", "thicket", "ruins"].includes(o.kind)).map((o) => ({ x: o.x, y: o.y, good: true }))];
  const score = (c) => -gap(c, home) + 0.6 * Math.min(gap(c, focus), 500) + (c.good ? 140 : 0);
  return spots.reduce((a, c) => (score(c) > score(a) ? c : a));
}

/** Pick a dial for each unit for the chosen quick order and send them as one batch. */
function issueOrder(mode, keepManual = false) {
  const units = myUnits();
  if (!units.length || S.phase !== "plan" || me()?.ready) return;
  if (!keepManual) L.manual = new Set();
  const focus = enemyFocus();
  if (mode === "charge" && (!keepManual || !L.chargeAt)) L.chargeAt = L.chargeAt && L.order?.mode === "charge" ? L.chargeAt : focus;
  const target = mode === "charge" ? L.chargeAt : focus;
  const rally = mode === "defend" ? rallyPoint(units, focus) : null;
  L.order = { mode, round: S.round };
  const ends = [];
  const dials = {};
  const plan = units.filter((u) => !L.manual.has(u.id)).sort((a, b) => gap(a, target) - gap(b, target));
  for (const u of units.filter((x) => L.manual.has(x.id) && S.dials[x.id])) ends.push({ u, pose: planMove(S, u, S.dials[u.id]).pose });
  for (const u of plan) {
    let best = null;
    for (const code of u.dial) {
      const m = parseManeuver(code);
      if (m.color === "red" && strained(u)) continue;
      if (isAim(m)) continue; // Aim is a deliberate call; quick orders leave it to the player
      if (mode === "charge" && isStance(m)) continue; // a charge never stands still
      const mv = planMove(S, u, code);
      if (mv.fled) continue;
      const end = mv.pose;
      let sc = 0;
      if (mv.bumped.length || mv.blockedBy) sc -= 40;
      if (mv.slowedBy?.kind === "lava" && u.faction !== "calamity") sc -= 30;
      if (m.color === "red") sc -= mode === "charge" ? 6 : 15;
      if (isStance(m) && m.type !== "D" && end.h === u.h) sc -= 30; // a pivot with no room to turn
      if (m.color === "blue" && u.strain > 0) sc += 10;
      // Keep planned bases from landing on each other.
      for (const o of ends) if (gap(end, o.pose) < ((BASE_SIZE[u.base] + BASE_SIZE[o.u.base]) / 2) * 1.05) sc -= 60;
      if (mode === "charge") {
        sc += -gap(end, target) - facingOff(end, target) / 4;
      } else if (mode === "scatter") {
        const edge = Math.min(end.x, end.y, S.board - end.x, S.board - end.y);
        const spread = Math.min(150, ...ends.map((o) => gap(end, o.pose)), 150);
        sc += gap(end, focus) + 0.5 * spread - Math.max(0, 90 - edge) * 3;
      } else {
        const arrived = gap(u, rally) < 110;
        sc += -gap(end, rally) - facingOff(end, focus) / 1.5; // a defensive line keeps its front to the enemy
        if (["hill", "thicket", "ruins"].some((k) => onKind(S, end, k))) sc += 25;
        if (onKind(S, end, "marsh")) sc -= 20;
        if (isStance(m)) sc += arrived ? 45 : -25;
        const mates = ends.filter((o) => gap(end, o.pose) < 120).length;
        sc += Math.min(3, mates) * 8;
      }
      if (!best || sc > best.sc) best = { code, sc, end };
    }
    if (!best) continue;
    dials[u.id] = best.code;
    ends.push({ u, pose: best.end });
  }
  if (Object.keys(dials).length) send("dials", { dials });
  render();
}

// ── Roster strip and full unit card ─────────────────────────────────────────
/** Buffs and debuffs currently on a unit: tokens, conditions, strain and the terrain under it. */
function unitStatus(u) {
  const t = u.tokens;
  const buffs = [];
  const debuffs = [];
  if (t.steel) buffs.push([`Steel ×${t.steel}`, ACTIONS.steel.text]);
  if (t.guard) buffs.push([`Guard ×${t.guard}`, ACTIONS.guard.text]);
  if (t.brace) buffs.push([`Brace ×${t.brace}`, ACTIONS.brace.text]);
  if (t.frenzy) buffs.push(["Frenzy", "Spend while attacking to reroll up to 2 dice."]);
  if (t.charge) buffs.push([`Calamity ×${t.charge}`, "Calamity charges, spent on Calamity abilities."]);
  if (t.mark) buffs.push([`Mark: ${unitName(t.mark)}`, ACTIONS.mark.text]);
  if (u.souls) buffs.push([`Souls ×${u.souls}`, "Spent in the End phase to heal thralls."]);
  if (u.aim) buffs.push([`Aimed ${u.aim}`, `Attacks gain up to ${u.aim} ${u.aim === 1 ? "die" : "dice"} against a target in a defensive stance, never more than its stance added.`]);
  if (u.stance) buffs.push([`Defensive stance +${u.stance}`, `Rolls ${u.stance} extra defence ${u.stance === 1 ? "die" : "dice"} until the end of the round.`]);
  if (u.strain) debuffs.push([`Strain ${u.strain}/${u.faction === "greenskin" ? 2 : 1}`, strained(u) ? "Strained: cannot pick red maneuvers or red actions." : "Strain builds from red maneuvers and actions."]);
  for (const c of Object.keys(u.cond)) if (CRIT_TEXT[c] && c !== "broken") debuffs.push([c[0].toUpperCase() + c.slice(1), CRIT_TEXT[c]]);
  if (u.cond.broken) debuffs.push([`Broken Arms ×${u.cond.broken}`, CRIT_TEXT.broken]);
  if (u.cond.noAction) debuffs.push(["No actions", "Bumped, blocked or in rubble: no actions this activation."]);
  if (!u.dead) for (const o of terrainUnder(S, u)) {
    const tt = TERRAIN[o.kind];
    if (!tt) continue;
    buffs.push([`In ${tt.name}`, tt.up]);
    if (tt.down) debuffs.push([`In ${tt.name}`, tt.down]);
  }
  return { buffs, debuffs };
}

const meter = (label, now, max, cls = "") => `<div class="meter ${cls}"><span class="label">${label}</span><span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < now ? "on" : ""}"></i>`).join("")}</span><b>${now}/${max}</b></div>`;

function renderRoster() {
  const el = $("#roster");
  if (!el) return;
  const units = S.phase === "muster" ? [] : myUnits();
  el.classList.toggle("many", units.length > 14); // big armies get compact icons so the board keeps its room
  el.innerHTML = units.map((u) => {
    const { buffs, debuffs } = unitStatus(u);
    return `<button class="rchip ${L.cardFor === u.id ? "on" : ""}" data-card="${u.id}" title="${esc(u.name)}" style="--fc:${playerColor(S, u.owner)}">
      <span class="portrait small">${iconSVG(u.icon || UNIT_ICON[u.type] || "sword", "emblem")}${artTag(`units/${u.type}.png`, "")}</span>
      <span class="hp"><i style="width:${Math.round((100 * u.wounds) / u.maxWounds)}%;background:${healthColor(u.wounds / u.maxWounds)}"></i></span>
      ${buffs.length ? `<span class="dot buff">${buffs.length}</span>` : ""}${debuffs.length ? `<span class="dot debuff">${debuffs.length}</span>` : ""}
    </button>`;
  }).join("");
  el.querySelectorAll("[data-card]").forEach((b) => (b.onclick = () => {
    L.cardFor = L.cardFor === b.dataset.card ? null : b.dataset.card;
    L.selected = b.dataset.card;
    render();
  }));
  const host = $("#umodal");
  const u = unitById(L.cardFor);
  if (!u) { L.cardFor = null; host.innerHTML = ""; return; }
  const scroll = $(".umodal-card", host)?.scrollTop || 0;
  host.innerHTML = `<div class="umodal" data-close><div class="umodal-card" style="${cardVars(u)}" role="dialog" aria-label="${esc(u.name)}">${unitModalHTML(u)}</div></div>`;
  $(".umodal-card", host).scrollTop = scroll;
  host.querySelectorAll("[data-close]").forEach((x) => (x.onclick = (ev) => {
    if (ev.target !== x) return;
    L.cardFor = null;
    render();
  }));
}

/** Darken (amt < 0) or lighten (amt > 0) a #RRGGBB colour, for faction-tinted card chrome. */
function tint(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `rgb(${ch.join(",")})`;
}

/** CSS colour variables for a unit's card, all derived from its army colour. */
function cardVars(u) {
  const col = FACTIONS[u.faction].color;
  return `--fc:${col};--fc-deep:${tint(col, -0.78)};--fc-mid:${tint(col, -0.55)};--fc-ink:${tint(col, -0.6)};--fc-hi:${tint(col, 0.35)}`;
}

const ACTION_ICON = { steel: "sword", guard: "shield", brace: "shield", mark: "eye", surge: "lance", sidestep: "dagger", command: "crown", mend: "staff", rally: "sun", channel: "burst" };

// Full unit card in the Drums of War card style: banner, parchment body, numbered rows with an effect
// column and a drawback column. Every colour comes from the unit's army.
function unitModalHTML(u) {
  let def = null;
  try { def = unitDef(u.faction, u.type); } catch { /* unknown roster entry: show live stats only */ }
  const f = FACTIONS[u.faction];
  const { buffs, debuffs } = unitStatus(u);
  const effects = (list, cls, none) => list.length
    ? list.map(([n, txt]) => `<li class="${cls}"><b>${esc(n)}</b> ${esc(txt)}</li>`).join("")
    : `<li class="none">${none}</li>`;
  const medal = (icon) => `<span class="medal">${iconSVG(icon, "icon")}</span>`;
  const row = (n, icon, title, use, effect, side) => `<div class="crow">
      ${medal(icon)}
      <div class="cmain"><div class="ctitle"><span class="diamond"><span>${n}</span></span><h4>${esc(title)}</h4></div>
        <p><b>Use:</b> ${use}</p><p><b>Effect:</b> ${effect}</p></div>
      <div class="cside">${side}</div>
    </div>`;
  let n = 0;
  const rows = [
    ...u.actions.map((entry) => {
      const x = parseAction(entry);
      const red = x.red || x.link?.red;
      const effect = esc(ACTIONS[x.a].text) + (x.link ? `<br><b>Then:</b> ${x.link.red ? "red " : ""}${esc(ACTIONS[x.link.a].name)}. ${esc(ACTIONS[x.link.a].text)}` : "");
      const side = `<p><b>Drawback:</b> ${red ? "Gains 1 strain. Not allowed while strained." : "None. A white action."}</p>${x.link ? `<p><b>Linked:</b> taken straight after ${esc(ACTIONS[x.a].name)} in the same activation.</p>` : ""}`;
      return row(++n, ACTION_ICON[x.a] || "burst", actionLabel(entry), `${x.red ? "Red action" : "Action"}, once per activation`, effect, side);
    }),
    ...u.abilities.map((ab) => {
      const [name, ...rest] = (ABILITIES[ab] || ab).split(": ");
      return row(++n, "burst", name, "Always on", esc(rest.join(": ")), `<p><b>Type:</b> Ability</p>`);
    }),
    ...(u.upgrade ? [row(++n, "crown", UPGRADES[u.upgrade].name, "Upgrade, bought at muster", esc(UPGRADES[u.upgrade].text), `<p><b>Type:</b> Upgrade</p>`)] : []),
  ];
  return `<header class="cbanner">
      <span class="medal lg">${iconSVG(u.icon || UNIT_ICON[u.type] || "sword", "icon")}${artTag(`units/${u.type}.png`, "")}</span>
      <div class="cname"><h3>${esc(u.name)}</h3><div class="csub">${esc(def?.role || (u.champion ? "Champion" : "Unit"))} · ${esc(f.name)}</div></div>
      <div class="cbrand">Drums<small>of</small>War</div>
      <button class="cclose" data-close aria-label="Close">×</button>
    </header>
    <div class="cbody">
      ${def?.flavor ? `<p class="cintro">${esc(def.flavor)}</p>` : ""}
      <div class="cband">
        <div class="cband-title">Current status${u.dead ? " · destroyed" : ""}${u.revealed ? ` · revealed ${esc(u.revealed.replace(":", " "))}` : ""}</div>
        ${meter("Wounds", u.wounds, u.maxWounds, "w")}
        ${u.maxWard ? meter("Ward", u.ward, u.maxWard, "ward") : ""}
        ${meter("Strain", u.strain, u.faction === "greenskin" ? 2 : 1, "strain")}
      </div>
      <div class="cfx"><div><h5>Buffs</h5><ul>${effects(buffs, "buff", "None right now.")}</ul></div>
        <div><h5>Debuffs</h5><ul>${effects(debuffs, "debuff", "None right now.")}</ul></div></div>
      <div class="cstats"><span>Init <b>${u.init}</b></span><span>Def <b>${u.def}</b></span><span>Base <b>${esc(u.base)}</b></span><span>Cost <b>${u.cost}</b></span></div>
      <div class="cweapons">${u.weapons.map((w) => `<div><b>${esc(w.name)}</b><span>${w.dice} dice · ${w.arc === "full" ? "all-round" : esc(w.arc)} arc · ${rangeText(w)}</span></div>`).join("")}</div>
      ${rows.join("")}
      ${Array.isArray(u.dial) ? `<div class="cband"><div class="cband-title">Maneuver dial</div>${dialHTML(u.dial, null, true)}</div>` : ""}
    </div>
    <footer class="cfoot">${esc(f.tagline)}</footer>`;
}

// ── Theme ────────────────────────────────────────────────────────────────────
// Dark is the default. Once you pick an army, the whole interface takes on its colour:
// the accent becomes the army colour and the grounds are tinted toward it.
const THEME_BASE = {
  dark: { "--bg": "#14110C", "--panel": "#1D1913", "--raise": "#2A241B", "--line": "#4A3F2E", "--board": "#17130E", "--grid": "#2F2719" },
  light: { "--bg": "#EFE4CB", "--panel": "#F7EFDC", "--raise": "#E9DDC0", "--line": "#CDBB97", "--board": "#D9CBA9", "--grid": "#CDBB97" },
};
const TINT = { "--bg": 0.06, "--panel": 0.08, "--raise": 0.1, "--line": 0.24, "--board": 0.07, "--grid": 0.14 };
const ARMY_PROPS = [...Object.keys(TINT), "--accent", "--accent-text", "--on-accent", "--glow"];
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixRGB = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

function applyArmyTheme() {
  const root = document.documentElement;
  const f = me()?.faction ? FACTIONS[me().faction] : null;
  const light = root.dataset.theme === "light";
  const key = f ? `${f.id}:${light}` : "";
  if (L.themeKey === key) return;
  L.themeKey = key;
  if (!f) return ARMY_PROPS.forEach((p) => root.style.removeProperty(p));
  const col = hexRGB(f.color);
  const base = THEME_BASE[light ? "light" : "dark"];
  for (const [p, t] of Object.entries(TINT)) root.style.setProperty(p, mixRGB(hexRGB(base[p]), col, t));
  root.style.setProperty("--accent", f.color);
  // Accent text: lifted on dark grounds, deepened on light ones, so it stays readable (4.5:1 or better).
  root.style.setProperty("--accent-text", light ? mixRGB(col, [0, 0, 0], 0.5) : mixRGB(col, [255, 255, 255], 0.15));
  root.style.setProperty("--on-accent", "#14110C");
  root.style.setProperty("--glow", `rgba(${col.join(",")}, 0.25)`);
}

const savedTheme = store.get("dow.theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("#theme").onclick = () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  store.set("dow.theme", next);
  render();
};

await loadArtIndex();
render();
connect();
