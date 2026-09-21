# Desktop app (Electron) — packaging

Wraps the existing `web/server.mjs` in a native window so a non-technical student
gets a double-click app: no terminal, no Node install, no `git clone`. Electron
ships its own Node, and the Agent SDK ships Claude Code as a native binary, so
**nothing has to be installed on the student's machine** — the only requirement
at launch is a Claude account to sign into.

## Architecture

```
Electron main (desktop/main.cjs)
  ├─ resolveRoots()          bundle (read-only) / data (writable) / cache (disposable)
  ├─ seedWorkspace()         rewrite CLAUDE.md + .claude/ from the bundle each launch
  ├─ resolveClaudeBin()      the SDK's bundled per-platform claude binary
  ├─ fork(web/server.mjs)    Electron-as-Node, free loopback port, roots in env
  ├─ waitForServer()         poll until it answers
  └─ BrowserWindow → http://127.0.0.1:<port>/   (the same web UI, unchanged)
```

External links (dashboard "open ↗", the sign-in URL) are handed to the system
browser via `setWindowOpenHandler` → `shell.openExternal`.

## The three roots

Resolved in `scripts/_roots.mjs` and passed down as `COACH_DATA_ROOT` /
`COACH_CACHE_ROOT`. In a repo checkout all three collapse onto the checkout, so
running from source is unchanged.

| Root | Packaged location | Update behavior |
|---|---|---|
| `BUNDLE_ROOT` — code, `templates/`, `starter-files/` | inside the `.app` | replaced wholesale |
| `DATA_ROOT` — `courses/`, the student's work | `userData/workspace` | never auto-touched |
| `CACHE_ROOT` — embedding model cache | `userData/cache` | safe to delete; regenerates |

This split is what makes the app updatable. Writing into the bundle would fail
outright on a quarantined download (read-only mount), break the code signature
once the app is signed, and be erased by the next update.

Both roots can be overridden by env var to relocate a student's data without a
rebuild.

### Seeding

`CLAUDE.md`, `CLAUDE.md.template`, and `.claude/` are *derived from the bundle*,
so `seedWorkspace()` rewrites them on **every launch** rather than seeding once.
A shipped fix then always wins — no version stamp to maintain, no stale copy to
debug. Student work lives under `courses/`, which seeding never touches.

`.claude/settings.json` is generated rather than copied: the checked-in one runs
hooks as `node $CLAUDE_PROJECT_DIR/…`, which assumes Node on PATH and the scripts
sitting next to the data. The generated one uses absolute bundle paths run by
Electron's own Node (`ELECTRON_RUN_AS_NODE` is set on the server process and
inherited down through `claude` to the hooks).

## The claude binary

The SDK installs Claude Code as a per-platform optional npm dependency
(`@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, ~192 MB). `main.cjs`
resolves it and hands the path to the server, which uses it for **both** the
agent loop (`pathToClaudeCodeExecutable`) and the `claude auth` subcommands.

Using one binary for both matters: auth previously ran against whatever `claude`
happened to be on the system, so sign-in silently depended on a separate install
— the exact thing this wrapper exists to avoid.

**Cross-platform builds:** npm installs only the binary matching the build host.
Building a Windows installer on macOS yields an app that launches and then fails
on the first message. Each target needs its platform package present.

## Dev run

```bash
npm install        # pulls electron + electron-builder (dev deps)
npm run desktop    # launches the app against the repo dir
```

## Build installers

Local one-off build:

```bash
npm run desktop:build   # electron-builder → dmg / nsis / AppImage
```

### Releasing via CI

Cut a release by pushing a semver tag — CI builds the DMG and publishes the
GitHub Release. `scripts/release.sh` handles the bump/tag/push:

```bash
npm run release patch     # bump (patch|minor|major|X.Y.Z), tag vX.Y.Z, push
```

`.github/workflows/release.yml` triggers on the `v*` tag, builds the **arm64**
DMG on `macos-14`, and attaches it to the release. It is **arm64-only**: the
Intel `macos-13` runner queues indefinitely (GitHub is retiring the image), so
the x64 matrix entry is commented out. Re-enable by uncommenting it — each arch
must build on its own host so `npm ci` bundles the correct per-platform claude
binary. Full flow in `PACKAGING.md` § Releasing.

## Packaging TODO (before shipping real installers)

- **Auto-update** (`electron-updater`). Without it, every student is stranded on
  the version they downloaded — and since the Claude harness is bundled, app
  updates are the *only* way they get harness fixes. (Models update server-side
  and need no app release.)
- **Code signing + notarization** (macOS) and a signed installer (Windows). Note
  the bundled 192 MB `claude` binary is a nested Mach-O that must be signed too.
- **First-run onboarding** — the packaged app starts with an empty `courses/`,
  so the student's first action is `/init-coach`.
- **App icon** and DMG background.
- `asar` must stay `false` (or the binary must be in `asarUnpack`): you cannot
  exec a binary from inside an asar archive.

## Why Electron (not Tauri)

Chosen for simplicity: Node is built in, so `fork(server.mjs)` and the SDK work
with zero extra runtime wiring. Cost is installer size — ~100–150 MB of Electron
plus ~192 MB for the bundled Claude Code binary. Tauri would cut the Electron
half but adds a Rust toolchain and a Node sidecar to manage, and would not
shrink the Claude binary at all.
