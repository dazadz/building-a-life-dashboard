# Samuel: build plan

## Context
The user pasted the Reddit "Samuel / LIFE OS PRIME" prompt, which is the main spec. It describes:
- step-by-step onboarding across 4 sections: life structure, daily routine, health and energy, goals
- a habit tracker with 10 default habits
- scores and analytics
- daily check-ins, weekly reviews and monthly reviews
- a personalised coach that never gives generic advice

It was written as a chatbot persona, so here it becomes an app.

Decisions from the user:
- **Name:** the app is called Samuel, and so is its AI coach.
- **Coach:** Claude Code, not the API. Anyone can clone the public repo (`dazadz/building-a-life-dashboard`, already set up with the PolyForm NC licence) and run it on their own machine with their own Claude Code subscription.
- **Hosting:** the app runs locally, and its owner can reach it from their phone. There is no shared server.
- **Privacy:** no one's data may leak. That includes the author's, who uses the same public repo every day.
- **Stack:** React + TypeScript + Vite on the frontend, FastAPI on the backend, SQLite in WAL mode for storage. This is eleanorkonik's stack.

Design sources to build on:
- The canvas https://claude.ai/artifact/1DUdad1m3RYN15j932Dagj, saved as `design/*.dc.html` in the repo.
- From eleanorkonik: dense lists, upserts that never overwrite real data with zero, a refresh action per card, and no AI-slop patterns.
- From romanrostislavovich: morning digest, reminders with Done / +1 hour / Tomorrow, the weekly review with AI questions, a needs-setup line in place of empty cards, and Ctrl+K search.

## Architecture
```
backend/   FastAPI app + `samuel` CLI (python -m samuel), SQLite via stdlib sqlite3, pytest
frontend/  React/TS/Vite, PWA manifest, vitest
.claude/skills/  coach skills that Claude Code runs
design/    canvas source (kept in sync)
```

**Data:**
- Database location: `~/.samuel/samuel.db`, outside the repo (overridable with `SAMUEL_DATA_DIR`). Personal data then can't be committed by accident. `.gitignore` already excludes `*.db` as a second guard.
- Tables:
  - `profile_answers`: onboarding answers per section and question.
  - `checkins`: the prompt's 12 daily questions.
  - `habits` and `habit_logs`: the 10 default trackers, editable.
  - `goals` and `milestones`, grouped by area: financial, career, fitness, …
  - `tasks` and `reminders`.
  - `routines`: schedule blocks such as morning, deep work and recovery.
  - `scores`: daily values.
  - `reports`: written by the coach. Each has a kind (daily, weekly, monthly, onboarding-section, ask), markdown, and the data it used.

**Scores need no AI:**
- The backend calculates Productivity, Discipline, Energy, Focus, Consistency, Stress index and Balance with plain rules from check-ins and habit logs.
- Missing data stays null and is never counted as 0.
- The UI shows numbers even before any coach run.

**Coach = Claude Code:**
- **CLI:** `samuel export --since 7d` prints JSON. `samuel report add --kind weekly --file -` stores the result.
- **Skills:** `onboard-insights`, `daily-report`, `weekly-review`, `monthly-evolution` and `ask`.
  - They tell Claude to read through the CLI, analyse, and write back a report with scores, bottlenecks, burnout risks, time leaks and a plan for tomorrow.
  - The Samuel persona rules from the prompt live in the skills: personalised, never generic, dashboard formatting.
- **In-app trigger:** a "Generate report" button or "Ask Samuel" box calls `POST /coach/run`.
  - The backend runs `claude -p "/weekly-review"` as a subprocess, using the user's logged-in Claude Code.
  - Tools are limited to the `samuel` CLI (`--allowedTools "Bash(samuel *)"`).
  - It runs in the background and the UI polls a job status.
  - This also works from the phone.
  - If `claude` isn't installed, the UI shows the needs-setup line instead.

