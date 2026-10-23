import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { api, type Monthly, type Report, type Status } from '../api'
import { Card } from '../components/Card'
import { MiniBars } from '../components/MiniBars'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { deltaText, isoDate, scoreText } from '../format'
import { useLoad, useNow, type useCoachJob } from '../hooks'

interface Props {
  coach: ReturnType<typeof useCoachJob>
  status: Status | null
}

type SortKey = 'name' | 'now' | 'change'
const VISIBLE = 6

function monthName(ym: string): string {
  return new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function shift(ym: string, by: number): string {
  const d = new Date(`${ym}-01T12:00:00`)
  d.setMonth(d.getMonth() + by)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Weekly and Monthly switch, shared by both review pages. */
export function ReviewTabs({ current }: { current: 'weekly' | 'monthly' }) {
  return (
    <div className="pills" role="group" aria-label="Review">
      <a className="pill pill-link" href="#/review" aria-current={current === 'weekly' ? 'page' : undefined}>Weekly</a>
      <a className="pill pill-link" href="#/monthly" aria-current={current === 'monthly' ? 'page' : undefined}>Monthly</a>
    </div>
  )
}

export function MonthlyPage({ coach, status }: Props) {
  const today = isoDate(useNow())
  const [month, setMonth] = useState<string | undefined>(undefined)
  const loaded = useLoad(() => api.monthly(today, month), [today, month])
  const m = loaded.data

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">{m ? monthName(m.month) : 'Monthly evolution'}</div>
        <h1>Monthly evolution</h1>
        <p>
          {m ? `${m.numbers.days_logged} of ${m.numbers.days_so_far} days logged${m.is_current ? ' so far' : ''}. Compared with ${monthName(m.previous)}.` : 'Loading the month…'}
        </p>
      </header>

      <div className="review-bar">
        <ReviewTabs current="monthly" />
        <div className="pills" role="group" aria-label="Month">
          <button type="button" className="pill" disabled={!m} onClick={() => m && setMonth(shift(m.month, -1))}>← Previous month</button>
          <button type="button" className="pill" disabled={!m || m.is_current} onClick={() => m && setMonth(shift(m.month, 1))}>Next month →</button>
        </div>
      </div>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}

      <Analysis month={m} coach={coach} status={status} />

      <div className="row">
        <Scorecard month={m} />
        <Card title="Discipline trend" className="wide" meta="Daily score" action={<a href="#/habits">Habits →</a>}>
          {!m ? <Loading lines={5} /> : !m.trend.some((t) => t.discipline != null) ? (
            <NeedsSetup>No habit logs this month yet. Discipline comes from the habits you log each day.</NeedsSetup>
          ) : (
            <>
              <MiniBars label="Discipline (0–100)" series={m.trend.map((t) => ({ date: t.date, value: t.discipline }))} max={100} unit="" />
              <p className="muted" style={{ margin: 0 }}>
                7-day average at the end of the period: <strong>{scoreText([...m.trend].reverse().find((t) => t.average != null)?.average)}</strong>
              </p>
            </>
          )}
        </Card>
      </div>

      <HabitEvolution month={m} />
    </div>
  )
}

