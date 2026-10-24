import { useState } from 'react'
import { api, type About, type PainGoal, type PainGoalFields, type Status } from '../api'
import { Card } from '../components/Card'
import { SuggestionsCard } from '../components/Suggestions'
import { DayTypesCard, FixedPartsCard } from '../components/WeekParts'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { useCoachJob, useLoad } from '../hooks'

interface Props {
  coach: ReturnType<typeof useCoachJob>
  status: Status | null
  onChanged: () => void
}

/** What Samuel knows: your pains and goals, notes in your own words, and Samuel's suggestions. */
export function AboutPage({ coach, status, onChanged }: Props) {
  const job = coach.job?.skill === 'plan-builder' ? coach.job : null
  // When a plan run finishes, reload what it may have added.
  const finished = job?.status === 'done' ? job.id : null
  const about = useLoad(() => api.about(), [finished])
  const profile = useLoad(() => api.profile(), [])
  const routine = useLoad(() => api.routines(), [finished])
  const dayTypes = useLoad(() => api.dayTypes(), [finished])
  const installed = status?.coach.installed ?? false
  const counts = about.data?.counts

  return (
    <div className="page">
      <header className="page-head about-head">
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="eyebrow">
            {profile.data ? `${profile.data.answered} profile answers` : 'Profile'} <span className="faint">//</span>{' '}
            {counts ? `${counts.pain} pains · ${counts.goal} goals` : 'Pains and goals'}
          </div>
          <h1>What Samuel knows</h1>
          <p>Everything here shapes your Home, your routine and Samuel's suggestions. It stays on this computer.</p>
        </div>
        <div className="about-build">
          <button type="button" className="btn btn-primary" disabled={!installed || coach.running} onClick={() => void coach.start('plan-builder')}>
            {coach.running && job ? 'Samuel is building your plan…' : 'Ask Samuel to build my plan →'}
          </button>
          {!installed && <span className="hint">Needs Claude Code. <a href="#/settings?tab=coach">Coach settings →</a></span>}
          {job?.status === 'failed' && <span className="warn-text hint">{job.error ?? 'The plan run failed.'}</span>}
          {coach.error && <span className="warn-text hint">{coach.error}</span>}
        </div>
      </header>

      {about.error ? <ErrorLine message={about.error} onRetry={about.reload} /> : !about.data ? <Loading lines={6} /> : (
        <PainsGoalsCard about={about.data} onChange={about.setData} />
      )}

      <div className="row">
        <SuggestionsCard limit={10} refresh={finished} onChanged={() => { about.reload(); onChanged() }} action={<a href="#/coach">Tell Samuel more in chat →</a>} />
        {about.data && <NotesCard about={about.data} onSaved={about.setData} />}
        <FixedPartsCard routines={routine.data} types={dayTypes.data ?? []} onChange={routine.setData} />
        <DayTypesCard types={dayTypes.data} routines={routine.data} />
        <Card title="Your profile" meta={profile.data ? `${profile.data.answered} of ${profile.data.total}` : undefined} action={<a href="#/profile">Edit profile →</a>}>
          {!profile.data ? <Loading /> : (
            <ul className="list">
              {profile.data.sections.map((s) => (
                <li key={s.key}>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <strong className={s.answered === s.total ? 'delta-up' : undefined}>{s.answered} / {s.total}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="faint" style={{ margin: 0 }}>Changed something big? Update the answers, then rebuild your plan.</p>
        </Card>
      </div>
    </div>
  )
}

type Filter = 'all' | 'pain' | 'goal' | 'resolved'
const AREA_OPTIONS = ['Career', 'Faith', 'Sleep', 'Energy', 'Focus', 'Fitness', 'Health', 'Money', 'Relationships', 'Learning', 'Other']

/** The life areas a pain or goal belongs to. A value Samuel wrote that isn't in the list stays selectable. */
function AreaSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const options = value && !AREA_OPTIONS.includes(value) ? [value, ...AREA_OPTIONS] : AREA_OPTIONS
  return (
    <select className="input" aria-label="Area" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Area…</option>
      {options.map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  )
}
const EMPTY: PainGoalFields = { kind: 'pain', text: '', area: null, evidence: null }

function PainsGoalsCard({ about, onChange }: { about: About; onChange: (a: About) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [kindFirst, setKindFirst] = useState<'pain' | 'goal'>('pain')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<PainGoalFields>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const write = async (work: () => Promise<About>) => {
    setError(null)
    try {
      onChange(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const active = about.items.filter((i) => i.status === 'active')
  const resolved = about.items.filter((i) => i.status === 'resolved')
  const shown = (filter === 'resolved' ? resolved : filter === 'all' ? active : active.filter((i) => i.kind === filter))
    .slice().sort((a, b) => (a.kind === b.kind ? 0 : a.kind === kindFirst ? -1 : 1))

  const add = async () => {
    if (!draft.text.trim()) return setError('Write what it is first.')
    if (await write(() => api.addPainGoal({ ...draft, text: draft.text.trim() }))) {
      setDraft(EMPTY)
      setAdding(false)
    }
  }

  return (
    <Card
      title="Pains and goals"
      className="wide"
      meta={`${active.length} active`}
      secondary={
        <button type="button" className="link-btn" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Add a pain or goal'}
        </button>
      }
      action={<a href="#/">See them on Today →</a>}
    >
      <div className="pills" role="group" aria-label="Filter pains and goals">
        {([['all', `All ${active.length}`], ['pain', `Pains ${about.counts.pain}`], ['goal', `Goals ${about.counts.goal}`], ['resolved', `Resolved ${resolved.length}`]] as [Filter, string][]).map(([f, label]) => (
          <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>

      {adding && (
        <div className="pain-add" aria-label="Add a pain or goal">
          <select className="input" aria-label="Kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PainGoal['kind'] })}>
            <option value="pain">Pain</option>
            <option value="goal">Goal</option>
          </select>
          <input className="input" aria-label="What it is" placeholder="e.g. Late to bed on weeknights" maxLength={160}
            value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <AreaSelect value={draft.area} onChange={(area) => setDraft({ ...draft, area })} />
          <button type="button" className="btn btn-primary" onClick={() => void add()}>Add</button>
        </div>
      )}

      {about.items.length === 0 ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>No pains or goals yet. Ask Samuel to build your plan and it suggests them from your profile, or add your own.</span>
        </NeedsSetup>
      ) : shown.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing here.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table pain-table">
            <thead>
              <tr>
                <th scope="col">
                  <button type="button" className="sort-btn" onClick={() => setKindFirst(kindFirst === 'pain' ? 'goal' : 'pain')}
                    aria-label={`Kind, ${kindFirst}s first. Sort ${kindFirst === 'pain' ? 'goals' : 'pains'} first`}>Kind ↕</button>
                </th>
                <th scope="col">What</th>
                <th scope="col">What shows it</th>
                <th scope="col">Tracked by</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => editing === item.id ? (
                <EditRow key={item.id} item={item} onCancel={() => setEditing(null)}
                  onSave={async (changes) => { if (await write(() => api.updatePainGoal(item.id, changes))) setEditing(null) }} />
              ) : (
                <tr key={item.id}>
                  <td><span className="tag kind-tag" data-kind={item.kind}>{item.kind === 'pain' ? 'Pain' : 'Goal'}</span></td>
                  <th scope="row" className="pain-what">
                    <span className="item-name">{item.text}</span>
                    {item.area && <span className="faint">{item.area}</span>}
                  </th>
                  <td className="muted">{item.evidence ?? '—'}</td>
                  <td>
                    {item.goal_title ? <a href="#/goals">Goal · {item.goal_title}</a>
                      : item.habit_name ? <a href="#/habits">Habit · {item.habit_name}</a>
                      : <span className="faint">Not linked</span>}
                  </td>
                  <td className="num pain-actions">
                    <button type="button" className="link-btn" onClick={() => setEditing(item.id)}>Edit</button>
                    <button type="button" className="link-btn"
                      onClick={() => void write(() => api.updatePainGoal(item.id, { status: item.status === 'active' ? 'resolved' : 'active' }))}>
                      {item.status === 'active' ? 'Resolve' : 'Reopen'}
                    </button>
                    <button type="button" className="link-btn" aria-label={`Remove ${item.text}`}
                      onClick={() => void write(() => api.deletePainGoal(item.id))}>Remove</button>
                  </td>
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

function EditRow({ item, onSave, onCancel }: {
  item: PainGoal; onSave: (changes: Partial<PainGoalFields>) => void; onCancel: () => void
}) {
  const [text, setText] = useState(item.text)
  const [area, setArea] = useState(item.area ?? '')
  const [evidence, setEvidence] = useState(item.evidence ?? '')
  return (
    <tr>
      <td><span className="tag kind-tag" data-kind={item.kind}>{item.kind === 'pain' ? 'Pain' : 'Goal'}</span></td>
      <th scope="row">
        <input className="input" aria-label="What it is" maxLength={160} value={text} onChange={(e) => setText(e.target.value)} />
        <AreaSelect value={area || null} onChange={(v) => setArea(v ?? '')} />
      </th>
      <td colSpan={2}>
        <input className="input" aria-label="What shows it" maxLength={300} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </td>
      <td className="num pain-actions">
        <button type="button" className="btn btn-primary btn-small"
          onClick={() => onSave({ text: text.trim(), area: area.trim() || null, evidence: evidence.trim() || null })}>Save</button>
        <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>
      </td>
    </tr>
  )
}

function NotesCard({ about, onSaved }: { about: About; onSaved: (a: About) => void }) {
  const [notes, setNotes] = useState(about.notes ?? '')
  const [state, setState] = useState<{ saving: boolean; message: string | null; error: string | null }>({ saving: false, message: null, error: null })
  const changed = notes !== (about.notes ?? '')

  const save = async () => {
    setState({ saving: true, message: null, error: null })
    try {
      onSaved(await api.saveAboutNotes(notes))
      setState({ saving: false, message: 'Saved. Samuel reads this in every plan and chat.', error: null })
    } catch (e) {
      setState({ saving: false, message: null, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <Card
      title="In your own words"
      meta={`${notes.length} / ${about.notes_max}`}
      secondary={<a href="#/coach">Or tell Samuel in chat →</a>}
      action={<button type="button" className="link-btn accent" disabled={!changed || state.saving} onClick={() => void save()}>Save notes →</button>}
    >
      <label htmlFor="about-notes" className="muted" style={{ fontSize: 13 }}>
        Anything Samuel should plan around: your week, fixed commitments, people, limits, what works for you.
      </label>
      <textarea id="about-notes" className="input" rows={8} maxLength={about.notes_max} value={notes}
        placeholder={'Office Mon–Wed, home Thu–Fri.\nTraining Saturdays at 08:00.\nI think best before lunch.'}
        onChange={(e) => { setNotes(e.target.value); setState({ saving: false, message: null, error: null }) }} />
      {state.error && <ErrorLine message={state.error} />}
      {state.message && <div className="notice ok" role="status">{state.message}</div>}
    </Card>
  )
}
