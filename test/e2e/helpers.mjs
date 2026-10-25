// Shared pieces for the browser tests (run through scripts/e2e.mjs, which sets E2E_PW and E2E_CHROME).
// Each test file starts its own game server on a spare port with a throwaway data folder.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const { chromium } = await import(process.env.E2E_PW);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start a game server; returns { url, stop }. */
export async function startServer() {
  const port = 42000 + Math.floor(Math.random() * 3000);
  const data = mkdtempSync(join(tmpdir(), "dow-e2e-"));
  const proc = spawn(process.execPath, ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), DOW_DATA: data }, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) break;
    await sleep(100);
  }
  return {
    url,
    port,
    stop: () => {
      proc.kill();
      rmSync(data, { recursive: true, force: true });
    },
  };
}

export const launch = () => chromium.launch({ executablePath: process.env.E2E_CHROME, headless: !process.env.E2E_HEADED });

/** A fresh browser profile on the game page (with the test hook). */
export async function openPage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
  await page.goto(`${url}/?e2e`);
  return { page, context, errors };
}

/** Join the table by name from the join screen and wait until this screen holds a seat. */
export async function takeSeat(page, name) {
  await page.fill("#name", name);
  await page.click("#join");
  await waitFor(page, (S) => !!S?.you);
}

/** This screen's own view of the game (the same object the page renders from). */
export const state = (page) => page.evaluate(() => window.__dow.state());

/** Wait until fn(state) is true on the page. */
export async function waitFor(page, fn, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const S = await state(page);
    if (fn(S)) return S;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting (phase ${S?.phase}, pending ${S?.pending?.type})`);
    await sleep(100);
  }
}

/** Where a unit is drawn on screen (viewport pixels), for clicking it. */
export const unitAt = (page, id) => page.evaluate((uid) => window.__dow.unitScreen(uid), id);

/**
 * A second connection on the same seat (same token), for setting up what a test is not about:
 * the page under test shows the result. Returns { send, state, close }.
 */
export async function puppet(url, page) {
  const token = await page.evaluate(() => localStorage.getItem("dow.token"));
  const ws = new WebSocket(url.replace("http", "ws"));
  let S = null;
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.t === "state") S = m.state;
  });
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ t: "hello", token })); // no name: the seat keeps its own
  await sleep(150);
  return { send: (m) => ws.send(JSON.stringify(m)), state: () => S, close: () => ws.close() };
}
