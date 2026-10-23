// Fields shared by onboarding and Settings.

import type { ChangeEvent } from 'react'
import type { Settings } from '../api'
import type { Targets } from '../targets'

export function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ maxWidth: 360 }}>
      <label htmlFor="name">First name</label>
      <input id="name" className="input" type="text" maxLength={40} autoComplete="given-name"
        value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint">Samuel uses it to greet you. It stays on this computer.</span>
    </div>
  )
}

export function TargetFields({ value, onChange }: { value: Targets; onChange: (v: Targets) => void }) {
  const set = (key: keyof Targets) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value })
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="wake_target">Wake-up target</label>
        <input id="wake_target" className="input" type="time" value={value.wake_target} onChange={set('wake_target')} />
        <span className="hint">Within 15 minutes counts as on time.</span>
      </div>
      <div className="field">
        <label htmlFor="sleep_target">Sleep target (hours)</label>
        <input id="sleep_target" className="input" type="number" min={4} max={12} step={0.25} inputMode="decimal"
          value={value.sleep_target_hours} onChange={set('sleep_target_hours')} />
        <span className="hint">Between 4 and 12.</span>
      </div>
      <div className="field">
        <label htmlFor="deep_work_target">Deep work target (hours)</label>
        <input id="deep_work_target" className="input" type="number" min={0.5} max={12} step={0.5} inputMode="decimal"
          value={value.deep_work_target_hours} onChange={set('deep_work_target_hours')} />
        <span className="hint">Focused work with no distractions.</span>
      </div>
    </div>
  )
}

export function HabitToggles({ habits, onToggle }: { habits: Settings['habits']; onToggle: (key: string, active: boolean) => void }) {
  return (
    <ul className="list">
      {habits.map((h) => (
        <li key={h.key}>
          <input id={`habit-${h.key}`} type="checkbox" className="check" checked={h.active}
            onChange={(e) => onToggle(h.key, e.target.checked)} />
          <label htmlFor={`habit-${h.key}`} style={{ flex: 1, cursor: 'pointer' }}>
            {h.name}
            {h.auto === 1 && <span className="tag" title="Ticked from the check-in">auto</span>}
          </label>
          <span className="faint">{h.active ? 'Tracking' : 'Off'}</span>
        </li>
      ))}
    </ul>
  )
}
