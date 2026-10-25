// The real server, started on a spare port: it serves the page, survives a malformed request,
// sends state on connect, and keeps host actions for a seated host. Nothing here saves an army,
// so data/armies.json is never written.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { test } from "node:test";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("the server stays up and guards host actions", async () => {
  const port = 41000 + Math.floor(Math.random() * 2000);
  const srv = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) {
      if (await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false)) break;
      await sleep(100);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    // A request target that is not a valid URL once took the whole server down.
    await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => s.write("GET http://[ HTTP/1.1\r\nHost: x\r\n\r\n"));
      s.on("data", () => (s.destroy(), resolve()));
      s.on("error", resolve);
      setTimeout(resolve, 1000);
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200, "still serving after a malformed request");

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let S = null;
    const errors = [];
    ws.on("message", (d) => {
      const m = JSON.parse(d);
      if (m.t === "state") S = m.state;
      else errors.push(m.msg);
    });
    await new Promise((r) => ws.on("open", r));
    await sleep(150);
    assert.ok(S, "a new screen gets the table state without saying hello");
    ws.send(JSON.stringify({ t: "addAI", faction: "holds" }));
    await sleep(150);
    assert.equal(S.players.length, 0, "a connection that never joined cannot add opponents");
    assert.ok(errors.some((e) => /Only the host/.test(e)));
    ws.send(JSON.stringify({ t: "hello", token: "serverTestToken1", name: "Host" }));
    ws.send(JSON.stringify({ t: "addAI", faction: "holds" }));
    await sleep(200);
    assert.deepEqual(S.players.map((p) => !!p.ai), [false, true], "the seated host can");
    ws.close();
  } finally {
    srv.kill();
  }
});
