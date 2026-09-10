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
- **Permissions** — a `canUseTool` guard (`makePermissionGuard`) gates every tool so the
  student is never interrupted by approval prompts *and* the agent can't roam: writes are
  scoped to `courses/{slug}/` (any course dir during `__new__` onboarding), reads are
  confined to the repo, and Bash is filtered against a small dangerous-pattern denylist.
  This is a **conservative stub, not a finished policy** — the Bash filter is a denylist;
  convert it to an allowlist and revisit per your threat model before trusting it further.
- **Live dashboard** — the existing `state-write` hook rebuilds `dashboard/index.html`
  on every `state.json` write. The server watches that file and pushes an SSE `reload`
  event; the iframe cache-busts and re-renders. Zero changes to the dashboard pipeline.

## What it reuses unchanged

`CLAUDE.md`, all course prompts, `.claude/settings.json` hooks, `scripts/build-dashboard.mjs`,
`dashboard/*`, `state.json` schema. The web layer adds nothing to the coaching logic — it's
pure transport + presentation.

## Hardening

Done:

- **Binds `127.0.0.1` only** — not reachable off the machine.
- **`canUseTool` guard** — writes scoped to the course dir, reads scoped to the repo,
  Bash denylist. Replaces the earlier blanket `bypassPermissions`.

Still required before any non-local / multi-user deployment:

- Turn the Bash denylist into an allowlist of the coach's known commands.
- Add authentication — the app still assumes a single trusted local user.

## Upgrade path

This is Option A (local web app). Option B wraps the same `server.mjs` in Electron/Tauri
for a clickable install with no visible Node/terminal step.
