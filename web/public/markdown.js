// web/public/markdown.js — shared markdown-lite renderer.
//
// A small block parser for exactly what CLAUDE.md.template's output actually
// looks like (headings, bold/italic, bullet/numbered lists, hr, inline/fenced
// code, links) — not a general markdown implementation. Shared between
// app.js (chat bubbles) and cheatsheet.html (standalone cheatsheet view) so
// there's one copy of this logic, not two drifting ones.
//
// Safety: every code path funnels raw text through esc() before any HTML is
// introduced, so escaped-then-reassembled markup can't turn into live tags —
// only the fixed wrapper tags this function itself emits are ever real HTML.

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function inlineMd(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}

function renderMarkdown(raw) {
  // Machine-only sentinels (e.g. `<!-- coach:day-start course=… day=N -->`,
  // read by scripts/day-delivery-gate.mjs) aren't meant for the student.
  const text = String(raw).replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*$/gm, '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const out = [];
  let list = null; // { tag: 'ul'|'ol', items: [] }
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((it) => `<li>${inlineMd(it)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  // One source line = one block. The coach's own output (CLAUDE.md.template)
  // never hand-wraps a sentence across lines, so merging soft line breaks into
  // a single <p> (standard CommonMark behavior) would instead run separate
  // "**Label:** ..." lines together into one paragraph — worse, not better.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushList(); const lvl = Math.min(h[1].length + 1, 5); out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`); continue; }
    if (/^-{3,}\s*$/.test(line)) { flushList(); out.push('<hr>'); continue; }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) { if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(bullet[1]); continue; }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) { if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(numbered[1]); continue; }
    if (!line.trim()) { flushList(); continue; }
    flushList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  flushList();
  return out.join('');
}
