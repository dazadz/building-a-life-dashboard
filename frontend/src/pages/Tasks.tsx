import { useMemo, useState } from 'react'
import { api, type Task, type TasksSummary, type BlockKind } from '../api'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { dayDate, isoDate, localStamp, shortDate } from '../format'
import { useLoad, useNow, useQuery } from '../hooks'
import { TaskEditor } from '../components/TaskEditor'
import { KIND_LABEL } from '../blocks'

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
  const day = t.due_date === today ? 'Today' : dayDate(t.due_date)
  return t.due_time ? `${day} · ${t.due_time}` : day
}

export function TasksPage() {
  const now = useNow()
  const stamp = localStamp(now)
  const today = isoDate(now)
  const loaded = useLoad(() => api.tasks(localStamp(new Date())), [today])
  const [view, setView] = useState<View>('today')
  const [type, setType] = useState<string>('all')
  const query = useQuery()
  const [editing, setEditing] = useState<number | 'new' | null>(() => (query.get('new') !== null ? 'new' : null))
  const [newTitle] = useState(() => query.get('new') ?? '')
  // Goals and routine blocks for the editor's pickers.
  const pickers = useLoad(() => Promise.all([api.goals(today), api.routines()]), [today])
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
    const shown = inView.filter((t) => (type === 'all' || (type === 'none' ? !t.type : t.type === type))
      && (!needle || t.title.toLowerCase().includes(needle) || (t.notes ?? '').toLowerCase().includes(needle)))
    const due = (t: Task) => `${t.due_date ?? '9999'}T${t.due_time ?? '99'}`
    return shown.sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title)
        : sort === 'priority' ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || due(a).localeCompare(due(b))
        : view === 'done' ? (b.done_at ?? '').localeCompare(a.done_at ?? '')
        : due(a).localeCompare(due(b)))
  }, [s, view, type, filter, sort])

  const types = s ? (Object.keys(KIND_LABEL) as BlockKind[]).map((k) => [k, s.tasks.filter((t) => t.view !== 'done' && t.type === k).length] as const).filter(([, n]) => n > 0) : []
  const editTask = typeof editing === 'number' ? s?.tasks.find((t) => t.id === editing) : undefined
  const [goals, routines] = pickers.data ?? [null, []]

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">{new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="about-head">
          <h1 style={{ flex: 1 }}>Tasks</h1>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ New task</button>
        </div>
        <p>{s ? `${s.counts.today} open today · ${s.counts.overdue} overdue · ${s.this_week} more this week` : 'Loading your tasks…'}</p>
      </header>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}
      {error && <ErrorLine message={error} />}

      {editing !== null && (editing === 'new' || editTask) && (
        <TaskEditor
          key={editing}
          task={editTask}
          title={newTitle}
          goals={(goals?.goals ?? []).filter((g) => !g.done_date || g.id === editTask?.goal_id)}
          routines={routines}
          onClose={() => setEditing(null)}
          onSave={(fields, subtasks) => write(async () => {
            const now = localStamp(new Date())
            if (editing === 'new') return api.addTask(now, { ...fields, subtasks })
            let summary = await api.updateTask(now, editing, fields)
            for (const title of subtasks) summary = await api.addSubtask(now, editing, title)
            return summary
          })}
        />
      )}

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
            <select className="input" aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              {types.map(([k, n]) => <option key={k} value={k}>{KIND_LABEL[k]} · {n}</option>)}
              <option value="none">No type</option>
            </select>
            <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="due">Sort: due date</option>
              <option value="priority">Sort: priority</option>
              <option value="title">Sort: title</option>
            </select>
          </div>
          {!s ? <Loading lines={6} /> : rows.length === 0 ? (
            <NeedsSetup>
              <span style={{ flex: 1 }}>{view === 'today' ? 'Nothing due today.' : 'No tasks here.'}</span>
              <button type="button" className="link-btn accent" onClick={() => setEditing('new')}>New task →</button>
            </NeedsSetup>
          ) : (
            <ul className="list tasks">
              {(showAll ? rows : rows.slice(0, VISIBLE)).map((t) => (
                <TaskRow key={t.id} task={t} today={today} open={open === t.id} stamp={stamp}
                  onToggle={() => setOpen(open === t.id ? null : t.id)} onEdit={() => setEditing(t.id)} write={write} />
              ))}
            </ul>
          )}
        </Card>

        <div className="side-col">
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

function TaskRow({ task: t, today, open, stamp, onToggle, onEdit, write }: {
  task: Task; today: string; open: boolean; stamp: string; onToggle: () => void; onEdit: () => void
  write: (work: () => Promise<TasksSummary>) => Promise<boolean>
}) {
  const [subtask, setSubtask] = useState('')
  const [notes, setNotes] = useState(t.notes ?? '')
  const [confirming, setConfirming] = useState(false)
  const done = !!t.done_at
  const now = () => localStamp(new Date())
  return (
    <li className="task" data-open={open}>
      <div className="task-line">
        <input type="checkbox" className="check" checked={done} aria-label={`${t.title} done`}
          onChange={() => void write(() => api.updateTask(now(), t.id, { done: !done }))} />
        <button type="button" className="row-link task-title" aria-expanded={open} onClick={onToggle} data-done={done}>{t.title}</button>
        {t.subtasks.length > 0 && <span className="faint mono">{t.subtasks.filter((x) => x.done).length}/{t.subtasks.length}</span>}
        {t.type && <span className="tag kind-tag" data-kind={t.type}>{KIND_LABEL[t.type]}</span>}
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
            <button type="button" className="btn" onClick={onEdit}>Edit</button>
            <button type="button" className="link-btn" onClick={() => setConfirming(true)}>Delete</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirming} title="Delete task?" confirmLabel="Delete task"
        onConfirm={() => { setConfirming(false); void write(() => api.deleteTask(now(), t.id)) }}
        onCancel={() => setConfirming(false)}>
        <p><strong>{t.title}</strong>{t.subtasks.length > 0 ? ' and its subtasks' : ''} will be deleted.</p>
      </ConfirmDialog>
    </li>
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
