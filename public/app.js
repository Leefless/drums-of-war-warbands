// Browser client. Holds no game logic beyond previews: the server is
// authoritative and sends a fresh filtered state after every change.
import { ABILITIES, ACTIONS, FACTIONS, MAX_COPIES, MAX_UNITS, UPGRADES, upgradesFor, validateArmy } from "/shared/factions.js";
import { costBreakdown } from "/shared/cost.js";
import { parseManeuver } from "/shared/geometry.js";
import { CRIT_TEXT, parseAction, strained } from "/shared/engine.js";
import { playerColor, sizeCanvas, terrainAt, toBoard, unitAt, updateBoard } from "/board.js";
import { TERRAIN } from "/shared/terrain.js";
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
  spectate: false,
  selected: null,
  hover: null,
  draft: [],
  draftFaction: null,
  sub: null, // in-progress choice for a multi-step action
  diceSel: new Set(),
  mode: null,
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
      if (prevPending !== (S.pending && JSON.stringify(S.pending))) {
        L.sub = null;
        L.diceSel.clear();
      }
      if (S.pending?.uid && S.pending.pid === S.you) L.selected = S.pending.uid;
      render();
    } else if (m.t === "error") toast(m.msg);
  };
  ws.onclose = () => setTimeout(connect, 1000);
}
function send(t, payload = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t, ...payload }));
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
const nameOf = (pid) => S.players.find((p) => p.id === pid)?.name ?? "?";
const myUnits = () => S.units.filter((u) => u.owner === S.you && !u.dead);
const PHASES = { muster: "Muster", deploy: "Deployment", plan: "Planning", activation: "Activation", engagement: "Engagement", over: "Battle over" };
const GLYPH = { TL: "↰", BL: "↖", S: "↑", BR: "↗", TR: "↱", A: "U", RF: "Rift", X: "■" };

function header() {
  $("#phase").textContent = S ? `${PHASES[S.phase]}${S.round ? ` · Round ${S.round} of ${S.settings.maxRounds}` : ""}` : "Connecting";
  $("#players").innerHTML = (S?.players || []).map((p) => {
    const f = p.faction ? FACTIONS[p.faction] : null;
    const status = S.phase === "over" ? `${p.vp} VP` : p.eliminated ? "broken" : p.ready && S.phase !== "activation" && S.phase !== "engagement" ? "ready" : "";
    return `<span class="chip ${p.connected ? "" : "off"}"><i class="sw" style="background:${f?.color ?? "var(--ink-3)"}"></i>${esc(p.name)}${p.id === S.you ? " (you)" : ""}<span class="ok">${status}</span></span>`;
  }).join("");
}

function render() {
  header();
  const app = $("#app");
  if (!S || (!L.joined && !L.spectate)) return renderJoin(app);
  if (me()) L.rejoinSent = false;
  else if (!L.spectate && S.phase === "muster" && !L.rejoinSent) {
    // Server dropped us (e.g. table reset while away); rejoin once, not on every broadcast.
    L.rejoinSent = true;
    send("hello", { token, name: L.name });
  }
  if (S.phase === "muster") return renderMuster(app);
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
  $("#join").onclick = () => {
    L.name = $("#name").value.trim() || "Warlord";
    store.set("dow.name", L.name);
    store.set("dow.joined", "1");
    L.joined = true;
    send("hello", { token, name: L.name });
  };
  $("#watch").onclick = () => {
    L.spectate = true;
    send("hello", { token, spectate: true });
    render();
  };
}

// ── Muster: the army builder ─────────────────────────────────────────────────
const unitIcon = (u) => u.icon || UNIT_ICON[u.id] || "sword";
const draftKey = (fid) => `dow.draft.${fid}`;
const unitIn = (fid, id) => FACTIONS[fid]?.units.find((u) => u.id === id);

