import { useEffect, useState } from 'react'
import { api, type DueReminder } from '../api'
import { localStamp } from '../format'

const CHECK_EVERY = 30_000
const stampNow = () => localStamp(new Date())

/**
 * Checks for due reminders while Samuel is open. Each one shows once as a Windows notification
 * (when allowed) and as a card in the corner with Done, +1 hour and Tomorrow.
 * 127.0.0.1 counts as a secure context, so this needs no HTTPS and no outside push service.
 */
export function Reminders() {
  const [shown, setShown] = useState<DueReminder[]>([])

  useEffect(() => {
    let live = true
    const check = async () => {
      const now = stampNow()
      try {
        const due = await api.dueReminders(now)
        for (const r of due) {
          await api.markNotified(now, r.id)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const n = new Notification('Samuel · reminder', { body: r.title, tag: `task-${r.id}` })
            n.onclick = () => { window.focus(); window.location.hash = '#/tasks' }
          }
        }
        if (live && due.length) setShown((s) => [...s.filter((x) => !due.some((d) => d.id === x.id)), ...due])
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

  if (!shown.length) return null
  return (
    <div className="toasts" role="region" aria-label="Reminders">
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
