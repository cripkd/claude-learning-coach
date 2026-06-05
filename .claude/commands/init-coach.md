# /init-coach — Interactive Setup

Set up this repo as a personalized study coach for a specific exam or learning goal. When this command is invoked, execute every step in order. Do not skip steps. Do not ask for permission between steps once the interview is complete — execute the full setup and report what you did.

---

## Step 0: Idempotency check

Before asking any questions, list the `courses/` directory. Each subfolder is an existing course (its name is the course slug).

**If a matching course already exists** (you can determine "matching" after Q1 gives you the exam short name to derive the slug):
Ask: "A course for [name] already exists at `courses/{slug}/`. What would you like to do?"
- `"reconfigure"` — re-run the full interview; regenerate `courses/{slug}/CLAUDE.md`, starter files, `data/state.json`, and `dashboard/index.html` for that course. Preserve existing `memory.md`, `misses.md`, `DIAGNOSTIC.md`, `CALIBRATION.md`, and `quizzes/` — these contain live session data.
- `"update fields"` — ask which fields to change; update only those and regenerate state + dashboard
- `"cancel"` — abort with no changes

**If no courses exist yet, or this is a new course slug:** proceed to Step 1.

**Note:** the root `CLAUDE.md` is the multi-course dispatcher and is never overwritten by `/init-coach` — it ships with the repo and is static.

---

## Step 1: Interview

Ask the following questions. You may ask 2–3 at a time to reduce back-and-forth, but do not ask all 10 at once — the student needs to think through each one. Collect all answers before proceeding to Step 2.

### Q1 — Exam name
> What exam or certification are you preparing for? Give me the full name and a short abbreviation.
> Example: "AWS Solutions Architect Associate (SAA-C03)" or "California Bar Exam (CA Bar)".

Store: `EXAM_FULL_NAME`, `EXAM_SHORT_NAME`.

### Q2 — Exam date
> What is your exam date? (YYYY-MM-DD format, or "ongoing" if this isn't date-bound.)

Store: `EXAM_DATE`. If "ongoing", set `daysRemainingUntilExam = null` in state.json.

### Q3 — Student name
> What's your name? (Optional — used in the coach's tone. Press Enter to skip and use "the student".)

Store: `STUDENT_NAME`. Default: `"the student"`.

### Q4 — Background
> In 1–3 sentences: what's your relevant background for this topic? Include your role, prior experience with the subject, and any known weak areas.

Store: `STUDENT_BACKGROUND`.

### Q5 — Learning style
> How do you learn best? Choose one or describe your own:
> - Scenarios and hands-on exercises
> - Concept-first, then drilling
> - Heavy drilling from day one
> - Mixed (concepts + immediate application)

Store: `LEARNING_STYLE`.

### Q6 — Domains and blueprint
> What domains or topic areas does this exam cover? Three ways to answer:
> - **With weights** — `"D1: Security — 30%, D2: Reliability — 26%, D3: Cost — 20%, D4: Performance — 14%, D5: Operational — 10%"`. The phase plan front-loads by weight, then is re-ordered by the diagnostic.
> - **Without weights** — just list the domains. The plan allocates days equally and is ordered (initially) in your listed order, then re-ordered by the diagnostic to put weaker domains first.
> - **No published blueprint** — say `"no blueprint"` or `"I don't know"`. The plan starts flat (no domain breakdown); domains and topics emerge from the diagnostic and early sessions.

Store: `BLUEPRINT_MODE`, `DOMAINS[]`.

- If the student provided weights → `BLUEPRINT_MODE = "weighted"`. `DOMAINS[]` keeps the declared weights. If weights don't sum to 100%, warn: "Your domain weights sum to X%, not 100%. I'll proceed — the phase plan will still work, but double-check the official exam blueprint."
- If the student listed domains without weights → `BLUEPRINT_MODE = "unweighted"`. `DOMAINS[]` assigns each domain `weight = round(100 / n)` (equal weight).
- If the student said "no blueprint" or equivalent → `BLUEPRINT_MODE = "none"`. `DOMAINS[] = []`. The phase plan is generic; the diagnostic and the first few sessions will populate domains as topics surface, after which the course behaves like `unweighted`.

### Q6b — Task statements (only ask when needed)

