// web/public/app.js — chat transport + live dashboard wiring.

const el = (id) => document.getElementById(id);
const courseSel = el('course');
const log = el('log');
const input = el('input');
const composer = el('composer');
const sendBtn = el('send');
const dashFrame = el('dashFrame');
const dashEmpty = el('dashEmpty');
const openDash = el('openDash');
const statusEl = el('status');

const NEW = '__new__';
let currentSlug = null;
let watchSource = null;
let streaming = false;
let knownSlugs = new Set();

function setStatus(text) {
  if (!text) { statusEl.hidden = true; statusEl.innerHTML = ''; return; }
  statusEl.hidden = false;
  statusEl.textContent = text;
}

function addBubble(role, text = '') {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  wrap.appendChild(b);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return b;
}

async function loadCourses({ keepSelection = false } = {}) {
  const courses = await fetch('/api/courses').then((r) => r.json());
  knownSlugs = new Set(courses.map((c) => c.slug));
  const keep = keepSelection ? courseSel.value : null;
  courseSel.innerHTML = '';

  for (const c of courses) {
    const o = document.createElement('option');
    o.value = c.slug;
    o.textContent = c.exam?.shortName ? `${c.exam.shortName} — ${c.slug}` : c.slug;
    o.dataset.hasDashboard = c.hasDashboard ? '1' : '';
    courseSel.appendChild(o);
  }
  const newOpt = document.createElement('option');
  newOpt.value = NEW;
  newOpt.textContent = '＋ Start a new course…';
  courseSel.appendChild(newOpt);

  if (keep && [...courseSel.options].some((o) => o.value === keep)) {
    courseSel.value = keep;
  } else if (!courses.length) {
    courseSel.value = NEW;
  }
  applySelection();
}

function applySelection() {
  const opt = courseSel.selectedOptions[0];
  selectCourse(opt.value, opt.dataset.hasDashboard === '1');
}

// The opening hint is the only instruction a first-time student sees, so keep it
// in step with what's actually selected. On a fresh install there are no courses
// to pick, and telling them to pick one is a dead end.
function setHint(slug) {
  const b = document.getElementById('hintBubble');
  if (!b) return;
  b.innerHTML = slug === NEW
    ? 'No courses yet — say <em>“/init-coach”</em> below and I’ll set one up with you.'
    : 'Say <em>“let’s go”</em> to start today’s session.';
}

function selectCourse(slug, hasDashboard) {
  currentSlug = slug;
  watchSource?.close();
  setHint(slug);

  if (slug === NEW) {
    openDash.removeAttribute('href');
    dashFrame.removeAttribute('src');
    dashEmpty.textContent = 'New course setup — say “/init-coach” in the chat to begin.';
    dashEmpty.classList.add('show');
    return;
  }

  const src = `/dashboard/${slug}/index.html`;
  openDash.href = src;
  if (hasDashboard) {
    dashFrame.src = src;
    dashEmpty.classList.remove('show');
  } else {
    dashFrame.removeAttribute('src');
    dashEmpty.textContent = 'No dashboard yet — it appears after your first study day.';
    dashEmpty.classList.add('show');
  }
  // Live-reload subscription: the state-write hook rebuilds the artifact.
  watchSource = new EventSource(`/api/watch?slug=${encodeURIComponent(slug)}`);
  watchSource.addEventListener('reload', () => {
    dashEmpty.classList.remove('show');
    dashFrame.src = `${src}?t=${Date.now()}`; // cache-bust the freshly built artifact
  });
}

courseSel.addEventListener('change', applySelection);


