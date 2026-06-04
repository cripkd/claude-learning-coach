# Exam Coach + ML Projects — Multi-Workspace Dispatcher

This repo contains two kinds of workspaces:
- **Courses** — exam/learning preparation workspaces under `courses/`
- **Projects** — long-running personal/professional build projects under `projects/`

## Session start protocol

1. List the contents of both `courses/` and `projects/` directories
2. **Single workspace found across both:** confirm with the student — "Working on [name] — ready to go?" — and proceed
3. **Multiple workspaces found:** ask "Which workspace are you working on today?" and list them prefixed by type (e.g., `course: saa-c03`, `course: mlops`, `project: mlops-build-along`)
4. **Nothing set up:** tell the student: "Nothing set up yet. Run `/init-coach` to create a course."
5. Once selected: read the workspace's `CLAUDE.md` (`courses/{slug}/CLAUDE.md` or `projects/{slug}/CLAUDE.md`) and follow it for the rest of the session

## That's it

This file is intentionally minimal. All workspace behavior, session protocol, and file-writing rules live in the per-workspace `CLAUDE.md`.
