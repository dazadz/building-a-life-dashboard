import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { api, type Report, type Status, type WeeklyReview } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, deltaText, isoDate, scoreText, shortDate } from '../format'
import { useLoad, useNow, type useCoachJob } from '../hooks'

interface Props {
  coach: ReturnType<typeof useCoachJob>
  status: Status | null
}

const LIST = 5

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
}

/** The weekly review: look back, reflect, plan next week. */
export function ReviewPage({ coach, status }: Props) {
  const today = isoDate(useNow())
  const [week, setWeek] = useState<string | undefined>(undefined)
  const loaded = useLoad(() => api.weekly(today, week), [today, week])
  const r = loaded.data

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">
          {r ? <>Week {r.week_number} <span className="faint">//</span> {shortDate(r.week_start)} – {shortDate(r.week_end)}</> : 'Weekly review'}
        </div>
        <h1>Weekly review</h1>
        <p>About 10 minutes. Look back, answer three questions, and set next week's top 3. Samuel uses your answers to plan next week.</p>
      </header>

      <div className="pills" role="group" aria-label="Week">
        <button type="button" className="pill" disabled={!r} onClick={() => r && setWeek(addDays(r.week_start, -7))}>← Previous week</button>
        <button type="button" className="pill" disabled={!r || r.is_current} onClick={() => r && setWeek(addDays(r.week_start, 7))}>Next week →</button>
        {r?.status && <span className="tag" style={{ alignSelf: 'center' }}>{r.status === 'done' ? 'Saved' : 'Draft'}</span>}
      </div>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}
      {!r ? <Loading lines={8} /> : <ReviewBody key={r.week_start} review={r} today={today} coach={coach} status={status} onSaved={loaded.setData} />}
    </div>
  )
}

