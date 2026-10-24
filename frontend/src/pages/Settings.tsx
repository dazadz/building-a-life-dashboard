import { useState } from 'react'
import { api, type DataInfo, type Settings, type TextSize } from '../api'
import { Card } from '../components/Card'
import { RoutineEditor } from '../components/Routine'
import { AppearanceCard } from '../components/Appearance'
import { TrashCard } from '../components/Undo'
import { HabitToggles, NameField, TargetFields } from '../components/SetupFields'
import { parseTargets, targetsFrom, type Targets } from '../targets'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { isoDate } from '../format'
import { useLoad } from '../hooks'

export function SettingsPage({ onSaved, onRestored }: { onSaved: () => void; onRestored: () => void }) {
  const [today] = useState(() => isoDate(new Date()))
  const loaded = useLoad(() => api.settings(today), [today])
  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Settings</div>
        <h1>Profile and targets</h1>
        <p>Changes to targets apply from today. Past days keep the targets they were scored against.</p>
      </header>
      <NeedsSetup>
        <span style={{ flex: 1 }}>
          <strong>Your profile.</strong> The 45 onboarding questions that tell Samuel about your life, routine, health and goals.
        </span>
        <a href="#/profile">Edit profile →</a>
      </NeedsSetup>
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} />
        : !loaded.data ? <Loading lines={4} />
        : <Forms today={today} initial={loaded.data} onSaved={onSaved} onRestored={onRestored} />}
    </div>
  )
}

function useSave() {
  const [state, setState] = useState<{ saving: boolean; message: string | null; error: string | null }>(
    { saving: false, message: null, error: null },
  )
  const save = async (work: () => Promise<unknown>, message: string) => {
    setState({ saving: true, message: null, error: null })
    try {
      await work()
      setState({ saving: false, message, error: null })
    } catch (e) {
      setState({ saving: false, message: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { ...state, save }
}

function Status({ message, error }: { message: string | null; error: string | null }) {
  if (error) return <ErrorLine message={error} />
  if (message) return <div className="notice ok" role="status">{message}</div>
  return null
}

function Forms({ today, initial, onSaved, onRestored }: { today: string; initial: Settings; onSaved: () => void; onRestored: () => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [targets, setTargets] = useState<Targets>(() => targetsFrom(initial))
  const [habits, setHabits] = useState(initial.habits)
  const profile = useSave()
  const goals = useSave()
  const tracking = useSave()

  const saveName = () => profile.save(async () => {
    if (!name.trim()) throw new Error('Enter a first name.')
    await api.saveSettings(today, { name: name.trim() })
    onSaved()
  }, 'Name saved.')

  const saveTargets = () => goals.save(async () => {
    const parsed = parseTargets(targets)
    if (!parsed.ok) throw new Error(parsed.error)
    await api.saveSettings(today, parsed.value)
  }, 'Targets saved. They apply from today.')

  const toggle = (key: string, active: boolean) => tracking.save(async () => {
    if (!active && habits.filter((h) => h.active).length === 1) throw new Error('Keep at least one habit.')
    setHabits(await api.setHabitActive(key, active))
  }, active ? 'Habit turned on.' : 'Habit turned off. Its history is kept.')

  return (
    <div className="row">
      <Card title="Profile" action={<button type="button" className="link-btn" style={{ color: 'var(--link)' }} disabled={profile.saving} onClick={saveName}>Save name →</button>}>
        <NameField value={name} onChange={setName} />
        <Status message={profile.message} error={profile.error} />
      </Card>
      <Card title="Daily targets" className="wide" action={<button type="button" className="link-btn" style={{ color: 'var(--link)' }} disabled={goals.saving} onClick={saveTargets}>Save targets →</button>}>
        <TargetFields value={targets} onChange={setTargets} />
        <Status message={goals.message} error={goals.error} />
      </Card>
      <RoutineEditor />
      <AppearanceCard today={today} saved={initial.theme} onSaved={onSaved} />
      <TextSizeCard today={today} initial={initial.text_size} onSaved={onSaved} />
      <DataCard />
      <TrashCard onRestored={onRestored} />
      <Card title="Habits" meta={`${habits.filter((h) => h.active).length} of ${habits.length} on`} action={<a href="#/habits">Habits →</a>}>
        <HabitToggles habits={habits} onToggle={toggle} />
        <Status message={tracking.message} error={tracking.error} />
      </Card>
    </div>
  )
}

const TEXT_SIZES: { key: TextSize; label: string; percent: number }[] = [
  { key: 'small', label: 'Small', percent: 100 },
  { key: 'medium', label: 'Medium', percent: 110 },
  { key: 'large', label: 'Large', percent: 125 },
  { key: 'xlarge', label: 'Extra large', percent: 140 },
]

function TextSizeCard({ today, initial, onSaved }: { today: string; initial: TextSize; onSaved: () => void }) {
  const [size, setSize] = useState<TextSize>(initial)
  const state = useSave()
  const pick = (key: TextSize) => state.save(async () => {
    setSize(key)
    await api.saveSettings(today, { text_size: key })
    onSaved()
  }, 'Text size saved.')
  return (
    <Card title="Text size" meta="Applies everywhere" action={<a href="#/">See it on Today →</a>}>
      <div className="pills" role="group" aria-label="Text size">
        {TEXT_SIZES.map((t) => (
          <button key={t.key} type="button" className="pill" aria-pressed={size === t.key} disabled={state.saving} onClick={() => pick(t.key)}>
            {t.label} <span className="faint">{t.percent}%</span>
          </button>
        ))}
      </div>
      <Status message={state.message} error={state.error} />
    </Card>
  )
}

function DataCard() {
  const info = useLoad(() => api.data(), [])
  const backup = useSave()
  const [latest, setLatest] = useState<DataInfo | null>(null)
  const d = latest ?? info.data

  const backUp = () => backup.save(async () => setLatest(await api.backupNow()), 'Backup written.')

  return (
    <Card
      title="Your data"
      meta={d ? `${d.backups} backups` : undefined}
      action={<button type="button" className="link-btn" style={{ color: 'var(--link)' }} disabled={backup.saving} onClick={backUp}>Back up now →</button>}
    >
      {info.error ? <ErrorLine message={info.error} onRetry={info.reload} /> : !d ? <Loading /> : (
        <ul className="list">
          <li>
            <span className="muted" style={{ flex: 1 }}>Stored in</span>
            <code className="mono faint" style={{ wordBreak: 'break-all', textAlign: 'right' }}>{d.data_dir}</code>
          </li>
          <li>
            <span className="muted" style={{ flex: 1 }}>Last backup</span>
            <strong>{d.last_backup ? new Date(d.last_backup.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'None yet'}</strong>
          </li>
          <li>
            <span className="muted" style={{ flex: 1 }}>Automatic</span>
            <span className="faint">Daily, keeping the last {d.keep_daily}</span>
          </li>
        </ul>
      )}
      <Status message={backup.message} error={backup.error} />
    </Card>
  )
}
