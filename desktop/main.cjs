// desktop/main.cjs — Electron main process.
//
// Wraps the existing web/server.mjs in a native window so a non-technical
// student gets a double-click app with no terminal. The Agent SDK ships Claude
// Code as a per-platform native binary, so the app carries its own copy: there
// is nothing for the student to install, and the only requirement at launch is
// a Claude account to sign into.
//
// Flow: resolve the three filesystem roots → seed the writable workspace →
// fork server.mjs on a free loopback port (Electron-as-Node) → wait until it
// answers → load it in a BrowserWindow.

const { app, BrowserWindow, shell } = require('electron');
const { fork } = require('node:child_process');
const { createRequire } = require('node:module');
const { existsSync, mkdirSync, copyFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

// Where the code and bundled assets live. Read-only in a packaged build: the
// bundle is code-signed, so writing into it would break the signature (and on a
// quarantined download it sits on a genuinely read-only mount).
const BUNDLE_ROOT = path.join(__dirname, '..');
const SERVER = path.join(BUNDLE_ROOT, 'web', 'server.mjs');

let serverProc = null;
let serverPort = null;
let win = null;

// ─── Filesystem roots ────────────────────────────────────────────────────────
// Running from a checkout, all three collapse onto the repo, so `npm run desktop`
// behaves exactly as it did before. Packaged, the student's work moves to
// userData — writable, backed up, and untouched by app updates.
function resolveRoots() {
  const userData = app.getPath('userData');
  const defaultData = app.isPackaged ? path.join(userData, 'workspace') : BUNDLE_ROOT;
  const defaultCache = app.isPackaged ? path.join(userData, 'cache') : path.join(BUNDLE_ROOT, '.cache');
  return {
    bundleRoot: BUNDLE_ROOT,
    // Overridable so the data can be relocated (a synced folder, a portable
    // install) without a rebuild.
    dataRoot: process.env.COACH_DATA_ROOT || defaultData,
    cacheRoot: process.env.COACH_CACHE_ROOT || defaultCache,
  };
}

// ─── Workspace seeding ───────────────────────────────────────────────────────
// The agent's cwd is dataRoot, and CLAUDE.md + .claude/settings.json must be
// found there. Both are *derived from the bundle*, so they are rewritten on
// every launch rather than seeded once: a shipped fix then always wins, with no
// version stamp to maintain and no stale copy to debug. Nothing the student
// creates lives at these paths — their work is under courses/, which this never
// touches.
function seedWorkspace({ bundleRoot, dataRoot }) {
  if (dataRoot === bundleRoot) return; // dev: the checkout is already the workspace

  mkdirSync(path.join(dataRoot, 'courses'), { recursive: true });
  mkdirSync(path.join(dataRoot, '.claude'), { recursive: true });

  for (const name of ['CLAUDE.md', 'CLAUDE.md.template']) {
    const src = path.join(bundleRoot, name);
    if (existsSync(src)) copyFileSync(src, path.join(dataRoot, name));
  }

  // Slash commands (/init-coach, /index-sources) are read from the project dir.
  const cmdSrc = path.join(bundleRoot, '.claude', 'commands');
  if (existsSync(cmdSrc)) {
    const cmdDst = path.join(dataRoot, '.claude', 'commands');
    mkdirSync(cmdDst, { recursive: true });
    for (const f of require('node:fs').readdirSync(cmdSrc)) {
      copyFileSync(path.join(cmdSrc, f), path.join(cmdDst, f));
    }
  }

  writeSettings({ bundleRoot, dataRoot });
}

// The checked-in .claude/settings.json runs hooks as `node $CLAUDE_PROJECT_DIR/...`,
// which assumes Node on PATH and the scripts sitting next to the data. Neither
// holds in a packaged build, so generate the packaged equivalent: absolute script
// paths in the bundle, run by Electron's own Node (ELECTRON_RUN_AS_NODE is set on
// the server process and inherited down through claude to the hooks).
function writeSettings({ bundleRoot, dataRoot }) {
  const hook = (script) => ({
    type: 'command',
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(bundleRoot, 'scripts', script))}`,
  });
  const settings = {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    hooks: {
      PostToolUse: [
        { matcher: 'Write|Edit|MultiEdit', hooks: [hook('state-write-hook.mjs')] },
        { matcher: 'Write|Edit|MultiEdit', hooks: [hook('embeddings-write-hook.mjs')] },
      ],
      Stop: [{ hooks: [hook('day-delivery-gate.mjs')] }],
    },
  };
  writeFileSync(path.join(dataRoot, '.claude', 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
}

// ─── Claude binary ───────────────────────────────────────────────────────────
// Resolve the native binary the SDK ships as a per-platform optional dependency.
// npm installs only the one matching the build host, so a cross-platform build
// that omits the target's package produces an app that launches and then fails on
// the first message — hence the explicit warning rather than a silent fallback.
function resolveClaudeBin() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const specs = [`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${exe}`];
  if (process.platform === 'linux') specs.push(`@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl/${exe}`);
  // Resolve from the SDK's own location first, then from here. electron-builder
  // nests the platform package inside the SDK's node_modules rather than
  // hoisting it, so a resolver anchored only at this file finds nothing in a
  // packaged build.
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
  console.error(`No bundled claude binary for ${process.platform}-${process.arch}; falling back to PATH.`);
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => (Date.now() > deadline ? reject(new Error('server did not start')) : setTimeout(tick, 250)));
      req.on('timeout', () => { req.destroy(); Date.now() > deadline ? reject(new Error('server timeout')) : setTimeout(tick, 250); });
    };
    tick();
  });
}

async function startServer() {
  const roots = resolveRoots();
  seedWorkspace(roots);

  const port = await getFreePort();
  const claudeBin = resolveClaudeBin();

  serverProc = fork(SERVER, [], {
    cwd: roots.dataRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',   // run the Electron binary as plain Node
      PORT: String(port),
      COACH_DATA_ROOT: roots.dataRoot,
      COACH_CACHE_ROOT: roots.cacheRoot,
      ...(claudeBin ? { CLAUDE_BIN: claudeBin } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],  // fork() requires an 'ipc' channel
  });
  serverProc.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProc.on('exit', (code) => { if (code) console.error(`server exited (${code})`); });

  await waitForServer(port);
  serverPort = port;
  return port;
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    title: 'Learning Coach',
    backgroundColor: '#0f1115',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // External links (dashboard "open ↗", sign-in URL) open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    console.error('Failed to start Learning Coach:', err);
    app.quit();
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(serverPort); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => { try { serverProc?.kill(); } catch { /* noop */ } });
