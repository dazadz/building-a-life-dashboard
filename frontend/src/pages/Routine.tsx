import { useState } from 'react'
import { api, type BlockKind, type DayType, type Goal, type Routine, type RoutineFields, type Settings, type Status } from '../api'
import { Card } from '../components/Card'
import { DAY_SHORT, KIND_LABEL, remindText, worksOn } from '../blocks'
import { Weekdays } from '../components/Routine'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { isoDate } from '../format'
import { useCoachJob, useLoad } from '../hooks'

interface Data {
  routines: Routine[]
  types: DayType[]
  goals: Goal[]
  habits: Settings['habits']
}

type Tab = number | 'days' // a day type's id, or the blocks that run on their own weekdays

const KINDS = Object.keys(KIND_LABEL) as BlockKind[]
const EMPTY: RoutineFields = {
  name: '', start: '09:00', end: '10:00', weekdays: [0, 1, 2, 3, 4], note: null, kind: 'focus', goal_id: null,
  habit_key: null, steps: [], remind_before: true, remind_start: true, day_type_id: null,
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const ownerOf = (types: DayType[], weekday: number) => types.find((t) => t.weekdays.includes(weekday))
const runsOn = (r: Routine, types: DayType[], weekday: number) =>
  r.day_type_id !== null ? r.day_type_id === ownerOf(types, weekday)?.id : r.weekdays.includes(weekday)

/** The weekly routine: day types, the blocks of each, and an editor for one block. */
export function RoutinePage({ coach, status }: { coach: ReturnType<typeof useCoachJob>; status: Status | null }) {
  const [today] = useState(() => isoDate(new Date()))
  const loaded = useLoad(async (): Promise<Data> => {
    const [routines, types, goals, settings] = await Promise.all([api.routines(), api.dayTypes(), api.goals(today), api.settings(today)])
    return { routines, types, goals: goals.goals.filter((g) => !g.done_date), habits: settings.habits.filter((h) => h.active) }
  }, [today])
  const [tab, setTab] = useState<Tab | null>(null)
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const d = loaded.data

  const write = async (work: () => Promise<Partial<Data>>) => {
    setError(null)
    try {
      const changed = await work()
      loaded.setData({ ...d!, ...changed })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  if (loaded.error) return <div className="page"><ErrorLine message={loaded.error} onRetry={loaded.reload} /></div>
  if (!d) return <div className="page"><Loading lines={8} /></div>

  const todayType = ownerOf(d.types, (new Date(`${today}T12:00:00`).getDay() + 6) % 7)
  const current: Tab = tab ?? todayType?.id ?? d.types[0]?.id ?? 'days'
  const untyped = d.routines.filter((r) => r.day_type_id === null)
  const shownType = d.types.find((t) => t.id === current)
  // A day type's tab shows everything that runs on its days: its own blocks and blocks on their own weekdays.
  const shown = current === 'days' ? untyped : d.routines.filter((r) => r.day_type_id === current
    || (r.day_type_id === null && shownType !== undefined && r.weekdays.some((w) => shownType.weekdays.includes(w))))
  const planned = shown.reduce((sum, r) => {
    const [s, e] = [r.start, r.end].map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)))
    return sum + (e > s ? e - s : e + 1440 - s)
  }, 0)
  const installed = status?.coach.installed ?? false

  return (
    <div className="page">
      <header className="page-head about-head">
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="eyebrow">Repeats every week <span className="faint">//</span> {d.types.length} day types <span className="faint">//</span> {d.routines.length} blocks</div>
          <h1>Routine</h1>
          <p>Each block says what to work on. Samuel reminds you 5 minutes before and when it starts, while Samuel is open.</p>
        </div>
        <div className="about-build">
          <button type="button" className="btn" disabled={!installed || coach.running} onClick={() => void coach.start('plan-builder')}>
            {coach.running && coach.job?.skill === 'plan-builder' ? 'Samuel is working on it…' : 'Ask Samuel to improve it →'}
          </button>
          {coach.job?.skill === 'plan-builder' && coach.job.status === 'done' && <a className="hint" href="#/about">Suggestions are waiting under About me →</a>}
        </div>
      </header>

      <section className="card week-strip" aria-label="Your week">
        {DAY_SHORT.map((day, i) => {
          const owner = ownerOf(d.types, i)
          const count = d.routines.filter((r) => runsOn(r, d.types, i)).length
          const target: Tab = owner?.id ?? 'days'
          return (
            <button key={day} type="button" className="week-day" aria-pressed={target === current}
              onClick={() => { setTab(target); setEditing(null) }}>
              <span className="meter-label">{day}</span>
              <span className="item-name">{owner?.name ?? 'Own days'}</span>
              <span className="mono faint">{plural(count, 'block')}</span>
            </button>
          )
        })}
      </section>

      <div className="routine-layout">
        <Card
          title={shownType ? shownType.name : 'Blocks on their own days'}
          className="wide"
          meta={`${plural(shown.length, 'block')} · ${Math.floor(planned / 60)} h${planned % 60 ? ` ${planned % 60} min` : ''} planned`}
          secondary={<button type="button" className="link-btn accent" onClick={() => setEditing('new')}>+ Add a block</button>}
          action={<a href="#/">See today →</a>}
        >
          <div className="pills" role="tablist" aria-label="Day type">
            {d.types.map((t) => (
              <button key={t.id} type="button" role="tab" className="pill" aria-selected={t.id === current}
                onClick={() => { setTab(t.id); setEditing(null) }}>{t.name}</button>
            ))}
            <button type="button" role="tab" className="pill" aria-selected={current === 'days'} onClick={() => { setTab('days'); setEditing(null) }}>
              Own days {untyped.length > 0 && <span className="faint">{untyped.length}</span>}
            </button>
          </div>
          {d.routines.length === 0 ? (
            <NeedsSetup>
              <span style={{ flex: 1 }}>No routine yet. Ask Samuel to build one from your profile, or start from a simple suggestion built from your targets.</span>
              <button type="button" className="link-btn accent"
                onClick={() => void write(async () => { await api.addSuggestedRoutine(today); return { routines: await api.routines() } })}>
                Use simple routine →
              </button>
            </NeedsSetup>
          ) : shown.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No blocks here yet. Add one, or give a block this day type.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table block-table">
                <thead>
                  <tr><th scope="col">Time</th><th scope="col">Block</th><th scope="col">Kind</th><th scope="col">Works on</th>
                    <th scope="col">Days</th><th scope="col" className="num">Remind</th><th scope="col"><span className="sr-only">Edit</span></th></tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} data-selected={editing !== 'new' && editing?.id === r.id}>
                      <td className="mono">{r.start}–{r.end}</td>
                      <th scope="row" className="item-name">{r.name}</th>
                      <td><span className="tag kind-tag" data-kind={r.kind}>{KIND_LABEL[r.kind]}</span></td>
                      <td className="muted">{worksOn(r) ?? '—'}</td>
                      <td className="mono faint">{r.day_type ?? (r.weekdays.length === 7 ? 'Every day' : r.weekdays.map((x) => DAY_SHORT[x]).join(' '))}</td>
                      <td className="num mono faint">{remindText(r)}</td>
                      <td className="num"><button type="button" className="link-btn" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {error && <ErrorLine message={error} />}
        </Card>

        {editing && (
          <BlockEditor
            key={editing === 'new' ? `new-${current}` : editing.id}
            block={editing === 'new' ? { ...EMPTY, day_type_id: current === 'days' ? null : current } : editing}
            data={d}
            onClose={() => setEditing(null)}
            onSave={async (fields) => {
              const ok = await write(async () => ({
                routines: editing === 'new' ? await api.addRoutine(fields) : await api.updateRoutine(editing.id, fields),
              }))
              if (ok) setEditing(null)
            }}
            onRemove={editing === 'new' ? undefined : async () => {
              if (await write(async () => ({ routines: await api.deleteRoutine(editing.id) }))) setEditing(null)
            }}
          />
        )}
      </div>

      <DayTypesCard types={d.types} write={write} />
    </div>
  )
}

