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

First run, if the `claude` CLI has never been authenticated, the app shows a
**"Connect your Claude account"** screen instead of the chat. Click *Sign in with
Claude*, complete the sign-in page it opens, and the app unlocks itself once the
CLI reports a valid session. No terminal, no API key. After that the login is
remembered (Keychain) and the screen never reappears — unless the token later
expires, in which case a failed turn re-surfaces it.

Under the hood the screen drives `claude auth login` (subscription) or, via the
secondary link, `claude auth login --console` (API billing). This OAuth flow is
**code-paste**, not a localhost callback: the CLI prints a URL, you authorize in
the browser, the redirect page shows a code, and the screen's input box sends
that code to the login process's stdin (`POST /api/auth/code`). If the CLI ever
uses a self-completing localhost callback instead, the flow still works — the
code box simply goes unused and the app unlocks when sign-in completes. A
copy-paste `claude auth login` terminal fallback + "check again" button cover the
case where the spawned sign-in can't proceed.

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

## Roadmap / TODO

- **Persist the session map across restarts.** `server.mjs` keeps `sessions` (slug →
  Claude session id) in memory only. Restarting the server loses the mapping, so the next
  message starts a fresh Claude session — the coach re-greets and re-reads `memory.md` /
  `progress.md` (no data loss; the course's own files are the durable memory, but the
  in-conversation thread resets). Fix: persist the map to a small JSON file, or recover it
  via the SDK's `listSessions()` matched by `cwd`.
- **Per-course concurrency guard.** Two turns fired at the same course simultaneously would
  both `--resume` the same session id and race on the transcript. A single user typing one
  message at a time never hits this; add a per-slug lock before multiplexing.
- **Migrate the onboarding session to the created slug.** After `/init-coach` creates a
  course, the chat thread still lives under the `__new__` pseudo-session. Reloading and
  picking the course starts a fresh session keyed by the real slug. Optional: hand the
  onboarding session id over to the new slug so the exact thread continues.

## Upgrade path

This is Option A (local web app). Option B wraps the same `server.mjs` in Electron/Tauri
for a clickable install with no visible Node/terminal step.
