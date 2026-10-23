import { useState } from 'react'
import { api, type Plan, type Routine, type RoutineFields } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { isoDate } from '../format'
import { useLoad } from '../hooks'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function inText(mins: number): string {
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `in ${h} h ${m} min` : `in ${h} h`
}

/** Home: today's routine blocks with Now and Next markers, and milestones due today. */
export function TodaysPlan({ now, plan }: { now: Date; plan: Plan | null }) {
  const at = now.getHours() * 60 + now.getMinutes()
  const blocks = plan?.blocks ?? []
  const current = blocks.find((b) => minutes(b.start) <= at && at < minutes(b.end))
  const next = blocks.find((b) => minutes(b.start) > at)
  return (
    <Card title="Today's plan" className="wide"
      meta={`Now ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
      action={<a href="#/settings">Edit routine →</a>}>
      {!plan ? <Loading lines={5} /> : !plan.has_routine ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>Set up your routine and Home shows your day block by block.</span>
          <a href="#/settings">Set up routine →</a>
        </NeedsSetup>
      ) : blocks.length === 0 && plan.due_today.length === 0 ? (
        <NeedsSetup>No routine blocks on {DAY_NAMES[(now.getDay() + 6) % 7]}s. Enjoy the free day.</NeedsSetup>
      ) : (
        <ul className="list plan">
          {blocks.map((b) => {
            const past = minutes(b.end) <= at
            const state = b === current ? 'Now' : b === next ? `Next · ${inText(minutes(b.start) - at)}` : null
            return (
              <li key={b.id} data-past={past} data-now={b === current}>
                <span className="mono plan-time">{b.start}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="item-name">{b.name}</span>
                  {b.note && <span className="faint"> · {b.note}</span>}
                </span>
                {state && <span className={b === current ? 'tag now-tag' : 'faint mono'}>{state}</span>}
                <span className="mono faint">{b.start}–{b.end}</span>
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

const EMPTY: RoutineFields = { name: '', start: '09:00', end: '10:00', weekdays: [0, 1, 2, 3, 4], note: null }

/** Settings: edit routine blocks. Changes save straight away. */
export function RoutineEditor() {
  const loaded = useLoad(() => api.routines(), [])
  const [draft, setDraft] = useState<RoutineFields>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const list = loaded.data

  const write = async (work: () => Promise<Routine[]>) => {
    setError(null)
    try {
      loaded.setData(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const add = async () => {
    if (!draft.name.trim()) return setError('Name the block.')
    if (await write(() => api.addRoutine({ ...draft, name: draft.name.trim() }))) setDraft(EMPTY)
  }

  return (
    <Card title="Routine" className="wide" meta={list ? `${list.length} blocks` : undefined}
      action={<a href="#/">See today's plan →</a>}>
      {!list ? <Loading lines={4} /> : list.length === 0 && (
        <NeedsSetup>
          <span style={{ flex: 1 }}>No routine yet. Start from a suggestion built from your wake-up and deep work targets, then adjust it.</span>
          <button type="button" className="link-btn accent" onClick={() => void write(() => api.addSuggestedRoutine(isoDate(new Date())))}>
            Use suggested routine →
          </button>
        </NeedsSetup>
      )}
      {list && list.length > 0 && (
        <div className="table-scroll">
          <table className="data-table routine-table">
            <thead>
              <tr><th scope="col">Block</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Days</th><th scope="col"><span className="sr-only">Remove</span></th></tr>
            </thead>
            <tbody>
              {list.map((r) => <RoutineRow key={`${r.id}-${r.name}-${r.start}-${r.end}-${r.weekdays.join()}`} routine={r} write={write} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="routine-add" aria-label="Add a block">
        <input className="input" aria-label="New block name" placeholder="New block, e.g. Deep work" maxLength={80}
          value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="input" type="time" aria-label="New block start" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        <input className="input" type="time" aria-label="New block end" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        <Weekdays value={draft.weekdays} onChange={(w) => setDraft({ ...draft, weekdays: w })} label="New block" />
        <button type="button" className="btn" onClick={() => void add()}>Add</button>
      </div>
      {error && <ErrorLine message={error} />}
    </Card>
  )
}

function RoutineRow({ routine, write }: { routine: Routine; write: (w: () => Promise<Routine[]>) => Promise<boolean> }) {
  const [name, setName] = useState(routine.name)
  const save = (changes: Partial<RoutineFields>) => void write(() => api.updateRoutine(routine.id, changes))
  return (
    <tr>
      <th scope="row">
        <input className="input" aria-label={`${routine.name} name`} maxLength={80} value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== routine.name) save({ name: name.trim() }) }} />
      </th>
      <td><input className="input" type="time" aria-label={`${routine.name} start`} defaultValue={routine.start}
        onBlur={(e) => { if (e.target.value && e.target.value !== routine.start) save({ start: e.target.value }) }} /></td>
      <td><input className="input" type="time" aria-label={`${routine.name} end`} defaultValue={routine.end}
        onBlur={(e) => { if (e.target.value && e.target.value !== routine.end) save({ end: e.target.value }) }} /></td>
      <td><Weekdays value={routine.weekdays} label={routine.name} onChange={(w) => save({ weekdays: w })} /></td>
      <td className="num">
        <button type="button" className="link-btn" aria-label={`Remove ${routine.name}`}
          onClick={() => void write(() => api.deleteRoutine(routine.id))}>Remove</button>
      </td>
    </tr>
  )
}

function Weekdays({ value, onChange, label }: { value: number[]; onChange: (w: number[]) => void; label: string }) {
  const toggle = (d: number) => {
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort()
    if (next.length) onChange(next)
  }
  return (
    <div className="weekdays" role="group" aria-label={`${label} days`}>
      {DAYS.map((d, i) => (
        <button key={i} type="button" className="pill" aria-pressed={value.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => toggle(i)}>{d}</button>
      ))}
    </div>
  )
}