function BlockEditor({ block, data, onSave, onClose, onRemove }: {
  block: RoutineFields; data: Data; onSave: (f: RoutineFields) => void; onClose: () => void; onRemove?: () => void
}) {
  const [f, setF] = useState<RoutineFields>({
    name: block.name, start: block.start, end: block.end, weekdays: block.weekdays, note: block.note, kind: block.kind,
    goal_id: block.goal_id, habit_key: block.habit_key, steps: block.steps, remind_before: block.remind_before,
    remind_start: block.remind_start, day_type_id: block.day_type_id,
  })
  const [step, setStep] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const set = <K extends keyof RoutineFields>(key: K, value: RoutineFields[K]) => setF({ ...f, [key]: value })

  const save = () => {
    if (!f.name.trim()) return setProblem('Name the block.')
    if (f.start === f.end) return setProblem("A block can't start and end at the same time.")
    const steps = step.trim() ? [...f.steps, step.trim()] : f.steps
    onSave({ ...f, name: f.name.trim(), steps })
  }

  return (
    <Card title={onRemove ? 'Edit block' : 'New block'} className="block-editor"
      secondary={onRemove && <button type="button" className="link-btn warn-text" onClick={onRemove}>Remove</button>}
      action={<button type="button" className="link-btn accent" onClick={save}>Save block →</button>}>
      <div className="form" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="block-name">Name</label>
          <input id="block-name" className="input" maxLength={80} value={f.name} placeholder="e.g. Deep work: side project"
            onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="fields">
          <div className="field">
            <label htmlFor="block-start">Start</label>
            <input id="block-start" className="input" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="block-end">End</label>
            <input id="block-end" className="input" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />
            {f.end < f.start && <span className="hint">Ends after midnight.</span>}
          </div>
          <div className="field">
            <label htmlFor="block-kind">Kind</label>
            <select id="block-kind" className="input" value={f.kind} onChange={(e) => set('kind', e.target.value as BlockKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="block-type">Runs on</label>
            <select id="block-type" className="input" value={f.day_type_id ?? ''}
              onChange={(e) => set('day_type_id', e.target.value ? Number(e.target.value) : null)}>
              {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}s</option>)}
              <option value="">Days I pick</option>
            </select>
          </div>
        </div>
        {f.day_type_id === null && <Weekdays label="Block" value={f.weekdays} onChange={(w) => set('weekdays', w)} />}
        <div className="fields">
          <div className="field">
            <label htmlFor="block-goal">Works on goal</label>
            <select id="block-goal" className="input" value={f.goal_id ?? ''} onChange={(e) => set('goal_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {data.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="block-habit">Ticks habit when done</label>
            <select id="block-habit" className="input" value={f.habit_key ?? ''} onChange={(e) => set('habit_key', e.target.value || null)}>
              <option value="">None</option>
              {data.habits.map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="block-note">What to do</label>
          <input id="block-note" className="input" maxLength={200} value={f.note ?? ''} placeholder="One line, shown on Today"
            onChange={(e) => set('note', e.target.value || null)} />
        </div>
        <fieldset>
          <legend>Steps, shown when the block starts</legend>
          {f.steps.map((s, i) => (
            <div key={i} className="step-row">
              <input className="input" aria-label={`Step ${i + 1}`} maxLength={120} value={s}
                onChange={(e) => set('steps', f.steps.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="link-btn" aria-label={`Remove step ${i + 1}`} onClick={() => set('steps', f.steps.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {f.steps.length < 8 && (
            <input className="input step-new" aria-label="New step" placeholder="Add a step, then Enter" maxLength={120} value={step}
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && step.trim()) { set('steps', [...f.steps, step.trim()]); setStep('') } }} />
          )}
        </fieldset>
        <fieldset>
          <legend>Reminders</legend>
          <div className="pills">
            <label className="check-label"><input type="checkbox" className="check" checked={f.remind_before} onChange={(e) => set('remind_before', e.target.checked)} /> 5 min before</label>
            <label className="check-label"><input type="checkbox" className="check" checked={f.remind_start} onChange={(e) => set('remind_start', e.target.checked)} /> At the start</label>
          </div>
        </fieldset>
        {problem && <ErrorLine message={problem} />}
        <div className="task-actions">
          <button type="button" className="btn btn-primary" onClick={save}>Save block</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Card>
  )
}

function DayTypesCard({ types, write }: { types: DayType[]; write: (w: () => Promise<Partial<Data>>) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [days, setDays] = useState<number[]>([])
  const add = async () => {
    if (!name.trim()) return
    if (await write(async () => ({ types: await api.addDayType(name.trim(), days) }))) { setName(''); setDays([]) }
  }
  return (
    <Card title="Day types" meta="A weekday belongs to one type" action={<a href="#/about">Fixed parts of your week →</a>}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Group days that run the same way, like office days and days off. Shift moved? Switch today's type on Today.
      </p>
      {types.length > 0 && (
        <ul className="list">
          {types.map((t) => (
            <li key={`${t.id}-${t.name}-${t.weekdays.join()}`} className="day-type-row">
              <input className="input" aria-label={`${t.name} name`} defaultValue={t.name} maxLength={40}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void write(async () => ({ types: await api.updateDayType(t.id, { name: v }) })) }} />
              <Weekdays label={t.name} value={t.weekdays} allowNone
                onChange={(w) => void write(async () => ({ types: await api.updateDayType(t.id, { weekdays: w }) }))} />
              <span className="mono faint">{plural(t.blocks, 'own block')}</span>
              <button type="button" className="link-btn" aria-label={`Remove ${t.name}`}
                onClick={() => void write(async () => ({ types: await api.deleteDayType(t.id), routines: await api.routines() }))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="day-type-row" aria-label="Add a day type">
        <input className="input" aria-label="New day type" placeholder="e.g. Office day" maxLength={40} value={name}
          onChange={(e) => setName(e.target.value)} />
        <Weekdays label="New day type" value={days} onChange={setDays} allowNone />
        <button type="button" className="btn" onClick={() => void add()}>Add</button>
      </div>
    </Card>
  )
}