Most exams break each domain into 2–5 *task statements* (e.g., SAA-C03's D1 has "Task 1.1 secure access", "Task 1.2 secure workloads", "Task 1.3 data security controls"). These task statements are what the day-by-day plan covers — and what the dashboard's Domain Coverage card matches days against.

**Decide whether to ask:**

- **Skip Q6b silently** when the exam short name from Q1 is one Claude knows from training data (any widely-published cert: AWS SAA-C03 / DOP-C02 / SAP-C02 / SCS-C02 / MLS-C01 / DVA-C02 / SOA-C02 / CLF-C02 / DEA-C01 / ANS-C01, Azure AZ-104 / AZ-204 / AZ-305 / AZ-400 / AZ-500 / AZ-700 / AZ-900, GCP ACE / PCA / PDE / PCSE / PCNE, CKA / CKAD / CKS, Anthropic Claude API certs, etc.). Use Claude's knowledge of the official exam guide to populate `taskStatements` later in Step 6 — no prompt needed.

- **Ask Q6b** when the exam is non-standard, internal, niche, or Claude is not confident it knows the published task statements verbatim:
  > Do you have the official task-statement breakdown for each domain (the "Task X.Y: …" lines from the exam guide)? Three ways to answer:
  > - **Paste them** — copy the task statements as they appear in the exam guide. I'll format them as `D{n}-T{n}.{n}` IDs and write them to `data/state.json`.
  > - **Skip** — leave task statements empty. The dashboard's Domain Coverage card will show "Task structure not yet populated" until the diagnostic and early sessions populate them. The course still runs; the coverage metric just goes dark until the structure is filled in.
  > - **I don't know** — same as skip.

Store: `TASK_STATEMENTS` as `{domainId: [string, ...]}` if the student pasted them, `null` otherwise. Coach will read this in Step 6.

### Q7 — Case mode
> Does this exam test integrated case reasoning (scenario-based questions that require applying multiple concepts together), or is it primarily recall-based (definitions, formulas, direct knowledge retrieval)?

If **integrated:**
> Do the official source materials list named scenarios/cases (like a scenario library), or does the exam cross-reference multiple topic pools?
> - Named scenarios → exam-defined (you'll paste or describe them next)
> - Cross-pool → pool-derived (you'll declare the pools)

If **exam-defined:** Ask the student to list or paste the named scenarios. Store them as a list for `cases.md`.

If **pool-derived:** Ask: "Describe the two (or more) pools the exam crosses. Example: 'Pool A: use cases (HA, DR, cost, security) × Pool B: architectures (3-tier, serverless, microservices)'."

If **recall:** Note that the case-practice phase will be skipped and those days will extend the drill phase.

Store: `CASE_MODE` = `"exam-defined"` | `"pool-derived"` | `"recall"`. Store pool definitions or scenario list as needed for `cases.md`.

### Q7a — Scoring & question format (optional — defaults cover most cert exams)

Ask only if there's any signal the exam is **not** the default shape (fixed-percent cutoff, 4 options per question, single correct). If the student didn't mention any of these in earlier answers, ask once with this prompt and accept *"default"* as a complete answer:

> A few quick exam-format details (skip with "default" if you're not sure — defaults match AWS / Azure / GCP / Anthropic-style exams):
> - **Scoring:** *fixed percent* (e.g., "you need 72%"), *scaled score* (e.g., "you need 720 of 1000"), or *pass/fail with no published cut*?
> - **Options per question:** 4 (default) or 5?
> - **Any multiple-correct questions?** No (default) — or yes, in which case: all-or-nothing scoring (whole question right) or partial credit?

Parse the answer and store:

- `SCORING_MODEL`: `"fixed_percent"` (default) | `"scaled"` | `"pass_fail_unknown"`
- `SCALE_MIN`, `SCALE_MAX`: numbers from a scaled answer (e.g., `100` and `1000` for AWS); both `null` for the other models. If the student said "scaled" but didn't give the range, ask for it as a follow-up.
- `OPTION_COUNT`: `4` (default) or `5`. Reject anything else; if the student claims another count, warn that it's untested and proceed with 4.
- `MULTIPLE_CORRECT`: `false` (default) | `true`. If `true`, also store `PARTIAL_CREDIT`: `"all_or_nothing"` (default) | `"partial"`.

If the answer was *"default"* (or the student skipped this question), use every default above.

### Q8 — Study days
> How many total study days do you have available before the exam (or as your initial learning budget)?

Store: `TOTAL_DAYS` (integer).

**If TOTAL_DAYS < 10:** warn: "A compressed schedule of fewer than 10 days may not have room for both the diagnostic and the endgame protocol. I'll create a minimum-viable 2-phase plan. You can re-run /init-coach if your timeline changes."

### Q9 — Source materials
> Heads up: your study materials live **inside the course folder I'm about to create** — at `courses/{slug}/sources/` — not at the repo root. The folder doesn't exist yet, so the expected flow is: answer "later" here, I create the folder, then you drop your files in and add entries to `SOURCES.md`. Run the diagnostic after that — the diagnostic is what pulls in your sources to personalize the plan.
>
> If you've already pre-staged files somewhere (e.g., the repo root, the example course's folder), tell me the absolute paths and I'll copy them into `courses/{slug}/sources/` during setup. Otherwise just say "later".

Store: `SOURCES[]` — list of `{path, label, priority}` if provided (treat as paths to copy from). If "later", leave `courses/{slug}/sources/` empty (created in Step 2) and note it in the setup summary.

### Q9a — Question bank (optional)
> Same convention as sources: the bank lives at `courses/{slug}/bank/`, which doesn't exist yet. A bank is **real** practice questions (verbatim from a vendor pack, course-pack questions, an official sample set, or a prior-exam pool) — *not* questions you'd write yourself. The coach draws from the bank during quizzes alongside synthetic generation, and weights bank results 2× synthetic when computing readiness (closer-to-real-exam signal). Format spec: `templates/question-bank.md`.
>
> Expected flow: say "no" here, I create an empty `bank/`, then you drop files in later when you have them. If you've already pre-staged bank files somewhere, give me the absolute paths and I'll copy them in during setup.

Store: `BANK_FILES[]` — list of `{path, label, questionCount, domains, retrievedDate}` if provided. If "no" or omitted, leave `bank/` empty.

The bank is fully **optional**. Absence of bank files = today's behavior (synthetic generation only). Do not prompt the student for a bank if they've already said "no" earlier or if they don't have one ready.

### Q10 — Reference resources
> Any specific courses, documentation sites, or community resources to link in daily sessions? (Optional — examples: "official docs at docs.example.com", "Course X on Platform Y")

Store: `REFERENCE_RESOURCES`. Default: `"the official documentation and source materials in sources/"`.

---

## Step 2: Derive the course slug and create the course folder

**Derive `COURSE_SLUG`** from `EXAM_SHORT_NAME`:
- Lowercase the entire string
- Replace spaces, forward slashes, and dots with hyphens
- Strip any characters that are not alphanumeric or hyphens
- Examples: `"SAA-C03"` → `"saa-c03"` · `"CKA"` → `"cka"` · `"CA Bar"` → `"ca-bar"` · `"DOP-C02"` → `"dop-c02"`

**Create the course directory structure:**
```
courses/{COURSE_SLUG}/
courses/{COURSE_SLUG}/data/
courses/{COURSE_SLUG}/dashboard/
courses/{COURSE_SLUG}/sources/
courses/{COURSE_SLUG}/bank/        ← optional, kept even when empty so the convention is discoverable
courses/{COURSE_SLUG}/quizzes/
```

Copy the shared dashboard assets into the course dashboard folder:
- `dashboard/dashboard.css` → `courses/{COURSE_SLUG}/dashboard/dashboard.css`
- `dashboard/dashboard.js` → `courses/{COURSE_SLUG}/dashboard/dashboard.js`

All output files for this course (CLAUDE.md, memory.md, progress.md, state.json, dashboard/index.html, etc.) go inside `courses/{COURSE_SLUG}/`.

---

## Step 3: Generate the phase plan

Use the collected answers to construct a structured phase plan. The base 4-phase shape and day-count formulas are the same across blueprint modes; what changes is the **domain assignment** and **day-allocation** rules inside Phases 1 and 2.

**Working days** = `TOTAL_DAYS − 3` (last 3 days are always reserved for the endgame protocol in `docs/ENDGAME.md`)

**If TOTAL_DAYS < 10:** use a 2-phase compressed plan:
- Phase 1: `floor(workingDays * 0.6)` days — content (per blueprint-mode rule below)
- Phase 2: `workingDays − Phase1days` days — simulation and drill
- No dedicated case-practice phase; no diagnostic day built in
- Still reserve day 1 for orientation and diagnostic

**Standard plan (TOTAL_DAYS ≥ 10):**

Calculate phase day counts from `workingDays`:

| Phase | Title | Days | Notes |
|---|---|---|---|
| Phase 4 | Simulation & Drill (or Final Drill if recall) | `max(3, ceil(workingDays × 0.15))` | Last phase before endgame |
| Phase 3 | Case Practice (or Extended Drill if recall) | `max(3, ceil(workingDays × 0.20))` | Skip case label if recall |
| Phase 1+2 content | — | `workingDays − P3days − P4days` | Split between Phase 1 and Phase 2 |
| Phase 1 | Core Domains | `ceil(contentDays × 0.55)` | See blueprint-mode rule below |
| Phase 2 | Remaining Domains | `contentDays − P1days` | See blueprint-mode rule below |

**Domain assignment and day allocation — branch on `BLUEPRINT_MODE`:**

**`weighted`** (current behavior — CCA-shaped exams with a published weighted blueprint):
- Sort domains by weight descending.
- Phase 1 covers the top domains by weight until their cumulative weight ≥ 55% of total weight (or top half if weights are equal).
- Phase 2 covers the remaining domains.
- Distribute days inside each phase **proportionally to declared weights**, minimum 1 day per domain.
- Phase titles use the names of the dominant domain(s) covered.

**`unweighted`** (domains listed but no published weights):
- Keep domains in declared order.
- Phase 1 covers the first `ceil(n/2)` domains; Phase 2 covers the rest.
- Distribute days inside each phase **equally** across that phase's domains, minimum 1 day per domain.
- Phase titles use the names of the domains covered (e.g., "Phase 1: D1 + D2 + D3").
- The diagnostic will re-order domains so the weakest are front-loaded — see "Post-diagnostic rebalancing" below.

**`none`** (no published blueprint — domains and topics emerge later):
- `DOMAINS[]` is empty. No per-domain front-loading.
- Phase 1 = "Foundations" (broad coverage). Phase 2 = "Building". Phase 3/4 unchanged.
- Days inside Phase 1 and Phase 2 carry generic placeholders (`topics: []`, `notes: "TBD by diagnostic and early sessions"`).
- The diagnostic creates the initial domain/topic structure; the coach populates `domains[]` and `days[].topics` during the first sessions. After the diagnostic, the course behaves as `unweighted`.

**Shared (all modes):**
- Each phase ends with 1 phase-exam day (included in the phase day count, not additional).
- If a domain has multiple task statements, spread them across multiple days (1–2 task statements per day).
- The 1–2 domain edge case still applies for `weighted` and `unweighted`: if only 1–2 domains exist, Phase 1 covers all domains with more depth and Phase 2 focuses on integration.

**Post-diagnostic rebalancing (referenced here, executed by the coach after the diagnostic runs):**
- `weighted`: the diagnostic may swap which phase a weak domain lands in, but day counts stay proportional to declared weights.
- `unweighted`: the diagnostic re-orders domains by score ascending (weakest first), then re-splits across phases. Day counts stay equal.
- `none`: the diagnostic populates `domains[]`; after it does, the course follows the `unweighted` rebalancing rule.

**Phase titles:**
- Phase 1: use the name of the primary domain(s) covered, e.g., "Phase 1: Core Architecture & Security"
- Phase 2: similar
- Phase 3: "Case Practice" (integrated) or "Extended Drill" (recall)
- Phase 4: "Simulation & Endgame Prep"

**Output:** produce a markdown table for `{{PHASE_PLAN_TABLE}}`:

```markdown
| Phase | Days | Focus | Phase Exam |
|---|---|---|---|
| Phase 1: [title] | Days 1–N | [Domain list] | Day N |
| Phase 2: [title] | Days N+1–M | [Domain list] | Day M |
| Phase 3: [title] | Days M+1–P | [Focus] | Day P |
| Phase 4: [title] | Days P+1–Q | Simulation, watchlist drill, cold-water calibration | Day Q |
| Endgame | Days Q+1–TOTAL | Watchlist only, rest day, exam day | — |

**Diagnostic:** Run before Day 1 to confirm this allocation. Weak domains get more days; strong ones get fewer.
```

Also produce the full day-by-day breakdown for `progress.md` (one row per day) and for `data/state.json` (one object per day in `phases[].days[]`).

---

## Step 4: Write `courses/{COURSE_SLUG}/CLAUDE.md`

1. Read `CLAUDE.md.template`
2. Replace every `{{PLACEHOLDER}}` with the corresponding interview answer:

| Placeholder | Value |
|---|---|
| `{{COACH_TITLE}}` | `"[EXAM_SHORT_NAME] Exam Coach"` |
| `{{COURSE_SLUG}}` | `COURSE_SLUG` (derived in Step 2) |
| `{{TOTAL_DAYS}}` | `TOTAL_DAYS` |
| `{{STUDENT_NAME}}` | `STUDENT_NAME` |
| `{{EXAM_FULL_NAME}}` | `EXAM_FULL_NAME` |
| `{{EXAM_SHORT_NAME}}` | `EXAM_SHORT_NAME` |
| `{{EXAM_DATE}}` | `EXAM_DATE` |
| `{{STUDENT_BACKGROUND}}` | `STUDENT_BACKGROUND` |
| `{{LEARNING_STYLE}}` | `LEARNING_STYLE` |
| `{{PHASE_PLAN_TABLE}}` | The generated phase plan markdown from Step 3 |
| `{{REFERENCE_RESOURCES}}` | `REFERENCE_RESOURCES` |

3. Write the result to `courses/{COURSE_SLUG}/CLAUDE.md`.

---

## Step 5: Copy and fill starter files

For each file in `starter-files/`, copy it to `courses/{COURSE_SLUG}/` and substitute placeholders. If the destination file already exists and this is a reconfigure, overwrite it (except `memory.md`, `misses.md`, `DIAGNOSTIC.md`, `CALIBRATION.md`, `quizzes/` — preserve these if they contain session data).

**Files to copy and their placeholder substitutions:**

**`starter-files/memory.md` → `memory.md`**
- Replace `{{EXAM_SHORT_NAME}}`

**`starter-files/progress.md` → `progress.md`**
- Replace `{{EXAM_SHORT_NAME}}`, `{{EXAM_DATE}}`, `{{TOTAL_DAYS}}`
- Replace `{{START_DATE}}` with today's date (YYYY-MM-DD)
- Replace the phase section placeholders with the generated phase plan from Step 2 — a full table with one row per study day, all statuses set to `⬜ Pending`, all scores `—`
- The `## Overall Readiness` table should have one row per generated phase

**`starter-files/cheatsheet.md` → `cheatsheet.md`**
- Replace `{{EXAM_SHORT_NAME}}`
- Replace `{{DOMAIN_1_NAME}}`, `{{DOMAIN_2_NAME}}` with the actual domain names from Q6
- Generate additional `## Domain N — Name` sections for all domains beyond Domain 2

**`starter-files/misses.md` → `misses.md`**
- Replace `{{DOMAIN_1_NAME}}`, `{{DOMAIN_2_NAME}}` with actual domain names
- Generate additional `## Domain N — Name` sections for all domains beyond Domain 2

**`starter-files/SOURCES.md` → `SOURCES.md`**
- No placeholders to replace
- If the student provided source files in Q9: add entries to the appropriate priority tier sections based on the information provided. If priority wasn't declared per source, ask: "Should I put these under Primary, Secondary, or Tertiary?"
- If the student provided bank files in Q9a: add one entry per file under the **Question Bank** section in the format `- [filename.md](bank/filename.md) — Description, N Qs, domains, retrieved YYYY-MM-DD`. If they didn't provide a bank, leave the section's example comments in place.

**`starter-files/DIAGNOSTIC.md` → `DIAGNOSTIC.md`**
- Replace `{{DIAGNOSTIC_DATE}}` with `"TBD — run 'run diagnostic' to fill in"`
- Replace domain rows in the table with actual domain names from Q6

**`starter-files/CALIBRATION.md` → `CALIBRATION.md`**
- No placeholders to replace

**`starter-files/cases.md` → `cases.md`**
- Replace `{{CASE_MODE}}` with the value from Q7
- Keep only the block matching the declared case mode; delete the other two template blocks
- If exam-defined: populate the case list with the scenarios provided in Q7
- If pool-derived: populate Pool A, Pool B (and additional pools) with the declarations from Q7
- If recall: replace the file body with the recall-only N/A note

**Also ensure these exist** (already created in Step 2):
- `courses/{COURSE_SLUG}/sources/` — with a `.gitkeep` if empty
- `courses/{COURSE_SLUG}/bank/` — with a `.gitkeep` if empty (the convention is discoverable even without files)
- `courses/{COURSE_SLUG}/quizzes/` — with a `.gitkeep` if empty

---

## Step 6: Write `courses/{COURSE_SLUG}/data/state.json`

Write a fully populated `courses/{COURSE_SLUG}/data/state.json` using the schema in `templates/state-schema.json`. Populate every field from the interview answers and the generated phase plan.

Key field values:

```
schemaVersion: "2.3"
exam.fullName: EXAM_FULL_NAME
exam.shortName: EXAM_SHORT_NAME
exam.date: EXAM_DATE (null if "ongoing")
exam.passMarkPercent: [ask the student if known; default 72 if not provided. Must be ≥ 1 — never write 0.72 (use 72).]
exam.caseMode: CASE_MODE

examProfile:
  profile: "mcq"
  scenarioRecallRatio: 1.0 if CASE_MODE in ("exam-defined","pool-derived"); 0.0 if CASE_MODE == "recall"
  blueprint: { mode: BLUEPRINT_MODE }                              # "weighted" | "unweighted" | "none" (from Q6)
  scoring: { model: SCORING_MODEL, scaleMin: SCALE_MIN, scaleMax: SCALE_MAX }   # from Q7a; defaults: fixed_percent / null / null
  questionFormat: { optionCount: OPTION_COUNT, multipleCorrect: MULTIPLE_CORRECT, partialCredit: PARTIAL_CREDIT }
    # from Q7a; defaults: 4 / false / "all_or_nothing"
  adaptive: false

student.name: STUDENT_NAME
student.learningStyle: LEARNING_STYLE

plan.totalDays: TOTAL_DAYS
plan.startDate: today's date
plan.currentDay: 1
plan.daysRemainingUntilExam: days between today and EXAM_DATE (null if ongoing)

domains[]: one entry per domain from Q6 (empty array if BLUEPRINT_MODE = "none")
  id: "D1", "D2", ...
  name: domain name
  weight:
    - weighted   → declared weight (as given in Q6)
    - unweighted → round(100 / n) where n = number of domains (equal across domains)
    - none       → N/A; domains[] is empty until the diagnostic populates it
  taskStatements:
    For known exams (Claude has the published task-statement list in its training data —
    AWS certs like SAA-C03 / DOP-C02 / SAP-C02, Azure AZ-104 / AZ-204, GCP ACE / PCA,
    CKA / CKAD, Anthropic certs, etc.): populate the FULL task-statement list from
    the official exam guide, formatted as "{domain-id}-T{task-num} {task title}".
    Example for SAA-C03 D1: ["D1-T1.1 Design secure access to AWS resources",
    "D1-T1.2 Design secure workloads and applications",
    "D1-T1.3 Determine appropriate data security controls"].

    For unknown exams: if Q6 included an optional follow-up where the student
    pasted task statements, use them verbatim. Otherwise leave taskStatements: []
    — the dashboard's Domain Coverage card will render "Task structure not yet
    populated" until the diagnostic and early sessions fill them in.

    Either way, the strings populated here MUST match every string used in
    phases[].days[].topics — coverage matching is byte-equal string equality.
    See the matching contract in the phases[].days[].topics block below.

phases[]: one entry per phase from Step 2
  id: "P1", "P2", "P3", "P4"
  title: phase title
  dayRange: [startDay, endDay]
  days[]: one entry per study day
    day: day number
    date: null (filled in as sessions happen)
    topics:
      MUST be byte-equal to a string in some domains[].taskStatements (for content
      days), OR the literal "Phase N Exam" (for the phase-exam day). The dashboard's
      Domain Coverage card matches days to domains by string equality; drift breaks
      it silently and the build script will warn on every build until it's fixed.

      When taskStatements were populated (known exam or student-provided):
        Distribute task statements across days within each phase. With weighted
        blueprint, allocate days per domain proportional to weight (as Step 3
        already computed); within each domain's allocation, spread task
        statements roughly evenly. e.g., SAA-C03 Phase 1 (D1 11 days + D2 8 days):
          Days 1–4   topics: ["D1-T1.1 Design secure access to AWS resources"]
          Days 5–8   topics: ["D1-T1.2 Design secure workloads and applications"]
          Days 9–11  topics: ["D1-T1.3 Determine appropriate data security controls"]
          Days 12–15 topics: ["D2-T2.1 Design scalable and loosely coupled architectures"]
          Days 16–19 topics: ["D2-T2.2 Design highly available and/or fault-tolerant architectures"]
          Day 20     topics: ["Phase 1 Exam"]

      When taskStatements were left empty (unknown exam, no student input):
        Leave topics: [] on every content day. The first sessions populate both
        taskStatements and topics together; until then the Domain Coverage card
        renders "Task structure not yet populated" and emits no misleading math.

    status: "pending"
    quizScore: null
    notes: ""
  phaseExam:
    completed: false
    date: null
    score: null
    total: null
    notes: ""

calibration: []
misses: []
watchlist: []

sources:
  primary: [entries from Q9 marked primary, or []]
  secondary: [entries from Q9 marked secondary, or []]
  tertiary: [entries from Q9 marked tertiary, or []]

diagnostic:
  completed: false
  date: null
  perDomain: []

readiness:
  lastUpdated: today's date
  coldWaterEstimatePercent: null
  summary: ""
  # Everything else (margin, stdDev, probability, bias, sampleSize, debiased, band) is
  # recomputed by scripts/build-dashboard.mjs on every build. Initial defaults that the
  # script will overwrite immediately:
  marginOverCutPercent: null
  noiseModelStdDevPercent: 7
  passProbabilityRoughEstimate: null
  biasCorrectionPercent: 0
  sampleSize: 0
  debiasedEstimatePercent: null
  qualitativeBand: null

lastUpdated: today's date + "T00:00:00Z"
```

`schemaVersion` is `"2.3"`.

**Exam pass mark:** if the student didn't mention it during Q6 and it's a well-known exam, use the known pass mark. If unknown, default to 72 and add a note: "I've defaulted the pass mark to 72% — update `exam.passMarkPercent` in `data/state.json` if you know the actual value."

**`examProfile` is an internal contract** — do not surface it to the student during the interview. It is fully derivable from the interview answers (CASE_MODE drives scenarioRecallRatio; everything else defaults to v1-equivalent values: weighted blueprint, fixed-percent scoring, 4 options, single-correct). Later tasks will branch on these fields; for now they just need to be present so the state validates.

---

## Step 7: Build `courses/{COURSE_SLUG}/dashboard/index.html`

Writing `data/state.json` in Step 6 already triggers the PostToolUse hook in `.claude/settings.json`, which rebuilds the dashboard automatically. If the hook did not run (e.g., dispatcher disabled, or you're running a manual setup outside Claude Code), invoke the build script directly:

```
node scripts/build-dashboard.mjs {COURSE_SLUG}
```

The script validates `data/state.json` against `templates/state-schema.json` and refuses to write a partial dashboard on validation failure. If you see a validation error, fix the offending field in `state.json` and re-run.

Confirm to the student: "Dashboard is ready — open `courses/{COURSE_SLUG}/dashboard/index.html` in your browser to view your starting state."

**Prerequisite:** `npm install` has been run at least once in the repo root (installs `ajv` for schema validation). If `node_modules/` is missing, instruct the student to run `npm install` from the repo root before opening the dashboard.

---

## Step 8: Closing summary

Print a concise setup summary:

```
✅ /init-coach complete

Exam:        [EXAM_FULL_NAME] ([EXAM_SHORT_NAME])
Course:      courses/[COURSE_SLUG]/
Date:        [EXAM_DATE]
Total days:  [TOTAL_DAYS] ([workingDays] study days + 3 endgame days)
Domains:     [count] domains
Case mode:   [CASE_MODE]
Dashboard:   courses/[COURSE_SLUG]/dashboard/index.html

Files written:
  courses/[COURSE_SLUG]/CLAUDE.md              ← coach behavior (active)
  courses/[COURSE_SLUG]/memory.md              ← session log (empty, ready)
  courses/[COURSE_SLUG]/progress.md            ← [TOTAL_DAYS]-day plan (all pending)
  courses/[COURSE_SLUG]/cheatsheet.md          ← [count] domain sections (empty, ready)
  courses/[COURSE_SLUG]/misses.md              ← [count] domain sections (empty, ready)
  courses/[COURSE_SLUG]/cases.md               ← [CASE_MODE] case patterns
  courses/[COURSE_SLUG]/SOURCES.md             ← [count] sources declared
  courses/[COURSE_SLUG]/DIAGNOSTIC.md          ← ready to fill
  courses/[COURSE_SLUG]/CALIBRATION.md         ← ready to fill
  courses/[COURSE_SLUG]/data/state.json        ← structured state initialized
  courses/[COURSE_SLUG]/dashboard/index.html   ← dashboard rendered
  courses/[COURSE_SLUG]/bank/                  ← [bank-count] bank files (or empty)

Next steps:
1. Drop your study materials into courses/[COURSE_SLUG]/sources/ and fill in SOURCES.md
2. Run `/index-sources` to build the topic index — maps each task statement to specific file:line ranges in your sources so the coach can find relevant content in seconds instead of re-reading every file each day
3. Say "run diagnostic" to take the pre-study assessment before Day 1
4. After the diagnostic, open the dashboard to see your domain starting map
5. When ready, say "let's go" or "Day 1" to start

[If sources were not provided:] I've left sources/ empty — add your materials, then run `/index-sources` before running the diagnostic. The coach reads the index at the start of every daily session; without it the coach can't ground concept delivery in your declared sources.
[If bank was not provided:] No question bank declared — quizzes will be coach-generated. You can drop a bank into bank/ later (format: templates/question-bank.md); the coach picks it up automatically.
[If pass mark was defaulted:] Double-check exam.passMarkPercent in data/state.json (currently 72%).
[If domain weights were estimated:] Double-check domain weights in data/state.json against the official exam blueprint.
```

---

## Edge case handling

Apply these rules silently (without asking again) when generating the plan:

**Recall-only exam:**
- Set `caseMode = "recall"` in state.json
- Phase 3 title becomes "Extended Drill" instead of "Case Practice"
- `cases.md` gets the N/A recall block
- Mention in the summary: "Case-practice phase replaced with Extended Drill (recall-only exam)."

**Pool-derived cases:**
- Populate `cases.md` with the declared pools and cross-rule
- Mention in the summary: "Question generation will cross [Pool A name] × [Pool B name] at runtime."
- If the student declared only 1 pool, ask: "You'll need at least 2 pools for pool-derived case generation. What's the second dimension?"

**Total days < 10:**
- Use the 2-phase compressed plan described in Step 2
- Warn in the summary: "Compressed schedule — no dedicated case-practice phase. The endgame playbook (docs/ENDGAME.md) still applies for the last 3 days."

**Domain weights don't sum to 100% (weighted mode only):**
- Proceed with the declared weights (proportional allocation still works)
- Note in the summary: "Domain weights sum to [X]% — phase allocation is proportional to declared weights. Update data/state.json if you get the official breakdown."

**Unweighted blueprint:**
- Set `examProfile.blueprint.mode = "unweighted"` and assign each domain `weight = round(100/n)`.
- Note in the summary: "No published weights — domains get equal allocation (`round(100/n)%` each). The diagnostic will re-order the phase plan to front-load your weakest domains."

**No blueprint declared:**
- Set `examProfile.blueprint.mode = "none"` and `domains[] = []`.
- Use the flat-plan variant in Step 3 (Phase 1 "Foundations", Phase 2 "Building"); leave each day's `topics: []` and `notes: "TBD by diagnostic and early sessions"`.
- Note in the summary: "No blueprint declared — domains and topics emerge from the diagnostic and the first few sessions. Once `domains[]` is populated, the course will rebalance like an unweighted blueprint."

**No source materials yet:**
- Leave `sources/` empty; leave `SOURCES.md` with only the format instructions
- In the summary: "No sources declared yet. Add them to sources/ and fill in SOURCES.md before running the diagnostic."

**Exam date in the past:**
- Note: "The exam date [DATE] appears to be in the past. Update exam.date in data/state.json if this is incorrect."
- Proceed normally; `daysRemainingUntilExam` will be negative (the dashboard handles this gracefully).

**Reconfigure (idempotency):**
- Re-run interview from Q1, pre-filling current values as defaults (show the student what's already set)
- After collecting changes, regenerate only the files that need updating
- Preserve existing `memory.md`, `misses.md`, `DIAGNOSTIC.md`, `CALIBRATION.md`, `quizzes/` content — these contain live session data and must not be overwritten on reconfigure
- Do overwrite: `CLAUDE.md`, `progress.md` (structure only — if study has started, merge existing scores into the new structure), `cheatsheet.md` structure, `cases.md`, `data/state.json`, `dashboard/index.html`
