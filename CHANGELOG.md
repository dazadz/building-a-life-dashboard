# Changelog

All notable changes to Samuel are listed here. Versions follow [semantic versioning](https://semver.org).

## [Unreleased]

### Added
- **Goals:** goals by life area with milestones, progress from milestones done (a dash until a goal has any), area filters and sorting, a priority matrix (impact vs effort), a 6-month roadmap, this week's milestones and your long-term vision. Samuel's export now includes active goals and what's due this week.

### Changed
- **Glow and sidebar:** a soft accent glow under headings, labels and key numbers; the background grid is gone; Settings sits at the bottom-left of the sidebar, which now stays in place as the page scrolls.
- **Mission control look:** Chakra Petch uppercase headings, sharp 2px corners, accent corner brackets on cards, LED-style segmented score meters, a faint grid behind the page, and a soft glow on active items.

## [0.1.0] - 2026-10-24

The core loop: check in each evening, see your scores, and have Samuel write your daily report. Runs on a PC.

### Added
- **Setup on first run:** your first name, daily targets and which habits to track. Samuel greets you by name from then on.
- **Home:** a greeting with your local date and time, a Productivity, Discipline, Energy and Focus strip, tonight's check-in, Samuel's latest report and today's habits.
- **Daily check-in:** the 12 questions, pre-filled from yesterday, ticking habits automatically from your answers.
- **Habits:** the 10 daily trackers in a grid over 7 to 90 days, with streaks, best streaks, rates, weekly consistency and patterns such as "missed 3 of the last 3 Mondays".
- **Scores:** plain rules, written down in `docs/scores.md`. Missing data shows a dash, never 0.
- **Coach:** Samuel (Claude Code, with your own login) writes a daily report from the last 7 days, from the Coach page or straight after a check-in. It asks for a check-in first if there isn't one.
- **Settings:** your name, targets and habits, plus a Your data card.
- **Backups:** a daily copy that keeps the last 14, a backup before every database update, Back up now, and full export and import as JSON.
- **CLI:** `samuel serve`, `demo`, `export`, `import`, `report add`, `scores` and `backup`.

### Security and privacy
- Data stays in `~/.samuel`, outside the repo. The server listens only on 127.0.0.1 and makes no outside requests.
- Protection against DNS rebinding and cross-site writes. Coach runs can only use the `samuel` CLI.
- A pre-commit hook and a CI check block database files, secrets, local paths and personal email addresses.

[0.1.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.1.0
