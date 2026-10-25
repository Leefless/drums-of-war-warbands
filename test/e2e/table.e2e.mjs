// Two people at one table (separate browser profiles) plus a computer opponent: surrendering
// through the page leaves you watching the whole field, and losing the server shows the banner.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, openPage, puppet, sleep, startServer, takeSeat, waitFor } from "./helpers.mjs";

let server;
let browser;
let ann;
let bo;
before(async () => {
  server = await startServer();
  browser = await launch();
  ann = await openPage(browser, server.url);
  bo = await openPage(browser, server.url);
  await takeSeat(ann.page, "Ann");
  await takeSeat(bo.page, "Bo");
  const pa = await puppet(server.url, ann.page);
  const pb = await puppet(server.url, bo.page);
  pa.send({ t: "addAI", faction: "umbral" });
  pa.send({ t: "faction", faction: "holds" });
  pb.send({ t: "faction", faction: "concord" });
  await sleep(200);
  pa.send({ t: "army", list: [{ unit: "ironbreakers" }, { unit: "gunners" }], buys: [] });
  pb.send({ t: "army", list: [{ unit: "halberdiers" }, { unit: "crossbows" }], buys: [] });
  await waitFor(ann.page, (s) => s.phase === "deploy");
  pa.send({ t: "ready" });
  pb.send({ t: "ready" });
  await waitFor(ann.page, (s) => s.phase === "plan");
  pa.close();
  pb.close();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

test("fog hides the enemy until you surrender; then you watch the whole field while the others fight on", async () => {
  let S = await waitFor(ann.page, (s) => s.phase === "plan");
  assert.ok(S.hidden > 0, "premise: the fog hides enemies from a seat still fighting");
  // Surrender takes two clicks.
  await ann.page.click("#surrender");
  assert.match(await ann.page.textContent("#surrender"), /Confirm surrender/);
  await ann.page.click("#surrender");
  S = await waitFor(ann.page, (s) => s.players.find((p) => p.id === s.you).eliminated);
  assert.equal(S.phase, "plan", "Bo and the computer fight on");
  assert.equal(S.hidden, 0, "nothing is hidden from a seat out of the battle");
  const bos = await waitFor(bo.page, (s) => s.players.find((p) => p.name === "Ann")?.eliminated);
  assert.ok(bos.hidden > 0, "Bo's fog is unchanged");
});

test("losing the connection shows the offline banner", async () => {
  assert.equal(await ann.page.isHidden("#offline"), true);
  server.stop();
  await ann.page.locator("#offline").waitFor({ state: "visible", timeout: 5000 });
  assert.match(await ann.page.textContent("#offline"), /Connection to the table lost/);
});

test("no script errors on either page", () => {
  const real = (e) => !/^(\d{3} |WebSocket connection)/.test(e) && !/ERR_CONNECTION_REFUSED/.test(e); // the stopped server is expected
  assert.deepEqual(ann.errors.filter(real), []);
  assert.deepEqual(bo.errors.filter(real), []);
});
