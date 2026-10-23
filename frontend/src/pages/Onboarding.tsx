import { useState, type ReactNode } from 'react'
import { api, type Settings } from '../api'
import { ErrorLine, Loading } from '../components/States'
import { HabitToggles, NameField, TargetFields } from '../components/SetupFields'
import { parseTargets, targetsFrom, type Targets } from '../targets'
import { isoDate } from '../format'
import { useLoad } from '../hooks'

const STEPS = [
  { title: 'About you', intro: 'A first name is all Samuel needs.' },
  { title: 'Your day', intro: 'Rough targets are fine. Scores measure you against these, and you can change them later in Settings.' },
  { title: 'Your habits', intro: 'Ten daily trackers from the Life OS prompt. Turn off any you don\u2019t want to track.' },
] as const

export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const [today] = useState(() => isoDate(new Date()))
  const loaded = useLoad(() => api.settings(today), [today])
  if (loaded.error) return <Frame step={0}><ErrorLine message={loaded.error} onRetry={loaded.reload} /></Frame>
  if (!loaded.data) return <Frame step={0}><Loading lines={4} /></Frame>
  return <Steps today={today} initial={loaded.data} onDone={onDone} />
}

function Steps({ today, initial, onDone }: { today: string; initial: Settings; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initial.name ?? '')
  const [targets, setTargets] = useState<Targets>(() => targetsFrom(initial))
  const [habits, setHabits] = useState(initial.habits)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const next = () => run(async () => {
    if (step === 0) {
      if (!name.trim()) throw new Error('Enter a first name to continue.')
      await api.saveSettings(today, { name: name.trim() })
    } else if (step === 1) {
      const parsed = parseTargets(targets)
      if (!parsed.ok) throw new Error(parsed.error)
      await api.saveSettings(today, parsed.value)
    } else {
      if (!habits.some((h) => h.active)) throw new Error('Keep at least one habit.')
      await api.saveSettings(today, { onboarded: true })
      onDone()
      return
    }
    setStep(step + 1)
  })

  const toggle = (key: string, active: boolean) => run(async () => {
    setHabits(await api.setHabitActive(key, active))
  })

  return (
    <Frame step={step}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void next() }}>
        <div>
          <div className="page-head">
            <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
            <h1 style={{ fontSize: 26 }}>{STEPS[step].title}</h1>
            <p>{STEPS[step].intro}</p>
          </div>
        </div>

        {step === 0 && <NameField value={name} onChange={setName} />}
        {step === 1 && <TargetFields value={targets} onChange={setTargets} />}
        {step === 2 && <HabitToggles habits={habits} onToggle={toggle} />}

        {error && <ErrorLine message={error} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={saving}>Back</button>}
          <span style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {step === STEPS.length - 1 ? 'Finish and open Samuel' : 'Continue'}
          </button>
        </div>
      </form>
    </Frame>
  )
}

function Frame({ step, children }: { step: number; children: ReactNode }) {
  return (
    <main className="onboarding">
      <div className="onboarding-inner">
        <header className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" aria-hidden="true">S</div>
          <span className="brand-name">Samuel</span>
          <span className="faint" style={{ marginLeft: 'auto' }}>Setup · about a minute</span>
        </header>

        <div className="progress" aria-hidden="true"><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

        <div className="onboarding-body">
          <ol className="steps" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li key={s.title} aria-current={i === step ? 'step' : undefined} data-done={i < step}>
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </li>
            ))}
          </ol>
          <section className="card" style={{ flex: 1, minWidth: 0 }}>{children}</section>
        </div>

        <p className="faint" style={{ margin: 0 }}>
          Your answers stay in a private file on this computer. Samuel is a coach, not a clinician, and this is not medical advice.
        </p>
      </div>
    </main>
  )
}
