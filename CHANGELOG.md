# Changelog

All notable changes to Samuel are listed here. Versions follow [semantic versioning](https://semver.org).

## [Unreleased]

## [0.3.0] - 2026-10-24

Tasks, health, the monthly view and your own theme.

### Added
- **Appearance:** Settings → Appearance builds the whole theme from one accent. Pick a vibe (Calm, Clear, Focus, Energise, Bold, Fresh) or set hue, vibrancy, brightness or a hex code; choose Dim, Dark or Midnight and how much the surfaces take the accent's hue. Changes preview live across the app, text on the accent switches between dark and white for contrast, and a green accent moves "on track" to blue.
- **Monthly evolution:** this month against last (days logged, discipline, productivity, energy, consistency, sleep and goal completion), a daily discipline trend, each habit's rate against last month, and Samuel's analysis from the new `monthly-evolution` skill. Weekly and Monthly sit together under Review.
- **Health & energy:** sleep and energy charts (with a table view), how much lower your energy is after short nights, a Recovery score, Burnout risk with its reasons, 7-day daily inputs, and an optional quick health log for water, caffeine and late screens. The rules are in `docs/scores.md`. Not medical advice.
- **Tasks with reminders:** Today, Upcoming, Overdue, All and Done views with counts, lists, priority, filters and sorting; subtasks, notes and links to goals; quick add that reads dates, times, #lists and !high as you type; Done, +1 hour and Tomorrow on every task. Reminders appear as Windows notifications (when allowed) and as cards in the app while Samuel is open; nothing goes through an outside push service. Samuel's daily report sees tasks that are overdue or due this week.

## [0.2.0] - 2026-10-24

Planning: goals, the full onboarding, the weekly review and today's plan, plus a new look and a desktop window.

### Added
- **Routines and Today's plan:** routine blocks with times and weekdays, edited in Settings, with a suggested routine built from your targets. Home shows today's plan with Now and Next markers and milestones due today. Samuel's daily report plans tomorrow around your routine.
- **Weekly review:** look back on the week (wins, what slipped, and the week's numbers), answer three questions drawn from your own data, set next week's top 3, and pick milestones to carry over. Saving it asks Samuel (the new `weekly-review` skill) for a brief built around your priorities.
- **Text size:** Settings → Text size scales the whole interface: Small (100%), Medium (110%, the new default), Large (125%) or Extra large (140%).
- **Full onboarding:** 45 profile questions in four sections (life structure, daily routine, health and energy, goals and ambition), saved as you go. After each section you get a snapshot of key numbers and Samuel's insights (the new `onboard-insights` coach skill). Home shows how much Samuel knows until the profile is done. Health limitations and mental health answers are optional and only go to Claude for onboarding insights.
- **`samuel app`:** opens Samuel in its own Edge app window with no browser UI, starting the server if needed and stopping it a few minutes after the window closes. `samuel app --shortcut` makes a desktop shortcut.
- **Goals:** goals by life area with milestones, progress from milestones done (a dash until a goal has any), area filters and sorting, a priority matrix (impact vs effort), a 6-month roadmap, this week's milestones and your long-term vision. Samuel's export now includes active goals and what's due this week.

### Changed
- **Centred Home:** the greeting, scores and cards sit in a narrower column in the middle of the window.
- **App icon:** a cyan "S" icon for the desktop shortcut and the browser tab.
- **Black and Michroma:** the page and sidebar are pure black, and headings use Michroma, a wide, smooth tech font (replacing Chakra Petch, which looked blocky).
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

[0.3.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.3.0
[0.2.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.1.0
