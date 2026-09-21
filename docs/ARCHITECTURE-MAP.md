# Architecture Map — UX to Components

High-level map of how user actions flow through skills, node scripts, hooks, and files.
Behind-the-scenes at a module/concept level, not line-level.

```mermaid
flowchart TB
  %% ---------------- USER ACTIONS ----------------
  subgraph UX["👤 User actions"]
    A1["/init-coach"]
    A2["drop files in sources/<br/>+ edit SOURCES.md"]
    A3["/index-sources"]
    A4["npm run setup:retrieval<br/>npm run embeddings:build"]
    A5["'run diagnostic'"]
    A6["'let's go' / 'Day N'"]
    A7["open dashboard /<br/>npm run web / npm run desktop"]
  end

  %% ---------------- TRANSPORT ----------------
  subgraph T["🖥 Transport (same coach underneath)"]
    T1["terminal: claude CLI"]
    T2["web/server.mjs (npm run web)"]
    T3["desktop/main.cjs — Electron<br/>forks server.mjs"]
  end
  T3 --> T2

  %% ---------------- SKILLS / COACH ----------------
  subgraph S["🧠 Skills & coach behavior (LLM-driven)"]
    S1["init-coach skill"]
    S2["index-sources skill"]
    S3["coach: diagnostic flow"]
    S4["coach: daily session<br/>(deliver → quiz → record)"]
  end

  %% ---------------- NODE SCRIPTS ----------------
  subgraph N["⚙️ Node scripts (deterministic)"]
    N1["build-dashboard.mjs<br/>migrate→validate→render"]
    N2["build-embeddings.mjs<br/>(+ _embed-utils)"]
    N3["retrieve.mjs<br/>vector query"]
    N4["check-day-readiness.mjs<br/>coverage of required reads"]
  end

  %% ---------------- HOOKS ----------------
  subgraph H["🪝 Hooks (.claude/settings.json — event-fired)"]
    H1["PostToolUse: state-write-hook<br/>(on state.json write)"]
    H2["PostToolUse: embeddings-write-hook<br/>(on sources/ or bank/ write)"]
    H3["Stop: day-delivery-gate<br/>(blocks turn-end)"]
  end

  %% ---------------- FILES / STATE ----------------
  subgraph F["📁 Files & state"]
    F1["starter-files/ → course scaffold"]
    F2["SOURCES.md (priority ranking)"]
    F3["sources/ + bank/ (materials)"]
    F4["sources/_index.md (topic→file:line)"]
    F5["data/embeddings.ndjson (vectors)"]
    F6["DIAGNOSTIC.md"]
    F7["memory.md / progress.md / misses.md<br/>cheatsheet.md / cases.md / CALIBRATION.md / quizzes/"]
    F8["data/state.json ⭐ canonical"]
    F9["dashboard/index.html (build artifact)"]
  end

  %% ---------------- WIRING ----------------
  A1 --> S1
  A3 --> S2
  A5 --> S3
  A6 --> S4
  A2 --> F3 & F2
  A4 --> N2

  T1 & T2 --> S1 & S2 & S3 & S4

  S1 --> F1 --> F7
  S1 --> F2
  S1 --> F8
  S2 --> F4
  N2 --> F5

  %% retrieval feeds source-reading flows
  S3 -. reads via .-> N3
  S4 -. reads via .-> N3
  N3 --- F5
  S3 -. or reads .-> F4
  S4 -. or reads .-> F4
  S3 --> F6
  S3 --> F8
  S4 --> F7
  S4 --> F8

  %% hooks fire on writes
  F8 -->|write triggers| H1 --> N1 --> F9
  F3 -->|write triggers| H2 --> N2
  S4 -->|turn-end| H3 --> N4
  H3 -. reads .-> F4

  %% surfaced output
  F9 --> A7
  A7 --> T1 & T2 & T3

  classDef user fill:#1e3a5f,stroke:#4a90d9,color:#fff
  classDef script fill:#3d2b1f,stroke:#c77,color:#fff
  classDef hook fill:#3a1f3a,stroke:#c7c,color:#fff
  classDef file fill:#1f3a2b,stroke:#7c9,color:#fff
  class A1,A2,A3,A4,A5,A6,A7 user
  class N1,N2,N3,N4 script
  class H1,H2,H3 hook
  class F1,F2,F3,F4,F5,F6,F7,F8,F9 file
```

## How to read it

- **Blue = what the user does.** Everything starts here.
- **Green = files** (the real source of truth; `state.json` ⭐ is canonical).
- **Brown = node scripts** (deterministic — no LLM; pure compute).
- **Purple = hooks** (fire automatically on file writes / turn-end; the "enforcement" layer).
- **Skills & coach = LLM-driven** (judgment, teaching, writing files).

## Three things the diagram makes visible

1. **The LLM only writes raw inputs; scripts compute the numbers.** Coach writes `state.json`; a hook fires `build-dashboard.mjs` to recompute readiness + render HTML. Coach never hand-builds the dashboard.
2. **Rules are enforced mechanically, not trusted.** The `Stop` hook (`day-delivery-gate`) refuses to end a turn until `check-day-readiness` confirms the required sources were actually read.
3. **Transport is swappable, coach is the same.** Terminal, web, and desktop all drive the identical skills/scripts/hooks/files underneath — Electron just forks the web server.
