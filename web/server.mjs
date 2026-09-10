#!/usr/bin/env node
/**
 * web/server.mjs — browser front-end for the Learning Coach.
 *
 * Wraps the same agent that Claude Code runs — same CLAUDE.md dispatcher, same
 * tools, same hooks, same dashboard build artifact — behind a local web UI so a
 * non-technical student never touches a terminal.
 *
 * Auth: the Agent SDK spawns the installed `claude` CLI, which inherits the
 * student's existing Claude subscription login. No API key required.
 *
 * Endpoints:
 *   GET  /                       → chat + dashboard shell (public/index.html)
 *   GET  /api/courses            → list of courses under courses/
 *   POST /api/chat               → SSE stream of a coach turn (body: {slug, message})
 *   GET  /api/watch?slug=…       → SSE; pushes "reload" when the dashboard rebuilds
 *   GET  /dashboard/:slug/*      → serves the per-course dashboard build artifact
 *   GET  /public/*               → static UI assets
 *
 * Run:  node web/server.mjs        (then open http://localhost:4173)
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat, watch } from 'node:fs/promises';
import { existsSync, watch as watchSync } from 'node:fs';
import { dirname, resolve, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { query } from '@anthropic-ai/claude-agent-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const COURSES_DIR = join(REPO_ROOT, 'courses');
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4173;

// One resumable SDK session id per course, so the coach keeps context across turns.
const sessions = new Map(); // slug -> session_id

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

// ─── Tool permission guard (stub) ─────────────────────────────────────────────
// Replaces blanket bypassPermissions. Scopes file writes to the active course and
// keeps reads/shell inside the repo. This is a conservative default, not a finished
// policy — tighten Bash to an allowlist and revisit per your threat model before any
// non-local deployment. Onboarding ('__new__') is broadened to allow creating a new
// course dir whose slug isn't known yet.
const DENY = (message) => ({ behavior: 'deny', message });
const ALLOW = (input) => ({ behavior: 'allow', updatedInput: input });

// Obvious footguns. Denylist, not allowlist — hence "stub".
const DANGEROUS_BASH = /(^|\s)(sudo|rm\s+-rf\s+\/|:\(\)\s*\{|curl[^|]*\|\s*(sh|bash)|wget[^|]*\|\s*(sh|bash))/;

function makePermissionGuard(slug) {
  const onboarding = slug === '__new__';
  const courseDir = onboarding ? COURSES_DIR : join(COURSES_DIR, slug);

  return async (toolName, input = {}) => {
    const within = (root, p) => {
      const abs = resolve(REPO_ROOT, String(p ?? ''));
      return abs.startsWith(root + '/') || abs === root ? abs : null;
    };

    switch (toolName) {
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
      case 'NotebookEdit': {
        const abs = within(courseDir, input.file_path);
        return abs ? ALLOW(input)
          : DENY(`write blocked: ${input.file_path} is outside the course directory`);
      }
      case 'Read': {
        // Reads span the repo (templates/, starter-files/, root files) but not the host FS.
        const abs = within(REPO_ROOT, input.file_path);
        return abs ? ALLOW(input) : DENY(`read blocked: ${input.file_path} is outside the repo`);
      }
      case 'Bash': {
        const cmd = String(input.command ?? '');
        if (DANGEROUS_BASH.test(cmd)) return DENY('shell command blocked by safety policy');
        return ALLOW(input);
      }
      default:
        // Glob/Grep/Web*/Task/Todo/etc. — read-only or side-effect-free; allow.
        return ALLOW(input);
    }
  };
}

// Short human label for a tool call, shown as transient chat status.
function toolTarget(name, input = {}) {
  const base = (p) => (typeof p === 'string' ? p.split('/').pop() : '');
  if (input.file_path) return base(input.file_path);
  if (input.command) return String(input.command).slice(0, 48);
  if (input.pattern) return String(input.pattern).slice(0, 48);
  if (input.description) return String(input.description).slice(0, 48);
  return '';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Course discovery ────────────────────────────────────────────────────────

async function listCourses() {
  if (!existsSync(COURSES_DIR)) return [];
  const entries = await readdir(COURSES_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !SLUG_RE.test(e.name)) continue;
    const statePath = join(COURSES_DIR, e.name, 'data', 'state.json');
    let exam = null;
    try {
      const s = JSON.parse(await readFile(statePath, 'utf8'));
      exam = { fullName: s?.exam?.fullName ?? null, shortName: s?.exam?.shortName ?? null };
    } catch { /* course may not be initialised yet */ }
    out.push({ slug: e.name, exam, hasDashboard: existsSync(join(COURSES_DIR, e.name, 'dashboard', 'index.html')) });
  }
  return out;
}

