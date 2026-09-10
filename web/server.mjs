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
        permissionMode: 'bypassPermissions', // local single-user app; coach writes only within the repo
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

server.listen(PORT, () => {
  console.log(`\n  Learning Coach web UI → http://localhost:${PORT}\n`);
  console.log('  (Uses your existing Claude login via the claude CLI — no API key needed.)\n');
});
