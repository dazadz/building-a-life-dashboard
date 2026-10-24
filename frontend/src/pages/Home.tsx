import { useEffect, useState, type ReactNode } from 'react'
import { api, type Day, type HabitStatus, type Plan, type Status } from '../api'
import { Card } from '../components/Card'
import { TodaysPlan } from '../components/Routine'
import { EnergyTapCard } from '../components/Energy'
import { DueCard } from '../components/Digest'
import { SuggestionsCard } from '../components/Suggestions'
import { NowCard } from '../components/NowCard'
import { FocusAreasCard, GoalsCard } from '../components/Focus'
import { dayMode, nowAndNext, type DayMode } from '../blocks'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, answeredCount, deltaText, greeting, isoDate, localStamp, localTime, longDate, scoreText } from '../format'
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

// Home follows the time of day: what matters now is always at the top (see dayMode in blocks.ts).
const ORDER: Record<DayMode, { top: string[]; bottom: string[] }> = {
  morning: { top: ['energy', 'plan', 'focus'], bottom: ['goals', 'due', 'habits', 'checkin'] },
  day: { top: ['plan', 'focus', 'goals'], bottom: ['due', 'habits', 'energy', 'checkin'] },
  evening: { top: ['checkin', 'plan', 'habits'], bottom: ['focus', 'goals', 'due', 'energy'] },
}
const MODE_LABEL: Record<DayMode, string> = { morning: 'Morning mode', day: 'Day mode', evening: 'Evening mode' }

export function HomePage({ status, onChanged }: { status: Status | null; onChanged: () => void }) {
  const now = useNow()
  const today = isoDate(now)
  const yesterday = addDays(today, -1)
  const days = useLoad(() => Promise.all([api.day(today), api.day(yesterday)]), [today])
  const profile = useLoad(() => api.profile(), [])
  const settings = useLoad(() => api.settings(today), [today])
  const plan = useLoad(() => api.plan(today), [today])
  useEffect(() => {
    window.addEventListener('samuel:plan-changed', plan.reload)
    return () => window.removeEventListener('samuel:plan-changed', plan.reload)
  }, [plan.reload])
  const [todayData, yesterdayData] = days.data ?? [null, null]

  const name = status?.name
  const yScore = yesterdayData?.summary.scores.day
  const at = now.getHours() * 60 + now.getMinutes()
  const mode: DayMode = settings.data ? dayMode(at, settings.data.wake_target, settings.data.sleep_target_hours) : 'day'

  const cards: Record<string, ReactNode> = {
    now: <NowCard key="now" now={now} plan={plan.data} onPlan={plan.setData} />,
    due: <DueCard key="due" stamp={localStamp(now)} />,
    plan: <TodaysPlan key="plan" now={now} plan={plan.data} />,
    focus: <FocusAreasCard key="focus" today={today} />,
    goals: <GoalsCard key="goals" today={today} />,
    suggest: <SuggestionsCard key="suggest" limit={3} hideWhenEmpty onChanged={onChanged} action={<a href="#/about">Review all →</a>} />,
    checkin: <CheckinCard key="checkin" day={todayData} yesterday={yesterdayData} loading={!days.data && !days.error} />,
    habits: <HabitsCard key="habits" day={todayData} onChange={(d) => days.setData([d, yesterdayData!])} />,
    energy: <EnergyTapCard key="energy" today={today} hhmm={localTime(now)} />,
  }
  const order = ORDER[mode]

  return (
    <div className="page home">
      <header className="page-head home-head">
        <div className="home-title">
          <div className="eyebrow">
            {longDate(today)} <span className="faint">//</span> <time dateTime={now.toISOString()}>{localTime(now)}</time>{' '}
            <span className="faint">//</span> <span className="accent-text">{MODE_LABEL[mode]}</span>
          </div>
          <h1>{name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours())}</h1>
          <p>{headline(plan.data, at) ?? (yScore != null
            ? `Yesterday scored ${yScore}. Tonight's check-in takes about a minute.`
            : 'Check in tonight to get your first day score.')}</p>
        </div>
        {plan.data && plan.data.day_types.length > 0 && <DaySwitch plan={plan.data} onPlan={plan.setData} />}
      </header>

      {days.error && <ErrorLine message={days.error} onRetry={days.reload} />}
      {profile.data && profile.data.answered < profile.data.total && (
        <NeedsSetup>
          <span style={{ flex: 1 }}>
            <strong>Samuel knows {profile.data.answered} of {profile.data.total} things about you.</strong>{' '}
            Finish your profile so every report fits your life.
          </span>
          <a href="#/profile">Continue profile →</a>
        </NeedsSetup>
      )}

      <div className="home-top">
        {cards.now}
        <ScoreStrip today={todayData} yesterday={yesterdayData} />
      </div>
      <div className="home-grid">{order.top.map((key) => cards[key])}</div>
      {cards.suggest}
      <div className="home-grid home-grid-4">{order.bottom.map((key) => cards[key])}</div>
    </div>
  )
}

/** One line on where the day stands, from today's routine. */
function headline(plan: Plan | null, at: number): string | null {
  if (!plan || !plan.blocks.length) return null
  const done = plan.blocks.filter((b) => b.status === 'done').length
  const { current } = nowAndNext(plan.blocks, at)
  const tally = `${done} of ${plan.blocks.length} blocks done.`
  if (current && !current.status) {
    const task = current.tasks[0]
    return `${current.name} is on.${task ? ` Today's task: ${task.title}.` : ''} ${tally}`
  }
  return tally
}

/** "Today is: Office day / Home day", one tap to switch when a shift moves. */
function DaySwitch({ plan, onPlan }: { plan: Plan; onPlan: (p: Plan) => void }) {
  const [error, setError] = useState<string | null>(null)
  const set = async (id: number | null) => {
    setError(null)
    try {
      onPlan(await api.setDayType(plan.date, id))
      window.dispatchEvent(new Event('samuel:plan-changed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="day-switch">
      <div className="pills" role="group" aria-label="Today is">
        <span className="meter-label day-switch-label">Today is</span>
        {plan.day_types.map((t) => (
          <button key={t.id} type="button" className="pill" aria-pressed={plan.day_type?.id === t.id}
            onClick={() => { if (plan.day_type?.id !== t.id) void set(t.id) }}>{t.name}</button>
        ))}
      </div>
      {plan.day_type?.overridden && <button type="button" className="link-btn" onClick={() => void set(null)}>Back to the usual day</button>}
      {error && <span className="warn-text hint">{error}</span>}
    </div>
  )
}

function ScoreStrip({ today, yesterday }: { today: Day | null; yesterday: Day | null }) {
  // Before tonight's check-in, the strip shows yesterday's scores.
  const scoreDay = today?.checkin ? today : yesterday
  const scoreLabel = today?.checkin ? 'Today' : 'Yesterday'
  return (
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
