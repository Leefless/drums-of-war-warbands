// The rulebook is rendered in the game by a small Markdown subset (shared/markdown.js). These tests
// render the real docs/RULES.md and fail on anything the subset would show as raw text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mdToHTML } from "../shared/markdown.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the renderer handles its subset: headings, tables, nested lists, bold, code, safe links", () => {
  const html = mdToHTML("## Title\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n\n- one\n  - sub\n- `two` [x](javascript:alert(1))\n\nText <b>raw</b>.");
  assert.match(html, /<h3>Title<\/h3>/);
  assert.match(html, /<table><tr><th>A<\/th><th>B<\/th><\/tr><tr><td>1<\/td><td><b>2<\/b><\/td><\/tr><\/table>/);
  assert.match(html, /<li>one<ul><li>sub<\/li><\/ul><\/li>/);
  assert.match(html, /<code>two<\/code>/);
  assert.match(html, /href="#"/, "unsafe link targets are neutralised");
  assert.match(html, /&lt;b&gt;raw&lt;\/b&gt;/, "raw HTML is escaped");
});

test("docs/RULES.md renders cleanly in the game's rulebook", () => {
  const md = read("docs/RULES.md");
  for (const [i, line] of md.split("\n").entries()) {
    assert.ok(!/^```|^>\s|^(-{3,}|\*{3,})\s*$|^#{5,}\s/.test(line), `RULES.md:${i + 1} uses Markdown the game does not render: ${line}`);
    assert.ok(!/^\s{4,}([-*]|\d+\.)\s/.test(line), `RULES.md:${i + 1} nests a list deeper than one level`);
  }
  const html = mdToHTML(md);
  const text = html.replace(/<[^>]+>/g, " ");
  assert.ok(!/\*\*/.test(text), "no unrendered bold markers");
  assert.ok(!/(^|\s)\*[^\s*][^*]*\*(\s|$)/.test(text), "no italics (not supported)");
  assert.ok(!/(^|\s)\|\s/.test(text), "no table rows rendered as text");
  assert.ok(html.length > 20000, "the whole rulebook rendered");
});

test("player-facing docs use no em or en dashes", () => {
  for (const p of ["docs/RULES.md", "README.md", "docs/ROADMAP.md"]) {
    const bad = read(p).split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /[–—]/.test(l));
    assert.deepEqual(bad, [], `${p} uses a dash`);
  }
});