// ─── Static file serving (sandboxed to a root dir) ─────────────────────────────

async function serveFile(res, rootDir, relPath) {
  const abs = normalize(join(rootDir, relPath));
  if (!abs.startsWith(rootDir)) return send(res, 403, 'Forbidden'); // path traversal guard
  try {
    const info = await stat(abs);
    const target = info.isDirectory() ? join(abs, 'index.html') : abs;
    const buf = await readFile(target);
    send(res, 200, buf, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream' });
  } catch {
    send(res, 404, 'Not found');
  }
}

// ─── Claude account auth ───────────────────────────────────────────────────────
// The Agent SDK can only *use* stored credentials, never obtain them — OAuth is
// interactive. These endpoints let the browser detect the logged-out state and
// drive `claude auth login` (which opens a browser + localhost callback) without
// the student ever opening a terminal. A copy-paste command is the fallback if the
// spawned flow needs a TTY.

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const URL_RE = /(https?:\/\/[^\s"']+)/;

// The active `claude auth login` child, if a sign-in is in flight. This OAuth flow
// is code-paste (not a localhost callback): the CLI prints a URL, the student
// authorizes in the browser, copies a code from the redirect page, and that code
// must be written to this process's stdin. /api/auth/code does the write.
let authChild = null;

function authStatus() {
  return new Promise((resolveP) => {
    const child = spawn(CLAUDE_BIN, ['auth', 'status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => resolveP({ loggedIn: false, error: 'claude CLI not found' }));
    child.on('close', () => {
      try { resolveP(JSON.parse(out)); }
      catch { resolveP({ loggedIn: false }); }
    });
  });
}

// SSE: spawn `claude auth login`, stream its output (URL + prompts) to the UI,
// then report the final status. The CLI opens the browser itself.
function handleAuthLogin(res, provider) {
  sseInit(res);
  const providerFlag = provider === 'console' ? '--console' : '--claudeai';

  // Only one sign-in in flight at a time.
  try { authChild?.kill(); } catch { /* noop */ }

  let child;
  try {
    // stdin piped so /api/auth/code can feed the pasted OAuth code back in.
    child = spawn(CLAUDE_BIN, ['auth', 'login', providerFlag], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    sseSend(res, 'error', 'Could not run the claude CLI. Install it, then retry.');
    return res.end();
  }
  authChild = child;

  let opened = false;
  const scan = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) sseSend(res, 'log', line);
    }
    const m = text.match(URL_RE);
    if (m && !opened) {
      opened = true;
      // The claude CLI opens the browser itself ("Opening browser to sign in…").
      // We only surface the URL as a clickable fallback — opening it again here
      // would spawn a duplicate tab.
      sseSend(res, 'url', m[1]);
      // Reveal the code-paste box as a fallback; the flow usually self-completes
      // via the CLI's callback (caught by the status poll) without needing it.
      sseSend(res, 'needcode', true);
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('error', () => { authChild = null; sseSend(res, 'error', 'claude CLI not found'); res.end(); });
  child.on('close', async () => {
    authChild = null;
    const status = await authStatus();
    sseSend(res, 'done', status);
    res.end();
  });

  res.on('close', () => { if (authChild === child) { try { child.kill(); } catch { /* noop */ } authChild = null; } });
}

// Feed the pasted OAuth code into the in-flight login process's stdin.
async function handleAuthCode(req, res) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, 'Bad JSON'); }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return send(res, 400, JSON.stringify({ ok: false, error: 'empty code' }), { 'Content-Type': MIME['.json'] });
  if (!authChild || !authChild.stdin.writable) {
    return send(res, 409, JSON.stringify({ ok: false, error: 'no sign-in in progress' }), { 'Content-Type': MIME['.json'] });
  }
  try {
    authChild.stdin.write(code + '\n');
    return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
  } catch (err) {
    return send(res, 500, JSON.stringify({ ok: false, error: String(err?.message || err) }), { 'Content-Type': MIME['.json'] });
  }
}

// ─── Chat turn (SSE) ───────────────────────────────────────────────────────────

async function handleChat(req, res) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, 'Bad JSON'); }

  const { slug, message } = body;
  if (!slug || !SLUG_RE.test(slug)) return send(res, 400, 'Bad slug');
  if (!message || typeof message !== 'string') return send(res, 400, 'Empty message');

  sseInit(res);
  const resume = sessions.get(slug);

  // Point the agent at the course by giving it the slug up front. The root
  // CLAUDE.md dispatcher + the course CLAUDE.md take it from there.
  // The onboarding pseudo-slug '__new__' runs /init-coach; don't pin it to a course.
  const isOnboarding = slug === '__new__';
  const prompt = (resume || isOnboarding) ? message : `I'm working on the course: ${slug}\n\n${message}`;

  try {
    const stream = query({
      prompt,
      options: {
        cwd: REPO_ROOT,
        resume,
        canUseTool: makePermissionGuard(slug), // scopes writes to the course; gates shell
        includePartialMessages: true,
        settingSources: ['project'],          // load .claude/settings.json → hooks fire (dashboard rebuild)
      },
    });

    for await (const msg of stream) {
      if (msg.type === 'system' && msg.session_id) sessions.set(slug, msg.session_id);
      else if (msg.type === 'result' && msg.session_id) sessions.set(slug, msg.session_id);

      if (msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          sseSend(res, 'delta', ev.delta.text);
        }
      } else if (msg.type === 'assistant') {
        // Surface tool activity so the student sees "reading memory.md…" instead of silence.
        for (const block of msg.message?.content || []) {
          if (block?.type === 'tool_use') {
            sseSend(res, 'tool', { name: block.name, target: toolTarget(block.name, block.input) });
          }
        }
      } else if (msg.type === 'result') {
        sseSend(res, 'done', { ok: msg.subtype === 'success' });
      }
    }
  } catch (err) {
    sseSend(res, 'error', String(err?.message || err));
  }
  res.end();
}

