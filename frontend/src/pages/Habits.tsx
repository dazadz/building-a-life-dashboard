import { useState } from 'react'
import { api, type HabitHistory, type HabitStatus, type Settings } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { isoDate, scoreText, shortDate } from '../format'
import { useLoad, useNow } from '../hooks'

const PERIODS = [7, 14, 30, 90] as const
type Row = HabitHistory['habits'][number]
type SortKey = 'position' | 'name' | 'streak' | 'best' | 'rate'

/** Clicking a square cycles: not logged, done, missed, back to not logged. */
const NEXT: Record<string, HabitStatus | null> = { none: 'done', done: 'missed', missed: null, skipped: null }
const STATUS_LABEL: Record<string, string> = { done: 'Done', missed: 'Missed', skipped: 'Skipped', none: 'Not logged' }
const PATTERNS_SHOWN = 5

function dayLetter(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })
}

export function HabitsPage() {
  const today = isoDate(useNow())
  const [days, setDays] = useState<number>(14)
  const history = useLoad(() => api.habits(today, days), [today, days])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const h = history.data

  const log = async (key: string, date: string, current: HabitStatus | null) => {
    setError(null)
    try {
      await api.logHabit(date, key, NEXT[current ?? 'none'])
      history.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Last {days} days</div>
        <div className="about-head">
          <h1 style={{ flex: 1 }}>Habits</h1>
          <button type="button" className="btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Done editing' : 'Edit habits'}
          </button>
        </div>
        <p>
          {h ? `${h.habits.length} daily trackers. ` : ''}
          {h?.consistency != null ? `Consistency is ${h.consistency}% over this period.` : 'Log a few days to see your consistency.'}
        </p>
      </header>

      <div className="pills" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} type="button" className="pill" aria-pressed={days === p} onClick={() => setDays(p)}>
            {p} days
          </button>
        ))}
      </div>

      {history.error && <ErrorLine message={history.error} onRetry={history.reload} />}
      {error && <ErrorLine message={error} />}

      {editing && <EditHabits today={today} onChanged={history.reload} onClose={() => setEditing(false)} />}

      <Trackers history={h} onLog={log} />

      <div className="row">
        <Patterns history={h} />
        <Weekly history={h} />
      </div>
    </div>
  )
}

