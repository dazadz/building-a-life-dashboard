import { useRef, useState, type ReactNode } from 'react'
import { api, AREAS, type Area, type Goal, type GoalFields, type GoalsSummary, type Status } from '../api'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, dayDate, daysLeftText, daysUntil, isoDate, scoreText, shortDate } from '../format'
import { useCoachJob, useLoad, useNow } from '../hooks'

const VISIBLE = 8
const ROADMAP_MONTHS = 6
type SortKey = 'title' | 'progress' | 'due' | 'priority'
type Filter = Area | 'all' | 'done'

const areaLabel = (a: string) => a[0].toUpperCase() + a.slice(1)

/** "Today", "Tomorrow", a weekday this week, or a short date. */
function dueLabel(iso: string, today: string): string {
  if (iso === today) return 'Today'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  if (iso > today && iso <= addDays(today, 6)) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
  }
  return shortDate(iso)
}

export function GoalsPage({ coach, status }: { coach: ReturnType<typeof useCoachJob>; status: Status | null }) {
  const today = isoDate(useNow())
  const loaded = useLoad(() => api.goals(today), [today])
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const roadmapRef = useRef<HTMLDivElement>(null)
  const data = loaded.data

  /** Run a write; every goals write returns the whole screen. */
  const write = async (work: () => Promise<GoalsSummary>) => {
    setError(null)
    try {
      loaded.setData(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const active = data?.goals.filter((g) => !g.done_date) ?? []
  const areas = new Set(active.map((g) => g.area)).size
  const year = today.slice(0, 4)
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1
  const editGoal = typeof editing === 'number' ? data?.goals.find((g) => g.id === editing) : undefined

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">{year} <span className="faint">//</span> Q{quarter}</div>
        <h1>Goals</h1>
        <p>
          {!data ? 'Loading your goals…' : active.length === 0 ? 'Set a goal and Samuel will plan around it.' : (
            `${active.length} active ${active.length === 1 ? 'goal' : 'goals'} across ${areas} ${areas === 1 ? 'area' : 'areas'}. `
            + `${data.week.length} ${data.week.length === 1 ? 'milestone' : 'milestones'} due this week.`
          )}
        </p>
      </header>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}
      {error && <ErrorLine message={error} />}

      {editing !== null && (editing === 'new' || editGoal) && (
        <GoalEditor
          key={editing}
          goal={editGoal}
          today={today}
          write={write}
          breakdown={editGoal && !editGoal.done_date ? <Breakdown goal={editGoal} coach={coach} installed={status?.coach.installed ?? false} /> : null}
          onCreated={(summary) => setEditing(Math.max(...summary.goals.map((g) => g.id)))}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="row">
        <ActiveGoals data={data} today={today} write={write} onOpen={setEditing} onAdd={() => setEditing('new')} />
        <ThisWeek data={data} today={today} write={write}
          onRoadmap={() => roadmapRef.current?.scrollIntoView({ behavior: 'smooth' })} />
      </div>

      <div className="row" ref={roadmapRef}>
        <PriorityMatrix goals={active} loading={!data} onAdd={() => setEditing('new')} />
        <Roadmap goals={active} loading={!data} today={today} />
      </div>

      <Vision data={data} today={today} write={write} />
    </div>
  )
}

// A goal's priority is its impact (1-5), the same number the priority matrix uses.
const PRIORITY: [number, string][] = [[5, 'Top'], [4, 'High'], [3, 'Medium'], [2, 'Low'], [1, 'Minimal']]

function DaysLeft({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="faint">No date</span>
  const n = daysUntil(date, today)
  return <span className={`mono days-left${n < 0 ? ' late' : n <= 14 ? ' soon' : ''}`}>{daysLeftText(date, today)}</span>
}

function ActiveGoals({ data, today, write, onOpen, onAdd }: {
  data: GoalsSummary | null; today: string; write: Write; onOpen: (id: number) => void; onAdd: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'due', desc: false })
  const [showAll, setShowAll] = useState(false)
  const action = <button type="button" className="link-btn accent" onClick={onAdd}>Add goal →</button>
  if (!data) return <Card title="Active goals" className="wide" action={action}><Loading lines={6} /></Card>

  const active = data.goals.filter((g) => !g.done_date)
  const done = data.goals.filter((g) => g.done_date)
  const counts = AREAS.map((a) => [a, active.filter((g) => g.area === a).length] as const).filter(([, n]) => n > 0)
  const rows = (filter === 'done' ? done : filter === 'all' ? active : active.filter((g) => g.area === filter)).slice()
  rows.sort((a, b) => {
    const val = (g: Goal) => (sort.key === 'title' ? g.title : sort.key === 'progress' ? g.progress ?? -1
      : sort.key === 'priority' ? g.impact : g.target_date ?? '9999')
    const av = val(a)
    const bv = val(b)
    const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : av - (bv as number)
    return sort.desc ? -cmp : cmp
  })
  const shown = showAll ? rows : rows.slice(0, VISIBLE)
  const sortBy = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === 'progress' || key === 'priority' }))
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined)
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')
  const header = (key: SortKey, label: string, className?: string) => (
    <th scope="col" className={className} aria-sort={ariaSort(key)}>
      <button type="button" className="th-btn" onClick={() => sortBy(key)}>{label}{arrow(key)}</button>
    </th>
  )

  return (
    <Card
      title="Active goals"
      className="wide"
      meta="Click a goal to edit"
      secondary={
        rows.length > VISIBLE ? (
          <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show ${rows.length - VISIBLE} more`}
          </button>
        ) : <span className="faint">{data.completed_this_year} completed this year</span>
      }
      action={action}
    >
      <div className="pills" role="group" aria-label="Area">
        <button type="button" className="pill" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All · {active.length}</button>
        {counts.map(([a, n]) => (
          <button key={a} type="button" className="pill" aria-pressed={filter === a} onClick={() => setFilter(a)}>
            {areaLabel(a)} · {n}
          </button>
        ))}
        {done.length > 0 && (
          <button type="button" className="pill" aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>Done · {done.length}</button>
        )}
      </div>
      {rows.length === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>
            {data.goals.length === 0 ? 'No goals yet. Add one, then break it into milestones.' : 'No goals here.'}
          </span>
        </NeedsSetup>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {header('title', 'Goal')}
                <th scope="col">Area</th>
                {header('priority', 'Priority')}
                {header('progress', 'Progress')}
                <th scope="col">Next milestone</th>
                {header('due', 'Due', 'num')}
                <th scope="col" className="num">Days left</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.id}>
                  <th scope="row">
                    <button type="button" className="row-link" onClick={() => onOpen(g.id)}>{g.title}</button>
                  </th>
                  <td><span className="tag" style={{ marginLeft: 0 }}>{g.area}</span></td>
                  <td>
                    <select className="input priority-select" aria-label={`${g.title} priority`} value={g.impact} data-priority={g.impact}
                      onChange={(e) => void write(() => api.updateGoal(today, g.id, { impact: Number(e.target.value) }))}>
                      {PRIORITY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </td>
                  <td><Progress value={g.progress} /></td>
                  <td className="muted">
                    {g.next_milestone ? (
                      <>
                        {g.next_milestone.title}
                        {g.next_milestone.due_date && <span className="faint"> · {dueLabel(g.next_milestone.due_date, today)}</span>}
                      </>
                    ) : g.done_date ? `Done ${shortDate(g.done_date)}` : '—'}
                  </td>
                  <td className="num mono">{g.target_date ? dayDate(g.target_date) : '—'}</td>
                  <td className="num">{g.done_date ? <span className="faint">Done</span> : <DaysLeft date={g.target_date} today={today} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** A 10-segment meter. No milestones means no progress yet: a dash, never 0%. */
function Progress({ value }: { value: number | null }) {
  return (
    <span className="progress-cell">
      <span className="mini-meter" role="img" aria-label={value == null ? 'No milestones yet' : `${value}% done`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="meter-seg" data-on={value != null && i < Math.round(value / 10)} />
        ))}
      </span>
      <span className="mono">{value == null ? '—' : `${value}%`}</span>
    </span>
  )
}

type Write = (work: () => Promise<GoalsSummary>) => Promise<boolean>

function ThisWeek({ data, today, write, onRoadmap }: {
  data: GoalsSummary | null; today: string; write: Write; onRoadmap: () => void
}) {
  return (
    <Card
      title="This week's execution"
      meta={data ? `${data.week.length} due` : undefined}
      action={<button type="button" className="link-btn accent" onClick={onRoadmap}>Roadmap →</button>}
    >
      {!data ? <Loading /> : data.week.length === 0 ? (
        <NeedsSetup>Nothing due in the next 7 days. Give your milestones due dates to see them here.</NeedsSetup>
      ) : (
        <ul className="list">
          {data.week.map((m) => (
            <li key={m.id}>
              <input
                type="checkbox"
                className="check"
                aria-label={`Mark ${m.title} done`}
                onChange={() => void write(() => api.updateMilestone(today, m.id, { done: true }))}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="item-name">{m.title}</span>
                <span className="faint"> · {m.goal_title}</span>
              </span>
              <span className={m.overdue ? 'warn-text mono' : 'mono muted'}>
                {m.overdue ? `Overdue · ${shortDate(m.due_date!)}` : dueLabel(m.due_date!, today)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function GoalEditor({ goal, today, write, breakdown, onCreated, onClose }: {
  goal?: Goal; today: string; write: Write; breakdown?: ReactNode; onCreated: (s: GoalsSummary) => void; onClose: () => void
}) {
  const [fields, setFields] = useState<GoalFields>(() => ({
    title: goal?.title ?? '', area: goal?.area ?? 'fitness', impact: goal?.impact ?? 3,
    effort: goal?.effort ?? 3, target_date: goal?.target_date ?? null,
  }))
  const [milestone, setMilestone] = useState({ title: '', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const set = <K extends keyof GoalFields>(key: K, value: GoalFields[K]) => setFields((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!fields.title.trim()) return setError('Give the goal a name.')
    setError(null)
    setSaving(true)
    if (goal) {
      await write(() => api.updateGoal(today, goal.id, fields))
    } else {
      let created: GoalsSummary | null = null
      if (await write(async () => (created = await api.addGoal(today, fields)))) onCreated(created!)
    }
    setSaving(false)
  }

  const addMilestone = async () => {
    if (!goal || !milestone.title.trim()) return
    if (await write(() => api.addMilestone(today, goal.id, { title: milestone.title.trim(), due_date: milestone.due_date || null }))) {
      setMilestone({ title: '', due_date: '' })
    }
  }

  const remove = async () => {
    if (!goal) return
    setSaving(true)
    const ok = await write(() => api.deleteGoal(today, goal.id))
    setSaving(false)
    setConfirming(false)
    if (ok) onClose()
  }

  return (
    <Card
      title={goal ? 'Edit goal' : 'New goal'}
      meta={goal ? `${goal.milestones.filter((m) => m.done_date).length} of ${goal.milestones.length} milestones done` : undefined}
      secondary={goal && (
        <span style={{ display: 'flex', gap: 16 }}>
          <button type="button" className="link-btn" onClick={() => void write(() => api.updateGoal(today, goal.id, { done: !goal.done_date }))}>
            {goal.done_date ? 'Reopen goal' : 'Mark goal done'}
          </button>
          <button type="button" className="link-btn" onClick={() => setConfirming(true)}>Delete</button>
        </span>
      )}
      action={<button type="button" className="link-btn accent" onClick={onClose}>Close →</button>}
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="fields">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="goal-title">Goal</label>
            <input id="goal-title" className="input" maxLength={120} value={fields.title}
              onChange={(e) => set('title', e.target.value)} placeholder="Half marathon in March" />
          </div>
          <div className="field">
            <label htmlFor="goal-area">Area</label>
            <select id="goal-area" className="input" value={fields.area} onChange={(e) => set('area', e.target.value as Area)}>
              {AREAS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="goal-target">Target date</label>
            <input id="goal-target" type="date" className="input" value={fields.target_date ?? ''}
              onChange={(e) => set('target_date', e.target.value || null)} />
          </div>
          <Scale label="Impact" value={fields.impact} onChange={(v) => set('impact', v)} />
          <Scale label="Effort" value={fields.effort} onChange={(v) => set('effort', v)} />
        </div>
        {error && <ErrorLine message={error} />}
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{goal ? 'Save goal' : 'Add goal'}</button>
        </div>
      </form>

      {breakdown}
      {goal && (
        <fieldset className="form" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Milestones</legend>
          {goal.milestones.length === 0 && <NeedsSetup>Break the goal into 3–5 milestones with due dates.</NeedsSetup>}
          <ul className="list">
            {goal.milestones.map((m) => (
              <li key={m.id}>
                <input type="checkbox" className="check" checked={!!m.done_date} aria-label={`${m.title} done`}
                  onChange={() => void write(() => api.updateMilestone(today, m.id, { done: !m.done_date }))} />
                <input className="input milestone-title" aria-label={`${m.title} name`} maxLength={120} defaultValue={m.title}
                  key={`${m.id}-${m.title}`} data-done={!!m.done_date}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.title) void write(() => api.updateMilestone(today, m.id, { title: v })) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
                <input type="date" className="input milestone-date" aria-label={`${m.title} due date`} value={m.due_date ?? ''}
                  onChange={(e) => void write(() => api.updateMilestone(today, m.id, { due_date: e.target.value || null }))} />
                <button type="button" className="link-btn" aria-label={`Remove ${m.title}`}
                  onClick={() => void write(() => api.deleteMilestone(today, m.id))}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="inline-add">
            <input className="input" aria-label="New milestone" placeholder="New milestone" maxLength={120}
              value={milestone.title} onChange={(e) => setMilestone((m) => ({ ...m, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addMilestone() } }} />
            <input type="date" className="input" aria-label="Milestone due date" value={milestone.due_date}
              onChange={(e) => setMilestone((m) => ({ ...m, due_date: e.target.value }))} />
            <button type="button" className="btn" onClick={() => void addMilestone()}>Add</button>
          </div>
        </fieldset>
      )}

      {goal && (
        <ConfirmDialog open={confirming} title="Delete goal?" confirmLabel="Delete goal" busy={saving}
          onConfirm={() => void remove()} onCancel={() => setConfirming(false)}>
          <p><strong>{goal.title}</strong> will be removed from your goals and roadmap.</p>
          {goal.milestones.length > 0 && (
            <p>Its {goal.milestones.length} {goal.milestones.length === 1 ? 'milestone' : 'milestones'} will be deleted with it.</p>
          )}
        </ConfirmDialog>
      )}
    </Card>
  )
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="label" id={`scale-${label}`}>{label} (1–5)</span>
      <div className="pills" role="group" aria-labelledby={`scale-${label}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="pill mono" aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

const QUADRANTS = [
  { label: 'Quick wins', className: 'q-tl' },
  { label: 'Big bets', className: 'q-tr' },
  { label: 'Fill-ins', className: 'q-bl' },
  { label: 'Rethink', className: 'q-br' },
]

function quadrant(g: Goal): string {
  const high = g.impact >= 3
  const easy = g.effort <= 3
  return high ? (easy ? 'Quick wins' : 'Big bets') : easy ? 'Fill-ins' : 'Rethink'
}

function PriorityMatrix({ goals, loading, onAdd }: { goals: Goal[]; loading: boolean; onAdd: () => void }) {
  // Goals on the same spot fan out a little so every number stays readable.
  const seen = new Map<string, number>()
  const points = goals.map((g, i) => {
    const spot = `${g.impact}-${g.effort}`
    const n = seen.get(spot) ?? 0
    seen.set(spot, n + 1)
    return { g, n: i + 1, left: ((g.effort - 0.5) / 5) * 100 + n * 4, bottom: ((g.impact - 0.5) / 5) * 100 - n * 4 }
  })
  return (
    <Card title="Priority matrix" meta="Impact vs effort" action={<button type="button" className="link-btn accent" onClick={onAdd}>Add goal →</button>}>
      {loading ? <Loading lines={5} /> : goals.length === 0 ? (
        <NeedsSetup>Add a goal with its impact and effort to place it here.</NeedsSetup>
      ) : (
        <>
          <div className="matrix" role="img"
            aria-label={`Priority matrix: ${goals.map((g) => `${g.title}, impact ${g.impact}, effort ${g.effort}, ${quadrant(g)}`).join('; ')}`}>
            {QUADRANTS.map((q) => <span key={q.label} className={`matrix-q ${q.className}`}>{q.label}</span>)}
            {points.map(({ g, n, left, bottom }) => (
              <span key={g.id} className="matrix-pt" style={{ left: `${left}%`, bottom: `${bottom}%` }} title={g.title}>{n}</span>
            ))}
            <span className="matrix-axis x">Effort →</span>
            <span className="matrix-axis y">Impact →</span>
          </div>
          <ol className="matrix-legend">
            {points.map(({ g, n }) => (
              <li key={g.id}><span className="mono accent-text">{n}</span> {g.title} <span className="faint">· {quadrant(g)}</span></li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}

function Roadmap({ goals, loading, today }: { goals: Goal[]; loading: boolean; today: string }) {
  const start = `${today.slice(0, 7)}-01`
  const months = Array.from({ length: ROADMAP_MONTHS }, (_, i) => {
    const d = new Date(`${start}T12:00:00`)
    d.setMonth(d.getMonth() + i)
    return isoDate(d)
  })
  const endD = new Date(`${months.at(-1)}T12:00:00`)
  endD.setMonth(endD.getMonth() + 1)
  const end = isoDate(endD)
  const span = (Date.parse(end) - Date.parse(start)) / 864e5
  const pos = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - Date.parse(start)) / 864e5 / span) * 100))
  const todayAt = pos(today)

  return (
    <Card title="Roadmap" className="wide" meta={`Next ${ROADMAP_MONTHS} months`} action={<a href="#/coach">Plan with Samuel →</a>}>
      {loading ? <Loading lines={6} /> : goals.length === 0 ? (
        <NeedsSetup>Your goals and milestones show here on a timeline.</NeedsSetup>
      ) : (
        <div className="roadmap">
          <div className="roadmap-row roadmap-head">
            <span />
            <div className="roadmap-track">
              {months.map((m) => (
                <span key={m} className="roadmap-month" style={{ left: `${pos(m)}%` }}>
                  {new Date(`${m}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })}
                </span>
              ))}
            </div>
          </div>
          {goals.map((g) => {
            const from = pos(g.created_at > today ? g.created_at : today)
            const to = g.target_date ? pos(g.target_date) : null
            return (
              <div key={g.id} className="roadmap-row">
                <span className="roadmap-label" title={g.title}>{g.title}</span>
                <div className="roadmap-track"
                  aria-label={`${g.title}: ${g.target_date ? `target ${shortDate(g.target_date)}` : 'no target date'}, ${scoreText(g.progress)}${g.progress != null ? '%' : ''} done`}
                  role="img">
                  {months.map((m) => <span key={m} className="roadmap-grid" style={{ left: `${pos(m)}%` }} />)}
                  {to != null && to > from && <span className="roadmap-bar" style={{ left: `${from}%`, width: `${to - from}%` }} />}
                  {to == null && <span className="roadmap-open">No target date</span>}
                  {g.milestones.filter((m) => m.due_date && m.due_date >= start && m.due_date < end).map((m) => (
                    <span key={m.id} className="roadmap-tick" data-done={!!m.done_date} style={{ left: `${pos(m.due_date!)}%` }}
                      title={`${m.title} · ${shortDate(m.due_date!)}`} />
                  ))}
                  <span className="roadmap-today" style={{ left: `${todayAt}%` }} />
                </div>
              </div>
            )
          })}
          <div className="legend" style={{ paddingTop: 4 }}>
            <span><span className="roadmap-tick legend-tick" data-done="true" /> Milestone done</span>
            <span><span className="roadmap-tick legend-tick" data-done="false" /> Milestone</span>
            <span><span className="roadmap-today legend-today" /> Today</span>
          </div>
        </div>
      )}
    </Card>
  )
}

function Vision({ data, today, write }: { data: GoalsSummary | null; today: string; write: Write }) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = async () => {
    if (await write(() => api.saveVision(today, draft ?? ''))) setDraft(null)
  }
  return (
    <Card
      title="Long-term vision"
      meta="Where the goals lead"
      action={draft === null
        ? <button type="button" className="link-btn accent" onClick={() => setDraft(data?.vision ?? '')}>Edit vision →</button>
        : <button type="button" className="link-btn accent" onClick={() => void save()}>Save vision →</button>}
    >
      {!data ? <Loading lines={2} /> : draft !== null ? (
        <div className="field">
          <label htmlFor="vision">Your vision, in a sentence or two</label>
          <textarea id="vision" className="input" maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="By 2030: …" />
        </div>
      ) : data.vision ? (
        <blockquote className="vision">“{data.vision}”</blockquote>
      ) : (
        <NeedsSetup>Write where you want to be in a few years. Samuel uses it to weigh your goals.</NeedsSetup>
      )}
    </Card>
  )
}

/** Samuel breaks a goal into milestones and session-sized tasks placed in your routine, as suggestions to review. */
function Breakdown({ goal, coach, installed }: { goal: Goal; coach: ReturnType<typeof useCoachJob>; installed: boolean }) {
  const [asked, setAsked] = useState(false)
  const job = asked && coach.job?.skill === 'plan-builder' ? coach.job : null
  return (
    <div className="breakdown-bar">
      <span style={{ flex: 1, minWidth: 0 }}>
        {job?.status === 'done' ? <><strong>Samuel's breakdown is ready.</strong> Review the milestones and tasks before anything changes.</>
          : job?.status === 'failed' ? <span className="warn-text">{job.error ?? 'The breakdown failed. Try again.'}</span>
          : job?.status === 'running' ? 'Samuel is breaking it down into milestones and tasks for your routine blocks…'
          : <>Samuel can break <strong>{goal.title}</strong> into milestones and tasks the size of one work session, placed in your routine blocks.</>}
        {coach.error && asked && <span className="warn-text"> {coach.error}</span>}
      </span>
      {job?.status === 'done' ? <a href="#/about">Review the breakdown →</a> : (
        <button type="button" className="link-btn accent" disabled={!installed || coach.running}
          onClick={() => { setAsked(true); void coach.start('plan-builder', goal.id) }}>
          {job?.status === 'running' ? 'Working…' : installed ? 'Break this down with Samuel →' : 'Needs Claude Code'}
        </button>
      )}
    </div>
  )
}
