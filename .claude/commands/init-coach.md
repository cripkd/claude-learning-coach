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

### Q6 — Domains
> What domains or topic areas does this exam cover? List them with their weights if you know them.
> Example: "D1: Security — 30%, D2: Reliability — 26%, D3: Cost — 20%, D4: Performance — 14%, D5: Operational — 10%"
> If you don't know the weights, just list the domains and I'll distribute evenly.

Store: `DOMAINS[]` — array of `{id, name, weight}`. If weights aren't provided, distribute evenly (100 / n, rounded). If weights don't sum to 100%, warn: "Your domain weights sum to X%, not 100%. I'll proceed — the phase plan will still work, but double-check the official exam blueprint."

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

### Q8 — Study days
> How many total study days do you have available before the exam (or as your initial learning budget)?

Store: `TOTAL_DAYS` (integer).

**If TOTAL_DAYS < 10:** warn: "A compressed schedule of fewer than 10 days may not have room for both the diagnostic and the endgame protocol. I'll create a minimum-viable 2-phase plan. You can re-run /init-coach if your timeline changes."

### Q9 — Source materials
> Do you have study materials ready to add? If yes, tell me the filenames or paths — drop them into `sources/` and I'll reference them. If not, say "later" and I'll set up the structure for you to fill in.

Store: `SOURCES[]` — list of `{path, label, priority}` if provided. If "later", leave `sources/` empty and note it in the setup summary.

### Q10 — Reference resources
> Any specific courses, documentation sites, or community resources to link in daily sessions? (Optional — examples: "official docs at docs.example.com", "Course X on Platform Y")

Store: `REFERENCE_RESOURCES`. Default: `"the official documentation and source materials in sources/"`.

### Q11 — License
> License preference for this repo? Default is MIT. (Enter to accept MIT, or specify another.)

Store: `LICENSE`. Default: `"MIT"`.

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
courses/{COURSE_SLUG}/quizzes/
```

Copy the shared dashboard assets into the course dashboard folder:
- `dashboard/dashboard.css` → `courses/{COURSE_SLUG}/dashboard/dashboard.css`
- `dashboard/dashboard.js` → `courses/{COURSE_SLUG}/dashboard/dashboard.js`

All output files for this course (CLAUDE.md, memory.md, progress.md, state.json, dashboard/index.html, etc.) go inside `courses/{COURSE_SLUG}/`.

---

## Step 3: Generate the phase plan

Use the collected answers to construct a structured phase plan. Apply this algorithm:

**Working days** = `TOTAL_DAYS − 3` (last 3 days are always reserved for the endgame protocol in `docs/ENDGAME.md`)

**If TOTAL_DAYS < 10:** use a 2-phase compressed plan:
- Phase 1: `floor(workingDays * 0.6)` days — all domains, front-loaded by weight
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
| Phase 1 | Core Domains | `ceil(contentDays × 0.55)` | Highest-weight domains |
| Phase 2 | Remaining Domains | `contentDays − P1days` | Remaining domains |

**Domain assignment to phases:**
- Sort domains by weight descending
- Phase 1 covers the top domains by weight until their cumulative weight ≥ 55% of total weight (or top half if weights are equal)
- Phase 2 covers the remaining domains
- If only 1–2 domains exist: Phase 1 covers all domains with more depth; Phase 2 focuses on integration

**Day allocation within Phase 1 and Phase 2:**
- Distribute days among the phase's domains proportionally to their declared weights
- Minimum 1 day per domain
- Each phase ends with 1 phase-exam day (included in the phase day count, not additional)
- If a domain has multiple task statements, spread them across multiple days (1–2 task statements per day)

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
- `courses/{COURSE_SLUG}/quizzes/` — with a `.gitkeep` if empty

---

## Step 6: Write `courses/{COURSE_SLUG}/data/state.json`

Write a fully populated `courses/{COURSE_SLUG}/data/state.json` using the schema in `templates/state-schema.json`. Populate every field from the interview answers and the generated phase plan.

Key field values:

```
schemaVersion: "1.0"
exam.fullName: EXAM_FULL_NAME
exam.shortName: EXAM_SHORT_NAME
exam.date: EXAM_DATE (null if "ongoing")
exam.passMarkPercent: [ask the student if known; default 72 if not provided]
exam.caseMode: CASE_MODE

student.name: STUDENT_NAME
student.learningStyle: LEARNING_STYLE

plan.totalDays: TOTAL_DAYS
plan.startDate: today's date
plan.currentDay: 1
plan.daysRemainingUntilExam: days between today and EXAM_DATE (null if ongoing)

domains[]: one entry per domain from Q6
  id: "D1", "D2", ...
  name: domain name
  weight: declared weight
  taskStatements: [] (empty for now; student fills in or coach populates during sessions)

phases[]: one entry per phase from Step 2
  id: "P1", "P2", "P3", "P4"
  title: phase title
  dayRange: [startDay, endDay]
  days[]: one entry per study day
    day: day number
    date: null (filled in as sessions happen)
    topics: [] (empty; filled in during sessions)
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
  marginOverCutPercent: null
  noiseModelStdDevPercent: 7
  passProbabilityRoughEstimate: null
  summary: ""

lastUpdated: today's date + "T00:00:00Z"
```

**Exam pass mark:** if the student didn't mention it during Q6 and it's a well-known exam, use the known pass mark. If unknown, default to 72 and add a note: "I've defaulted the pass mark to 72% — update `exam.passMarkPercent` in `data/state.json` if you know the actual value."

---

## Step 7: Regenerate `courses/{COURSE_SLUG}/dashboard/index.html`

1. Read `templates/dashboard-template.html` (repo root)
2. Replace `__STATE_PLACEHOLDER__` with the literal contents of `courses/{COURSE_SLUG}/data/state.json`
3. Write the result to `courses/{COURSE_SLUG}/dashboard/index.html`

Confirm to the student: "Dashboard is ready — open `courses/{COURSE_SLUG}/dashboard/index.html` in your browser to view your starting state."

---

## Step 8: Write the `LICENSE` file (if not present)

If `LICENSE` does not exist in the project root, write an MIT license file with:
- Year: current year
- Copyright holder: the student's name if provided (STUDENT_NAME), otherwise leave as `[Your Name]`

If the student chose a different license in Q11, note: "I've left the LICENSE file for you to fill in — MIT is the template default but you chose [LICENSE]."

---

## Step 9: Closing summary

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

Next steps:
1. Drop your study materials into courses/[COURSE_SLUG]/sources/ and fill in SOURCES.md
2. Say "run diagnostic" to take the pre-study assessment before Day 1
3. After the diagnostic, open the dashboard to see your domain starting map
4. When ready, say "let's go" or "Day 1" to start

[If sources were not provided:] I've left sources/ empty — add your materials before running the diagnostic.
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

**Domain weights don't sum to 100%:**
- Proceed with the declared weights (proportional allocation still works)
- Note in the summary: "Domain weights sum to [X]% — phase allocation is proportional to declared weights. Update data/state.json if you get the official breakdown."

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
