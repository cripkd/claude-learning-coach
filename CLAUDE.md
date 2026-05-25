# Exam Coach — Multi-Course Dispatcher

This repo may contain preparation workspaces for one or more exams or learning goals. Each workspace lives in its own subfolder under `courses/`.

## Session start protocol

1. List the contents of the `courses/` directory
2. **One course found:** confirm with the student — "Working on [name] — ready to go?" — and proceed
3. **Multiple courses found:** ask "Which course are you working on today?" and list the options by folder name
4. **No courses found:** tell the student: "No courses set up yet. Run `/init-coach` to create one."
5. Once the course is confirmed: read `courses/{slug}/CLAUDE.md` and follow it for the rest of the session

## That's it

This file is intentionally minimal. All coaching behavior, session protocol, and file-writing rules live in the per-course `CLAUDE.md` under `courses/{slug}/`.
