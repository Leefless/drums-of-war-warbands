// Combat as a player sees it: an attack plays out on the combat card, the battle pauses, and
// Continue (button or Space) resumes it. A puppet on the same seat makes the routine choices
// (dials, actions, which target) so the test reaches an attack quickly; the page is what is checked.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, openPage, puppet, sleep, startServer, takeSeat, waitFor } from "./helpers.mjs";

let server;
let browser;
let page;
let errors;
let p;
let stop = false;
before(async () => {
  server = await startServer();
  browser = await launch();
  ({ page, errors } = await openPage(browser, server.url));
  await takeSeat(page, "Ann");
  p = await puppet(server.url, page);
  p.send({ t: "settings", aiSpeed: "slow", pauseAttacks: true }); // a 5 s pause: long enough to tell Space from the timer
  p.send({ t: "addAI", faction: "greenskin" });
  p.send({ t: "faction", faction: "holds" });
  await sleep(200);
  p.send({ t: "army", list: [{ unit: "gunners" }, { unit: "gunners" }, { unit: "ironbreakers" }], buys: [] });
  // Routine choices for the human seat, until a pause after an attack reaches the page.
  (async () => {
    while (!stop) {
      const S = p.state();
      const me = S?.players.find((x) => x.id === S.you);
      if (S && me && !S.beat) {
        if ((S.phase === "deploy" || S.phase === "plan") && !me.ready) {
          if (S.phase === "plan") p.send({ t: "dials", dials: Object.fromEntries(S.units.filter((u) => u.owner === S.you && !u.dead).map((u) => [u.id, u.dial.find((c) => c.startsWith("2S")) || u.dial[0]])) });
          p.send({ t: "ready" });
        } else if (S.pending?.pid === S.you) {
          if (S.pending.type === "attack") p.send({ t: "attack", target: S.pending.options[0].target, weapon: S.pending.options[0].weapon });
          else if (S.pending.type === "pick") p.send({ t: "takeTurn", uid: S.pending.options[0] });
          else if (S.pending.type !== "attackMods" && S.pending.type !== "defenseMods") p.send({ t: "pass" });
          else p.send({ t: "pass" });
        }
      }
      await sleep(150);
    }
  })();
});
after(async () => {
  stop = true;
  p?.close();
  await browser?.close();
  server?.stop();
});

test("an attack shows on the combat card and the battle pauses with a Continue button", async () => {
  const S = await waitFor(page, (s) => s?.beat?.waiting && !!s.lastAttack, 90000);
  const card = page.locator("#combat");
  await card.locator(".cc-head").waitFor();
  assert.match(await card.textContent(), /rolls \d+ attack dice/);
  await card.locator("#contBtn").waitFor({ state: "visible" });
  assert.match(await page.textContent("#turnText"), /Continue when ready \(0 of 1\)/);
  assert.ok(S.lastAttack.steps.length >= 2, "the card has the attack and defence rolls to show");
});

test("Space presses Continue, even right after a mouse click on a panel button", async () => {
  // Use a pause that is still running when Space is pressed (a pause can end on its timer while
  // the clicks happen; then Space rightly goes to the focused button, so try the next pause).
  for (let tries = 0; ; tries++) {
    const seen = (await waitFor(page, (s) => !!s)).lastAttack?.n ?? 0;
    const S = await waitFor(page, (s) => s?.beat?.waiting && s.beat.n > seen && !(s.beat.acked || []).includes(s.you), 90000);
    // A mouse click leaves Chrome's focus on that button; Space must still mean Continue.
    await page.click("#muteBtn", { force: true });
    await page.click("#muteBtn", { force: true });
    const still = await page.evaluate((n) => window.__dow.state().beat?.n === n, S.beat.n);
    if (!still) {
      assert.ok(tries < 3, "a pause was still running for the test in three tries");
      continue;
    }
    assert.equal(await page.evaluate(() => document.activeElement.id), "muteBtn", "premise: the clicked button has focus");
    await page.keyboard.press("Space");
    await waitFor(page, (s) => !s.beat || s.beat.n !== S.beat.n || (s.beat.acked || []).includes(s.you), 1000);
    assert.match(await page.textContent("#muteBtn"), /Sound on/, "Space pressed Continue, not the focused sound button");
    return;
  }
});

test("no script errors on the page", () => {
  assert.deepEqual(errors, []);
});
