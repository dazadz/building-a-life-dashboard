// Small display helpers shared by the screens.

import type { Checkin } from './api'

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** A missing score shows a dash, never 0. */
export function scoreText(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}

/** "+6" or "−9" with a real minus sign; nothing when unknown or unchanged. */
export function deltaText(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return ''
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`
}

export const QUESTIONS: (keyof Checkin)[] = [
  'wake_time', 'sleep_hours', 'mood', 'energy', 'main_goal', 'workout',
  'deep_work_hours', 'productivity', 'distraction', 'wins', 'failures', 'improvement',
]

export function answeredCount(c: Partial<Checkin> | null | undefined): number {
  if (!c) return 0
  return QUESTIONS.filter((k) => {
    const v = c[k]
    return v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
  }).length
}