// ─── Question picker ─────────────────────────────────────────────────────────
// Renders the structured questions the coach asks via AskUserQuestion (aliased
// server-side to mcp__ui__ask). Keyboard-first, because the wizard is a long
// interview: ↑/↓ or 1-9 to move, Enter to choose, Tab between questions.
// "Other…" drops to free text — the tool schema says the model must never list
// an Other option itself, so it is always added here.
function renderQuestions(payload, onDone) {
  const card = document.createElement('div');
  card.className = 'qcard';
  const answers = new Array(payload.questions.length).fill(null);
  const groups = [];

  payload.questions.forEach((q, qi) => {
    const group = document.createElement('div');
    group.className = 'qgroup';
    group.innerHTML = `<div class="qhead"><span class="qchip">${esc(q.header)}</span>`
      + `<span class="qtext">${esc(q.question)}</span></div>`;

    const list = document.createElement('div');
    list.className = 'qopts';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', q.question);

    const opts = [...q.options, { label: 'Other…', description: 'Type your own answer', other: true }];
    opts.forEach((o, oi) => {
      const row = document.createElement('div');
      row.className = 'qopt';
      row.tabIndex = -1;
      row.setAttribute('role', 'option');
      row.innerHTML = `<span class="qkey">${oi + 1}</span>`
        + `<span class="qlabel">${esc(o.label)}</span>`
        + (o.description ? `<span class="qdesc">${esc(o.description)}</span>` : '');
      row.addEventListener('click', () => choose(qi, oi));
      list.appendChild(row);
    });

    group.appendChild(list);
    card.appendChild(group);
    groups.push({ list, opts, multi: !!q.multiSelect, cursor: 0, picked: new Set() });
  });

  const foot = document.createElement('div');
  foot.className = 'qfoot';
  foot.innerHTML = '<span class="qhint">↑↓ move · 1-9 pick · Enter confirm</span>';
  const done = document.createElement('button');
  done.className = 'qdone';
  done.textContent = 'Send answers';
  done.addEventListener('click', submit);
  foot.appendChild(done);
  card.appendChild(foot);

  function paint() {
    groups.forEach((g, qi) => {
      [...g.list.children].forEach((row, oi) => {
        row.classList.toggle('cursor', qi === active && oi === g.cursor);
        row.classList.toggle('picked', g.picked.has(oi));
        row.setAttribute('aria-selected', g.picked.has(oi) ? 'true' : 'false');
      });
    });
    done.disabled = groups.some((g) => g.picked.size === 0);
  }

  function choose(qi, oi) {
    const g = groups[qi];
    const opt = g.opts[oi];
    // Electron's BrowserWindow has no window.prompt, so free text is an inline
    // field rather than a dialog — it also keeps the answer in place, visible.
    if (opt.other && !opt.typed) {
      active = qi; g.cursor = oi; paint();
      openOther(g, qi, oi);
      return;
    }
    if (g.multi) { g.picked.has(oi) ? g.picked.delete(oi) : g.picked.add(oi); }
    else { g.picked.clear(); g.picked.add(oi); }
    g.cursor = oi;
    active = qi;
    paint();
    // Single-question, single-select: choosing IS the answer — don't make them
    // confirm a decision they just made.
    if (!g.multi && groups.length === 1) submit();
  }

  function openOther(g, qi, oi) {
    const row = g.list.children[oi];
    if (row.querySelector('input')) return row.querySelector('input').focus();
    const label = row.querySelector('.qlabel');
    const prev = label.textContent;
    label.textContent = '';
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'qother';
    field.placeholder = 'Type your answer, then press Enter';
    const cancel = () => { field.remove(); label.textContent = prev; };
    const commit = () => {
      const v = field.value.trim();
      if (!v) return cancel();
      g.opts[oi].typed = v;
      field.remove();
      label.textContent = v;
      choose(qi, oi);
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation();
    });
    field.addEventListener('blur', () => { if (field.isConnected && !field.value.trim()) cancel(); });
    label.after(field);
    field.focus();
  }

  function submit() {
    if (groups.some((g) => g.picked.size === 0)) return;
    groups.forEach((g, qi) => {
      const picks = [...g.picked].map((oi) => g.opts[oi].typed || g.opts[oi].label);
      answers[qi] = {
        header: payload.questions[qi].header,
        question: payload.questions[qi].question,
        answer: g.multi ? picks : picks[0],
      };
    });
    card.classList.add('answered');
    card.querySelectorAll('.qopt').forEach((r) => { r.style.pointerEvents = 'none'; });
    foot.remove();
    document.removeEventListener('keydown', onKey, true);
    onDone(answers);
  }

  let active = 0;
  function onKey(e) {
    if (!card.isConnected || card.classList.contains('answered')) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const g = groups[active];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      g.cursor = (g.cursor + (e.key === 'ArrowDown' ? 1 : -1) + g.opts.length) % g.opts.length;
      paint(); e.preventDefault(); e.stopPropagation();
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= g.opts.length) {
      choose(active, Number(e.key) - 1); e.preventDefault(); e.stopPropagation();
    } else if (e.key === 'Enter') {
      if (g.picked.size === 0) choose(active, g.cursor);
      else if (groups.length === 1 || active === groups.length - 1) submit();
      else { active += 1; paint(); }
      e.preventDefault(); e.stopPropagation();
    } else if (e.key === 'Tab' && groups.length > 1) {
      active = (active + (e.shiftKey ? -1 : 1) + groups.length) % groups.length;
      paint(); e.preventDefault(); e.stopPropagation();
    }
  }
  document.addEventListener('keydown', onKey, true);

  paint();
  return card;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function send(message) {
  if (!currentSlug || streaming) return;
  streaming = true;
  sendBtn.disabled = true;
  addBubble('user', message);
  let bubble = addBubble('coach');
  bubble.classList.add('thinking');
  bubble.textContent = '…';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: currentSlug, message }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';

  const handleEvent = (block) => {
    const lines = block.split('\n');
    const evName = lines.find((l) => l.startsWith('event: '))?.slice(7);
    const dataLine = lines.find((l) => l.startsWith('data: '))?.slice(6);
    if (!dataLine) return;
    const data = JSON.parse(dataLine);
    if (evName === 'delta') {
      if (!bubble) bubble = addBubble('coach');
      bubble.classList.remove('thinking');
      setStatus('');
      text += data;
      bubble.textContent = text;
      log.scrollTop = log.scrollHeight;
    } else if (evName === 'question') {
      // bubble is null when this is the second picker of a turn — the previous
      // question already cleared it and no text has arrived since.
      if (bubble) {
        bubble.classList.remove('thinking');
        if (!text) bubble.remove();
      }
      setStatus('');
      const card = renderQuestions(data, (answers) => {
        fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, answers }),
        });
        setStatus('thinking…');
      });
      log.appendChild(card);
      log.scrollTop = log.scrollHeight;
      // Anything the coach says next belongs after the picker, not above it —
      // but only once it actually says something. Creating the bubble here would
      // leave a "…" hanging under a picker that's waiting on the student.
      bubble = null;
      text = '';
    } else if (evName === 'tool') {
      setStatus(`${data.name}${data.target ? ` — ${data.target}` : ''}…`);
    } else if (evName === 'error') {
      if (!bubble) bubble = addBubble('coach');
      bubble.classList.remove('thinking');
      bubble.textContent = text + `\n\n⚠️ ${data}`;
      if (/auth|login|credential|unauthor|api key|token/i.test(String(data))) {
        window.dispatchEvent(new Event('coach:maybe-auth-error'));
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      handleEvent(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  // A turn that ended on a picker has no trailing text, and that's fine.
  if (!text && bubble) { bubble.classList.remove('thinking'); bubble.textContent = '(no response)'; }
  else if (!text && !bubble && !log.querySelector('.qcard')) addBubble('coach', '(no response)');

  setStatus('');
  streaming = false;
  sendBtn.disabled = false;
  input.focus();

  // Onboarding may have created a course mid-conversation — pick it up and switch.
  if (currentSlug === NEW) {
    const before = new Set(knownSlugs);
    await loadCourses({ keepSelection: true });
    const created = [...knownSlugs].find((s) => !before.has(s));
    if (created) {
      courseSel.value = created;
      applySelection();
      addBubble('coach', `✅ Course “${created}” is set up. It’s selected now — say “run diagnostic” or “let’s go”.`);
    }
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  send(msg);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

// ─── Resizable splitter ────────────────────────────────────────────────────
(function initSplitter() {
  const splitter = el('splitter');
  const main = document.querySelector('main');
  const MIN_CHAT = 300; // px — don't let either pane collapse
  const MIN_DASH = 360;
  const KEY = 'coach.chatWidthPct';

  const clampPct = (pct) => {
    const w = main.clientWidth || window.innerWidth;
    const lo = (MIN_CHAT / w) * 100;
    const hi = 100 - ((MIN_DASH + 6) / w) * 100;
    return Math.min(Math.max(pct, lo), Math.max(lo, hi));
  };
  const setPct = (pct) => document.documentElement.style.setProperty('--chat-w', `${pct}%`);

  const saved = parseFloat(localStorage.getItem(KEY));
  if (!Number.isNaN(saved)) setPct(clampPct(saved));

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const pct = clampPct(((e.clientX - rect.left) / rect.width) * 100);
    setPct(pct);
  };
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    main.classList.remove('resizing');
    splitter.releasePointerCapture?.(e.pointerId);
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--chat-w');
    localStorage.setItem(KEY, parseFloat(cur));
  };

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    main.classList.add('resizing');
    splitter.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', stop);
  splitter.addEventListener('pointercancel', stop);

  // Keyboard: arrow keys nudge, double-click resets to default.
  splitter.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 8 : 3;
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chat-w')) || 46;
    if (e.key === 'ArrowLeft') { setPct(clampPct(cur - step)); localStorage.setItem(KEY, clampPct(cur - step)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setPct(clampPct(cur + step)); localStorage.setItem(KEY, clampPct(cur + step)); e.preventDefault(); }
  });
  splitter.addEventListener('dblclick', () => { setPct(46); localStorage.removeItem(KEY); });
})();

// ─── Auth gate ──────────────────────────────────────────────────────────────
const auth = {
  overlay: el('authOverlay'),
  intro: el('authIntro'),
  progress: el('authProgress'),
  connect: el('authConnect'),
  console: el('authConsole'),
  statusLine: el('authStatusLine'),
  url: el('authUrl'),
  codeForm: el('authCodeForm'),
  codeInput: el('authCodeInput'),
  log: el('authLog'),
  recheck: el('authRecheck'),
  error: el('authError'),
  errorEl: el('authError'),
  source: null,
  poll: null,
};

async function checkAuth() {
  try {
    const s = await fetch('/api/auth/status').then((r) => r.json());
    return !!s.loggedIn;
  } catch { return false; }
}

function showAuth() { auth.overlay.hidden = false; }
function hideAuth() {
  auth.overlay.hidden = true;
  auth.source?.close();
  clearInterval(auth.poll);
}

async function onSignedIn() {
  hideAuth();
  await loadCourses();
}

function startLogin(provider) {
  auth.intro.hidden = true;
  auth.progress.hidden = false;
  auth.errorEl.hidden = true;
  auth.log.hidden = true;
  auth.log.textContent = '';
  auth.codeForm.hidden = true;

  auth.source?.close();
  auth.source = new EventSource(`/api/auth/login?provider=${encodeURIComponent(provider)}`);
  auth.source.addEventListener('url', (e) => {
    const u = JSON.parse(e.data);
    auth.url.href = u; auth.url.hidden = false;
    auth.statusLine.textContent = 'Authorize in the browser tab that opened — this screen unlocks automatically.';
  });
  auth.source.addEventListener('needcode', () => {
    auth.codeForm.hidden = false; // optional fallback if auto-unlock doesn't fire
  });
  auth.source.addEventListener('log', (e) => {
    auth.log.hidden = false;
    auth.log.textContent += JSON.parse(e.data) + '\n';
    auth.log.scrollTop = auth.log.scrollHeight;
  });
  auth.source.addEventListener('error', (e) => {
    const msg = e.data ? JSON.parse(e.data) : 'Sign-in failed. Try the terminal command below.';
    auth.errorEl.textContent = msg; auth.errorEl.hidden = false;
  });
  auth.source.addEventListener('done', (e) => {
    const status = JSON.parse(e.data);
    if (status.loggedIn) onSignedIn();
    else { auth.statusLine.textContent = 'Not signed in yet — finish in the browser, then re-check.'; }
  });

  // Poll independently in case the login process completes the callback silently.
  clearInterval(auth.poll);
  auth.poll = setInterval(async () => { if (await checkAuth()) onSignedIn(); }, 2500);
}

auth.connect.addEventListener('click', () => startLogin('claudeai'));
auth.console.addEventListener('click', () => startLogin('console'));

auth.codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = auth.codeInput.value.trim();
  if (!code) return;
  auth.statusLine.textContent = 'Submitting code…';
  try {
    const r = await fetch('/api/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then((x) => x.json());
    if (!r.ok) { auth.errorEl.textContent = r.error || 'Could not submit the code.'; auth.errorEl.hidden = false; return; }
    auth.codeInput.value = '';
    auth.statusLine.textContent = 'Finishing sign-in…'; // 'done'/poll will unlock on success
  } catch {
    auth.errorEl.textContent = 'Could not reach the server.'; auth.errorEl.hidden = false;
  }
});
auth.recheck.addEventListener('click', async () => {
  if (await checkAuth()) onSignedIn();
  else { auth.errorEl.textContent = 'Still not signed in.'; auth.errorEl.hidden = false; }
});

// Re-check auth whenever a turn fails on an auth-ish error (token expired mid-session).
window.addEventListener('coach:maybe-auth-error', async () => {
  if (!(await checkAuth())) { auth.intro.hidden = false; auth.progress.hidden = true; showAuth(); }
});

// Boot: gate the app behind auth, then load courses.
(async () => {
  if (await checkAuth()) loadCourses();
  else showAuth();
})();
