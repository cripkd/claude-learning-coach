# Desktop Packaging (Electron)

Status: **in progress** on branch `packaging-electron`. The Electron wrapper is scaffolded
(`desktop/main.cjs`, wired as `package.json` `main`) but not yet finished/tested — it wraps the
existing web UI (`web/server.mjs`).

## Build & run

```bash
npm install          # pulls Electron 33.x prebuilt binary (large download from GitHub)
npm run desktop      # electron .  — launches the desktop app
npm run desktop:build  # electron-builder — produces distributable
```

Verify Electron installed:

```bash
./node_modules/.bin/electron --version   # expect v33.x
```

## Pinned versions

- `electron` `^33.0.0` (resolves to **33.4.11** as of 2026-09)
- `electron-builder` `^25.0.0`
- Dev arch reference: macOS **darwin-arm64**

## Corporate machine (Zscaler / TLS-intercept) workaround

`npm install` fails behind Zscaler in two stages:

1. **TLS cert reject** — export the Zscaler root CA and point Node at it:
   ```bash
   security find-certificate -a -c "Zscaler" -p /Library/Keychains/System.keychain > ~/zscaler-root.crt
   export NODE_EXTRA_CA_CERTS="$HOME/zscaler-root.crt"
   ```
2. **`read ECONNRESET`** — Zscaler kills the large binary download from GitHub releases.
   The npm registry works; only the GitHub binary fetch dies. Workaround: download the binary
   via **browser** (survives Zscaler where the CLI doesn't) and seed the `@electron/get` cache.

   For electron 33.4.11 / darwin-arm64, download from the GitHub `v33.4.11` release:
   - `electron-v33.4.11-darwin-arm64.zip`
   - `SHASUMS256.txt`

   Place each into `~/Library/Caches/electron/<sha256-of-download-URL>/` (folder name is the
   sha256 hex of the full download URL), then rerun `npm install` — it finds the cache and
   skips the download.

**Simplest path:** run `npm install` on an unrestricted network (personal laptop), then
`git pull` this branch there. The binary download just works off the corporate network.

## Web-only fallback

If desktop packaging stays blocked, the app runs as a plain web server — Electron only wraps it:

```bash
npm run web    # node web/server.mjs
```

The in-browser Claude-account auth screen lives on this branch (connect + code-paste OAuth).
