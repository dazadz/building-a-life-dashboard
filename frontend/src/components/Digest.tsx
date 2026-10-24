import { api } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading } from './States'
import { useLoad } from '../hooks'

/** Today: the one focus for the day, then tasks and milestones due today or overdue, compact enough for the Today grid. */
export function DueCard({ stamp }: { stamp: string }) {
  const loaded = useLoad(() => api.digest(stamp), [stamp])
  const d = loaded.data
  const due = d ? d.due.overdue + d.due.today : 0
  return (
    <Card title="Focus and due" meta={d ? (d.due.overdue ? `${d.due.overdue} overdue` : `${due} due`) : undefined} action={<a href="#/tasks">Tasks →</a>}>
      {d?.focus && (
        <div className="due-focus">
          <span className="meter-label">Focus</span>
          <strong>{d.focus.text}</strong>
          <span className="faint">{d.focus.source}</span>
        </div>
      )}
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} /> : !d ? <Loading lines={3} /> : due === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing due. Clear day.</p>
      ) : (
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
    </Card>
  )
}
