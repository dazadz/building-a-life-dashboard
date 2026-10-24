import { api, type About, type GoalsSummary, type HabitHistory } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { useLoad } from '../hooks'

const SEGMENTS = Array.from({ length: 20 }, (_, i) => i)
const AREAS_SHOWN = 6

interface Metric {
  value: string
  share: number | null // 0..1 for the meter, null when there's nothing to measure yet
  label: string
}

/** How each pain or goal is doing, from the goal or habit it's linked to. */
function metricFor(item: About['items'][number], goals: GoalsSummary, habits: HabitHistory): Metric {
  if (item.goal_id !== null) {
    const goal = goals.goals.find((g) => g.id === item.goal_id)
    if (goal) {
      const done = goal.milestones.filter((m) => m.done_date).length
      return goal.progress === null
        ? { value: '—', share: null, label: `Goal · no milestones yet` }
        : { value: `${goal.progress}%`, share: goal.progress / 100, label: `Goal · ${done} of ${goal.milestones.length} milestones` }
    }
  }
  if (item.habit_key) {
    const habit = habits.habits.find((h) => h.key === item.habit_key)
    if (habit) {
      const done = habit.days.filter((d) => d === 'done').length
      return habit.rate === null
        ? { value: '—', share: null, label: `Habit · ${habit.name}, not logged this week` }
        : { value: `${done} / 7`, share: done / 7, label: `Habit · ${habit.name}, last 7 days${habit.streak > 1 ? ` · ${habit.streak}-day streak` : ''}` }
    }
  }
  return { value: '—', share: null, label: 'Not linked to a goal or habit yet' }
}

/** Home: your pains and goals, each with the meter that shows whether it's moving. */
export function FocusAreasCard({ today }: { today: string }) {
  const loaded = useLoad(() => Promise.all([api.about(), api.goals(today), api.habits(today, 7)]), [today])
  const [about, goals, habits] = loaded.data ?? [null, null, null]
  const active = about?.items.filter((i) => i.status === 'active') ?? []
  return (
    <Card title="Your focus areas" action={<a href="#/about">What Samuel knows →</a>}>
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !about || !goals || !habits ? <Loading lines={4} /> : active.length === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>No pains or goals yet. Ask Samuel to build your plan and this card tracks them.</span>
          <a href="#/about">About me →</a>
        </NeedsSetup>
      ) : (
        <ul className="focus-list">
          {active.slice(0, AREAS_SHOWN).map((item) => {
            const m = metricFor(item, goals, habits)
            const tone = item.kind === 'pain' ? 'amber' : 'green'
            return (
              <li key={item.id}>
                <div className="focus-top">
                  <span className="tag kind-tag" data-kind={item.kind}>{item.kind === 'pain' ? 'Pain' : 'Goal'}</span>
                  <span className="item-name focus-text">{item.text}</span>
                  <strong className="mono">{m.value}</strong>
                </div>
                <div className="meter-track" data-tone={tone} role="img" aria-label={`${item.text}: ${m.label} ${m.value}`}>
                  {SEGMENTS.map((i) => <span key={i} className="meter-seg" data-on={m.share !== null && i < Math.round(m.share * 20)} />)}
                </div>
                <span className="faint focus-label">{m.label}</span>
              </li>
            )
          })}
          {active.length > AREAS_SHOWN && <li className="faint">+{active.length - AREAS_SHOWN} more on About me</li>}
        </ul>
      )}
    </Card>
  )
}

/** Home: the three goals closest to their target date, with this week's milestone. */
export function GoalsCard({ today }: { today: string }) {
  const loaded = useLoad(() => api.goals(today), [today])
  const active = (loaded.data?.goals ?? []).filter((g) => !g.done_date)
    .sort((a, b) => (a.target_date ?? '9999').localeCompare(b.target_date ?? '9999'))
  const week = loaded.data?.week ?? []
  return (
    <Card title="Goals" meta={loaded.data ? `${active.length} active` : undefined} action={<a href="#/goals">All goals →</a>}>
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !loaded.data ? <Loading lines={3} /> : active.length === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>No goals yet. Samuel can suggest two or three from your profile.</span>
          <a href="#/about">About me →</a>
        </NeedsSetup>
      ) : (
        <ul className="list">
          {active.slice(0, 3).map((g) => {
            const due = week.find((m) => m.goal_id === g.id)
            const next = due ?? g.next_milestone
            return (
              <li key={g.id} className="goal-row">
                <span className="goal-row-text">
                  <span className="item-name">{g.title}</span>
                  <span className="faint">
                    {next ? `${due ? 'This week' : 'Next'}: ${next.title}${next.due_date ? ` · ${next.due_date.slice(5)}` : ''}` : 'No open milestones'}
                  </span>
                </span>
                <strong className="mono accent-text">{g.progress === null ? '—' : `${g.progress}%`}</strong>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
