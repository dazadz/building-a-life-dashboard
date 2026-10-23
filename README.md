# Building a Life Dashboard

Building a life dashboard using Claude Code.

**Samuel** is a personal performance dashboard and AI coach. It tracks routines, habits, sleep, energy and goals, scores them, and uses Claude Code to write daily reports, weekly reviews and monthly analyses. It runs on your own computer, your data stays in a private local file, and you can reach it from your phone over a private connection. This repo documents the build from design to working app.

## Status

Walking skeleton: you can save a daily check-in, see your scores, and have Samuel (Claude Code) write a daily report. It runs on a PC; phone access comes later. See [docs/PLAN.md](docs/PLAN.md) for the full build plan and [docs/scores.md](docs/scores.md) for how scores work.

## Run it

You need Python 3.11+, Node 22 and, for Samuel's reports, [Claude Code](https://claude.com/claude-code) logged in on the same computer.

```sh
# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows; use: source .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"

# Frontend (build once)
cd ../frontend
npm install
npm run build

# Start
cd ../backend
samuel serve                    # open http://127.0.0.1:8765
```

Your data lives in `~/.samuel/samuel.db`, outside this repo (set `SAMUEL_DATA_DIR` to move it). To try the app with made-up data, point `SAMUEL_DATA_DIR` at an empty folder and run `samuel demo`.

**Privacy:** the app only listens on this computer and makes no outside requests. The only data that leaves your machine is what Claude Code sends to Anthropic, under your own account, when you ask for a report.

## Design

UI designs live in `design/` (the source of the canvas at https://claude.ai/artifact/1DUdad1m3RYN15j932Dagj):

| File | Screen |
| --- | --- |
| `design/Onboarding.dc.html` | Five-step setup with scores and insights after each section |
| `design/Main.dc.html` | Home: scores, Samuel's brief, today's plan, check-in, needs a reply (optional email), habits, goals |
| `design/Checkin.dc.html` | Daily check-in (12 questions) and yesterday's report |
| `design/Habits.dc.html` | 10 daily trackers, streaks, consistency, failure detection |
| `design/Health.dc.html` | Sleep and energy, recovery, burnout risk, energy curve |
| `design/Goals.dc.html` | Goals by area, priority matrix, roadmap, long-term vision |
| `design/Review.dc.html` | Weekly review |
| `design/Monthly.dc.html` | Monthly evolution |
| `design/Coach.dc.html` | Samuel's reports and Ask Samuel |
| `design/Tasks.dc.html` | Tasks and reminders |
| `design/Palette.dc.html` | Ctrl+K command palette |
| `design/Settings.dc.html` | Appearance: colour wheel, vibe presets, theme and live preview |

Design rules: dark but bright theme with one vivid accent colour; every card ends in an action;
no hero KPI cards, emoji, gradients, glass effects, nested cards, or pure black/white.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). You may view, use, modify and share this code for any noncommercial purpose. Selling it or using it commercially is not permitted. The software is provided as is, with no warranty or liability.
