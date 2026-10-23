# How scores work

Samuel's scores come from plain rules applied to your check-ins and habit logs. No AI is involved: the numbers appear as soon as you save a check-in, and the same answers always give the same scores. Claude Code reads the scores to write reports, but it never changes them.

The app's "How scores work" page shows this text, so every number on screen can be traced back to a rule here. Change this file before changing the code.

## Ground rules

- **Scores run from 0 to 100**, rounded to whole numbers. The one exception is the Stress index, which runs from 1 to 10 because that is how the prompt describes it.
- **Missing is not zero.** A question you skipped or a habit you didn't log counts as unknown, never as a fail. A score is the weighted average of the parts that have data, with the missing parts' weight shared out among the rest.
- **Not enough data means no score.** If parts making up less than half of a score's weight have data, the score shows "Not enough data" instead of a number.
- **Saving never wipes data.** Re-saving a check-in keeps earlier answers unless you change them. An empty field never overwrites a real value with zero or blank.
- **Your targets come from onboarding.** They default to 7.5 h of sleep and 3 h of deep work, and the wake-up time you gave. You can change all three in Settings, and scores use the target that applied on each day.

## Inputs

Each answer is first turned into a value from 0 to 1.

| Input | Source | Value from 0 to 1 |
| --- | --- | --- |
| Sleep | Hours of sleep | hours ÷ sleep target, capped at 1 |
| Wake time | What time did you wake up? | 1 if within 15 min of your target, falling evenly to 0 at 90 min off |
| Mood | Mood | Low 0, Flat 0.25, Okay 0.5, Good 0.75, Great 1 |
| Energy | Energy level (1–10) | (rating − 1) ÷ 9 |
| Productivity | Productivity rating (1–10) | (rating − 1) ÷ 9 |
| Deep work | Deep work (hours) | hours ÷ deep work target, capped at 1 |
| Overwork | Deep work (hours) | 1 up to target + 2 h, falling evenly to 0 at target + 5 h |
| Workout | Workout completed? | Yes 1, No 0, Rest day 1 for Balance and unknown elsewhere |
| Habits | Habit log | done 1, missed 0, not logged unknown |

The other questions (main goal, biggest distraction, wins, failures, one improvement) are not scored. Samuel uses them in reports to find time leaks and patterns.

## Habits ticked from the check-in

Four of the 10 default habits are ticked automatically when you save a check-in, so you don't log them twice. You can override any of them by hand.

| Habit | Done when |
| --- | --- |
| Wake up on time | the Wake time value is 1 (within 15 min of target) |
| Sleep target achieved | hours of sleep ≥ sleep target |
| Deep work completed | deep work hours ≥ deep work target |
| Workout done | Workout is Yes; a rest day skips the habit for that day instead of missing it |

You log the other six yourself: Reading, Healthy eating, Water target, Meditation, No procrastination and No excessive social media.

## Daily scores

| Score | Made of | Weights |
| --- | --- | --- |
| **Productivity** | Productivity rating, Deep work | 50%, 50% |
| **Focus** | Deep work; No procrastination; No excessive social media | 50%, 25%, 25% |
| **Energy** | Energy rating, Sleep, Mood | 50%, 30%, 20% |
| **Discipline** | Share of today's logged habits marked done | 100% |
| **Balance** | Sleep, Workout (rest counts), Overwork, Mood | 25% each |

**Day score:** the average of whichever of Productivity, Discipline, Energy and Focus exist that day. It needs at least two of the four.

**Stress index (1–10, higher is worse):** the check-in has no stress question, so this is estimated from low mood, low energy and lost sleep:

```
strain = 0.4 × (1 − Mood) + 0.3 × (1 − Energy) + 0.3 × (1 − Sleep)
stress = 1 + 9 × strain, rounded to one decimal
```

## Scores over time

- **Consistency:** the share of logged habit-days marked done over the last 7 days, shown as a %. It needs at least 3 days with logs. The Habits screen shows it week by week.
- **Habit rate:** the same calculation for one habit over the period you pick (7, 14, 30 or 90 days).
- **Streak:** consecutive days a habit was done, counting back from yesterday, or from today if today is already logged. An unlogged day ends a streak and a skipped day (such as a rest day) doesn't. Best is the longest streak ever recorded.
- **Check-in streak:** consecutive days with a saved check-in.
- **Weekly consistency:** the Consistency rule applied to each Monday-to-Sunday week, for the Habits chart. A week with logs on fewer than 3 days shows no bar.
- **Patterns (failure detection):** for each habit and weekday, look at the habit's last 4 logged occurrences on that weekday within the last 8 weeks. If at least 3 were missed, Samuel lists it (for example, "Reading: missed 3 of the last 4 Wednesdays"). Unlogged days don't count either way.
- **Change vs last week** (the "+6" next to a score): today's score minus the average of the previous 7 days that have that score.
- **7-day average:** the mean of the days that have a score. Days without one are left out rather than counted as 0.

## Onboarding snapshot

After each onboarding section, Samuel shows a snapshot of key answers as they are, with no formula: for example satisfaction and stress out of 10, time in bed (from sleep time to wake-up time), screen time, and time wasted per day and per week (× 7). Samuel's written insights come separately from Claude Code.

## Weekly review

The weekly review covers one Monday-to-Sunday week. Its numbers come straight from that week's data:

- **Day score:** the 7-day average rule above, over that week. The change is that average minus the previous week's.
- **Check-ins:** days with a saved check-in, out of 7.
- **Sleep:** the average of the nights with a sleep answer.
- **Deep work:** the total of the deep work answers.
- **Habits:** the Habit rate rule over every habit-day in the week.
- **Workouts:** days with "Workout completed?" answered Yes.

Wins are check-in wins plus milestones done that week. Slips are check-in failures plus milestones due that week whose due date has passed and that are still open. From Friday on, the review opens on the current week; earlier in the week, on the week that just ended.

## Later

These scores are planned with their screens and will be added here before they are built:

- **Recovery** and **Burnout risk** (Health & energy, v0.3). They need inputs the check-in doesn't collect yet: water, caffeine and screen time.
- **Monthly evolution** (v0.3).

## Decisions

- **Stress stays estimated.** The check-in keeps the prompt's 12 questions, with no separate stress question.
- **Workouts count every day.** "No" is a miss on any day, whatever the routine. Answer "Rest day" to skip a day.
