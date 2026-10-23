import { useState } from 'react'
import { api, type Settings } from '../api'
import { Card } from '../components/Card'
import { HabitToggles, NameField, TargetFields } from '../components/SetupFields'
import { parseTargets, targetsFrom, type Targets } from '../targets'
import { ErrorLine, Loading } from '../components/States'
import { isoDate } from '../format'
import { useLoad } from '../hooks'

export function SettingsPage({ onSaved }: { onSaved: () => void }) {
  const [today] = useState(() => isoDate(new Date()))
  const loaded = useLoad(() => api.settings(today), [today])
  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Settings</div>
        <h1>Profile and targets</h1>
        <p>Changes to targets apply from today. Past days keep the targets they were scored against.</p>
      </header>
      {loaded.error ? <ErrorLine message={loaded.error} onRetry={loaded.reload} />
        : !loaded.data ? <Loading lines={4} />
        : <Forms today={today} initial={loaded.data} onSaved={onSaved} />}
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

function Forms({ today, initial, onSaved }: { today: string; initial: Settings; onSaved: () => void }) {
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
      <Card title="Habits" meta={`${habits.filter((h) => h.active).length} of ${habits.length} on`} action={<a href="#/habits">Habits →</a>}>
        <HabitToggles habits={habits} onToggle={toggle} />
        <Status message={tracking.message} error={tracking.error} />
      </Card>
    </div>
  )
}