function loadDraft(p) {
  if (p.army.length) return p.army.map((e) => ({ ...e }));
  try {
    const saved = JSON.parse(store.get(draftKey(p.faction)) || "[]");
    return Array.isArray(saved) ? saved.filter((e) => unitIn(p.faction, e.unit)) : [];
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
const CATEGORIES = [
  ["Artillery and machines", /artiller|machine|engine|cannon|wagon|ballista|catapult|lobba|flinga|mortar|organ|bolt thrower|siege|buggy|cart|vehicle/],
  ["Flyers", /fly|flyer|eagle|gyro|winged|bat|pegasus|griffon|sprite|wisp|imp/],
  ["Cavalry", /cavalr|rider|lancer|chariot|horse|knight|charger/],
  ["Support and casters", /caster|mage|priest|support|heal|shaman|engineer|seer|warlock|acolyte|banner|drum|herald|oracle|mystic|witch|cult/],
  ["Ranged", /ranged|archer|marksm|crossbow|sling|gun|bow|thrower|javelin|sniper/],
  ["Monsters", /monster|brute|giant|troll|ogre|treant|tree|elemental|construct|colossus|beast|demon|golem|horror|hulk|spider|bear|stag|wolf|warg|hound|fiend|abomination/],
  ["Skirmishers", /skirmish|scout|hunter|assassin|stalker|raider/],
];
function categoryOf(u) {
  const role = u.role.toLowerCase();
  const hit = CATEGORIES.find(([, re]) => re.test(role));
  if (hit) return hit[0];
  if (u.abilities.includes("flying")) return "Flyers";
  if (Math.max(...u.weapons.map((w) => w.range[1])) >= 3) return "Ranged";
  return "Infantry";
}

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
  const full = !u.champion && n >= MAX_COPIES;
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
    <span style="flex:1">${esc(u.name)} <span class="muted num">${u.cost}${e.upgrade ? ` +${UPGRADES[e.upgrade].cost}` : ""}</span></span>
    <select data-up="${i}" ${locked ? "disabled" : ""} aria-label="Upgrade"><option value="">No upgrade</option>${ups.map((g) => `<option value="${g.id}" ${e.upgrade === g.id ? "selected" : ""}>${esc(g.name)} +${g.cost}</option>`).join("")}</select>
    <button class="small ghost" data-rm="${i}" ${locked ? "disabled" : ""} aria-label="Remove">✕</button></div>`;
}

function renderMuster(app) {
  L.mode = "muster";
  const p = me();
  if (!p) {
    app.innerHTML = `<div class="center"><h2>Waiting for the muster</h2><p class="muted">You are watching. ${S.players.length} warlord(s) seated.</p></div>`;
    return;
  }
  if (L.draftFaction !== p.faction) {
    L.draftFaction = p.faction;
    L.draft = p.faction ? loadDraft(p) : [];
    Object.assign(L, { open: null, tab: "units", role: "all", search: "", armyName: "", loadedId: null });
  }
  const host = S.players[0]?.id === S.you;
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
        <label class="label" style="display:flex;gap:6px;align-items:center" title="When on, Watch only screens see every unit, ignoring fog of war"><input type="checkbox" id="openSpec" ${S.settings.openSpectators ? "checked" : ""}> Spectators see all</label>
      </div>` : `<div class="label">Budget ${S.settings.budget} · ${S.settings.maxRounds} rounds</div>`}
    </div>
    <div class="factions ${f ? "compact" : ""}" style="margin-top:12px">${Object.values(FACTIONS).map((x) => `
      <button class="fcard ${p.faction === x.id ? "on" : ""}" style="--fc:${x.color}" data-faction="${x.id}" ${locked ? "disabled" : ""}>
        ${artTag(`banners/${x.id}.jpg`, "banner-img")}${emblemSVG(x.id)}<h3>${esc(x.name)}</h3><div class="label">${esc(x.kin)}</div>
        <p>${esc(x.tagline)}</p>
      </button>`).join("")}</div>
    ${f ? `<div class="muster">
      <div class="roster">
        <div><div class="label">Step 2 · Muster</div><h2>${esc(f.name)}</h2></div>
        <p style="margin:0"><b>Action economy.</b> ${esc(f.economy)}</p>
        <p style="margin:0" class="muted"><b>Dial.</b> ${esc(f.dialNote)}</p>
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
        <div class="label">Units <span class="num">${regs.length} / ${MAX_UNITS}</span></div>
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
          <button class="small ghost" data-del="${esc(a.id)}">${L.confirmDel === a.id ? "Confirm" : "Delete"}</button></div>`).join("") : `<p class="muted" style="margin:0">No saved ${esc(f.name)} armies yet.</p>`}
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
    if (u.champion) L.draft = L.draft.filter((e) => !unitIn(f.id, e.unit).champion);
    L.draft.push({ unit: u.id, upgrade: null });
    changed();
  });
  on("[data-rm]", "onclick", (b) => { L.draft.splice(Number(b.dataset.rm), 1); changed(); });
  on("[data-up]", "onchange", (s) => { L.draft[Number(s.dataset.up)].upgrade = s.value || null; changed(); });
  on("[data-load]", "onclick", (b) => {
    const a = S.armies.find((x) => x.id === b.dataset.load);
    if (!a) return;
    Object.assign(L, { draft: a.list.map((e) => ({ ...e })), armyName: a.name, loadedId: a.id });
    changed();
  });
  on("[data-del]", "onclick", (b) => {
    if (L.confirmDel === b.dataset.del) {
      send("deleteArmy", { id: b.dataset.del });
      L.confirmDel = null;
    } else {
      L.confirmDel = b.dataset.del;
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
  const ms = dial.map(parseManeuver);
  const speeds = [...new Set(ms.map((m) => m.speed))].sort((a, b) => b - a);
  let html = `<div class="dial" ${mini ? 'style="max-width:260px"' : ""}>`;
  for (const s of speeds) {
    html += `<span class="sp">${s}</span>`;
    for (const c of cols) {
      const m = ms.find((x) => x.speed === s && (c === "*" ? ["A", "RF", "X"].includes(x.type) : x.type === c));
      if (!m) { html += `<button class="empty" disabled></button>`; continue; }
      const blocked = strainedNow && m.color === "red";
      html += `<button class="${m.color} ${current === m.code ? "on" : ""}" ${mini ? "disabled" : `data-man="${m.code}"`} ${blocked ? "disabled title='Strained: no red maneuvers'" : ""} title="${m.code}">${GLYPH[m.type]}</button>`;
    }
  }
  return `${html}</div>`;
}

// ── Battle ───────────────────────────────────────────────────────────────────
function renderBattle(app) {
  if (L.mode !== "battle") {
    L.mode = "battle";
    app.innerHTML = `<div class="battle"><div class="boardwrap"><canvas id="board"></canvas></div>
      <aside class="side"><section id="prompt" class="scroll"></section><section id="card" class="scroll"></section><section class="log" id="log"></section></aside></div>`;
    const canvas = $("#board");
    canvas.onclick = onBoardClick;
    canvas.onmousemove = (ev) => {
      const pt = toBoard(canvas, ev);
      const u = unitAt(S, pt);
      const o = u ? null : terrainAt(S, pt);
      const tt = o && TERRAIN[o.kind];
      canvas.title = u ? `${u.name} (${nameOf(u.owner)})` : tt ? `${tt.name}\n+ ${tt.up}\n- ${tt.down}` : "";
    };
    window.onresize = () => drawBoard();
    window.onkeydown = (ev) => {
      if (S?.phase !== "deploy" || !L.selected) return;
      const u = unitById(L.selected);
      if (!u || u.owner !== S.you) return;
      if (ev.key === "q" || ev.key === "e") send("deploy", { uid: u.id, x: u.x, y: u.y, h: u.h + (ev.key === "e" ? 45 : -45) });
    };
  }
  $("#prompt").innerHTML = promptHTML();
  $("#prompt").className = `scroll ${S.pending?.pid === S.you ? "prompt" : ""}`;
  $("#card").innerHTML = cardHTML();
  $("#log").innerHTML = S.log.slice(-80).reverse().map((l) => `<div><span class="label">R${l.round}</span> ${esc(l.msg)}</div>`).join("");
  wirePrompt();
  drawBoard();
}

function drawBoard() {
  const canvas = $("#board");
  if (!canvas || !S) return;
  sizeCanvas(canvas);
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
    if (L.sub?.targets) L.sub.targets.forEach((t) => highlight.add(typeof t === "string" ? t : t.id));
  }
  const A = S.attack || null;
  updateBoard(canvas, S, {
    selected: L.selected,
    active: p?.uid || A?.attacker,
    ghost,
    highlight,
    zones: S.phase === "deploy",
    fog: !S.spectator && !!me() && S.phase !== "over",
    attackLine: A ? { from: A.attacker, to: A.target } : L.hoverTarget ? { from: p?.uid, to: L.hoverTarget } : null,
  });
}

function onBoardClick(ev) {
  const canvas = $("#board");
  const pt = toBoard(canvas, ev);
  const u = unitAt(S, pt);
  if (S.phase === "deploy" && !u && L.selected) {
    const s = unitById(L.selected);
    if (s?.owner === S.you) return send("deploy", { uid: s.id, x: pt.x, y: pt.y, h: s.h });
  }
  // During a targeted choice, clicking a highlighted unit picks it.
  if (u && L.sub?.targets && S.pending?.pid === S.you) {
    const hit = L.sub.targets.find((t) => (typeof t === "string" ? t : t.id) === u.id);
    if (hit) return chooseTarget(u.id);
  }
  if (u && S.pending?.type === "attack" && S.pending.pid === S.you) {
    const opts = S.pending.options.filter((o) => o.target === u.id);
    if (opts.length === 1) return send("attack", { target: u.id, weapon: opts[0].weapon });
  }
  L.selected = u?.id || null;
  L.hover = null;
  render();
}

function waitingText(p) {
  const who = esc(nameOf(p.pid));
  const u = p.uid ? unitById(p.uid) : null;
  return {
    action: `${who} is choosing an action for ${esc(u?.name)}.`,
    attack: `${who} is choosing a target for ${esc(u?.name)}.`,
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
      <p class="muted" style="margin:6px 0">Select one of your units, then click inside your shaded zone to move it. Rotate with Q and E or the buttons.</p>
      ${mine ? `<div class="btns">
        <button data-rot="-45" ${L.selected ? "" : "disabled"}>Rotate left</button><button data-rot="45" ${L.selected ? "" : "disabled"}>Rotate right</button>
        ${mine.ready ? `<button id="unready">Keep adjusting</button>` : `<button class="cta" id="ready">Ready</button>`}
      </div>` : ""}`;
  } else if (S.phase === "plan") {
    if (!mine || mine.eliminated) html = `<div class="label">Planning</div><p class="muted">Warlords are setting their dials in secret.</p>`;
    else {
      const units = myUnits();
      const sel = unitById(L.selected);
      const allSet = units.every((u) => S.dials[u.id]);
      html = `<div class="label">Planning · secret</div><h3>Set a maneuver for every unit</h3>
        <div class="ulist" style="margin:8px 0">${units.map((u) => `<button data-sel="${u.id}" class="${L.selected === u.id ? "on" : ""}"><span>${esc(u.name)} <span class="muted">i${u.init}${strained(u) ? " · strained" : ""}</span></span><span class="set">${S.dials[u.id] ? esc(S.dials[u.id].replace(":", " ")) : ""}</span></button>`).join("")}</div>
        ${sel && sel.owner === S.you ? `<div class="label">${esc(sel.name)} dial (hover to preview)</div>${dialHTML(sel.dial, S.dials[sel.id], false, strained(sel))}` : `<p class="muted">Select a unit to open its dial.</p>`}
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
    return `<div class="label">Command · pick a friendly unit</div><div class="ulist" style="margin:8px 0">${o.targets.map((t) => `<button data-cmdt="${t.id}">${esc(unitById(t.id).name)}</button>`).join("")}</div>${back}`;
  }
  if (o.a === "command" && !o.subA) {
    const t = o.targets.find((x) => x.id === o.target);
    return `<div class="label">Command ${esc(unitById(t.id).name)} to</div><div class="btns" style="margin:8px 0">${t.subs.map((s) => `<button data-cmds="${s.a}">${esc(ACTIONS[s.a].name)}</button>`).join("")}</div>${back}`;
  }
  const spec = o.a === "command" ? o.targets.find((x) => x.id === o.target).subs.find((s) => s.a === o.subA) : o;
  if (spec.dirs) {
    const name = { L: spec.a === "surge" ? "Bank left" : "Left", S: "Straight", R: spec.a === "surge" ? "Bank right" : "Right" };
    return `<div class="label">${esc(ACTIONS[spec.a].name)} · direction</div><div class="btns" style="margin:8px 0">${spec.dirs.map((d) => `<button data-dir="${d}">${name[d]}</button>`).join("")}</div>${back}`;
  }
  return `<div class="label">${esc(ACTIONS[spec.a].name)} · pick a unit (or click it on the board)</div><div class="ulist" style="margin:8px 0">${spec.targets.map((id) => `<button data-tgt="${id}" data-hover="${id}">${esc(unitById(id).name)} <span class="muted">${esc(nameOf(unitById(id).owner))}</span></button>`).join("")}</div>${back}`;
}

function chooseTarget(id) {
  const o = L.sub;
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
    <div class="dice">${A.atk.map((f, i) => `<span class="die atk ${f} ${L.diceSel.has(i) ? "sel" : ""} ${A.rerolled.includes(i) ? "rr" : ""} ${rolled("a", i, f)}" title="${f}" ${selectable ? `data-die="${i}" style="cursor:pointer"` : ""}>${iconSVG(DIE_ICON[f])}</span>`).join("")}</div>
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
  on("[data-man]", (el) => send("dial", { uid: L.selected, code: el.dataset.man }));
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

// ── Theme ────────────────────────────────────────────────────────────────────
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
