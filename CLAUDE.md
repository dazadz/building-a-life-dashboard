# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Samuel**: a local personal performance dashboard with Claude Code as its AI coach, built from the "LIFE OS PRIME" prompt. The build plan, architecture and milestones are in `docs/PLAN.md`; follow it. The stack is React + TypeScript + Vite, FastAPI and SQLite. The walking skeleton is built: Home, daily check-in and Coach. The app runs on the PC first; phone work comes later.

Privacy is a hard requirement. This repo is public and the author uses the app daily, so personal data must never enter the repo:
- The database lives in `~/.samuel/`, outside the repo.
- Only the `samuel` command may open `~/.samuel`. Scripts, tests and one-off checks must set `SAMUEL_DATA_DIR` to another folder, or `db.data_dir()` refuses to run.
- Screenshots, tests, fixtures and designs use only the fake demo persona, never the author's real name.
- Never write absolute local paths (e.g. `C:\Users\...`) into tracked files. Use `~` or paths relative to the repo.
- Commits use the GitHub noreply email (set in this repo's git config), never a personal address.
- A pre-commit hook (`scripts/privacy-check.sh`) blocks data files, secrets, local paths, personal email addresses, and private words listed in `.git/info/private-words`. Turn it on once per clone with `git config core.hooksPath scripts/hooks`. Never bypass it with `--no-verify`.
- Follow the `security-privacy-review` skill before commits, pushes and anything that stores or sends personal data.

## Commands

Backend (`backend/`, Python 3.11+, virtualenv in `backend/.venv`):
- Set up: `python -m venv .venv` then `.venv/Scripts/python -m pip install -e ".[dev]"` (Windows path; `.venv/bin` elsewhere)
- Test: `.venv/Scripts/python -m pytest -q`
- Run the app: `samuel serve` (http://127.0.0.1:8765, serves `frontend/dist` once built), or `samuel app` to open it in an Edge app window (starts the server if needed and stops it a few minutes after the window stops checking in; `--shortcut` makes desktop and Start menu shortcuts that carry the window's taskbar ID, so pinning works)
- Demo data: `SAMUEL_DATA_DIR=<some temp folder> samuel demo`. Always use a temp data dir for demos and screenshots, never `~/.samuel`.
- Coach CLI: `samuel export --since 7d`, `samuel report add --kind daily --file -`, `samuel scores`, `samuel backup`

Frontend (`frontend/`, Node 22):
- `npm install`, then `npm run dev` (port 5173, proxies `/api` to 8765), `npm test`, `npm run lint`, `npm run build`

Coach: skills live in `.claude/skills/` (`daily-report`, `onboard-insights`, `weekly-review`, `monthly-evolution`, `plan-builder` (run as `/plan-builder` or `/plan-builder goal <id>`), and `ask` for chat, run as `/ask <chat id>`). The onboarding questions live in `backend/samuel/profile.py`; sensitive answers only reach Claude via `samuel export --sensitive` (onboarding insights and the plan builder). The backend runs `claude -p "/daily-report" --tools Bash --setting-sources project --strict-mcp-config --allowedTools "Bash(samuel export *)" "Bash(samuel report add *)" "Bash(samuel suggest add *)"` from the repo root, with `SAMUEL_COACH=1` so the CLI refuses full exports (`--all/--out/--force`) and reading report files. `samuel suggest add` only adds suggestions the user accepts or dismisses in the app; it never changes their data (ADR 0004). Keep coach runs this narrow: check-in text reaches Claude and must not be able to steer it into copying data.

Scores follow `docs/scores.md` exactly. Change the doc first, then `backend/samuel/scores.py` and its tests.

## Git workflow

As you work, commit to Git and push to GitHub regularly, so there is always a saved version to revert to. The full process is under Process in `docs/PLAN.md`.

- **Branches:** `main` is protected, so nothing can be pushed to it directly, admins included.
  - Create a feature branch per GitHub issue (`feat/…`, `fix/…`, `docs/…`) and open a pull request.
  - The four CI checks must pass and the branch must be up to date with `main`. No review approval is needed.
  - Merge with squash (the only merge type allowed). The branch is deleted after merging.
- Commit after each logical change; don't batch unrelated work into one commit.
- Write clean commit messages: an imperative subject of 72 characters or fewer (e.g. "Add task snooze buttons"), then a short body explaining why when it isn't obvious.
- Never commit secrets, `.env` files, local database files or `*.local.json` settings (`.gitignore` covers these).
- Undo published work with `git revert`, not by rewriting pushed history.
- Each release gets a semantic version tag and a `CHANGELOG.md` entry. Each key decision gets a short ADR in `docs/adr/`.

## Design

`design/*.dc.html` and `design/canvas.json` are the source of the design canvas at https://claude.ai/artifact/1DUdad1m3RYN15j932Dagj (Onboarding, Home with Needs a reply, Check-in, Habits, Health & energy, Goals, Weekly and Monthly reviews, Coach, Tasks, Ctrl+K palette, Settings → Appearance, and the v0.5 row: Home with your plan, About me, Routine, Samuel's plan with the project breakdown, and block reminders). Keep the files and the canvas in sync when designs change, and build the app to match them.

Design rules:
- Tech style (since 2026-10-24, this overrides the canvas's colours and fonts; the canvas still defines layout): a pure black page and sidebar (#000000, the user's choice) with cards a hair above it (card #0A0D12, border #1B222D) and one electric cyan accent (default #22E0E6). Status colours: green #5BE38A, amber #FFC24D, blue #5CB8FF. Every text colour passes WCAG AA on every surface.
- Mission control details (since 2026-10-24): Michroma for uppercase headings (wide, smooth and techy; one weight, so never fake a bold), Inter for body text, JetBrains Mono for numbers, times, and small uppercase labels, all bundled locally. Sharp 2px corners, thin 1px borders, accent corner brackets on cards, segmented LED-style meters, a soft accent glow on active items, and a soft accent glow under headings, labels and key numbers (a text-shadow). No background grid. Settings sits at the bottom-left of the sidebar.
- Settings → Text size zooms the whole UI via `--ui-scale` (default 110%); full-height layouts divide `100vh` by it.
- Users can re-theme from any accent (Settings → Appearance; `frontend/src/theme.ts` computes the variables, and with no saved theme the defaults in `index.css` apply), so build every colour from CSS variables and never hard-code the hex values in components.
- Every card prompts an action and ends with a "→" link.
- Dense lists of 5–10 rows with "Show more", filter pills, sortable headers, and visible labels.
- No hero KPI cards, emoji, gradients, glass effects, nested cards, or pure white. Pure black is used only for the page and sidebar background. Glow is a box-shadow on active items, never a gradient fill.