**Phone access (opt-in, never public):**
- By default the app binds to 127.0.0.1.
- `samuel serve --lan` turns on phone access. It requires a passcode, set at first run and stored as a hash, and issues a session cookie. The README documents Tailscale (`tailscale serve`) as the recommended private HTTPS route.
- On the phone, the app works as a responsive PWA you can add to the home screen.

**Privacy rules (enforced, and written into CLAUDE.md):**
- No analytics, no CDN calls, and fonts are bundled locally.
- The only outbound data is what Claude Code sends to Anthropic under the user's own account. The README states this.
- `samuel demo` seeds a fake persona. Screenshots, tests and CI use only that demo data.
- A pre-commit check rejects `*.db` files, `.samuel/` and files over 1 MB.

## Screens (update the canvas first, then build)
**Existing screens, revised:**
- Rename to Samuel.
- Remove "Needs a reply" because there's no email integration.
- Add a compact score strip to Home: Productivity, Discipline, Energy and Focus meters in the header, with no hero KPI cards.

**New screens:**
1. **Onboarding:** 4 sections, one at a time. A stepper with a progress bar. After each section, a scores and insights panel (the rule-based scores immediately, Samuel's insights once a coach run finishes).
2. **Daily check-in:** a 12-question form that takes about 60 seconds, then the daily report and score.
3. **Habits:** the 10 trackers in a grid, with streaks, a consistency %, and failure detection (which habit fails on which weekday).
4. **Health & energy:** a sleep and energy trend chart, a burnout risk meter and a recovery score.
5. **Goals:** areas leading to goals and milestones, a priority matrix and a roadmap timeline.
6. **Reviews:** Weekly (the existing design, reworked around the prompt's weekly items) and Monthly evolution.
7. **Coach:** the report feed and Ask Samuel.

**Kept:** Tasks with reminders, and the Ctrl+K palette.

**Charts:** follow the dataviz skill with one accent colour, so the prompt's "Unicode bars" become real meters.

## Milestones (each is one or more commits pushed to origin main)
1. **Designs:** update the canvas and `design/` with the new screens above.
2. **Scaffold:**
   - backend and frontend skeletons
   - `samuel` CLI with `serve`, `demo` and `export`
   - data dir outside the repo
   - pytest and vitest
   - GitHub Actions CI: lint, tests and a build on demo data
   - README quickstart: clone, `uv sync`, `npm i`, `samuel demo`, `samuel serve`
3. **Onboarding:** profile tables, the 4-section flow and rule-based scores.
4. **Daily use:** daily check-in, habits with streaks, and the Today home with the score strip.
5. **Planning:** tasks with reminders, goals with milestones, and routines.
6. **Coach:**
   - the export and report CLI
   - `.claude/skills/*`
   - the `/coach/run` subprocess runner
   - the Coach screen and Ask Samuel
7. **Reviews:** weekly and monthly views, plus charts for health and energy.
8. **Phone access:** `--lan` with a passcode, the PWA manifest, and the Tailscale guide.
9. **CLAUDE.md:** update it with run and test commands, the privacy rules, and the coach architecture.

## Verification
- **Tests:** `pytest` covers scores (nulls aren't treated as 0), the upsert rule, CLI export and import, and the passcode requirement for `--lan`. `npm test` and `npm run build` pass, and CI is green on GitHub.
- **Fresh-clone test:** clone into a temp dir, then run `samuel demo` and `samuel serve`. Check that every screen renders with the demo data and that no `*.db` file appears inside the repo (`git status` stays clean).
- **Coach:** run `claude -p "/daily-report"` in the repo and check that the report appears on the Coach screen. Do the same through the in-app button.
- **Phone:** run `samuel serve --lan` and open the app on a phone through Tailscale. Check that a passcode is required and that it can be added to the home screen.
- **Privacy:** watch the browser network tab during use and check that there are no external requests.