function ReviewBody({ review, today, coach, status, onSaved }: {
  review: WeeklyReview; today: string; coach: ReturnType<typeof useCoachJob>; status: Status | null
  onSaved: (r: WeeklyReview) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => Object.fromEntries(review.questions.map((q) => [q.key, q.answer ?? ''])),
  )
  const [priorities, setPriorities] = useState<string[]>(review.priorities)
  const [carry, setCarry] = useState<Set<number>>(() => new Set(review.carry_over.filter((m) => m.carry).map((m) => m.id)))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (done: boolean) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.saveWeekly(today, review.week_start, { answers, priorities, carry: [...carry], status: done ? 'done' : 'draft' })
      onSaved(next)
      setMessage(done ? 'Review saved.' : 'Draft saved.')
      if (done && status?.coach.installed && status.coach.has_recent_checkin && !coach.running) void coach.start('weekly-review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const n = review.numbers
  const stats = [
    { label: 'Day score', value: scoreText(n.day_score), note: deltaText(n.day_score_change) ? `${deltaText(n.day_score_change)} vs last week` : null },
    { label: 'Check-ins', value: `${n.checkins} / 7`, note: null },
    { label: 'Sleep', value: n.sleep_avg == null ? '—' : `${n.sleep_avg} h`, note: 'average a night' },
    { label: 'Deep work', value: n.deep_work_total == null ? '—' : `${n.deep_work_total} h`, note: 'this week' },
    { label: 'Habits', value: n.habit_rate == null ? '—' : `${n.habit_rate}%`, note: 'done when logged' },
    { label: 'Workouts', value: String(n.workouts), note: null },
  ]

  return (
    <>
      <Brief review={review} coach={coach} status={status} />

      <div className="row">
        <Card title="By the numbers" className="wide" meta={`${shortDate(review.week_start)} – ${shortDate(review.week_end)}`}
          action={<a href="#/habits">Habits →</a>}>
          <div className="snapshot">
            {stats.map((s) => (
              <div key={s.label} className="snapshot-item">
                <span className="meter-label">{s.label}</span>
                <span className="meter-value">{s.value}</span>
                {s.note && <span className="faint">{s.note}</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="row">
        <Entries title="Wins" items={review.wins} empty="No wins logged yet. They come from your check-ins and finished milestones." dot="done" />
        <Entries title="Slipped" items={review.slipped} empty="Nothing slipped. Failures from check-ins and overdue milestones show here." dot="missed" />
      </div>

      <form className="row" onSubmit={(e) => { e.preventDefault(); void save(true) }}>
        <Card title="Reflect" className="wide" meta="3 questions from your week"
          action={<button type="button" className="link-btn accent" disabled={saving} onClick={() => void save(false)}>Save draft →</button>}>
          <div className="form">
            {review.questions.map((q) => (
              <div className="field" key={q.key}>
                <label htmlFor={`r-${q.key}`}>{q.question}</label>
                <textarea id={`r-${q.key}`} className="input" maxLength={2000} value={answers[q.key] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Plan next week" meta={review.coming_up.length ? `${review.coming_up.length} due` : undefined}
          action={<a href="#/goals">Goals →</a>}>
          <div className="form" style={{ gap: 16 }}>
            <fieldset>
              <legend>Top 3 for next week</legend>
              {priorities.map((p, i) => (
                <div className="field" key={i}>
                  <label htmlFor={`p-${i}`} className="sr-only">Priority {i + 1}</label>
                  <div className="inline-num">
                    <span className="step-num">{i + 1}</span>
                    <input id={`p-${i}`} className="input" maxLength={200} placeholder={`Priority ${i + 1}`} value={p}
                      onChange={(e) => setPriorities((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                </div>
              ))}
            </fieldset>
            {review.carry_over.length > 0 && (
              <fieldset>
                <legend>Carry over</legend>
                <ul className="list">
                  {review.carry_over.map((m) => (
                    <li key={m.id}>
                      <input type="checkbox" className="check" id={`c-${m.id}`} checked={carry.has(m.id)}
                        onChange={() => setCarry((c) => { const n2 = new Set(c); if (n2.has(m.id)) n2.delete(m.id); else n2.add(m.id); return n2 })} />
                      <label htmlFor={`c-${m.id}`} style={{ flex: 1, minWidth: 0 }}>
                        <span className="item-name">{m.title}</span> <span className="faint">· {m.goal_title}</span>
                      </label>
                      {m.due_date && <span className="mono warn-text">{shortDate(m.due_date)}</span>}
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <fieldset>
              <legend>Coming up</legend>
              {review.coming_up.length === 0 ? <span className="faint">No milestones due next week.</span> : (
                <ul className="list">
                  {review.coming_up.map((m) => (
                    <li key={m.id}>
                      <span className="mono accent-text" style={{ width: 36 }}>{m.due_date ? weekday(m.due_date) : ''}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{m.title} <span className="faint">· {m.goal_title}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            {error && <ErrorLine message={error} />}
            {message && <div className="notice ok" role="status">{message}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>Save review</button>
          </div>
        </Card>
      </form>
    </>
  )
}

function Entries({ title, items, empty, dot }: { title: string; items: { date: string; text: string }[]; empty: string; dot: string }) {
  const [showAll, setShowAll] = useState(false)
  return (
    <Card
      title={title}
      meta={`${items.length}`}
      secondary={items.length > LIST && (
        <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show ${items.length - LIST} more`}
        </button>
      )}
      action={<a href="#/checkin">Check-in →</a>}
    >
      {items.length === 0 ? <NeedsSetup>{empty}</NeedsSetup> : (
        <ul className="list">
          {(showAll ? items : items.slice(0, LIST)).map((w, i) => (
            <li key={i}>
              <span className={`dot ${dot}`} aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>{w.text}</span>
              <span className="mono faint">{weekday(w.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Brief({ review, coach, status }: { review: WeeklyReview; coach: ReturnType<typeof useCoachJob>; status: Status | null }) {
  const reports = useLoad(() => api.reports('weekly'), [])
  const { job } = coach
  useEffect(() => {
    if (job?.status === 'done') reports.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status])
  const brief: Report | undefined = reports.data?.find((x) => x.date >= review.week_start && x.date <= addDays(review.week_end, 1))
  const installed = status?.coach.installed ?? false
  const canRun = installed && (status?.coach.has_recent_checkin ?? false)
  const writing = coach.running && job?.skill === 'weekly-review'

  return (
    <Card
      title="Your week in brief"
      meta={brief ? 'Written by Samuel · Claude Code' : undefined}
      action={canRun
        ? <button type="button" className="link-btn accent" disabled={coach.running} onClick={() => void coach.start('weekly-review')}>
            {writing ? 'Writing…' : brief ? 'Write again →' : 'Ask Samuel →'}
          </button>
        : <a href="#/coach">Coach →</a>}
    >
      {writing ? <Loading lines={4} /> : brief ? (
        <div className="report"><Markdown>{brief.markdown.split('\n').slice(1).join('\n')}</Markdown></div>
      ) : (
        <NeedsSetup>
          {!installed
            ? "Samuel's brief needs Claude Code installed and logged in on this computer. The review works without it."
            : !canRun ? 'Save a check-in first. Samuel needs at least one from the last 7 days.'
            : 'Save your review and Samuel writes the week in brief, built around your top 3.'}
        </NeedsSetup>
      )}
      {job?.status === 'failed' && job.skill === 'weekly-review' && <ErrorLine message={`The brief didn't finish: ${job.error ?? 'unknown error'}`} />}
    </Card>
  )
}