// ─── Dashboard live-reload (SSE) ────────────────────────────────────────────────
// The state-write hook rebuilds dashboard/index.html on every state.json write.
// We watch that file and push a reload event so the iframe refreshes itself.

function handleWatch(res, slug) {
  if (!SLUG_RE.test(slug)) return send(res, 400, 'Bad slug');
  const dashPath = join(COURSES_DIR, slug, 'dashboard', 'index.html');
  sseInit(res);
  sseSend(res, 'hello', { slug });

  let watcher;
  try {
    watcher = watchSync(join(COURSES_DIR, slug, 'dashboard'), (_evt, file) => {
      if (file === 'index.html') sseSend(res, 'reload', { at: dashPath });
    });
  } catch { /* dashboard dir may not exist yet */ }

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => { clearInterval(ping); watcher?.close?.(); });
}

// ─── Router ──────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === '/' ) return serveFile(res, PUBLIC_DIR, 'index.html');
    if (path === '/api/auth/status') return send(res, 200, JSON.stringify(await authStatus()), { 'Content-Type': MIME['.json'] });
    if (path === '/api/auth/login') return handleAuthLogin(res, url.searchParams.get('provider') || 'claudeai');
    if (path === '/api/auth/code' && req.method === 'POST') return handleAuthCode(req, res);
    if (path === '/api/courses') return send(res, 200, JSON.stringify(await listCourses()), { 'Content-Type': MIME['.json'] });
    if (path === '/api/chat' && req.method === 'POST') return handleChat(req, res);
    if (path === '/api/watch') return handleWatch(res, url.searchParams.get('slug') || '');

    if (path.startsWith('/dashboard/')) {
      const rest = path.slice('/dashboard/'.length);
      const slug = rest.split('/')[0];
      if (!SLUG_RE.test(slug)) return send(res, 400, 'Bad slug');
      const relInCourse = rest.slice(slug.length + 1) || 'index.html';
      return serveFile(res, join(COURSES_DIR, slug, 'dashboard'), relInCourse);
    }

    if (path.startsWith('/public/')) return serveFile(res, PUBLIC_DIR, path.slice('/public/'.length));

    send(res, 404, 'Not found');
  } catch (err) {
    send(res, 500, `Server error: ${err?.message || err}`);
  }
});

// Bind to loopback only: this app assumes a single trusted local user (see web/README.md).
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Learning Coach web UI → http://localhost:${PORT}\n`);
  console.log('  (Uses your existing Claude login via the claude CLI — no API key needed.)\n');
});
