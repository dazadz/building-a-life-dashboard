import { useState } from 'react'
import Markdown from 'react-markdown'
import { api, type Day, type HabitStatus, type Report, type Status } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, answeredCount, deltaText, greeting, isoDate, localTime, longDate, scoreText } from '../format'
import { useLoad, useNow } from '../hooks'

const STRIP = [
  { key: 'productivity', label: 'Productivity' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'energy', label: 'Energy' },
  { key: 'focus', label: 'Focus' },
] as const

// The meters are LED-style bars: 20 segments of 5 points each.
const SEGMENTS = Array.from({ length: 20 }, (_, i) => i)

const SCORES_DOC = 'https://github.com/dazadz/building-a-life-dashboard/blob/main/docs/scores.md'

export function HomePage({ status }: { status: Status | null }) {
  const now = useNow()
  const today = isoDate(now)
  const yesterday = addDays(today, -1)
  const days = useLoad(() => Promise.all([api.day(today), api.day(yesterday)]), [today])
  const reports = useLoad(() => api.reports('daily'), [])
  const [todayData, yesterdayData] = days.data ?? [null, null]

  const name = status?.name
  const yScore = yesterdayData?.summary.scores.day
  // Before tonight's check-in, the strip shows yesterday's scores.
  const scoreDay = todayData?.checkin ? todayData : yesterdayData
  const scoreLabel = todayData?.checkin ? 'Today' : 'Yesterday'

  return (
    <div className="page home">
      <header className="page-head">
        <div className="eyebrow">
          {longDate(today)} <span className="faint">//</span> <time dateTime={now.toISOString()}>{localTime(now)}</time>
        </div>
        <h1>{name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours())}</h1>
        <p>
          {yScore != null
            ? `Yesterday scored ${yScore}. Tonight's check-in takes about a minute.`
            : 'Check in tonight to get your first day score.'}
        </p>
      </header>

      {days.error && <ErrorLine message={days.error} onRetry={days.reload} />}

      <section className="scores" aria-label={`Scores · ${scoreLabel}`}>
        {STRIP.map(({ key, label }) => {
          const value = scoreDay?.summary.scores[key] ?? null
          const delta = scoreDay?.summary.change[key] ?? null
          return (
            <div className="meter" key={key}>
              <div className="meter-top">
                <span className="meter-label">{label}</span>
                {deltaText(delta) && (
                  <span className={delta! > 0 ? 'delta-up' : 'delta-down'}>{deltaText(delta)}</span>
                )}
                <span className="meter-value">{scoreText(value)}</span>
              </div>
              <div className="meter-track" role="img" aria-label={`${label} ${scoreText(value)} of 100`}>
                {SEGMENTS.map((i) => <span key={i} className="meter-seg" data-on={value != null && i < Math.round(value / 5)} />)}
              </div>
            </div>
          )
        })}
        <div className="faint" style={{ flex: '0 0 auto' }}>
          {scoreLabel}
          <br />
          <a href={SCORES_DOC} target="_blank" rel="noreferrer">How scores work →</a>
        </div>
      </section>

      <div className="row">
        <CheckinCard day={todayData} yesterday={yesterdayData} loading={!days.data && !days.error} />
        <LatestReport reports={reports} />
        <HabitsCard day={todayData} onChange={(d) => days.setData([d, yesterdayData!])} />
      </div>
    </div>
  )
}

function CheckinCard({ day, yesterday, loading }: { day: Day | null; yesterday: Day | null; loading: boolean }) {
  const answered = answeredCount(day?.checkin)
  return (
    <Card
      title="Tonight's check-in"
      meta={answered === 12 ? 'Done' : 'Due tonight'}
      action={<a href="#/checkin">{answered ? 'Edit check-in →' : 'Start check-in →'}</a>}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            12 quick questions, about a minute. Samuel turns them into tonight's report and tomorrow's plan.
          </p>
          <ul className="list">
            <li>
              <span className="muted" style={{ flex: 1 }}>Answered today</span>
              <strong>{answered} of 12</strong>
            </li>
            <li>
              <span className="muted" style={{ flex: 1 }}>Yesterday</span>
              <strong>{scoreText(yesterday?.summary.scores.day)}</strong>
              <span className="faint">day score</span>
            </li>
            <li>
              <span className="muted" style={{ flex: 1 }}>Streak</span>
              <strong>{day?.summary.checkin_streak ?? 0} days</strong>
            </li>
          </ul>
        </>
      )}
    </Card>
  )
}

interface Loaded<T> {
  data: T | null
  error: string | null
  reload: () => void
}

function LatestReport({ reports }: { reports: Loaded<Report[]> }) {
  const latest = reports.data?.[0]
  return (
    <Card
      title="Samuel's latest report"
      meta={latest ? latest.date : undefined}
      action={<a href="#/coach">{latest ? 'Full report →' : 'Coach →'}</a>}
    >
      {reports.error ? (
        <ErrorLine message={reports.error} onRetry={reports.reload} />
      ) : !reports.data ? (
        <Loading />
      ) : latest ? (
        <div className="report" style={{ maxHeight: 220, overflow: 'hidden' }}>
          <Markdown>{latest.markdown.split('\n## ')[0]}</Markdown>
        </div>
      ) : (
        <NeedsSetup>No reports yet. Save a check-in, then ask Samuel for a daily report.</NeedsSetup>
      )}
    </Card>
  )
}

const VISIBLE_HABITS = 6

function HabitsCard({ day, onChange }: { day: Day | null; onChange: (d: Day) => void }) {
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!day) return <Card title="Habits today" action={<a href="#/habits">Habits →</a>}><Loading /></Card>

  const done = day.habits.filter((h) => h.status === 'done').length
  const shown = showAll ? day.habits : day.habits.slice(0, VISIBLE_HABITS)

  const log = async (key: string, current: HabitStatus | null, next: HabitStatus) => {
    setError(null)
    try {
      onChange(await api.logHabit(day.date, key, current === next ? null : next))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card
      title="Habits today"
      meta={`${done} of ${day.habits.length}`}
      secondary={
        day.habits.length > VISIBLE_HABITS && (
          <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show ${day.habits.length - VISIBLE_HABITS} more`}
          </button>
        )
      }
      action={<a href="#/habits">Habits →</a>}
    >
      {error && <ErrorLine message={error} />}
      <ul className="list">
        {shown.map((h) => (
          <li key={h.key}>
            <span className={`dot ${h.status ?? ''}`} aria-hidden="true" />
            <span style={{ flex: 1, minWidth: 0 }}>
              {h.name}
              {h.auto === 1 && h.source !== 'manual' && <span className="tag" title="Ticked from the check-in">auto</span>}
            </span>
            <div className="pills" role="group" aria-label={h.name}>
              {(['done', 'missed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="pill"
                  style={{ height: 28 }}
                  aria-pressed={h.status === s}
                  onClick={() => log(h.key, h.status, s)}
                >
                  {s === 'done' ? 'Done' : 'Missed'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
