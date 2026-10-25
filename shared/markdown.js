// The in-game rulebook renderer: a small Markdown subset (#-#### headings, pipe tables, -/*/1.
// lists one level deep, **bold**, `code` and links). docs/RULES.md must stay inside it; a test
// renders the real rulebook through this to keep it so.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function mdToHTML(md) {
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
