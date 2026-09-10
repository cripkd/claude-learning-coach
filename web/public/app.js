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

function selectCourse(slug, hasDashboard) {
  currentSlug = slug;
  watchSource?.close();

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

async function send(message) {
  if (!currentSlug || streaming) return;
  streaming = true;
  sendBtn.disabled = true;
  addBubble('user', message);
  const bubble = addBubble('coach');
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
      bubble.classList.remove('thinking');
      setStatus('');
      text += data;
      bubble.textContent = text;
      log.scrollTop = log.scrollHeight;
    } else if (evName === 'tool') {
      setStatus(`${data.name}${data.target ? ` — ${data.target}` : ''}…`);
    } else if (evName === 'error') {
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
  if (!text) { bubble.classList.remove('thinking'); bubble.textContent = '(no response)'; }

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
