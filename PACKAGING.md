# Desktop Packaging (Electron)

Status: **dev-tested** on branch `packaging-electron`. The Electron wrapper
(`desktop/main.cjs`, wired as `package.json` `main`) wraps the existing web UI
(`web/server.mjs`) and runs. Installers are not built or signed yet — see the
TODO in `desktop/README.md`.

The app bundles Claude Code itself (the Agent SDK ships it as a per-platform
native binary), so a student needs **nothing installed** — only a Claude account
to sign into.

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

Not needed on an unrestricted network — `npm install` completed clean there, and
the notes below went unused. Kept for the corporate machine, where `npm install`
has failed in two stages:

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

## Releasing (tag → CI → GitHub Release)

Releases are cut by pushing a semver tag. `scripts/release.sh` does the bump +
tag + push; `.github/workflows/release.yml` builds the DMG and publishes.

```bash
npm run release patch          # 2.0.1 -> 2.0.2   (also: minor | major | X.Y.Z)
npm run release patch --dry-run   # preview, change nothing
npm run release patch --yes       # skip the confirmation prompt
```

The script requires a clean tree, bumps `package.json`, commits, creates an
annotated `vX.Y.Z` tag, and pushes with `--follow-tags`. Pushing the tag fires
the workflow, which:

1. builds the **arm64** DMG on `macos-14` (`npm ci` there pulls the matching
   per-platform claude binary), and
2. publishes a GitHub Release with the DMG attached, generated notes, and the
   Gatekeeper `xattr` instructions.

**arm64-only for now.** The Intel (`macos-13`) runner queues indefinitely —
GitHub is retiring the Intel image — so the x64 job is commented out in the
workflow. Re-enable by uncommenting the matrix block; each arch must build on
its own host so `npm ci` bundles the right claude binary (a cross-arch build
would ship the wrong one). Intel users run from source (`npm run desktop`).

**The workflow must exist at the tagged commit** — GitHub reads a tag's workflow
from that tag's tree. Tag from a branch that has `release.yml`.

Builds are **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY: false`). Signing +
notarization secrets slot in here when ready — see the TODO in `desktop/README.md`.

## Web-only fallback

The app runs as a plain web server — Electron only wraps it:

```bash
npm run web    # node web/server.mjs
```

This path also uses the bundled claude binary, so it needs no system install
either. The in-browser Claude-account auth screen lives on this branch (connect
+ code-paste OAuth).

## Storage layout

Three roots, resolved in `scripts/_roots.mjs`. A repo checkout collapses all
three onto the checkout, so running from source is unchanged; a packaged build
puts the student's work in `userData` so it survives app updates. Details and
rationale in `desktop/README.md`.

Override either root to relocate data without a rebuild:

```bash
COACH_DATA_ROOT=/path/to/workspace COACH_CACHE_ROOT=/path/to/cache npm run desktop
```
