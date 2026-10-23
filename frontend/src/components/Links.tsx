import { useState } from 'react'
import { api, ApiError, type Links } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { useLoad } from '../hooks'

const fmt = (n: number, unit: string) => (unit === 'h' ? `${n} h` : `${n}`)

/** What moves your energy and mood: with/without comparisons (rules in docs/scores.md). */
export function LinksCard({ today, coachInstalled }: { today: string; coachInstalled: boolean }) {
  const [days, setDays] = useState<30 | 90>(90)
  const loaded = useLoad(() => api.links(today, days), [today, days])
  const [error, setError] = useState<string | null>(null)
  const data: Links | null = loaded.data
  const top = data?.links[0]

  const ask = async () => {
    if (!top) return
    setError(null)
    try {
      const chat = await api.startChat(
        `${top.condition_label}: my ${top.outcome_label.toLowerCase()} (${top.when}) averages ${top.with_avg} vs ${top.without_avg} without. How do I use that?`,
      )
      window.location.hash = `#/coach?chat=${chat.id}`
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <Card
      title="What moves your energy and mood"
      className="wide"
      meta={`Your own days · ${days} days`}
      secondary={
        <span className="pills" role="group" aria-label="Links period">
          {([30, 90] as const).map((d) => (
            <button key={d} type="button" className="pill" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </span>
      }
      action={coachInstalled && top
        ? <button type="button" className="link-btn accent" onClick={() => void ask()}>Ask Samuel about this →</button>
        : <a href="#/checkin">Check-in →</a>}
    >
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !data ? <Loading /> : data.links.length === 0 ? (
        <NeedsSetup>
          No clear links yet. Keep checking in and logging; a link shows once both sides have {data.min_days} days and the
          difference is big enough to matter.
        </NeedsSetup>
      ) : (
        <>
          <ul className="list">
            {data.links.map((l) => (
              <li key={`${l.condition}-${l.outcome}-${l.when}`} className="link-row">
                <span className="link-what">
                  <strong className="link-title">{l.condition_label}</strong>
                  <span className="faint">
                    {l.outcome_label} {l.when} · {l.with_days} days vs {l.without_days} with {l.compared_with}
                  </span>
                </span>
                <span className="mono link-nums">
                  {fmt(l.with_avg, l.unit)} <span className="faint">vs {fmt(l.without_avg, l.unit)}</span>
                </span>
                <span className={`mono link-diff ${l.difference > 0 ? 'up' : 'down'}`}>
                  {l.difference > 0 ? '+' : '−'}{fmt(Math.abs(l.difference), l.unit)}
                </span>
              </li>
            ))}
          </ul>
          <p className="faint" style={{ margin: 0 }}>Patterns in your own days, not proof of cause.</p>
        </>
      )}
      {error && <ErrorLine message={error} />}
    </Card>
  )
}
