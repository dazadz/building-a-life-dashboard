import { useState } from 'react'
import type { BlockKind, Goal, NewSubtask, NewTask, Priority, Routine, Task } from '../api'
import { alphabetical, dayDate } from '../format'
import { KIND_LABEL, TYPE_OPTIONS } from '../blocks'
import { Card } from './Card'
import { ErrorLine } from './States'

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'high', label: 'High' }, { key: 'normal', label: 'Normal' }, { key: 'low', label: 'Low' },
]

type Fields = Required<Pick<NewTask, 'title' | 'type' | 'goal_id' | 'due_date' | 'due_time' | 'remind_at' | 'priority' | 'routine_id' | 'notes'>>

/** Create a task, or edit one: its time, type, the goal it moves forward and the routine block it belongs to. */
export function TaskEditor({ task, title, goals, routines, onSave, onClose }: {
  task?: Task; title?: string; goals: Goal[]; routines: Routine[]
  onSave: (fields: Fields, subtasks: NewSubtask[]) => Promise<boolean>; onClose: () => void
}) {
  const [f, setF] = useState<Fields>({
    title: task?.title ?? title ?? '', type: task?.type ?? null, goal_id: task?.goal_id ?? null,
    due_date: task?.due_date ?? null, due_time: task?.due_time ?? null, remind_at: task?.remind_at ?? null,
    priority: task?.priority ?? 'normal', routine_id: task?.routine_id ?? null, notes: task?.notes ?? null,
  })
  const [subtasks, setSubtasks] = useState<NewSubtask[]>([])
  const [subtask, setSubtask] = useState('')
  const [subtaskDue, setSubtaskDue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const addSubtask = () => {
    if (!subtask.trim()) return
    setSubtasks((s) => [...s, { title: subtask.trim(), due_date: subtaskDue || null }])
    setSubtask('')
    setSubtaskDue('')
  }
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setF((x) => ({ ...x, [key]: value }))

  const save = async () => {
    if (!f.title.trim()) return setProblem('Give the task a name.')
    if (f.due_time && !f.due_date) return setProblem('Pick a date for the time.')
    setProblem(null)
    setSaving(true)
    const pending = subtask.trim() ? [...subtasks, { title: subtask.trim(), due_date: subtaskDue || null }] : subtasks
    const ok = await onSave({ ...f, title: f.title.trim(), notes: f.notes?.trim() || null }, pending)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Card title={task ? 'Edit task' : 'New task'} className="wide task-editor"
      secondary={<button type="button" className="link-btn" onClick={onClose}>Cancel</button>}
      action={<button type="button" className="link-btn accent" disabled={saving} onClick={() => void save()}>{task ? 'Save task →' : 'Create task →'}</button>}>
      <div className="form" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="task-title">Task</label>
          <input id="task-title" className="input" maxLength={200} value={f.title} autoFocus placeholder="e.g. Draft the Q4 budget summary"
            onChange={(e) => set('title', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />
        </div>
        <div className="fields">
          <div className="field">
            <label htmlFor="task-type">Type</label>
            <select id="task-type" className="input" value={f.type ?? ''} onChange={(e) => set('type', (e.target.value || null) as BlockKind | null)}>
              <option value="">No type</option>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{KIND_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-goal">Goal it achieves</label>
            <select id="task-goal" className="input" value={f.goal_id ?? ''} onChange={(e) => set('goal_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {alphabetical(goals, (g) => g.title).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-date">Due date</label>
            <input id="task-date" className="input" type="date" value={f.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="task-time">Time</label>
            <input id="task-time" className="input" type="time" value={f.due_time ?? ''} onChange={(e) => set('due_time', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="task-remind">Reminder</label>
            <input id="task-remind" className="input" type="datetime-local" value={f.remind_at ?? ''}
              onChange={(e) => set('remind_at', e.target.value ? e.target.value.slice(0, 16) : null)} />
          </div>
          <div className="field">
            <label htmlFor="task-block">Do it in routine block</label>
            <select id="task-block" className="input" value={f.routine_id ?? ''} onChange={(e) => set('routine_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {alphabetical(routines, (r) => r.name).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.start}</option>)}
            </select>
            <span className="hint">It shows on the Now card while that block runs.</span>
          </div>
        </div>
        <div className="field">
          <span className="label" id="task-priority">Priority</span>
          <div className="pills" role="radiogroup" aria-labelledby="task-priority">
            {PRIORITIES.map((p) => (
              <button key={p.key} type="button" role="radio" className="pill" aria-checked={f.priority === p.key} onClick={() => set('priority', p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
        <fieldset className="task-subtasks">
          <legend>Subtasks</legend>
          {(task?.subtasks.length ?? 0) > 0 && (
            <ul className="list">
              {task!.subtasks.map((x) => (
                <li key={x.id}><span className={x.done ? 'muted' : undefined} style={{ flex: 1 }}>{x.title}</span><span className="faint mono">{x.due_date ? dayDate(x.due_date) : x.done ? 'done' : 'open'}</span></li>
              ))}
            </ul>
          )}
          {subtasks.length > 0 && (
            <ul className="list">
              {subtasks.map((x, i) => (
                <li key={i}>
                  <span style={{ flex: 1 }}>{x.title}</span>
                  <span className="faint mono">{x.due_date ? dayDate(x.due_date) : 'No date'}</span>
                  <button type="button" className="link-btn" aria-label={`Remove ${x.title}`} onClick={() => setSubtasks((s) => s.filter((_, j) => j !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline-add" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px auto' }}>
            <input className="input" aria-label="New subtask" placeholder="Add a subtask, then Enter" maxLength={200} value={subtask}
              onChange={(e) => setSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }} />
            <input type="date" className="input" aria-label="New subtask due date" value={subtaskDue} onChange={(e) => setSubtaskDue(e.target.value)} />
            <button type="button" className="btn" disabled={!subtask.trim()} onClick={addSubtask}>Add subtask</button>
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="task-notes">Notes</label>
          <textarea id="task-notes" className="input" rows={3} maxLength={4000} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
        </div>
        {problem && <ErrorLine message={problem} />}
        <div className="task-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{task ? 'Save task' : 'Create task'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Card>
  )
}
