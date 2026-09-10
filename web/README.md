# Web UI (Option A)

A browser front-end for the coach so a non-technical student never touches a terminal.
It wraps the **same** agent Claude Code runs — same `CLAUDE.md` dispatcher, same tools,
same hooks, same auto-built dashboard. Only the chat transport changes: terminal → browser.

```
┌──────────────┐   POST /api/chat (SSE)   ┌──────────────────────┐
│  browser     │ ───────────────────────▶ │  web/server.mjs      │
│  chat + iframe│ ◀── deltas / reload ──── │  (Agent SDK query()) │
└──────────────┘                          └─────────┬────────────┘
                                                    │ spawns
                                          ┌─────────▼────────────┐
                                          │  claude CLI          │  ← your existing
                                          │  reads CLAUDE.md,     │    subscription login
                                          │  runs hooks, writes   │    (no API key)
                                          │  state.json → builds  │
                                          │  dashboard/index.html │
                                          └──────────────────────┘
```

## Run

```bash
npm install        # once — pulls @anthropic-ai/claude-agent-sdk
npm run web        # then open http://localhost:4173
```

First run may prompt a one-time `claude` login if you've never authenticated the CLI.
After that the web UI reuses that session — no API key, no re-login.

## How it works

- **Auth** — the Agent SDK spawns the installed `claude` binary, which inherits your
  Claude subscription login. Nothing new for the student.
- **One session per course** — `server.mjs` keeps a resumable SDK `session_id` per slug,
  so the coach retains context across turns just like a terminal session.
- **Permissions** — runs `permissionMode: 'bypassPermissions'` so the student is never
  interrupted by approval prompts. This is a **local, single-user** tool; the agent's
  `cwd` is the repo root and the coach only writes within `courses/{slug}/`. Do not
  expose this server to a network you don't trust. See "Hardening" below.
- **Live dashboard** — the existing `state-write` hook rebuilds `dashboard/index.html`
  on every `state.json` write. The server watches that file and pushes an SSE `reload`
  event; the iframe cache-busts and re-renders. Zero changes to the dashboard pipeline.

## What it reuses unchanged

`CLAUDE.md`, all course prompts, `.claude/settings.json` hooks, `scripts/build-dashboard.mjs`,
`dashboard/*`, `state.json` schema. The web layer adds nothing to the coaching logic — it's
pure transport + presentation.

## Hardening (before any non-local deployment)

- Bind to `127.0.0.1` only (default is all interfaces via `createServer`).
- Replace `bypassPermissions` with a `canUseTool` callback that allowlists Read/Write/Edit/Bash
  scoped to the selected course dir.
- Add auth (the app assumes a single trusted local user today).

## Upgrade path

This is Option A (local web app). Option B wraps the same `server.mjs` in Electron/Tauri
for a clickable install with no visible Node/terminal step.
