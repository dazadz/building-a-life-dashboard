import { useId, useState, type FormEvent } from 'react'
import { api, type Checkin, type Day } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { addDays, answeredCount, isoDate, longDate, scoreText } from '../format'
import { useLoad, type useCoachJob } from '../hooks'

type Form = Record<keyof Checkin, string>

const EMPTY: Form = {
  wake_time: '', sleep_hours: '', mood: '', energy: '', main_goal: '', workout: '',
  deep_work_hours: '', productivity: '', distraction: '', wins: '', failures: '', improvement: '',
}
const NUMBERS: (keyof Checkin)[] = ['sleep_hours', 'energy', 'deep_work_hours', 'productivity']
/** Answers that usually stay the same day to day, so they start from yesterday's. */
const CARRY_OVER: (keyof Checkin)[] = ['wake_time', 'sleep_hours', 'main_goal']

const MOODS = [
  ['low', 'Low'], ['flat', 'Flat'], ['okay', 'Okay'], ['good', 'Good'], ['great', 'Great'],
] as const
const WORKOUT = [['yes', 'Yes'], ['no', 'No'], ['rest', 'Rest day']] as const
const DISTRACTIONS = ['Phone', 'Social media', 'Email', 'Meetings', 'Noise', 'Low energy', 'Other']

function toForm(c: Checkin | null, keys: (keyof Checkin)[] = Object.keys(EMPTY) as (keyof Checkin)[]): Partial<Form> {
  if (!c) return {}
  return Object.fromEntries(keys.filter((k) => c[k] != null).map((k) => [k, String(c[k])]))
}

function toAnswers(f: Form): Partial<Checkin> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v.trim() === '') continue
    out[k] = NUMBERS.includes(k as keyof Checkin) ? Number(v) : v.trim()
  }
  return out as Partial<Checkin>
}

interface Props {
  coach: ReturnType<typeof useCoachJob>
  coachInstalled: boolean
}

function Header({ today }: { today: string }) {
  return (
    <header className="page-head">
      <div className="eyebrow">{longDate(today)}</div>
      <h1>Daily check-in</h1>
      <p>About a minute. Samuel turns your answers into tonight's report and tomorrow's plan.</p>
    </header>
  )
}

export function CheckinPage(props: Props) {
  // Fixed when the page opens, so a check-in started before midnight saves to that day.
  const [today] = useState(() => isoDate(new Date()))
  const days = useLoad(() => Promise.all([api.day(today), api.day(addDays(today, -1))]), [today])
  if (days.error) {
    return <div className="page"><Header today={today} /><ErrorLine message={days.error} onRetry={days.reload} /></div>
  }
  if (!days.data) return <div className="page"><Header today={today} /><Loading lines={6} /></div>
  return <CheckinForm {...props} today={days.data[0]} yesterday={days.data[1]} />
}

function startingForm(today: Day, yesterday: Day): { form: Form; prefilled: boolean } {
  if (today.checkin) return { form: { ...EMPTY, ...toForm(today.checkin) }, prefilled: false }
  const carried = toForm(yesterday.checkin, CARRY_OVER)
  return { form: { ...EMPTY, ...carried }, prefilled: Object.keys(carried).length > 0 }
}

