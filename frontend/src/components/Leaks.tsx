import { useState } from 'react'
import { api, ApiError, type TimeLeaks } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { useLoad } from '../hooks'

const IMPACT = { high: 'High', medium: 'Medium', low: 'Low' } as const

/** Time leaks from the check-in's biggest distraction (rules in docs/scores.md). */
export function TimeLeaksCard({ today, coachInstalled }: { today: string; coachInstalled: boolean }) {
  const [days, setDays] = useState<7 | 30>(30)
  const loaded = useLoad(() => api.leaks(today, days), [today, days])
  const [error, setError] = useState<string | null>(null)
  const data: TimeLeaks | null = loaded.data
  const top = data?.leaks[0]

  const ask = async () => {
    if (!top) return
    setError(null)
    try {
      const chat = await api.startChat(
        `"${top.name}" is my biggest time leak: ${top.days} days in the last ${days}, ${top.deep_work_lost} h of deep work lost. What should I change first?`,
      )
      window.location.hash = `#/coach?chat=${chat.id}`
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <Card
      title="Time leaks"
      className="wide"
      meta={data ? `${data.total_lost} h deep work lost · ${data.checkins} check-ins` : undefined}
      secondary={
        <span className="pills" role="group" aria-label="Time leaks period">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" className="pill" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </span>
      }
      action={coachInstalled && top
        ? <button type="button" className="link-btn accent" onClick={() => void ask()}>Ask Samuel about “{top.name}” →</button>
        : <a href="#/checkin">Check-in →</a>}
    >
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !data ? <Loading /> : data.leaks.length === 0 ? (
        <NeedsSetup>
          No time leaks yet. Answer "Biggest distraction today" in your check-in; a distraction shows here once it comes up on 2 days.
        </NeedsSetup>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Leak</th>
                <th scope="col" className="num">Days</th>
                <th scope="col" className="num">Deep work lost</th>
                <th scope="col" className="num">Deep work those days</th>
                <th scope="col" className="num">Other days</th>
                <th scope="col" className="num">Impact</th>
              </tr>
            </thead>
            <tbody>
              {data.leaks.map((l) => (
                <tr key={l.name}>
                  <th scope="row">{l.name}</th>
                  <td className="num mono">{l.days}</td>
                  <td className="num mono">{l.deep_work_lost} h</td>
                  <td className="num mono">{l.deep_work_avg == null ? '—' : `${l.deep_work_avg} h`}</td>
                  <td className="num mono faint">{l.deep_work_avg_other_days == null ? '—' : `${l.deep_work_avg_other_days} h`}</td>
                  <td className={`num ${l.impact === 'high' ? 'warn-text' : l.impact === 'medium' ? '' : 'faint'}`}>{IMPACT[l.impact]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <ErrorLine message={error} />}
    </Card>
  )
}