function Trackers({ history, onLog }: { history: HabitHistory | null; onLog: (key: string, date: string, s: HabitStatus | null) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'position', desc: false })
  if (!history) return <Card title="Daily trackers" action={<a href="#/checkin">Check-in →</a>}><Loading lines={6} /></Card>

  const compact = history.dates.length > 14
  const rows = [...history.habits]
  if (sort.key !== 'position') {
    const k = sort.key
    rows.sort((a, b) => {
      const av = a[k] ?? -1
      const bv = b[k] ?? -1
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number)
      return sort.desc ? -cmp : cmp
    })
  }
  const sortBy = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined)
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')

  return (
    <Card
      title="Daily trackers"
      meta="Click a square to log"
      secondary={
        <span className="legend">
          {(['done', 'missed', 'skipped', 'none'] as const).map((s) => (
            <span key={s}><span className={`sq ${s}`} aria-hidden="true" /> {STATUS_LABEL[s]}</span>
          ))}
        </span>
      }
      action={<a href="#/checkin">Check-in →</a>}
    >
      <div className="table-scroll">
        <table className={`habit-grid ${compact ? 'compact' : ''}`}>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort('name')}>
                <button type="button" className="th-btn" onClick={() => sortBy('name')}>Habit{arrow('name')}</button>
              </th>
              {history.dates.map((d) => (
                <th scope="col" key={d} className="day-col" title={shortDate(d)}>
                  {compact ? <span className="sr-only">{shortDate(d)}</span> : (
                    <>
                      <span className="faint">{dayLetter(d)}</span>
                      <br />
                      {Number(d.slice(8))}
                    </>
                  )}
                </th>
              ))}
              {(['streak', 'best', 'rate'] as const).map((k) => (
                <th scope="col" key={k} className="num" aria-sort={ariaSort(k)}>
                  <button type="button" className="th-btn" onClick={() => sortBy(k)}>
                    {k === 'rate' ? `${history.dates.length}-day rate` : k === 'best' ? 'Best' : 'Streak'}{arrow(k)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TrackerRow key={r.key} row={r} dates={history.dates} onLog={onLog} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TrackerRow({ row, dates, onLog }: { row: Row; dates: string[]; onLog: (key: string, date: string, s: HabitStatus | null) => void }) {
  return (
    <tr>
      <th scope="row">
        {row.name}
        {row.auto === 1 && <span className="tag" title="Ticked from the check-in">auto</span>}
      </th>
      {row.days.map((s, i) => (
        <td key={dates[i]} className="day-col">
          <button
            type="button"
            className={`sq ${s ?? 'none'}`}
            aria-label={`${row.name}, ${shortDate(dates[i])}: ${STATUS_LABEL[s ?? 'none']}`}
            onClick={() => onLog(row.key, dates[i], s)}
          />
        </td>
      ))}
      <td className="num">
        {row.streak > 0 ? `${row.streak} d` : row.best > 0 ? <span className="warn-text">Broken</span> : '—'}
      </td>
      <td className="num">{row.best} d</td>
      <td className="num">{row.rate == null ? '—' : `${row.rate}%`}</td>
    </tr>
  )
}

function Patterns({ history }: { history: HabitHistory | null }) {
  const [showAll, setShowAll] = useState(false)
  const list = history?.patterns ?? []
  return (
    <Card
      title="Patterns"
      meta={history ? `${list.length} found` : undefined}
      secondary={list.length > PATTERNS_SHOWN && (
        <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show ${list.length - PATTERNS_SHOWN} more`}
        </button>
      )}
      action={<a href="#/coach">Ask Samuel why →</a>}
    >
      {!history ? <Loading /> : list.length === 0 ? (
        <NeedsSetup>No repeated misses yet. Samuel flags a habit when it's missed on 3 of the last 4 of the same weekday.</NeedsSetup>
      ) : (
        <ul className="list">
          {(showAll ? list : list.slice(0, PATTERNS_SHOWN)).map((p) => (
            <li key={`${p.key}-${p.weekday}`}>
              <span className="dot missed" aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="item-name">{p.name}</span>
                <span className="muted"> · missed {p.missed} of the last {p.of} {p.weekday}s</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Weekly({ history }: { history: HabitHistory | null }) {
  const weeks = history?.weekly ?? []
  const latest = weeks.at(-1)?.consistency
  return (
    <Card title="Consistency by week" meta={history ? `This week ${scoreText(latest)}${latest != null ? '%' : ''}` : undefined}
      action={<a href="#/coach">Weekly report →</a>}>
      {!history ? <Loading /> : (
        <div className="bars" role="img"
          aria-label={`Weekly consistency: ${weeks.map((w) => `week of ${shortDate(w.week_start)} ${w.consistency == null ? 'no data' : `${w.consistency}%`}`).join(', ')}`}>
          {weeks.map((w, i) => (
            <div className="bar-col" key={w.week_start}>
              <span className="bar-value">{w.consistency ?? '—'}</span>
              <div className="bar" style={{ height: `${w.consistency ?? 0}%` }} data-current={i === weeks.length - 1} />
              <span className="bar-label">{shortDate(w.week_start)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Rename habits, turn tracking on or off (history is kept), and add your own. */
function EditHabits({ today, onChanged, onClose }: { today: string; onChanged: () => void; onClose: () => void }) {
  const loaded = useLoad(() => api.settings(today), [today])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const habits = loaded.data?.habits

  const write = async (work: () => Promise<Settings['habits']>) => {
    setError(null)
    try {
      const list = await work()
      loaded.setData({ ...loaded.data!, habits: list })
      onChanged()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  const add = async () => {
    if (name.trim() && await write(() => api.addHabit(name.trim()))) setName('')
  }

  return (
    <Card title="Edit habits" className="wide" meta={habits ? `${habits.filter((x) => x.active).length} of ${habits.length} tracked` : undefined}
      secondary={<button type="button" className="link-btn" onClick={onClose}>Done editing</button>}
      action={<a href="#/routine">Link a habit to a routine block →</a>}>
      {!habits ? <Loading lines={5} /> : (
        <ul className="list">
          {habits.map((x) => (
            <li key={`${x.key}-${x.name}`} className="habit-edit-row">
              <input className="input" aria-label={`${x.name} name`} maxLength={60} defaultValue={x.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name) void write(() => api.renameHabit(x.key, v)) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
              {x.auto === 1 && <span className="tag" title="Ticked from the check-in">auto</span>}
              <label className="check-label">
                <input type="checkbox" className="check" checked={x.active}
                  onChange={(e) => void write(() => api.setHabitActive(x.key, e.target.checked))} /> Tracking
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="routine-add habit-add" aria-label="Add your own habit">
        <input className="input" aria-label="New habit" placeholder="Your own habit, e.g. 10 min stretch" maxLength={60}
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
        <button type="button" className="btn" onClick={() => void add()}>Add habit</button>
      </div>
      <p className="faint" style={{ margin: 0 }}>Turning a habit off hides it from your days but keeps its history.</p>
      {error && <ErrorLine message={error} />}
    </Card>
  )
}
