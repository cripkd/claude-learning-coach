# Desktop app (Electron) — packaging

Wraps the existing `web/server.mjs` in a native window so a non-technical student
gets a double-click app: no terminal, no Node install, no `git clone`. Electron
ships its own Node; the only external dependency is the `claude` CLI.

## Architecture

```
Electron main (desktop/main.cjs)
  ├─ resolveClaudeBin()      find the claude binary (packaged apps don't inherit shell PATH)
  ├─ fork(web/server.mjs)    Electron-as-Node, free loopback port, CLAUDE_BIN + PORT in env
  ├─ waitForServer()         poll until it answers
  └─ BrowserWindow → http://127.0.0.1:<port>/   (the same web UI, unchanged)
```

External links (dashboard "open ↗", the sign-in URL) are handed to the system
browser via `setWindowOpenHandler` → `shell.openExternal`.

## Dev run

```bash
npm install        # pulls electron + electron-builder (dev deps)
npm run desktop    # launches the app against the repo dir
```

In dev the app's working dir is the repo, which is writable, so courses read/write
normally.

## Build installers

```bash
npm run desktop:build   # electron-builder → dmg / nsis / AppImage
```

## Packaging TODO (before shipping real installers)

These are known gaps — the dev run works, but a packaged `.app`/`.exe` needs:

- **Writable course storage.** In a packaged build the app resources live inside a
  read-only bundle, but the coach writes `courses/{slug}/…`. The server must run
  with `cwd` pointing at a writable location — e.g. `app.getPath('userData')` —
  seeded on first launch from bundled `templates/` + `starter-files/`. Until this
  lands, packaged writes will fail; dev is unaffected.
- **`claude` on first run.** `resolveClaudeBin()` probes common paths, but if the
  CLI is absent the app should offer to run `claude install` (or link the docs)
  rather than fail silently.
- **Code signing + notarization** (macOS) and a signed installer (Windows) so the
  OS doesn't block the download.
- **Auto-update** for both the app and the `claude` CLI (`claude update`).
- **App icon** and DMG background.

## Why Electron (not Tauri)

Chosen for simplicity: Node is built in, so `fork(server.mjs)` and the SDK work
with zero extra runtime wiring. Cost is installer size (~100–150 MB). Tauri would
cut that to a few MB but adds a Rust toolchain and a Node sidecar to manage — not
worth it for the first packaged cut.
