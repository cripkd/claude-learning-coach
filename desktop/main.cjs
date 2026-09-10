// desktop/main.cjs — Electron main process.
//
// Wraps the existing web/server.mjs (unchanged) in a native window so a
// non-technical student gets a double-click app with no terminal. Electron
// ships its own Node, so the only external dependency is the `claude` CLI,
// which the server drives for auth + the agent loop.
//
// Flow: resolve the claude binary → fork server.mjs on a free loopback port
// (Electron-as-Node) → wait until it answers → load it in a BrowserWindow.

const { app, BrowserWindow, shell } = require('electron');
const { fork } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const REPO_ROOT = path.join(__dirname, '..');
const SERVER = path.join(REPO_ROOT, 'web', 'server.mjs');

let serverProc = null;
let serverPort = null;
let win = null;

// The packaged app won't inherit the user's shell PATH, so the SDK's spawned
// `claude` may not be found. Probe the common install locations and hand the
// server an absolute path via CLAUDE_BIN. Falls back to bare "claude" (PATH).
function resolveClaudeBin() {
  const home = app.getPath('home');
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(home, '.claude', 'local', 'claude'),
  ];
  return candidates.find(existsSync) || 'claude';
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
  const port = await getFreePort();
  serverProc = fork(SERVER, [], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',   // run the Electron binary as plain Node
      PORT: String(port),
      CLAUDE_BIN: resolveClaudeBin(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
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
