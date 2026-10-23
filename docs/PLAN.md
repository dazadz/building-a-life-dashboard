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

Decisions from the plan review (2026-10-24):
- **v1 scope:** the core loop (short onboarding, daily check-in, habits, Home, Samuel's daily report) plus goals and the weekly review. Health, monthly evolution, tasks, theming, email and calendar come in later releases.
- **Mobile:** PC first (decided 2026-10-24). Phone-width (390px) layouts and phone access come after the desktop app works.
- **Check-in:** all 12 questions every day, as the prompt specifies. To keep it fast:
  - pre-fill from yesterday
  - tick habits automatically from the answers
- **Notifications:** standard web push with generic text only (e.g. "Time for your check-in"). No personal data goes through Apple or Google.
- **Calendar:** later and optional. It will be a read-only Google or Outlook link, like email; v1 builds "Today's plan" from routine blocks.
- **Demo persona:** designs, screenshots and demo data use a made-up person, never the author's real name.
- **Process:** a full professional GitHub workflow (see Process below).

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
- Each formula is written down in `docs/scores.md` before it is coded. "How scores work" shows the same text, so every score can be explained.

**Data safety:**
- Schema changes use versioned migrations from day one.
- `samuel backup` writes a dated copy of the database, and `samuel export` and `samuel import` move all data as JSON.
- A backup is taken automatically before every migration.

**Wellbeing:**
- Samuel is a coach, not a clinician. Onboarding and the Health screen say "not medical advice".
- Answers about mental health and medical limitations are stored only locally, and are sent to Claude only when a report needs them.
- If answers suggest serious distress, Samuel gently points to professional support instead of optimising further.

**Untrusted input:**
- Email subjects and free text are passed to Claude as quoted data, never as instructions.
- Coach runs have read-and-report tools only.

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

**Email, optional ("Needs a reply"):**
- Connect Gmail or Outlook in Settings, using OAuth on the user's own machine (or IMAP with an app password).
- Access is read-only. Only the sender, subject, thread age and replied state are stored. Message bodies are never stored.
- Tokens go in the OS keychain (`keyring`), never in the database or repo.
- "Needs a reply" uses plain rules: threads from real people where you haven't replied yet, oldest first. Claude Code is used only if the user asks.
- With no email connected, the card shows the needs-setup line.

**Phone access (opt-in, never public):**
- By default the app binds to 127.0.0.1.
- **Tailscale is the main route.** `tailscale serve` gives private HTTPS. Phones can only install the PWA and receive push notifications over HTTPS, so plain-HTTP LAN access can't do either.
- A passcode is still required for any non-localhost access. It is set at first run, stored as a hash, and issues a session cookie.
- `samuel serve --lan` (plain HTTP) is a fallback for testing only. It warns that the PWA and push won't work.
- On the phone, the app works as a responsive PWA you can add to the home screen.

**Notifications:**
- Web push with VAPID keys generated locally.
- Payloads carry generic text only (e.g. "Time for your check-in", "Your weekly review is ready"). The app shows the details after it opens.
- Each notification type can be switched off in Settings.

**Privacy rules (enforced, and written into CLAUDE.md):**
- No analytics, no CDN calls, and fonts are bundled locally.
- The only outbound data is what Claude Code sends to Anthropic under the user's own account. The README states this.
- `samuel demo` seeds a fake persona. Screenshots, tests and CI use only that demo data.
- A pre-commit check rejects `*.db` files, `.samuel/` and files over 1 MB.

## Screens (update the canvas first, then build)
**Existing screens, revised:**
- Rename to Samuel.
- Keep "Needs a reply" and the Inbox, powered by the optional email connection.
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

**Settings → Appearance:** a hue wheel, vibe presets, theme controls and a live preview.

**Palette (tech style, 2026-10-24):** a pure black base (page #000000, cards #0A0D12) with an electric cyan accent (default #22E0E6; sky, iris, sunrise and pink are alternatives) and crisp status colours (green #5BE38A, amber #FFC24D, blue #5CB8FF). Fonts: Michroma, Inter and JetBrains Mono. A mission control finish: 2px corners, card corner brackets, LED-style segmented meters, a soft glow on active items and under headings and labels. The canvas designs keep the earlier palette and fonts; the app's styles are the reference for colour and type.

**Custom themes (Settings → Appearance):**
- Electric cyan is the default ("Calm" vibe).
- Users can pick any accent from a hue wheel, with vibrancy and brightness sliders and a hex field, or tap a vibe preset: Calm, Clear, Focus, Energise, Bold or Fresh.
- The theme comes from one accent. Every colour is a CSS variable, computed in a small `theme.ts`:
  - surfaces take a light tint of the accent's hue, with a strength the user sets
  - the darkness level is Dim, Dark or Midnight, and the background always stays dark
  - text on the accent switches between dark and white, whichever passes WCAG AA
  - if the accent is green, the success colour switches to blue so the two stay distinct
- A live preview updates as you pick. The theme is saved in the local settings table and applies to the phone PWA too.

**Charts:** follow the dataviz skill with one accent colour, so the prompt's "Unicode bars" become real meters.

## Process
- **GitHub Projects board** with one GitHub milestone per milestone below. Each piece of work is an issue with acceptance criteria.
- **One feature branch per issue** (e.g. `feat/checkin-form`). Each merges to `main` through a pull request that must pass CI, using squash merge.
- **Main is protected:** no direct pushes once CI exists.
- **Releases** are semantic version tags (`v0.1.0`) with a `CHANGELOG.md` entry and GitHub release notes.
- **Decision records:** each key choice gets a short ADR in `docs/adr/`, such as Claude Code as coach, local-first SQLite, Tailscale for phone access, and generic push text.
- **Definition of done** for every issue:
  - the acceptance criteria are met
  - tests pass, and the change works on Windows and on phone width
  - no hard-coded colours
  - no personal data
  - the docs are updated
- **Repo hygiene:** `SECURITY.md`, issue and PR templates, and README screenshots from demo data.
- **Commit identity:** commits use the GitHub noreply email, never a personal address.

## Milestones
1. **Designs (done):** the 12 desktop screens on the canvas and in `design/`.
2. **Design gaps (done):** swap the real name for the demo persona, and write `docs/scores.md`. First-run, empty, loading and error states are designed alongside the screens that need them.
3. **Walking skeleton (PC):** one thin end-to-end slice that proves the riskiest parts first.
   - backend and frontend skeletons, the `samuel` CLI, the data dir outside the repo, migrations and CI
   - save a check-in, calculate a score, run `claude -p` to write a daily report
   - show the report in the browser on the PC
4. **v0.1 (core loop):** short onboarding, the full daily check-in, habits with auto-ticking and streaks, Home with the score strip, the Coach screen and daily reports, backups.
5. **v0.2 (planning):** goals with milestones and the roadmap, the weekly review, routines for "Today's plan", and the full 45-question onboarding. Push notifications moved to the Phone milestone, since they need HTTPS on the phone.
6. **v0.3:** Health & energy, monthly evolution, tasks with reminders, and Settings → Appearance theming.
7. **v0.4 (integrations, optional):** email ("Needs a reply" and Inbox), then a read-only calendar.
8. **Phone:** 390px layouts for every screen, then phone access over Tailscale HTTPS with a passcode, the installable PWA and push notifications.
9. **Throughout:** keep CLAUDE.md current with run and test commands, privacy rules and the coach architecture.

## Verification
- **Tests:** `pytest` covers scores (nulls aren't treated as 0), the upsert rule, CLI export and import, and the passcode requirement for `--lan`. `npm test` and `npm run build` pass, and CI is green on GitHub.
- **Fresh-clone test:** clone into a temp dir, then run `samuel demo` and `samuel serve`. Check that every screen renders with the demo data and that no `*.db` file appears inside the repo (`git status` stays clean).
- **Coach:** run `claude -p "/daily-report"` in the repo and check that the report appears on the Coach screen. Do the same through the in-app button.
- **Phone:** open the app on a phone through Tailscale HTTPS. Check that a passcode is required, that it can be added to the home screen, and that a push notification arrives with generic text.
- **Data safety:** run a migration on a copy of real-shaped demo data. Check that a backup is created first and that export, then import, round-trips without loss.
- **Privacy:** watch the browser network tab during use and check that there are no external requests.
