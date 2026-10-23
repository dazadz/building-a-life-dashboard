import { api, type Digest } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading } from './States'
import { deltaText, scoreText } from '../format'
import { useLoad } from '../hooks'

/**
 * Today at a glance, at the top of Home all day: one focus, what's due, what's next and how
 * yesterday went. It reloads every minute and on Refresh, since the user opens Samuel on and off.
 */
export function DigestCard({ stamp }: { stamp: string }) {
  const loaded = useLoad(() => api.digest(stamp), [stamp])
  const d: Digest | null = loaded.data
  const due = d ? d.due.overdue + d.due.today : 0

  return (
    <Card
      title="Today at a glance"
      className="digest"
      meta={d ? `Updated ${d.now.slice(11)}` : undefined}
      secondary={<button type="button" className="link-btn" onClick={loaded.reload}>Refresh</button>}
      action={<a href="#/tasks">Tasks →</a>}
    >
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !d ? <Loading lines={2} /> : (
        <div className="digest-grid">
          <div className="digest-cell digest-focus">
            <span className="meter-label">Focus</span>
            {d.focus ? (
              <>
                <strong className="digest-text">{d.focus.text}</strong>
                <span className="faint">{d.focus.source}</span>
              </>
            ) : (
              <>
                <span className="muted">No focus set yet.</span>
                <a className="faint" href="#/checkin">Tonight, answer "one improvement for tomorrow" →</a>
              </>
            )}
          </div>

          <div className="digest-cell">
            <span className="meter-label">
              Due today{d.due.overdue > 0 && <span className="warn-text"> · {d.due.overdue} overdue</span>}
            </span>
            {due === 0 ? <span className="muted">Nothing due. Clear day.</span> : (
              <ul className="digest-list">
                {d.due.items.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <span className={i.overdue ? 'warn-text mono' : 'mono faint'}>{i.overdue ? 'late' : i.time ?? (i.kind === 'milestone' ? 'goal' : 'today')}</span>
                    <span className="digest-item">{i.title}</span>
                  </li>
                ))}
                {due > d.due.items.length && <li className="faint">+{due - d.due.items.length} more</li>}
              </ul>
            )}
          </div>

          <div className="digest-cell">
            <span className="meter-label">{d.next?.state === 'now' ? 'Now' : 'Next up'}</span>
            {d.next ? (
              <>
                <strong className="digest-text">{d.next.name}</strong>
                <span className="mono faint">{d.next.start}–{d.next.end}</span>
              </>
            ) : <span className="muted">Nothing else in your routine today.</span>}
          </div>

          <div className="digest-cell">
            <span className="meter-label">Yesterday</span>
            <span className="meter-value">{scoreText(d.yesterday.score)}</span>
            <span className="faint">
              {d.yesterday.score == null ? 'No check-in' : deltaText(d.yesterday.change) ? `${deltaText(d.yesterday.change)} vs a week before` : 'day score'}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}
