import { Fragment, useState, type ChangeEvent, type ReactNode } from 'react'
import { api, AREAS, type Suggestion, type SuggestionKind, type SuggestionPayload, type Suggestions } from '../api'
import { Card } from './Card'
import { Weekdays } from './Routine'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { alphabetical, isoDate } from '../format'
import { useLoad } from '../hooks'

const KIND_LABEL: Record<SuggestionKind, string> = {
  pain: 'Pain', goal: 'Goal', milestone: 'Milestone', habit: 'Habit', task: 'Task', routine: 'Routine',
}
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Where an accepted suggestion lands, for the note after accepting.
const LANDS: Record<SuggestionKind, [string, string]> = {
  pain: ['About me', '#/about'], goal: ['Goals', '#/goals'], milestone: ['Goals', '#/goals'],
  habit: ['Habits', '#/habits'], task: ['Tasks', '#/tasks'], routine: ['Routine', '#/routine'],
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
// Read the date when you click, so a page left open overnight accepts for the right day.
const today = () => isoDate(new Date())

/** A heading for each group Samuel sent: a plan, one goal's breakdown, or a chat. */
function batchLabel(batch: string | null): string {
  if (!batch) return 'Other ideas'
  if (batch === 'plan') return 'Your plan'
  if (batch === 'chat') return 'From chat'
  if (batch === 'weekly review') return 'From your weekly review'
  if (batch.startsWith('breakdown:')) return `Break down · ${batch.slice('breakdown:'.length).trim()}`
  return batch
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** One line of detail under the title, so a suggestion can be judged without opening it. */
function detail(s: Suggestion): string {
  const p = s.payload
  if (s.kind === 'routine') {
    const days = Array.isArray(p.weekdays) ? (p.weekdays as number[]) : []
    return `${days.length === 7 ? 'Every day' : days.map((d) => DAY[d]).join(' ')} · ${str(p.start)}–${str(p.end)}${p.note ? ` · ${str(p.note)}` : ''}`
  }
  if (s.kind === 'goal') {
    const n = Array.isArray(p.milestones) ? p.milestones.length : 0
    return [str(p.area), n ? `${n} milestones` : '', p.target_date ? `by ${shortDate(str(p.target_date))}` : ''].filter(Boolean).join(' · ')
  }
  if (s.kind === 'task') return [p.due_date ? `Due ${shortDate(str(p.due_date))}` : '', str(p.goal_title), str(p.notes)].filter(Boolean).join(' · ')
  if (s.kind === 'milestone') return [str(p.goal_title), p.due_date ? `due ${shortDate(str(p.due_date))}` : ''].filter(Boolean).join(' · ')
  if (s.kind === 'pain') return [str(p.area), p.habit_name ? `Tracked by ${str(p.habit_name)}` : ''].filter(Boolean).join(' · ')
  return ''
}

interface Props {
  /** Rows shown before "Show more". */
  limit: number
  /** Home hides the card when nothing is waiting; About me shows how to get suggestions. */
  hideWhenEmpty?: boolean
  /** Changes when a coach run finishes, so new suggestions load. */
  refresh?: unknown
  onChanged?: () => void
  action: ReactNode
}

/** Samuel's suggestions: nothing changes until you accept one. */
export function SuggestionsCard({ limit, hideWhenEmpty, refresh, onChanged, action }: Props) {
  const loaded = useLoad(() => api.suggestions(), [refresh])
  const [filter, setFilter] = useState<SuggestionKind | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [landed, setLanded] = useState<[string, string] | null>(null)
  const data = loaded.data

  // Hide on Home when nothing is waiting, but keep the card while it says where the last one went.
  if (hideWhenEmpty && (!data || data.total === 0) && !landed) return null

  const pending = data?.pending ?? []
  const order = [...new Set([...pending].reverse().map((s) => s.batch))]
  const grouped = [...pending].sort((a, b) => order.indexOf(a.batch) - order.indexOf(b.batch) || a.id - b.id)
  const filtered = filter === 'all' ? grouped : grouped.filter((s) => s.kind === filter)
  const shown = showAll ? filtered : filtered.slice(0, limit)
  const kinds = (Object.keys(KIND_LABEL) as SuggestionKind[]).filter((k) => (data?.counts[k] ?? 0) > 0)

  const act = async (work: () => Promise<Suggestions>, s?: Suggestion) => {
    setBusy(true)
    setError(null)
    try {
      const next = await work()
      loaded.setData(next)
      setSelected((sel) => new Set([...sel].filter((id) => next.pending.some((p) => p.id === id))))
      if (s) setLanded(LANDS[s.kind])
      setEditing(null)
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const accept = (s: Suggestion, payload?: SuggestionPayload) => act(() => api.acceptSuggestion(today(), s.id, payload), s)
  const dismiss = (s: Suggestion) => act(() => api.dismissSuggestion(s.id))
  // Accept in the order Samuel sent them, so habits and goals exist before the pains that link to them.
  const acceptSelected = () => act(async () => {
    let last = data!
    for (const s of pending.filter((p) => selected.has(p.id))) last = await api.acceptSuggestion(today(), s.id)
    return last
  })
  // Accept what's ticked, then turn down everything else that's showing.
  const dismissRest = () => act(async () => {
    let last = await acceptSelectedNow()
    for (const s of filtered.filter((p) => !selected.has(p.id))) last = await api.dismissSuggestion(s.id)
    return last
  })
  const acceptSelectedNow = async () => {
    let last = data!
    for (const s of pending.filter((p) => selected.has(p.id))) last = await api.acceptSuggestion(today(), s.id)
    return last
  }
  const acceptBatch = (batch: string | null) => act(async () => {
    let last = data!
    for (const s of pending.filter((p) => p.batch === batch)) last = await api.acceptSuggestion(today(), s.id)
    return last
  })
  const toggle = (id: number) => setSelected((sel) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <Card
      title="Samuel suggests"
      className="wide"
      meta={data ? `${data.total} waiting` : undefined}
      secondary={
        <span className="pills">
          {selected.size > 0 && (
            <>
              <button type="button" className="link-btn accent" disabled={busy} onClick={() => void acceptSelected()}>
                Accept {selected.size} selected
              </button>
              <button type="button" className="link-btn" disabled={busy} onClick={() => void dismissRest()}>
                Dismiss the rest
              </button>
            </>
          )}
          {filtered.length > limit && (
            <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show ${filtered.length - limit} more`}
            </button>
          )}
        </span>
      }
      action={action}
    >
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !data ? <Loading lines={3} /> : data.total === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>Nothing waiting. Ask Samuel to build your plan, or tell Samuel about your week in chat.</span>
          <a href="#/coach">Chat →</a>
        </NeedsSetup>
      ) : (
        <>
          <div className="pills" role="group" aria-label="Filter suggestions">
            <button type="button" className="pill" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {data.total}</button>
            {kinds.map((k) => (
              <button key={k} type="button" className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {KIND_LABEL[k]} {data.counts[k]}
              </button>
            ))}
          </div>
          <ul className="list suggestion-list">
            {shown.map((s, i) => (
              <Fragment key={s.id}>
              {(i === 0 || shown[i - 1].batch !== s.batch) && new Set(pending.map((p) => p.batch)).size > 1 && (
                <li className="suggestion-group">
                  <span className="meter-label">{batchLabel(s.batch)}</span>
                  <span className="faint mono">{pending.filter((p) => p.batch === s.batch).length}</span>
                  <button type="button" className="link-btn accent" disabled={busy}
                    onClick={() => void acceptBatch(s.batch)}>Accept all {pending.filter((p) => p.batch === s.batch).length}</button>
                </li>
              )}
              <li className="suggestion">
                <div className="suggestion-row">
                  <input type="checkbox" className="check" aria-label={`Select ${s.title}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="tag kind-tag" data-kind={s.kind}>{KIND_LABEL[s.kind]}</span>
                  <span className="suggestion-text">
                    <span className="item-name">{s.title}</span>
                    {detail(s) && <span className="faint suggestion-detail">{detail(s)}</span>}
                    {s.reason && <span className="muted suggestion-why">Why: {s.reason}</span>}
                  </span>
                  <span className="suggestion-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void accept(s)}>Accept</button>
                    <button type="button" className="btn btn-small" disabled={busy} aria-expanded={editing === s.id}
                      onClick={() => setEditing(editing === s.id ? null : s.id)}>Edit</button>
                    <button type="button" className="link-btn" disabled={busy} onClick={() => void dismiss(s)}>Dismiss</button>
                  </span>
                </div>
                {editing === s.id && (
                  <SuggestionEditor suggestion={s} busy={busy} onCancel={() => setEditing(null)} onAccept={(p) => void accept(s, p)} />
                )}
              </li>
              </Fragment>
            ))}
          </ul>
        </>
      )}
      {error && <ErrorLine message={error} />}
      {landed && !error && (
        <div className="notice ok" role="status">Added. <a href={landed[1]}>See it in {landed[0]} →</a></div>
      )}
    </Card>
  )
}

/** Edit a suggestion before accepting it. The server checks it again, so a bad edit changes nothing. */
function SuggestionEditor({ suggestion, busy, onCancel, onAccept }: {
  suggestion: Suggestion; busy: boolean; onCancel: () => void; onAccept: (payload: SuggestionPayload) => void
}) {
  const [p, setP] = useState<SuggestionPayload>(suggestion.payload)
  const set = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setP({ ...p, [key]: e.target.value === '' ? null : e.target.value })
  const id = (key: string) => `s${suggestion.id}-${key}`
  const text = (key: string, label: string, max: number) => (
    <div className="field">
      <label htmlFor={id(key)}>{label}</label>
      <input id={id(key)} className="input" maxLength={max} value={str(p[key])} onChange={set(key)} />
    </div>
  )
  const when = (key: string, label: string, type: 'date' | 'time') => (
    <div className="field">
      <label htmlFor={id(key)}>{label}</label>
      <input id={id(key)} className="input" type={type} value={str(p[key])} onChange={set(key)} />
    </div>
  )
  const k = suggestion.kind
  return (
    <div className="suggestion-editor">
      <div className="fields">
        {k === 'routine' && <>{text('name', 'Block', 80)}{when('start', 'Start', 'time')}{when('end', 'End', 'time')}{text('note', 'What to do', 200)}</>}
        {k === 'task' && <>{text('title', 'Task', 200)}{when('due_date', 'Due', 'date')}{when('due_time', 'Time', 'time')}{text('notes', 'Notes', 400)}</>}
        {k === 'habit' && text('name', 'Habit', 60)}
        {k === 'milestone' && <>{text('title', 'Milestone', 120)}{when('due_date', 'Due', 'date')}</>}
        {k === 'pain' && <>{text('text', 'Pain', 160)}{text('area', 'Area', 40)}{text('evidence', 'What shows it', 300)}</>}
        {k === 'goal' && (
          <>
            {text('title', 'Goal', 120)}
            <div className="field">
              <label htmlFor={id('area')}>Area</label>
              <select id={id('area')} className="input" value={str(p.area)} onChange={set('area')}>
                {alphabetical(AREAS, (a) => a).map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
              </select>
            </div>
            {when('target_date', 'Target date', 'date')}
          </>
        )}
      </div>
      {k === 'routine' && (
        <Weekdays label={suggestion.title} value={Array.isArray(p.weekdays) ? (p.weekdays as number[]) : [0, 1, 2, 3, 4, 5, 6]}
          onChange={(w) => setP({ ...p, weekdays: w })} />
      )}
      {k === 'goal' && Array.isArray(p.milestones) && p.milestones.length > 0 && (
        <ul className="list">
          {(p.milestones as { title: string; due_date?: string | null }[]).map((m, i) => (
            <li key={i}><span style={{ flex: 1 }}>{m.title}</span><span className="mono faint">{m.due_date ? shortDate(m.due_date) : 'no date'}</span></li>
          ))}
        </ul>
      )}
      <div className="task-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAccept(p)}>Save and accept</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