function Scorecard({ month: m }: { month: Monthly | null }) {
  const rows = m ? [
    { label: 'Discipline', value: scoreText(m.numbers.discipline), change: m.changes.discipline },
    { label: 'Productivity', value: scoreText(m.numbers.productivity), change: m.changes.productivity },
    { label: 'Consistency', value: m.numbers.consistency == null ? '—' : `${m.numbers.consistency}%`, change: m.changes.consistency },
    { label: 'Energy', value: scoreText(m.numbers.energy), change: m.changes.energy },
    { label: 'Sleep', value: m.numbers.sleep == null ? '—' : `${m.numbers.sleep} h`, change: m.changes.sleep },
    {
      label: 'Goal completion',
      value: m.numbers.milestones_due ? `${m.numbers.milestones_done} / ${m.numbers.milestones_due}` : '—',
      change: m.changes.goal_completion, note: m.numbers.goal_completion != null ? `milestones hit · ${m.numbers.goal_completion}%` : null,
    },
  ] : []
  return (
    <Card title="Month scorecard" meta={m ? `vs ${monthName(m.previous)}` : undefined} action={<a href="#/goals">Goals →</a>}>
      {!m ? <Loading lines={6} /> : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="muted" style={{ flex: 1 }}>{r.label}{'note' in r && r.note ? <span className="faint"> · {r.note}</span> : null}</span>
              {deltaText(r.change) && <span className={r.change! > 0 ? 'delta-up' : 'delta-down'}>{deltaText(r.change)}</span>}
              <strong>{r.value}</strong>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function HabitEvolution({ month: m }: { month: Monthly | null }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'change', desc: true })
  const [showAll, setShowAll] = useState(false)
  const rows = [...(m?.habits ?? [])].sort((a, b) => {
    const cmp = sort.key === 'name' ? a.name.localeCompare(b.name) : (a[sort.key] ?? -999) - (b[sort.key] ?? -999)
    return sort.desc ? -cmp : cmp
  })
  const sortBy = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined)
  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')
  return (
    <Card
      title="Habit evolution"
      meta="Completion rate"
      secondary={rows.length > VISIBLE && (
        <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show ${rows.length - VISIBLE} more`}
        </button>
      )}
      action={<a href="#/habits">All habits →</a>}
    >
      {!m ? <Loading lines={6} /> : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort('name')}><button type="button" className="th-btn" onClick={() => sortBy('name')}>Habit{arrow('name')}</button></th>
                <th scope="col" className="num">{new Date(`${m.previous}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })}</th>
                <th scope="col" className="num" aria-sort={ariaSort('now')}><button type="button" className="th-btn" onClick={() => sortBy('now')}>{new Date(`${m.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })}{arrow('now')}</button></th>
                <th scope="col" className="num" aria-sort={ariaSort('change')}><button type="button" className="th-btn" onClick={() => sortBy('change')}>Change{arrow('change')}</button></th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? rows : rows.slice(0, VISIBLE)).map((h) => (
                <tr key={h.key}>
                  <th scope="row">{h.name}</th>
                  <td className="num">{h.then == null ? '—' : `${h.then}%`}</td>
                  <td className="num">{h.now == null ? '—' : `${h.now}%`}</td>
                  <td className={`num ${h.change != null && h.change > 0 ? 'delta-up' : h.change != null && h.change < 0 ? 'delta-down' : ''}`}>{deltaText(h.change) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Analysis({ month: m, coach, status }: { month: Monthly | null; coach: ReturnType<typeof useCoachJob>; status: Status | null }) {
  const reports = useLoad(() => api.reports('monthly'), [])
  const { job } = coach
  useEffect(() => {
    if (job?.status === 'done') reports.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status])
  // An analysis written in the month or in the first days after it belongs to that month.
  const analysis: Report | undefined = m ? reports.data?.find((r) => r.date.slice(0, 7) === m.month || (r.date.slice(0, 7) === shift(m.month, 1) && r.date.slice(8) <= '07')) : undefined
  const installed = status?.coach.installed ?? false
  const canRun = installed && (status?.coach.has_recent_checkin ?? false) && (m?.is_current ?? false)
  const writing = coach.running && job?.skill === 'monthly-evolution'
  return (
    <Card
      title="Samuel's analysis"
      meta={analysis ? `Written ${analysis.date} · Claude Code` : undefined}
      action={canRun
        ? <button type="button" className="link-btn accent" disabled={coach.running} onClick={() => void coach.start('monthly-evolution')}>
            {writing ? 'Writing…' : analysis ? 'Write again →' : 'Ask Samuel →'}
          </button>
        : <a href="#/coach">Coach →</a>}
    >
      {writing ? <Loading lines={5} /> : analysis ? (
        <div className="report"><Markdown>{analysis.markdown.split('\n').slice(1).join('\n')}</Markdown></div>
      ) : (
        <NeedsSetup>
          {!installed ? "Samuel's analysis needs Claude Code installed and logged in on this computer. The numbers below work without it."
            : !m?.is_current ? 'No analysis was saved for this month.'
            : !canRun ? 'Save a check-in first. Samuel needs at least one from the last 7 days.'
            : 'Ask Samuel to compare this month with the last one and suggest changes for the next.'}
        </NeedsSetup>
      )}
      {job?.status === 'failed' && job.skill === 'monthly-evolution' && <ErrorLine message={`The analysis didn't finish: ${job.error ?? 'unknown error'}`} />}
    </Card>
  )
}
