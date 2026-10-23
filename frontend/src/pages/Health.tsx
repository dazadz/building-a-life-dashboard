import { useState } from 'react'
import { api, type Health, type HealthLog } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { deltaText, isoDate, scoreText, shortDate } from '../format'
import { useLoad, useNow } from '../hooks'
import { MiniBars } from '../components/MiniBars'
import { EnergyCurveCard } from '../components/Energy'
import { LinksCard } from '../components/Links'

const PERIODS = [7, 30, 90] as const
const LEVELS = ['low', 'moderate', 'high'] as const

export function HealthPage({ coachInstalled }: { coachInstalled: boolean }) {
  const today = isoDate(useNow())
  const [days, setDays] = useState<number>(30)
  const loaded = useLoad(() => api.health(today, days), [today, days])
  const h = loaded.data

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Last {days} days</div>
        <h1>Health & energy</h1>
        <p>
          {h?.recovery.sleep_avg != null
            ? `Sleep averaged ${h.recovery.sleep_avg} h this week against a ${h.sleep_target} h target.`
            : 'Check in for a few days to see your sleep, energy and recovery.'}{' '}
          Samuel is a coach, not a clinician; this is not medical advice.
        </p>
      </header>

      <div className="pills" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} type="button" className="pill" aria-pressed={days === p} onClick={() => setDays(p)}>{p} days</button>
        ))}
      </div>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}

      <div className="row">
        <SleepEnergy health={h} />
        <div className="side-col">
          <Recovery health={h} />
          <Burnout health={h} />
        </div>
      </div>
      <div className="row">
        <LinksCard today={today} coachInstalled={coachInstalled} />
      </div>
      <div className="row">
        <EnergyCurveCard curve={h?.energy_curve ?? null} days={days} />
        <Inputs health={h} />
        {h ? <LogToday key={today} today={today} log={h.log_today} onSaved={loaded.reload} />
          : <Card title="Log today" action={<a href="#/checkin">Check-in →</a>}><Loading /></Card>}
      </div>
    </div>
  )
}

