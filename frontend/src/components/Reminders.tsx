import { useEffect, useState } from 'react'
import { api, type BlockReminder, type DueReminder } from '../api'
import { localStamp } from '../format'

const CHECK_EVERY = 30_000
const SNOOZE_MINUTES = 15
const stampNow = () => localStamp(new Date())

function notify(title: string, body: string, tag: string, href: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const n = new Notification(title, { body, tag })
  n.onclick = () => { window.focus(); window.location.hash = href }
}

function later(stamp: string, mins: number): string {
  const [h, m] = stamp.slice(11, 16).split(':').map(Number)
  const t = Math.min(h * 60 + m + mins, 24 * 60 - 1)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Checks for due reminders while Samuel is open: task reminders, and routine blocks 5 minutes before
 * and when they start. Each shows once as a Windows notification (when allowed) and as a card in the
 * corner. 127.0.0.1 counts as a secure context, so this needs no HTTPS and no outside push service.
 */
export function Reminders() {
  const [shown, setShown] = useState<DueReminder[]>([])
  const [blocks, setBlocks] = useState<BlockReminder[]>([])

  useEffect(() => {
    let live = true
    const check = async () => {
      const now = stampNow()
      try {
        const [due, dueBlocks] = await Promise.all([api.dueReminders(now), api.blockReminders(now)])
        for (const r of due) {
          await api.markNotified(now, r.id)
          notify('Samuel · reminder', r.title, `task-${r.id}`, '#/tasks')
        }
        for (const b of dueBlocks) {
          await api.blockShown(now, b.routine_id, b.which)
          const body = b.task ? `${b.name}: ${b.task}` : b.name
          notify(b.which === 'heads_up' ? `Samuel · up next at ${b.start}` : `Samuel · now until ${b.end}`, body, `block-${b.routine_id}`, '#/')
        }
        if (!live) return
        if (due.length) setShown((s) => [...s.filter((x) => !due.some((d) => d.id === x.id)), ...due])
        if (dueBlocks.length) setBlocks((s) => [...s.filter((x) => !dueBlocks.some((d) => d.routine_id === x.routine_id)), ...dueBlocks])
      } catch {
        // The server may be restarting; try again on the next check.
      }
    }
    void check()
    const id = window.setInterval(() => void check(), CHECK_EVERY)
    return () => { live = false; window.clearInterval(id) }
  }, [])

  const act = async (r: DueReminder, how: 'done' | 'hour' | 'tomorrow' | 'dismiss') => {
    const now = stampNow()
    setShown((s) => s.filter((x) => x.id !== r.id))
    try {
      if (how === 'done') await api.updateTask(now, r.id, { done: true })
      else if (how !== 'dismiss') await api.snoozeTask(now, r.id, how)
    } catch {
      setShown((s) => [...s, r])
    }
  }

  const close = (b: BlockReminder) => setBlocks((s) => s.filter((x) => x.routine_id !== b.routine_id))
  const actBlock = async (b: BlockReminder, how: 'snooze' | 'skip', reason?: string) => {
    close(b)
    try {
      if (how === 'snooze') await api.snoozeBlock(b.date, b.routine_id, later(stampNow(), SNOOZE_MINUTES))
      else await api.logBlock(b.date, b.routine_id, 'skipped', reason)
      window.dispatchEvent(new Event('samuel:plan-changed'))
    } catch {
      setBlocks((s) => [...s, b])
    }
  }

  if (!shown.length && !blocks.length) return null
  return (
    <div className="toasts" role="region" aria-label="Reminders">
      {blocks.map((b) => <BlockToast key={`b-${b.routine_id}`} reminder={b} onClose={() => close(b)} onAct={actBlock} />)}
      {shown.map((r) => (
        <div key={r.id} className="toast" role="alert">
          <div className="toast-head">
            <span className="meter-label">Reminder · {r.remind_at.slice(11)}</span>
            <button type="button" className="link-btn" aria-label="Dismiss" onClick={() => void act(r, 'dismiss')}>×</button>
          </div>
          <strong>{r.title}</strong>
          <div className="task-actions">
            <button type="button" className="btn btn-primary" onClick={() => void act(r, 'done')}>Done</button>
            <button type="button" className="btn" onClick={() => void act(r, 'hour')}>+1 hour</button>
            <button type="button" className="btn" onClick={() => void act(r, 'tomorrow')}>Tomorrow</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function BlockToast({ reminder: b, onClose, onAct }: {
  reminder: BlockReminder; onClose: () => void; onAct: (b: BlockReminder, how: 'snooze' | 'skip', reason?: string) => void
}) {
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const start = b.which === 'start'
  return (
    <div className={`toast${start ? ' toast-now' : ''}`} role="alert">
      <div className="toast-head">
        {start ? <span className="tag now-tag toast-now-tag">Now</span> : null}
        <span className="meter-label">{start ? `${b.start}–${b.end}` : `Up next · ${b.start}`}</span>
        <button type="button" className="link-btn" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
      <strong>{start ? b.name : `${b.name} in 5 minutes`}{start && b.goal_title ? ` · ${b.goal_title}` : ''}</strong>
      {b.task && <span className="muted">Task: {b.task}</span>}
      {start && b.steps.length > 0 && (
        <ul className="toast-steps">{b.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
      {!start && b.steps[0] && <span className="muted">First: {b.steps[0]}</span>}
      {skipping ? (
        <div className="task-actions">
          <input className="input" aria-label="What got in the way?" placeholder="What got in the way?" maxLength={200} autoFocus
            value={reason} onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAct(b, 'skip', reason.trim() || undefined) }} />
          <button type="button" className="btn" onClick={() => onAct(b, 'skip', reason.trim() || undefined)}>Skip</button>
        </div>
      ) : (
        <div className="task-actions">
          {start
            ? <a className="btn btn-primary" href="#/" onClick={onClose}>Open Now →</a>
            : <button type="button" className="btn" onClick={onClose}>OK</button>}
          <button type="button" className="btn" onClick={() => onAct(b, 'snooze')}>Snooze {SNOOZE_MINUTES} min</button>
          <button type="button" className="link-btn" onClick={() => setSkipping(true)}>{start ? 'Skip…' : 'Skip today'}</button>
        </div>
      )}
    </div>
  )
}
