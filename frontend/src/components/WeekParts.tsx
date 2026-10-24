import { useState } from 'react'
import { api, type DayType, type Routine, type RoutineFields } from '../api'
import { DAY_SHORT } from '../blocks'
import { Card } from './Card'
import { Weekdays } from './Routine'
import { ErrorLine, Loading, NeedsSetup } from './States'

const days = (r: Routine) => r.day_type ?? (r.weekdays.length === 7 ? 'Every day' : r.weekdays.map((d) => DAY_SHORT[d]).join(' '))

/**
 * About me: work hours, classes, training and other fixed commitments. They're routine blocks of
 * type Fixed, without reminders by default, and Samuel plans everything else around them.
 */
export function FixedPartsCard({ routines, types, onChange }: {
  routines: Routine[] | null; types: DayType[]; onChange: (r: Routine[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', start: '09:00', end: '17:00', weekdays: [0, 1, 2, 3, 4], day_type_id: null as number | null })
  const [error, setError] = useState<string | null>(null)
  const fixed = (routines ?? []).filter((r) => r.kind === 'fixed')

  const write = async (work: () => Promise<Routine[]>) => {
    setError(null)
    try {
      onChange(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  const add = async () => {
    if (!draft.name.trim()) return setError('Name it, e.g. Office hours.')
    const block: RoutineFields = {
      name: draft.name.trim(), start: draft.start, end: draft.end, weekdays: draft.weekdays, note: null, kind: 'fixed',
      goal_id: null, habit_key: null, steps: [], remind_before: false, remind_start: false, day_type_id: draft.day_type_id,
    }
    if (await write(() => api.addRoutine(block))) {
      setDraft({ ...draft, name: '' })
      setAdding(false)
    }
  }

  return (
    <Card title="Fixed parts of your week"
      secondary={<button type="button" className="link-btn accent" aria-expanded={adding} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add a fixed block'}</button>}
      action={<a href="#/routine">Routine →</a>}>
      {!routines ? <Loading /> : fixed.length === 0 && !adding ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>Add office hours, classes, church or training, so Samuel plans the rest of your week around them.</span>
          <button type="button" className="link-btn accent" onClick={() => setAdding(true)}>Add one →</button>
        </NeedsSetup>
      ) : (
        <ul className="list">
          {fixed.map((r) => (
            <li key={r.id}>
              <span className="fixed-part">
                <span className="item-name">{r.name}</span>
                <span className="mono faint">{days(r)} · {r.start}–{r.end}</span>
              </span>
              <button type="button" className="link-btn" aria-label={`Remove ${r.name}`} onClick={() => void write(() => api.deleteRoutine(r.id))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="form fixed-add" style={{ gap: 12 }}>
          <div className="fields">
            <div className="field">
              <label htmlFor="fixed-name">What</label>
              <input id="fixed-name" className="input" maxLength={80} placeholder="e.g. Office hours" autoFocus
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="fixed-start">From</label>
              <input id="fixed-start" className="input" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="fixed-end">To</label>
              <input id="fixed-end" className="input" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="fixed-type">On</label>
              <select id="fixed-type" className="input" value={draft.day_type_id ?? ''}
                onChange={(e) => setDraft({ ...draft, day_type_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Days I pick</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}s</option>)}
              </select>
            </div>
          </div>
          {draft.day_type_id === null && <Weekdays label="Fixed block" value={draft.weekdays} onChange={(w) => setDraft({ ...draft, weekdays: w })} />}
          <div className="task-actions">
            <button type="button" className="btn btn-primary" onClick={() => void add()}>Add fixed block</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <ErrorLine message={error} />}
    </Card>
  )
}

/** About me: the day types that set which blocks run on which days. Edited on the Routine page. */
export function DayTypesCard({ types, routines }: { types: DayType[] | null; routines: Routine[] | null }) {
  return (
    <Card title="Your day types" meta={types ? `${types.length} types` : undefined} action={<a href="#/routine">Edit day types →</a>}>
      {!types ? <Loading /> : types.length === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>Group days that run the same way, like office days and days off, so each gets its own routine.</span>
          <a href="#/routine">Set up →</a>
        </NeedsSetup>
      ) : (
        <ul className="list">
          {types.map((t) => {
            const count = (routines ?? []).filter((r) => r.day_type_id === t.id
              || (r.day_type_id === null && r.weekdays.some((d) => t.weekdays.includes(d)))).length
            return (
              <li key={t.id}>
                <span className="item-name" style={{ flex: 1 }}>{t.name}</span>
                <span className="mono faint">{t.weekdays.length ? t.weekdays.map((d) => DAY_SHORT[d]).join(' ') : 'No days yet'} · {count} blocks</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="faint" style={{ margin: 0 }}>Shift moved? Switch today's type on Today with one tap.</p>
    </Card>
  )
}
