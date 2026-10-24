# Changelog

All notable changes to Samuel are listed here. Versions follow [semantic versioning](https://semver.org).

## [Unreleased]

### Changed
- **Faith instead of Spiritual:** routine block and task types, goal areas and the area of a pain or goal now say Faith. Existing Spiritual items, and suggestions waiting for review, become Faith (your data is backed up first).
- **Routine page:** each block's Edit is a clear button in its own column, and clicking a block's name opens it too.
- **Delete habits** in Edit habits, after a confirm. Unticking Tracking still hides a habit and keeps its history.
- **Sidebar icons:** each page has a line icon in its card colour (Goals green, Habits violet, Tasks orange and so on), glowing on the current page. Search has one too. They're drawn in the app, so nothing loads from outside.
- **Rounder and tidier:** cards have 10px corners and fields, dropdowns, buttons and pills 6px; corner brackets follow the curve. Dropdowns now have the app's dark style with a matching arrow. Samuel's suggestions sit under the other cards on Today.
- **Subtasks have due dates:** set one when adding a subtask (in the task form or under a task), or change it later; a late one shows in red.
- **Pains and goals:** Area is a dropdown (Career, Spiritual, Sleep, Energy, Focus, Fitness, Health, Money, Relationships, Learning, Other).
- **Tasks:** add subtasks while creating a task (and more while editing). Due dates read like "Mon 26/10/2026" (today still says Today).
- **Goals:** a Days left column (amber within two weeks, red when late), dates like "Sun 14/03/2027", and a Priority you can change right in the list (it's the goal's impact, as on the priority matrix). Both columns sort. Goals can have the area **Spiritual**.
- **Colours that mean something:** scores are green from 70, amber from 40 and red below that (stress the other way round), on Today, Health, the monthly scorecard, the weekly numbers and the check-in. Each kind of card has its own colour on every page (routine cyan, goals green, pains and risks amber, habits violet, check-in and reviews blue, suggestions pink, tasks orange, health rose), shown on its title and corner brackets.
- **Today is compact, like its design:** the Now card and scores, then a row of three cards, Samuel's suggestions (3, with Review all), and a row of four small cards. Which cards lead follows the time of day. "Today at a glance" and the latest report leave Today; your focus moves into a "Focus and due" card, and the report stays on the Coach page.
- **Black gradient background:** a faint accent glow at the top of the page, deepening down. Cards stay flat.
- **About me:** add fixed parts of your week (office hours, classes, training) right there, and see your day types.
- **Samuel's plan:** "Dismiss the rest" next to "Accept N selected". Just after midnight Samuel says good evening, not good morning.
- **Type, for routine blocks and tasks:** the block's "Kind" is now **Type**, with Focus, Fixed, Work, Spiritual, Habit, Recovery and Leisure. Tasks use the same types in place of their list (Work tasks become Type: Work), with a type filter on the Tasks page.
- **Create and edit tasks with a form:** a **New task** button replaces quick add. The form sets the task, type, goal it achieves, due date, time, reminder, routine block, priority and notes, and **Edit** on any task opens the same form. Ctrl+K "Create task" opens it with your text as the title.
- **Edit habits** on the Habits page: rename any habit, turn tracking on or off (history is kept), and add your own.
- **Edit milestones in place:** a goal's milestones have editable names and dates.

### Fixed
- **Plan builder saves its plan:** Claude Code blocks shell commands that contain JSON braces, so coach runs couldn't send their suggestions. `samuel suggest add` now also reads plain `key: value` lines, which the plan builder, chat and weekly review use. A routine suggestion's reminder settings no longer fail when you accept it.

## [0.5.0] - 2026-10-24

Your plan: pains and goals, Samuel's suggestions, repeating routines by day type with reminders, goal breakdowns, and a Home built around what's on now.

### Added
- **Pains and goals:** an About me store for what holds you back and what you're working towards, plus notes in your own words that Samuel plans around.
- **Samuel suggests, you decide:** coach runs can propose goals, milestones, habits, tasks, routine blocks and pains with `samuel suggest add`. They wait for you to accept, edit or dismiss them, and are checked again when accepted (ADR 0004).
- **Plan builder:** a new coach skill that turns your profile and notes into a plan, or breaks one goal into milestones and session-sized tasks (`/plan-builder goal <id>`). Chat replies can propose suggestions too.
- **Your own habits:** add and rename habits next to the ten defaults.
- **About me page:** what Samuel knows about you: your pains and goals (filter, sort, edit, resolve, remove with undo), your notes, your profile progress, and a button to have Samuel build your plan.
- **Repeating routines by day type:** blocks run on day types such as Office day and Home day (switch one date with a tap) or on their own weekdays. Each block has a kind, an optional goal or habit, steps, and reminders 5 minutes before and at the start. Blocks can run past midnight. Done ticks the linked habit; skipped asks what got in the way, and Samuel sees the last 14 days.
- **Routine page:** a week strip, tabs per day type, and a block editor (kind, days or day type, goal, habit, what to do, steps, reminders). Day types are managed on the same page; Settings links to it.
- **Home built around your plan:** a Now card (the block running now or next, its goal, today's task, steps to tick, time left, Done and Skip), a one-tap "Today is" day-type switch, your focus areas (each pain and goal with the meter of its linked goal or habit) and your top goals. The card order follows the time of day: morning from your wake-up target, evening from 3 hours before bedtime.
- **Break a goal down:** each open goal has "Break this down with Samuel", which proposes milestones and session-sized tasks placed in your routine blocks. Suggestions are grouped by where they came from (your plan, a goal breakdown, a chat or the weekly review), each with "Accept all". The weekly review can propose up to 3 changes for next week.
- **About me** lists the fixed parts of your week, and the Coach page lists plan reports.
- **Block reminders:** a corner card and Windows notification 5 minutes before a block ("Up next") and when it starts ("Now", with the task and steps), with Snooze 15 min and Skip, which asks what got in the way. Today's plan shows done and skipped marks and each block's task.
- **Tasks queued for a block:** a task can belong to a routine block. It shows when the block runs and rolls on to the next run if it isn't done.
- **Samuel suggests card:** on About me, and on Today whenever something is waiting, with Accept, Edit (then accept) and Dismiss, accept-selected, and a count badge in the sidebar. Settings → Profile can add your own habits.

### Changed
- **Settings matches its design:** section tabs (Profile, Appearance, Coach, Data & privacy). Appearance has an accent ring you can drag or move with the arrow keys, vibe tiles, a live preview of Samuel, and a Theme card for darkness and surface tint.

### Fixed
- **Updates reach the app window:** after you update, opening Samuel replaces a server left running from before the update (one started by `samuel app`), so the window no longer shows new screens on old server code. A `samuel serve` you started yourself is never stopped; you get a message instead.
- **Safer data folder:** only the `samuel` command uses your real data in `~/.samuel`. Scripts and tests that open the database without `SAMUEL_DATA_DIR` now stop with an error instead of using it.
- **Full export:** `samuel export --all` and import now include pains and goals, suggestions, day types and the block log. A test now fails when a new table isn't covered.
- **Taskbar pinning:** `samuel app --shortcut` now gives the shortcut the same taskbar ID as Samuel's window and adds a Start menu entry. A pinned Samuel keeps its icon and opens Samuel, instead of opening a plain Edge page. Run `samuel app --shortcut` again, then re-pin.

## [0.4.0] - 2026-10-24

Chat with Samuel, today at a glance, energy taps, time leaks and what moves your energy and mood.

### Added
- **Undo for deletes:** deleting a goal (with its milestones), a milestone, a task (with its subtasks), a routine block or a chat shows Undo for 10 seconds. Settings → Recently deleted keeps them for 30 days on this computer, with Restore and Empty now.
- **Lifestyle score:** the prompt's lifestyle score, from sleep, workouts (rest days count), healthy eating and water. Health & energy shows it next to Balance as 7-day averages with the change from the week before, and Samuel's reports see both. The rule is in `docs/scores.md`.
- **What moves your energy and mood:** Health & energy compares your days with and without a condition (sleeping to target, working out, hitting deep work, late caffeine, late screens) against energy, mood, productivity or the next night's sleep, over 30 or 90 days. Each link shows both averages and both day counts, and only shows when both sides have 3 days and the difference is big enough to matter. Samuel's reports and chat can cite them. The rules are in `docs/scores.md`.
- **Time leaks:** the weekly review lists your biggest distractions over 7 or 30 days, with the deep work lost on those days against your target, deep work on those days versus other days, and the impact. One click asks Samuel about the top leak. Daily reports now include a Time leaks table explained with your own check-in words. The rules are in `docs/scores.md`.
- **Today at a glance:** a card at the top of Home, kept current all day: one focus (your "one improvement" from last night's check-in, else this week's top priority, else a due milestone), what's due or overdue across tasks and milestones, what's on now or next in your routine, and yesterday's score. It updates every minute and has a Refresh link.
- **Energy taps and the energy curve:** an optional "Energy now" card on Today takes a 1–10 tap for the morning, midday, afternoon or evening. Health & energy draws the average for each part of the day, with your peak and dip, once a part has taps on 3 days. Samuel's reports and chat see the curve. The rules are in `docs/scores.md`.
- **Ctrl+K palette:** press Ctrl+K (or Search in the sidebar) to jump to any screen, search tasks, goals, milestones, check-ins, reports and chats, create a task with quick-add syntax, or ask Samuel. Type `>` for commands only and `?` to ask Samuel. Search results open the exact report, chat or past check-in.
- **Chat with Samuel:** the prompt's coach mode as a conversation on the Coach page. Ask about your sleep, energy, habits, goals or plans and get an answer built from your own data, then ask follow-ups; Samuel sees the conversation so far. Start from a suggested question, or ask about the report you're reading. Conversations are kept on this computer, and each answer is a locked-down Claude Code run (the new `ask` skill) with the same two `samuel` commands as reports.

### Security
- **Coach runs are locked down further.** Bash is the only tool, and only `samuel export` and `samuel report add` may run. Runs no longer load your own Claude Code settings or MCP servers. Inside a run, `samuel export` refuses full exports and `report add` won't read files.
- **Exports can't be committed.** The privacy check stops any Samuel export file.
- **Dependencies are watched.** CI checks Python and npm packages for known vulnerabilities, Dependabot alerts on known vulnerabilities and opens a pull request only for security fixes, and CI actions are pinned to exact versions.

### Changed
- **Delete confirmations:** deleting a goal or task asks in an in-app dialog that matches the app, instead of the browser's plain popup. It names what will go (including a goal's milestones), says it can be restored from Recently deleted for 30 days, and starts on Cancel so Enter never deletes by accident.

### Fixed
- **Health:** "1 points lower" now reads "1 point lower".
- **Docs:** two README lines broken by stray control characters, new issue and PR templates, the coach permissions in CLAUDE.md, the plan and ADR 0001, and the README design rules. The README now warns against saving exports in cloud-synced folders.

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
- **Mission control look:** a pure black page and sidebar, Michroma uppercase headings (a wide, smooth tech font), sharp 2px corners, accent corner brackets on cards, LED-style segmented score meters, and a soft accent glow on active items and under headings, labels and key numbers.
- **Sidebar:** Settings sits at the bottom-left, and the sidebar stays in place as the page scrolls.

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

[0.5.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.5.0
[0.4.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.4.0
[0.3.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.3.0
[0.2.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/dazadz/building-a-life-dashboard/releases/tag/v0.1.0
