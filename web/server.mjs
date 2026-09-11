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
import { createRequire } from 'node:module';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BUNDLE_ROOT, DATA_ROOT, COURSES_DIR } from '../scripts/_roots.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
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

// ─── Interactive questions ────────────────────────────────────────────────────
// The model already emits structured multiple-choice questions via the built-in
// AskUserQuestion tool — the same picker Claude Code renders in the terminal.
// Nothing in a browser answers it, so it returns unanswered and the coach falls
// back to re-asking in prose ("I didn't get an answer to that question").
//
// toolAliases redirects that built-in name at the in-process MCP tool below, so
// the call lands here instead: push the questions down the turn's SSE stream,
// wait for the student's pick, and hand back a real tool result. To the model
// this is indistinguishable from the terminal picker.

const pendingQuestions = new Map(); // id -> resolve

// Mirrors AskUserQuestionInput. Kept permissive on bounds (the model is already
// constrained by the built-in tool's own schema) so a stricter local copy can't
// reject a call the model considered valid.
const ASK_SHAPE = {
  questions: z.array(z.object({
    question: z.string(),
    header: z.string(),
    multiSelect: z.boolean().optional(),
    options: z.array(z.object({
      label: z.string(),
      description: z.string(),
      preview: z.string().optional(),
    })),
  })),
};

function makeAskServer(sse, liveIds) {
  return createSdkMcpServer({
    name: 'ui',
    version: '1.0.0',
    tools: [
      tool(
        'ask',
        'Ask the student 1-4 multiple-choice questions and wait for their answer. '
        + 'Renders as a keyboard-navigable picker in the app. Prefer this over asking in prose.',
        ASK_SHAPE,
        async ({ questions }) => {
          const id = randomUUID();
          liveIds.add(id);
          const answers = await new Promise((resolve) => {
            pendingQuestions.set(id, resolve);
            sse('question', { id, questions });
          });
          pendingQuestions.delete(id);
          liveIds.delete(id);
          return { content: [{ type: 'text', text: JSON.stringify({ answers }) }] };
        },
      ),
    ],
  });
}

async function handleAnswer(req, res) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, 'Bad JSON'); }
  const resolve = pendingQuestions.get(body?.id);
  if (!resolve) return send(res, 409, JSON.stringify({ ok: false, error: 'no question pending' }), { 'Content-Type': MIME['.json'] });
  resolve(body.answers ?? []);
  return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': MIME['.json'] });
}

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
    // Relative paths are resolved against DATA_ROOT because that is the agent's
    // cwd. In a repo checkout DATA_ROOT === BUNDLE_ROOT and this behaves exactly
    // as it did before the split.
    const within = (roots, p) => {
      const abs = resolve(DATA_ROOT, String(p ?? ''));
      return roots.some((r) => abs === r || abs.startsWith(r + '/')) ? abs : null;
    };

    switch (toolName) {
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
      case 'NotebookEdit': {
        const abs = within([courseDir], input.file_path);
        return abs ? ALLOW(input)
          : DENY(`write blocked: ${input.file_path} is outside the course directory`);
      }
      case 'Read': {
        // Reads span the student's data and the bundled assets (templates/,
        // starter-files/, root files) but not the rest of the host FS.
        const abs = within([DATA_ROOT, BUNDLE_ROOT], input.file_path);
        return abs ? ALLOW(input) : DENY(`read blocked: ${input.file_path} is outside the workspace`);
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

// The Agent SDK ships Claude Code as a per-platform native binary (an optional
// npm dependency), so the app carries its own copy and nothing has to be
// installed on the student's machine. Use that same binary for the auth
// subcommands too — otherwise sign-in silently depends on a separate system
// install, which is exactly what the desktop wrapper exists to avoid.
function resolveBundledClaude() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const specs = [`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${exe}`];
  if (process.platform === 'linux') specs.push(`@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl/${exe}`);

  // Resolve from the SDK's own location first, then from here. electron-builder
  // nests the platform package inside the SDK's node_modules rather than
  // hoisting it, so a resolver anchored only at this file finds nothing in a
  // packaged build and silently falls back to PATH.
  const anchors = [];
  try { anchors.push(createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'))); } catch { /* ignore */ }
  anchors.push(require);

  for (const req of anchors) {
    for (const spec of specs) {
      try {
        const p = req.resolve(spec);
        if (existsSync(p)) return p;
      } catch { /* not installed for this platform */ }
    }
  }
  return null;
}

// Absolute path when we have one; null means "fall back to PATH".
const CLAUDE_PATH = process.env.CLAUDE_BIN || resolveBundledClaude();
const CLAUDE_BIN = CLAUDE_PATH || 'claude';
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

  // Unanswered questions must not outlive the turn: if the student closes the
  // tab mid-question the tool would await forever and wedge the session.
  const liveIds = new Set();
  const releaseQuestions = () => {
    for (const id of liveIds) pendingQuestions.get(id)?.([]);
    liveIds.clear();
  };
  res.on('close', releaseQuestions);

  try {
    const stream = query({
      prompt,
      options: {
        cwd: DATA_ROOT,                       // roots CLAUDE.md discovery + $CLAUDE_PROJECT_DIR
        mcpServers: { ui: makeAskServer((ev, data) => sseSend(res, ev, data), liveIds) },
        toolAliases: { AskUserQuestion: 'mcp__ui__ask' },
        resume,
        canUseTool: makePermissionGuard(slug), // scopes writes to the course; gates shell
        includePartialMessages: true,
        // 'project' loads .claude/settings.json (→ hooks fire, dashboard rebuilds)
        // *and* CLAUDE.md. Omitting 'user' is deliberate: the student's own
        // ~/.claude/settings.json must not leak into the coach session.
        settingSources: ['project'],
        ...(CLAUDE_PATH ? { pathToClaudeCodeExecutable: CLAUDE_PATH } : {}),
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
          // The picker renders its own UI; a "tool running" status line under it
          // just flickers.
          if (block?.type === 'tool_use' && block.name !== 'mcp__ui__ask') {
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
  releaseQuestions();
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
    if (path === '/api/answer' && req.method === 'POST') return handleAnswer(req, res);
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
  console.log(`\n  Learning Coach web UI → http://localhost:${PORT}`);
  console.log(`  data: ${DATA_ROOT}`);
  console.log(`  claude: ${CLAUDE_PATH ? `bundled (${CLAUDE_PATH})` : 'from PATH — no bundled binary for this platform'}`);
  console.log('  (Signs in with your Claude account — no API key needed.)\n');
});
