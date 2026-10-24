import type { Plan } from '../api'
import { DAY_NAMES, KIND_LABEL, inText, nowAndNext, span, worksOn } from '../blocks'
import { Card } from './Card'
import { Loading, NeedsSetup } from './States'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Home: today's routine blocks with Now and Next markers, done and skipped marks, and milestones due today. */
export function TodaysPlan({ now, plan }: { now: Date; plan: Plan | null }) {
  const at = now.getHours() * 60 + now.getMinutes()
  const blocks = plan?.blocks ?? []
  const { current, next } = nowAndNext(blocks, at)
  const done = blocks.filter((b) => b.status === 'done').length
  return (
    <Card title={plan?.day_type ? `Today · ${plan.day_type.name}` : "Today's plan"} className="wide"
      meta={blocks.length ? `${done} of ${blocks.length} done` : `Now ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
      action={<a href="#/routine">Edit routine →</a>}>
      {!plan ? <Loading lines={5} /> : !plan.has_routine ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>Set up your routine and Home shows your day block by block.</span>
          <a href="#/routine">Set up routine →</a>
        </NeedsSetup>
      ) : blocks.length === 0 && plan.due_today.length === 0 ? (
        <NeedsSetup>No routine blocks {plan.day_type ? `on a ${plan.day_type.name.toLowerCase()}` : `on ${DAY_NAMES[(now.getDay() + 6) % 7]}s`}. Enjoy the free day.</NeedsSetup>
      ) : (
        <ul className="list plan">
          {blocks.map((b) => {
            const [start, end] = span(b)
            const state = b.status === 'done' ? 'Done' : b.status === 'skipped' ? 'Skipped'
              : b === current ? 'Now' : b === next ? `Next · ${inText(start - at)}` : null
            const task = b.tasks[0]
            const detail = task ? `Task: ${task.title}` : worksOn(b)
            return (
              <li key={b.id} data-past={end <= at || b.status !== null} data-now={b === current && !b.status}>
                <span className="mono plan-time"><span className="type-dot" data-type={b.kind} title={KIND_LABEL[b.kind]} aria-hidden="true" />{b.start}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="item-name">{b.name}</span>
                  {detail && <span className="faint plan-detail">{detail}</span>}
                </span>
                {state && (
                  <span className={b.status === 'done' ? 'tag status-done' : b.status === 'skipped' ? 'tag status-skipped'
                    : b === current ? 'tag now-tag' : 'faint mono'}>{state}</span>
                )}
                <span className="mono faint plan-range">{b.start}–{b.end}</span>
              </li>
            )
          })}
          {plan.due_today.map((m) => (
            <li key={`m-${m.id}`}>
              <span className="mono plan-time accent-text">Due</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="item-name">{m.title}</span> <span className="faint">· {m.goal_title}</span>
              </span>
              <a href="#/goals">Goals →</a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function Weekdays({ value, onChange, label, allowNone }: {
  value: number[]; onChange: (w: number[]) => void; label: string; allowNone?: boolean
}) {
  const toggle = (d: number) => {
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort()
    if (next.length || allowNone) onChange(next)
  }
  return (
    <div className="weekdays" role="group" aria-label={`${label} days`}>
      {DAYS.map((d, i) => (
        <button key={i} type="button" className="pill" aria-pressed={value.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => toggle(i)}>{d}</button>
      ))}
    </div>
  )
}