/** Two small charts on the same dates: sleep (hours) and energy (1–10). Never one chart with two y-axes. */
function SleepEnergy({ health: h }: { health: Health | null }) {
  const [table, setTable] = useState(false)
  return (
    <Card
      title="Sleep and energy"
      className="wide"
      meta="Daily"
      secondary={<button type="button" className="link-btn" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>}
      action={<a href="#/checkin">Check-in →</a>}
    >
      {!h ? <Loading lines={6} /> : !h.series.some((d) => d.sleep != null || d.energy != null) ? (
        <NeedsSetup>No sleep or energy answers in this period yet. They come from your daily check-in.</NeedsSetup>
      ) : table ? (
        <div className="table-scroll" style={{ maxHeight: 320 }}>
          <table className="data-table">
            <thead><tr><th scope="col">Date</th><th scope="col" className="num">Sleep (h)</th><th scope="col" className="num">Energy (1–10)</th></tr></thead>
            <tbody>
              {[...h.series].reverse().map((d) => (
                <tr key={d.date}><th scope="row">{shortDate(d.date)}</th><td className="num">{d.sleep ?? '—'}</td><td className="num">{d.energy ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <MiniBars label="Sleep (hours)" series={h.series.map((d) => ({ date: d.date, value: d.sleep }))} max={Math.max(10, h.sleep_target + 1)}
            target={h.sleep_target} unit="h" />
          <MiniBars label="Energy (1–10)" series={h.series.map((d) => ({ date: d.date, value: d.energy }))} max={10} unit="/ 10" />
          {h.energy_gap != null && (
            <p className="muted" style={{ margin: 0 }}>
              {h.energy_gap > 0
                ? `Energy is ${h.energy_gap} ${h.energy_gap === 1 ? 'point' : 'points'} lower on days with less than 6.5 h of sleep.`
                : `Energy is no lower on days with less than 6.5 h of sleep (${h.energy_gap}).`}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function Recovery({ health: h }: { health: Health | null }) {
  const r = h?.recovery
  return (
    <Card title="Recovery" meta="Today" action={<a href="https://github.com/dazadz/building-a-life-dashboard/blob/main/docs/scores.md#health--energy" target="_blank" rel="noreferrer">How it works →</a>}>
      {!r ? <Loading /> : (
        <>
          <div className="meter-top">
            <span className="meter-value" style={{ fontSize: 30 }}>{scoreText(r.score)}</span>
            {deltaText(r.change) && <span className={r.change! > 0 ? 'delta-up' : 'delta-down'}>{deltaText(r.change)} this week</span>}
          </div>
          <ul className="list">
            <li><span className="muted" style={{ flex: 1 }}>Sleep</span><strong>{r.sleep_avg == null ? '—' : `${r.sleep_avg} h`}</strong><span className="faint">of {h!.sleep_target}</span></li>
            <li><span className="muted" style={{ flex: 1 }}>Rest days</span><strong>{r.rest_days}</strong><span className="faint">of 2</span></li>
            <li><span className="muted" style={{ flex: 1 }}>Stress</span><strong>{r.stress_avg == null ? '—' : `${r.stress_avg} / 10`}</strong></li>
            <li><span className="muted" style={{ flex: 1 }}>Workouts</span><strong>{r.workouts}</strong><span className="faint">this week</span></li>
          </ul>
        </>
      )}
    </Card>
  )
}

function Burnout({ health: h }: { health: Health | null }) {
  const b = h?.burnout
  return (
    <Card title="Burnout risk" meta="Last 7 days" action={<a href="#/settings">Edit routine →</a>}>
      {!b ? <Loading /> : b.level == null ? (
        <NeedsSetup>Not enough data. Burnout risk needs at least 3 check-ins in the last 7 days.</NeedsSetup>
      ) : (
        <>
          <div className="risk" role="img" aria-label={`Burnout risk: ${b.level}`}>
            {LEVELS.map((l) => <span key={l} className="risk-step" data-level={l} data-on={l === b.level}>{l}</span>)}
          </div>
          {b.reasons.length === 0 ? <span className="muted">No warning signs this week.</span> : (
            <ul className="list">
              {b.reasons.map((r) => (
                <li key={r}><span className="dot missed" aria-hidden="true" /><span style={{ flex: 1 }}>{r}</span></li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function Inputs({ health: h }: { health: Health | null }) {
  const i = h?.inputs
  const items = i ? [
    { label: 'Water', value: i.water_l == null ? '—' : `${i.water_l} L`, note: 'a day' },
    { label: 'Caffeine', value: i.caffeine_cups == null ? '—' : `${i.caffeine_cups} cups`, note: i.caffeine_latest ? `latest ${i.caffeine_latest}` : null },
    { label: 'Screens after 22:00', value: i.screens_late == null ? '—' : `${i.screens_late} min`, note: 'a night' },
    { label: 'Workouts', value: String(i.workouts), note: 'this week' },
  ] : []
  return (
    <Card title="Daily inputs" className="wide" meta={i ? `7-day average · ${i.logged_days} days logged` : undefined} action={<a href="#/checkin">Check-in →</a>}>
      {!i ? <Loading /> : (
        <div className="snapshot">
          {items.map((s) => (
            <div key={s.label} className="snapshot-item">
              <span className="meter-label">{s.label}</span>
              <span className="meter-value">{s.value}</span>
              {s.note && <span className="faint">{s.note}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function LogToday({ today, log, onSaved }: { today: string; log: HealthLog | null; onSaved: () => void }) {
  const [water, setWater] = useState(log?.water_l?.toString() ?? '')
  const [cups, setCups] = useState(log?.caffeine_cups?.toString() ?? '')
  const [last, setLast] = useState(log?.caffeine_last ?? '')
  const [screens, setScreens] = useState(log?.screens_late?.toString() ?? '')
  const [state, setState] = useState<{ saving: boolean; error: string | null; saved: boolean }>({ saving: false, error: null, saved: false })
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  const save = async () => {
    setState({ saving: true, error: null, saved: false })
    try {
      await api.saveHealthLog(today, { water_l: num(water), caffeine_cups: num(cups), caffeine_last: last || null, screens_late: num(screens) })
      onSaved()
      setState({ saving: false, error: null, saved: true })
    } catch (e) {
      setState({ saving: false, error: e instanceof Error ? e.message : String(e), saved: false })
    }
  }

  return (
    <Card title="Log today" meta="Optional · about 20 seconds"
      action={<button type="button" className="link-btn accent" disabled={state.saving} onClick={() => void save()}>Save log →</button>}>
      <div className="fields">
        <div className="field"><label htmlFor="h-water">Water (litres)</label>
          <input id="h-water" className="input" type="number" min={0} max={10} step={0.25} value={water} onChange={(e) => setWater(e.target.value)} /></div>
        <div className="field"><label htmlFor="h-cups">Coffee or energy drinks</label>
          <input id="h-cups" className="input" type="number" min={0} max={20} step={1} value={cups} onChange={(e) => setCups(e.target.value)} /></div>
        <div className="field"><label htmlFor="h-last">Last one at</label>
          <input id="h-last" className="input" type="time" value={last} onChange={(e) => setLast(e.target.value)} /></div>
        <div className="field"><label htmlFor="h-screens">Screens after 22:00 (min)</label>
          <input id="h-screens" className="input" type="number" min={0} max={600} step={5} value={screens} onChange={(e) => setScreens(e.target.value)} /></div>
      </div>
      {state.error && <ErrorLine message={state.error} />}
      {state.saved && <div className="notice ok" role="status">Saved for today.</div>}
    </Card>
  )
}