function CheckinForm({ coach, coachInstalled, today: initialToday, yesterday }: Props & { today: Day; yesterday: Day }) {
  const [start] = useState(() => startingForm(initialToday, yesterday))
  const [todayDay, setTodayDay] = useState(initialToday)
  const [form, setForm] = useState<Form>(start.form)
  const [prefilled, setPrefilled] = useState(start.prefilled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof Checkin, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(null)
  }
  const toggle = (key: keyof Checkin, value: string) => set(key, form[key] === value ? '' : value)

  const save = async (withReport: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const day = await api.saveCheckin(todayDay.date, toAnswers(form))
      setTodayDay(day)
      setPrefilled(false)
      if (withReport) {
        await coach.start('daily-report')
        window.location.hash = '#/coach'
      } else {
        setSaved(`Saved. Day score ${scoreText(day.summary.scores.day)}.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    void save(coachInstalled && submitter?.value === 'report')
  }

  const answered = answeredCount(toAnswers(form))

  return (
    <div className="page">
      <Header today={todayDay.date} />

      <div className="row">
        <section className="card wide" aria-label="Check-in questions">
          <div className="card-head">
            <h2 style={{ fontSize: 15 }}>{answered} of 12 answered</h2>
            <span className="card-meta">Streak {todayDay.summary.checkin_streak} days</span>
          </div>
          <div className="progress" aria-hidden="true"><div style={{ width: `${(answered / 12) * 100}%` }} /></div>
          {prefilled && <p className="faint" style={{ margin: 0 }}>Wake-up, sleep and main goal start from yesterday's answers.</p>}

          <form className="form" onSubmit={onSubmit}>
            <fieldset>
              <legend>Sleep and start</legend>
              <div className="fields">
                <div className="field">
                  <label htmlFor="wake_time">What time did you wake up?</label>
                  <input id="wake_time" className="input" type="time" value={form.wake_time}
                    onChange={(e) => set('wake_time', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="sleep_hours">Hours of sleep</label>
                  <input id="sleep_hours" className="input" type="number" min={0} max={24} step={0.1}
                    inputMode="decimal" value={form.sleep_hours} onChange={(e) => set('sleep_hours', e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>How you feel</legend>
              <Choice label="Mood" options={MOODS} value={form.mood} onPick={(v) => toggle('mood', v)} />
              <Scale label="Energy level (1–10)" value={form.energy} onPick={(v) => toggle('energy', v)} />
            </fieldset>

            <fieldset>
              <legend>Your work</legend>
              <div className="field">
                <label htmlFor="main_goal">Main goal today</label>
                <input id="main_goal" className="input" type="text" maxLength={500} value={form.main_goal}
                  onChange={(e) => set('main_goal', e.target.value)} />
              </div>
              <div className="fields">
                <Choice label="Workout completed?" options={WORKOUT} value={form.workout} onPick={(v) => toggle('workout', v)} />
                <div className="field">
                  <label htmlFor="deep_work_hours">Deep work (hours)</label>
                  <input id="deep_work_hours" className="input" type="number" min={0} max={24} step={0.25}
                    inputMode="decimal" value={form.deep_work_hours} onChange={(e) => set('deep_work_hours', e.target.value)} />
                </div>
              </div>
              <Scale label="Productivity rating (1–10)" value={form.productivity} onPick={(v) => toggle('productivity', v)} />
              <Choice label="Biggest distraction today" options={DISTRACTIONS.map((d) => [d, d] as const)}
                value={form.distraction} onPick={(v) => toggle('distraction', v)} />
            </fieldset>

            <fieldset>
              <legend>Reflect</legend>
              {([['wins', 'Wins today'], ['failures', 'Failures today'], ['improvement', 'One improvement for tomorrow']] as const).map(([key, label]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <textarea id={key} className="input" maxLength={2000} rows={2} value={form[key]}
                    onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </fieldset>

            {error && <ErrorLine message={error} />}
            {coach.error && <ErrorLine message={`Saved, but the report didn't start: ${coach.error}`} />}
            {saved && <div className="notice ok" role="status">{saved}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              {coachInstalled ? (
                <>
                  <button type="submit" value="report" className="btn btn-primary" disabled={saving || coach.running}>
                    Save and write my report
                  </button>
                  <button type="submit" value="save" className="btn" disabled={saving}>Save only</button>
                  <span className="faint">The report runs with Claude Code on this computer.</span>
                </>
              ) : (
                <>
                  <button type="submit" value="save" className="btn btn-primary" disabled={saving}>Save check-in</button>
                  <span className="faint">Install Claude Code to get Samuel's reports.</span>
                </>
              )}
            </div>
          </form>
        </section>

        <Card title="Yesterday" meta={longDate(yesterday.date)} action={<a href="#/coach">Reports →</a>}>
          {!yesterday.checkin ? (
            <NeedsSetup>No check-in yesterday. Today's answers start your streak.</NeedsSetup>
          ) : (
            <ul className="list">
              <li><span className="muted" style={{ flex: 1 }}>Day score</span><strong>{scoreText(yesterday.summary.scores.day)}</strong></li>
              <li><span className="muted" style={{ flex: 1 }}>Sleep</span><strong>{yesterday.checkin.sleep_hours ?? '—'} h</strong></li>
              <li><span className="muted" style={{ flex: 1 }}>Energy</span><strong>{yesterday.checkin.energy ?? '—'} / 10</strong></li>
              <li><span className="muted" style={{ flex: 1 }}>Deep work</span><strong>{yesterday.checkin.deep_work_hours ?? '—'} h</strong></li>
              <li>
                <span className="muted" style={{ flex: 1 }}>Habits</span>
                <strong>{yesterday.habits.filter((h) => h.status === 'done').length} / {yesterday.habits.length}</strong>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Choice({ label, options, value, onPick }: {
  label: string
  options: readonly (readonly [string, string])[]
  value: string
  onPick: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className="pills" role="group" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button key={v} type="button" className="pill" aria-pressed={value === v} onClick={() => onPick(v)}>{text}</button>
        ))}
      </div>
    </div>
  )
}

function Scale({ label, value, onPick }: { label: string; value: string; onPick: (v: string) => void }) {
  const id = useId()
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className="scale" role="group" aria-labelledby={id}>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
          <button key={n} type="button" className="pill" aria-pressed={value === n} onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}
