import { useState } from 'react'
import { api, type Plan, type PlanBlock } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { KIND_LABEL, inText, nowAndNext, span } from '../blocks'

const SEGMENTS = Array.from({ length: 20 }, (_, i) => i)

function clock(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

/** Steps ticked on the Now card are a per-viewer convenience: kept in this browser for the day only. */
function useSteps(key: string): [string[], (step: string) => void] {
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[] } catch { return [] }
  }
  const [ticked, setTicked] = useState<string[]>(read)
  const toggle = (step: string) => {
    const next = ticked.includes(step) ? ticked.filter((s) => s !== step) : [...ticked, step]
    setTicked(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private window: fine without it */ }
  }
  return [ticked, toggle]
}

/** Home: the block running now (or next), what to work on in it, and Done / Skip. */
export function NowCard({ now, plan, onPlan }: { now: Date; plan: Plan | null; onPlan: (p: Plan) => void }) {
  const at = now.getHours() * 60 + now.getMinutes()
  if (!plan) return <Card title="Now" className="wide now-card" action={<a href="#/routine">Routine →</a>}><Loading lines={4} /></Card>
  if (!plan.has_routine) {
    return (
      <Card title="Now" className="wide now-card" action={<a href="#/routine">Set up routine →</a>}>
        <NeedsSetup>
          <span style={{ flex: 1 }}>Build a routine and this card shows what to work on right now, with reminders 5 minutes before each block.</span>
          <a href="#/about">Ask Samuel for a plan →</a>
        </NeedsSetup>
      </Card>
    )
  }
  const open = plan.blocks.filter((b) => !b.status)
  const { current, next } = nowAndNext(plan.blocks, at)
  const live = current && !current.status ? current : undefined
  const upcoming = nowAndNext(open, at).next
  const done = plan.blocks.filter((b) => b.status === 'done').length
  const focus = live ?? upcoming
  if (!focus) {
    return (
      <Card title="Now" className="wide now-card" meta={`${done} of ${plan.blocks.length} blocks done`} action={<a href="#/checkin">Tonight's check-in →</a>}>
        <p className="muted" style={{ margin: 0 }}>
          {plan.blocks.length ? "That's your routine for today. Check in tonight so Samuel can plan tomorrow." : 'No blocks today. A free day.'}
        </p>
      </Card>
    )
  }
  return (
    <BlockNow key={`${plan.date}-${focus.id}`} block={focus} live={focus === live} at={at} plan={plan}
      after={live ? (next && next !== live ? next : upcoming && upcoming !== live ? upcoming : undefined) : undefined} onPlan={onPlan} />
  )
}

function BlockNow({ block, live, at, plan, after, onPlan }: {
  block: PlanBlock; live: boolean; at: number; plan: Plan; after?: PlanBlock; onPlan: (p: Plan) => void
}) {
  const [start, end] = span(block)
  const [ticked, toggle] = useSteps(`samuel:steps:${plan.date}:${block.id}`)
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const task = block.tasks[0]
  const left = Math.max(0, end - at)
  const share = live ? Math.min(1, (at - start) / (end - start)) : 0

  const log = async (status: 'done' | 'skipped', why?: string) => {
    setError(null)
    try {
      onPlan(await api.logBlock(plan.date, block.id, status, why))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="card wide now-card" aria-label={live ? 'Now' : 'Up next'}>
      <div className="now-grid">
        <div className="now-main">
          <div className="now-tags">
            <span className={live ? 'now-badge' : 'tag'}>{live ? 'NOW' : `UP NEXT · ${inText(start - at)}`}</span>
            <span className="mono muted">{block.start}–{block.end}</span>
            <span className="tag type-tag" data-type={block.kind}>{KIND_LABEL[block.kind]}</span>
            {block.goal_title && <span className="tag">Goal · {block.goal_title}</span>}
            {!block.goal_title && block.habit_name && <span className="tag">Habit · {block.habit_name}</span>}
          </div>
          <h2 className="now-title">{block.name}</h2>
          {task ? (
            <div className="now-task">
              <span className="meter-label">Today's task{task.rolled > 0 && <span className="warn-text"> · waited {task.rolled} {task.rolled === 1 ? 'run' : 'runs'}</span>}</span>
              <strong>{task.title}</strong>
              {task.notes && <span className="muted">{task.notes}</span>}
              {block.tasks.length > 1 && <span className="faint">+{block.tasks.length - 1} more queued · <a href="#/tasks">Tasks →</a></span>}
            </div>
          ) : block.note && <p className="muted" style={{ margin: 0 }}>{block.note}</p>}
          {block.steps.length > 0 && (
            <fieldset className="now-steps">
              <legend className="meter-label">Steps</legend>
              {block.steps.map((s) => (
                <label key={s} className="check-label" data-done={ticked.includes(s)}>
                  <input type="checkbox" className="check" checked={ticked.includes(s)} onChange={() => toggle(s)} /> {s}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <div className="now-side">
          {live ? (
            <div>
              <span className="meter-label">Time left</span>
              <div className="now-clock">{clock(left)}</div>
              <div className="meter-track" role="img" aria-label={`Block ${Math.round(share * 100)} percent done`}>
                {SEGMENTS.map((i) => <span key={i} className="meter-seg" data-on={i < Math.round(share * 20)} />)}
              </div>
            </div>
          ) : (
            <div>
              <span className="meter-label">Starts</span>
              <div className="now-clock">{block.start}</div>
              <span className="faint">{block.remind_before ? `Reminder at ${clock(Math.max(0, start - 5)).padStart(5, '0')}` : 'No reminder'}</span>
            </div>
          )}
          {skipping ? (
            <div className="task-actions">
              <input className="input" aria-label="What got in the way?" placeholder="What got in the way?" maxLength={200} autoFocus
                value={reason} onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void log('skipped', reason.trim() || undefined) }} />
              <button type="button" className="btn" onClick={() => void log('skipped', reason.trim() || undefined)}>Skip</button>
              <button type="button" className="link-btn" onClick={() => setSkipping(false)}>Cancel</button>
            </div>
          ) : (
            <div className="task-actions">
              {live && <button type="button" className="btn btn-primary btn-big" onClick={() => void log('done')}>Done</button>}
              <button type="button" className="btn btn-big" onClick={() => setSkipping(true)}>{live ? 'Skip…' : 'Skip today…'}</button>
            </div>
          )}
          {error && <ErrorLine message={error} />}
          {after && (
            <div className="now-next">
              <span className="meter-label">Next · {inText(Math.max(0, span(after)[0] - at))}</span>
              <span className="item-name">{after.start} {after.name}</span>
            </div>
          )}
          <a className="card-foot-link" href="#/routine">Today's routine →</a>
        </div>
      </div>
    </section>
  )
}
