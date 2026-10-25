// Joining, mustering, deploying and planning, driven through the page like a player would.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, openPage, puppet, startServer, state, takeSeat, unitAt, waitFor } from "./helpers.mjs";

let server;
let browser;
let page;
let errors;
before(async () => {
  server = await startServer();
  browser = await launch();
  ({ page, errors } = await openPage(browser, server.url));
});
after(async () => {
  await browser?.close();
  server?.stop();
});

test("join, add a computer opponent, pick an army and a prebuilt warband, and ready up", async () => {
  await takeSeat(page, "Ann");
  await page.selectOption("#aiFaction", "umbral");
  await page.click("#addAI");
  await waitFor(page, (S) => S.players.length === 2);
  await page.click('[data-faction="holds"]');
  await waitFor(page, (S) => S.players.find((p) => p.id === S.you).faction === "holds");
  await page.click("[data-preset]:not([disabled])");
  await page.click("#submit");
  const S = await waitFor(page, (s) => s.phase === "deploy");
  assert.ok(S.units.some((u) => u.owner === S.you), "my warband is on the table");
  assert.match(await page.textContent("#turnText"), /Your turn: place your warband/);
});

test("deployment: quick arrow nudges all land", async () => {
  const S = await state(page);
  const u = S.units.find((x) => x.owner === S.you);
  const at = await unitAt(page, u.id);
  await page.mouse.click(at.x, at.y);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await waitFor(page, (s) => s.units.find((x) => x.id === u.id).x === u.x - 50);
});

test("planning: a unit's dial opens beside it, sets the maneuver, and moves on to the next unit", async () => {
  await page.click("#ready");
  let S = await waitFor(page, (s) => s.phase === "plan");
  const mine = S.units.filter((x) => x.owner === S.you && !x.dead);
  const at = await unitAt(page, mine[0].id);
  await page.mouse.click(at.x, at.y);
  const dial = page.locator("#mapdial");
  await dial.waitFor({ state: "visible" });
  assert.match(await dial.textContent(), /Facing (north|south|east|west)/);
  const box = await dial.boundingBox();
  assert.ok(Math.abs(box.y + box.height / 2 - at.y) < box.height, "the dial sits beside its unit");
  await dial.locator('[data-man="1S:b"], [data-man="1S:w"]').first().click();
  S = await waitFor(page, (s) => !!s.dials[mine[0].id]);
  assert.match(await dial.textContent(), /Set: 1S/);
  if (mine.length > 1) {
    await dial.locator("[data-mdnext]").click();
    await waitFor(page, async () => true);
    assert.equal(await dial.getAttribute("data-uid"), mine.find((x) => !S.dials[x.id]).id, "Next unit opens the next undialed unit");
  }
  await page.keyboard.press("Escape");
  await dial.waitFor({ state: "hidden" });
});

test("locking in orders starts the activation", async () => {
  // The puppet sets the remaining dials and locks in; the page shows the activation start.
  const p = await puppet(server.url, page);
  const S = await state(page);
  const dials = Object.fromEntries(S.units.filter((u) => u.owner === S.you && !u.dead).map((u) => [u.id, S.dials[u.id] || u.dial.find((c) => c.startsWith("1S")) || u.dial[0]]));
  p.send({ t: "dials", dials });
  p.send({ t: "ready" });
  await waitFor(page, (s) => s.phase !== "plan", 20000);
  p.close();
  assert.notEqual((await state(page)).phase, "plan");
});

test("the in-game rulebook opens and renders the new rules", async () => {
  await page.click("#rulesBtn");
  const body = page.locator(".rb-body");
  await body.locator("h2").first().waitFor();
  const text = await body.textContent();
  assert.match(text, /Pile in/);
  assert.match(text, /Units in the way/);
  await page.click(".rb-head [data-close]");
  await body.waitFor({ state: "detached" });
});

test("no script errors on the page", () => {
  assert.deepEqual(errors, []);
});
