import { useMemo, useState } from 'react'
import { api, type Task, type TasksSummary } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, isoDate, localStamp, shortDate } from '../format'
import { useLoad, useNow } from '../hooks'
import { parseQuickAdd } from '../quickadd'

type View = 'today' | 'upcoming' | 'overdue' | 'all' | 'done'
type Sort = 'due' | 'priority' | 'title'

const VIEWS: { key: View; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All' }, { key: 'done', label: 'Done' },
]
const VISIBLE = 8
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 }

function when(t: Task, today: string): string {
  if (!t.due_date) return 'No date'
  const day = t.due_date === today ? 'Today' : t.due_date === addDays(today, 1) ? 'Tomorrow'
    : t.due_date > today && t.due_date <= addDays(today, 6)
      ? new Date(`${t.due_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
      : shortDate(t.due_date)
  return t.due_time ? `${day} · ${t.due_time}` : day
}

export function TasksPage() {
  const now = useNow()
  const stamp = localStamp(now)
  const today = isoDate(now)
  const loaded = useLoad(() => api.tasks(localStamp(new Date())), [today])
  const [view, setView] = useState<View>('today')
  const [list, setList] = useState<string>('all')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>('due')
  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = loaded.data

  const write = async (work: () => Promise<TasksSummary>) => {
    setError(null)
    try {
      loaded.setData(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const rows = useMemo(() => {
    if (!s) return []
    const inView = s.tasks.filter((t) =>
      view === 'done' ? t.view === 'done'
        : view === 'all' ? t.view !== 'done'
        : view === 'upcoming' ? t.view === 'upcoming' || t.view === 'someday'
        : t.view === view)
    const needle = filter.trim().toLowerCase()
    const shown = inView.filter((t) => (list === 'all' || t.list === list)
      && (!needle || t.title.toLowerCase().includes(needle) || (t.notes ?? '').toLowerCase().includes(needle)))
    const due = (t: Task) => `${t.due_date ?? '9999'}T${t.due_time ?? '99'}`
    return shown.sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title)
        : sort === 'priority' ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || due(a).localeCompare(due(b))
        : view === 'done' ? (b.done_at ?? '').localeCompare(a.done_at ?? '')
        : due(a).localeCompare(due(b)))
  }, [s, view, list, filter, sort])

  const lists = s ? s.lists.map((l) => [l, s.tasks.filter((t) => t.view !== 'done' && t.list === l).length] as const) : []

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">{new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Tasks</h1>
        <p>{s ? `${s.counts.today} open today · ${s.counts.overdue} overdue · ${s.this_week} more this week` : 'Loading your tasks…'}</p>
      </header>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}
      {error && <ErrorLine message={error} />}

      <div className="row">
        <Card
          title="Your tasks"
          className="wide"
          meta={s ? `${rows.length} shown` : undefined}
          secondary={rows.length > VISIBLE && (
            <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show ${rows.length - VISIBLE} more`}
            </button>
          )}
          action={<a href="#/goals">Goals →</a>}
        >
          <div className="pills" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" className="pill" aria-pressed={view === v.key} onClick={() => { setView(v.key); setShowAll(false) }}>
                {v.label}{s ? ` · ${s.counts[v.key]}` : ''}
              </button>
            ))}
          </div>
          <div className="task-filters">
            <input className="input" aria-label="Filter tasks" placeholder="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="input" aria-label="List" value={list} onChange={(e) => setList(e.target.value)}>
              <option value="all">All lists</option>
              {lists.map(([l, n]) => <option key={l} value={l}>{l} · {n}</option>)}
            </select>
            <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="due">Sort: due date</option>
              <option value="priority">Sort: priority</option>
              <option value="title">Sort: title</option>
            </select>
          </div>
          {!s ? <Loading lines={6} /> : rows.length === 0 ? (
            <NeedsSetup>{view === 'today' ? 'Nothing due today. Add a task on the right.' : 'No tasks here.'}</NeedsSetup>
          ) : (
            <ul className="list tasks">
              {(showAll ? rows : rows.slice(0, VISIBLE)).map((t) => (
                <TaskRow key={t.id} task={t} today={today} open={open === t.id} stamp={stamp}
                  onToggle={() => setOpen(open === t.id ? null : t.id)} write={write} />
              ))}
            </ul>
          )}
        </Card>

        <div className="side-col">
          <QuickAdd today={today} lists={s?.lists ?? ['Personal', 'Work']} onAdd={(task) => write(() => api.addTask(localStamp(new Date()), task))} />
          <Card title="Reminders" meta={s ? `${s.reminders.length} this week` : undefined} action={<a href="#/settings">Settings →</a>}>
            <NotificationsSwitch />
            {!s ? <Loading /> : s.reminders.length === 0 ? <NeedsSetup>No reminders this week. Add a time to a task to get one.</NeedsSetup> : (
              <ul className="list">
                {s.reminders.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <span className="mono accent-text" style={{ width: 64 }}>
                      {r.remind_at.slice(0, 10) === today ? r.remind_at.slice(11) : new Date(`${r.remind_at.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }} className={r.remind_at < stamp ? 'muted' : undefined}>{r.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task: t, today, open, stamp, onToggle, write }: {
  task: Task; today: string; open: boolean; stamp: string; onToggle: () => void
  write: (work: () => Promise<TasksSummary>) => Promise<boolean>
}) {
  const [subtask, setSubtask] = useState('')
  const [notes, setNotes] = useState(t.notes ?? '')
  const done = !!t.done_at
  const now = () => localStamp(new Date())
  return (
    <li className="task" data-open={open}>
      <div className="task-line">
        <input type="checkbox" className="check" checked={done} aria-label={`${t.title} done`}
          onChange={() => void write(() => api.updateTask(now(), t.id, { done: !done }))} />
        <button type="button" className="row-link task-title" aria-expanded={open} onClick={onToggle} data-done={done}>{t.title}</button>
        {t.subtasks.length > 0 && <span className="faint mono">{t.subtasks.filter((x) => x.done).length}/{t.subtasks.length}</span>}
        <span className="tag" style={{ marginLeft: 0 }}>{t.list}</span>
        {t.priority === 'high' && <span className="tag priority-high" style={{ marginLeft: 0 }}>High</span>}
        <span className={`mono task-when ${t.view === 'overdue' ? 'warn-text' : 'faint'}`}>{when(t, today)}</span>
      </div>
      {open && (
        <div className="task-detail">
          <textarea className="input" aria-label={`${t.title} notes`} placeholder="Notes" maxLength={4000} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== (t.notes ?? '')) void write(() => api.updateTask(now(), t.id, { notes: notes || null })) }} />
          {t.subtasks.length > 0 && (
            <ul className="list">
              {t.subtasks.map((x) => (
                <li key={x.id}>
                  <input type="checkbox" className="check" checked={x.done} aria-label={`${x.title} done`}
                    onChange={() => void write(() => api.setSubtask(now(), x.id, !x.done))} />
                  <span style={{ flex: 1 }} className={x.done ? 'muted' : undefined}>{x.title}</span>
                  <button type="button" className="link-btn" aria-label={`Remove ${x.title}`} onClick={() => void write(() => api.deleteSubtask(now(), x.id))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline-add" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
            <input className="input" aria-label="New subtask" placeholder="Add a subtask" maxLength={200} value={subtask}
              onChange={(e) => setSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && subtask.trim()) { e.preventDefault(); void write(() => api.addSubtask(now(), t.id, subtask.trim())).then((ok) => ok && setSubtask('')) } }} />
            <button type="button" className="btn" disabled={!subtask.trim()}
              onClick={() => void write(() => api.addSubtask(now(), t.id, subtask.trim())).then((ok) => ok && setSubtask(''))}>Add</button>
          </div>
          <div className="task-meta faint">
            {t.remind_at ? `Reminder ${t.remind_at.slice(0, 10) === today ? 'at' : shortDate(t.remind_at.slice(0, 10)) + ' at'} ${t.remind_at.slice(11)}${t.remind_at < stamp ? ' (passed)' : ''}` : 'No reminder'}
            {t.goal_title && <> · Goal: {t.goal_title}</>}
          </div>
          <div className="task-actions">
            {!done && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => void write(() => api.updateTask(now(), t.id, { done: true }))}>Done</button>
                <button type="button" className="btn" onClick={() => void write(() => api.snoozeTask(now(), t.id, 'hour'))}>+1 hour</button>
                <button type="button" className="btn" onClick={() => void write(() => api.snoozeTask(now(), t.id, 'tomorrow'))}>Tomorrow</button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="link-btn" onClick={() => { if (window.confirm(`Delete "${t.title}"?`)) void write(() => api.deleteTask(now(), t.id)) }}>Delete</button>
          </div>
        </div>
      )}
    </li>
  )
}

function QuickAdd({ today, lists, onAdd }: { today: string; lists: string[]; onAdd: (task: ReturnType<typeof parseQuickAdd>) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const parsed = parseQuickAdd(text, today)
  const add = async () => {
    if (!parsed.title) return
    if (await onAdd({ ...parsed, list: parsed.list ?? 'Personal' })) setText('')
  }
  return (
    <Card title="Quick add" meta="Type naturally" action={<button type="button" className="link-btn accent" disabled={!parsed.title} onClick={() => void add()}>Add task →</button>}>
      <input className="input" aria-label="Quick add" placeholder="Call Sarah tomorrow at 9 #work !high" maxLength={300} value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
      <p className="hint" style={{ margin: 0 }}>
        Dates (today, tomorrow, fri, 3 Nov, in 3 days), times (at 9, 13:45, 7pm), #list ({lists.slice(0, 3).join(', ')}) and !high or !low are picked up.
      </p>
      {text.trim() && (
        <div className="quick-preview" aria-live="polite">
          <strong>{parsed.title || 'Add a title'}</strong>
          <span className="tag" style={{ marginLeft: 0 }}>{parsed.list ?? 'Personal'}</span>
          {parsed.priority && <span className={`tag ${parsed.priority === 'high' ? 'priority-high' : ''}`} style={{ marginLeft: 0 }}>{parsed.priority}</span>}
          {parsed.due_date && <span className="mono faint">{shortDate(parsed.due_date)}{parsed.due_time ? ` · ${parsed.due_time}` : ''}</span>}
          {parsed.remind_at && <span className="faint">reminder</span>}
        </div>
      )}
    </Card>
  )
}

function NotificationsSwitch() {
  const supported = typeof Notification !== 'undefined'
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')
  if (!supported || permission === 'granted') return null
  return (
    <NeedsSetup>
      <span style={{ flex: 1 }}>
        {permission === 'denied'
          ? 'Windows notifications are blocked for Samuel. Reminders still show inside the app.'
          : 'Turn on Windows notifications so reminders reach you while Samuel is open.'}
      </span>
      {permission === 'default' && (
        <button type="button" className="link-btn accent" onClick={() => void Notification.requestPermission().then(setPermission)}>Turn on →</button>
      )}
    </NeedsSetup>
  )
}
