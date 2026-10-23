import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { api, type Profile, type ProfileQuestion, type ProfileSection, type ProfileValue, type Report, type Status } from '../api'
import { Card } from '../components/Card'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { useLoad, type useCoachJob } from '../hooks'

interface Props {
  coach: ReturnType<typeof useCoachJob>
  status: Status | null
}

type View = { section: string; mode: 'edit' | 'results' }

/** The full onboarding: 45 questions in 4 sections, saved as you go. */
export function ProfilePage({ coach, status }: Props) {
  const loaded = useLoad(() => api.profile(), [])
  const [view, setView] = useState<View | null>(null)
  const p = loaded.data

  // Start on the first section that isn't finished yet.
  const current: View | null = view ?? (p ? { section: (p.sections.find((s) => !s.done) ?? p.sections[0]).key, mode: 'edit' } : null)
  const index = p && current ? p.sections.findIndex((s) => s.key === current.section) : 0
  const section = p && current ? p.sections[index] : null

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Profile <span className="faint">//</span> {p ? `${p.answered} of ${p.total} answered` : '…'}</div>
        <h1>What Samuel knows about you</h1>
        <p>Samuel uses these answers in every report. About 15 minutes in all; answers save as you go, so you can finish later.</p>
      </header>

      {loaded.error && <ErrorLine message={loaded.error} onRetry={loaded.reload} />}
      {p && <div className="progress" aria-hidden="true"><div style={{ width: `${(p.answered / p.total) * 100}%` }} /></div>}

      {!p || !section || !current ? <Loading lines={6} /> : (
        <div className="onboarding-body">
          <ol className="steps" aria-label="Profile sections">
            {p.sections.map((s, i) => (
              <li key={s.key} aria-current={s.key === section.key ? 'step' : undefined} data-done={s.done}>
                <button type="button" className="step-btn" onClick={() => setView({ section: s.key, mode: s.done ? 'results' : 'edit' })}>
                  <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span className="faint">{s.done ? 'Done' : `${s.answered}/${s.total}`}</span>
                </button>
              </li>
            ))}
          </ol>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {current.mode === 'edit' ? (
              <SectionForm
                key={section.key}
                section={section}
                number={index + 1}
                count={p.sections.length}
                onSaved={(next, finished) => {
                  loaded.setData(next)
                  if (finished) {
                    setView({ section: section.key, mode: 'results' })
                    if (status?.coach.installed && !coach.running) void coach.start('onboard-insights')
                  }
                }}
                onBack={index > 0 ? () => setView({ section: p.sections[index - 1].key, mode: 'edit' }) : undefined}
              />
            ) : (
              <Results
                section={section}
                next={p.sections[index + 1]}
                coach={coach}
                installed={status?.coach.installed ?? false}
                onEdit={() => setView({ section: section.key, mode: 'edit' })}
                onNext={(key) => setView({ section: key, mode: 'edit' })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionForm({ section, number, count, onSaved, onBack }: {
  section: ProfileSection; number: number; count: number
  onSaved: (p: Profile, finished: boolean) => void; onBack?: () => void
}) {
  const [values, setValues] = useState<Record<string, ProfileValue>>(
    () => Object.fromEntries(section.questions.map((q) => [q.key, q.answer])),
  )
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = (key: string, value: ProfileValue) => {
    setValues((v) => ({ ...v, [key]: value }))
    setChanged((c) => new Set(c).add(key))
    setSaved(false)
  }

  const save = async (finish: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const answers = Object.fromEntries([...changed].map((k) => [k, values[k]]))
      const next = await api.saveProfile(section.key, answers, finish ? true : undefined)
      setChanged(new Set())
      setSaved(!finish)
      onSaved(next, finish)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const groups = [...new Set(section.questions.map((q) => q.group))]
  const left = section.questions.filter((q) => !q.optional && (values[q.key] == null || values[q.key] === '' || (Array.isArray(values[q.key]) && (values[q.key] as string[]).length === 0))).length

  return (
    <section className="card" aria-labelledby="section-title">
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(true) }}>
        <div className="page-head">
          <div className="eyebrow">Section {number} of {count} <span className="faint">//</span> About {section.minutes} minutes</div>
          <h2 id="section-title" style={{ fontSize: 20, margin: '8px 0 6px' }}>{section.title}</h2>
          <p>{section.intro}</p>
        </div>
        {groups.map((g) => (
          <fieldset key={g}>
            <legend>{g}</legend>
            <div className="fields">
              {section.questions.filter((q) => q.group === g).map((q) => (
                <Question key={q.key} q={q} value={values[q.key]} onChange={(v) => set(q.key, v)} />
              ))}
            </div>
          </fieldset>
        ))}
        {error && <ErrorLine message={error} />}
        {saved && <div className="notice ok" role="status">Saved. Come back any time to finish.</div>}
        <div className="form-actions">
          {onBack && <button type="button" className="btn" onClick={onBack} disabled={saving}>Back</button>}
          <span className="faint" style={{ flex: 1 }}>{left === 0 ? 'All answered' : `${left} ${left === 1 ? 'question' : 'questions'} left`}</span>
          <button type="button" className="btn" onClick={() => void save(false)} disabled={saving || changed.size === 0}>Save and finish later</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>Finish section</button>
        </div>
      </form>
    </section>
  )
}

function Question({ q, value, onChange }: { q: ProfileQuestion; value: ProfileValue; onChange: (v: ProfileValue) => void }) {
  const id = `q-${q.key}`
  const label = (
    <>
      {q.label}
      {q.unit && <span className="hint"> ({q.unit})</span>}
      {q.optional && <span className="hint"> · optional</span>}
      {q.sensitive && <span className="hint"> · shared with Samuel only for these insights</span>}
    </>
  )
  const wide = q.type === 'long' || q.type === 'multi' || q.type === 'scale' || (q.options?.length ?? 0) > 4
  const style = wide ? { gridColumn: '1 / -1' } : undefined

  if (q.type === 'choice' || q.type === 'multi' || q.type === 'scale') {
    const options = q.type === 'scale' ? Array.from({ length: 10 }, (_, i) => String(i + 1)) : q.options ?? []
    const selected = (o: string) =>
      q.type === 'multi' ? ((value as string[] | null) ?? []).includes(o) : q.type === 'scale' ? value === Number(o) : value === o
    const pick = (o: string) => {
      if (q.type === 'multi') {
        const now = (value as string[] | null) ?? []
        onChange(now.includes(o) ? now.filter((x) => x !== o) : [...now, o])
      } else if (q.type === 'scale') {
        onChange(value === Number(o) ? null : Number(o))
      } else {
        onChange(value === o ? null : o)
      }
    }
    return (
      <div className="field" style={style}>
        <span className="label" id={id}>{label}</span>
        <div className={q.type === 'scale' ? 'scale' : 'pills'} role="group" aria-labelledby={id}>
          {options.map((o) => (
            <button key={o} type="button" className="pill" aria-pressed={selected(o)} onClick={() => pick(o)}>{o}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>{label}</label>
      {q.type === 'long' ? (
        <textarea id={id} className="input" maxLength={2000} placeholder={q.placeholder}
          value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          className="input"
          type={q.type === 'number' ? 'number' : q.type === 'time' ? 'time' : 'text'}
          min={q.min}
          max={q.max}
          step={q.step}
          maxLength={q.type === 'text' ? 200 : undefined}
          placeholder={q.placeholder}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(q.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        />
      )}
    </div>
  )
}

function Results({ section, next, coach, installed, onEdit, onNext }: {
  section: ProfileSection; next?: ProfileSection; coach: ReturnType<typeof useCoachJob>; installed: boolean
  onEdit: () => void; onNext: (key: string) => void
}) {
  const reports = useLoad(() => api.reports('onboarding'), [])
  const { job } = coach
  useEffect(() => {
    if (job?.status === 'done') reports.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status])
  const insight: Report | undefined = reports.data?.find((r) => r.markdown.startsWith(`# ${section.title}`))

  return (
    <>
      <Card
        title={`${section.title} · snapshot`}
        meta={`From your ${section.answered} answers`}
        secondary={<button type="button" className="link-btn" onClick={onEdit}>Edit answers</button>}
        action={next
          ? <button type="button" className="link-btn accent" onClick={() => onNext(next.key)}>Continue to {next.title} →</button>
          : <a href="#/">Back to Today →</a>}
      >
        <div className="snapshot">
          {section.snapshot.map((s) => (
            <div key={s.label} className="snapshot-item">
              <span className="meter-label">{s.label}</span>
              <span className="meter-value">{s.value ?? '—'}</span>
              {s.note && <span className="faint">{s.note}</span>}
            </div>
          ))}
        </div>
      </Card>
      <Card
        title="What Samuel noticed"
        meta={insight ? 'Written by Samuel · Claude Code' : undefined}
        action={installed
          ? <button type="button" className="link-btn accent" disabled={coach.running} onClick={() => void coach.start('onboard-insights')}>
              {coach.running ? 'Writing…' : insight ? 'Write again →' : 'Ask Samuel →'}
            </button>
          : <a href="#/coach">Coach →</a>}
      >
        {coach.running ? <Loading lines={4} /> : insight ? (
          <div className="report"><Markdown>{insight.markdown.split('\n').slice(1).join('\n')}</Markdown></div>
        ) : (
          <NeedsSetup>
            {installed
              ? 'Samuel writes up what stands out in this section with Claude Code on this computer. Ask when you are ready.'
              : "Samuel's insights need Claude Code installed and logged in on this computer. Your answers are saved either way."}
          </NeedsSetup>
        )}
        {job?.status === 'failed' && job.skill === 'onboard-insights' && <ErrorLine message={`The insights didn't finish: ${job.error ?? 'unknown error'}`} />}
        {coach.error && <ErrorLine message={coach.error} />}
      </Card>
    </>
  )
}
