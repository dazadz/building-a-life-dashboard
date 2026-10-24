// Small display helpers shared by the screens.

import type { Checkin } from './api'

/** The local calendar date as YYYY-MM-DD. Never use toISOString() for this: it gives the UTC date. */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The local date and time as YYYY-MM-DDTHH:MM, the format tasks and reminders use. */
export function localStamp(d: Date): string {
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function localTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function greeting(hour: number): string {
  if (hour < 4) return 'Good evening' // still last night for anyone up late
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

export type ScoreTone = 'good' | 'mid' | 'low'

/**
 * Green, amber or red for a 0–100 score: 70 and up is good, 40–69 middling, under 40 low.
 * Pass `inverse` for the stress index (1–10, higher is worse).
 */
export function scoreTone(value: number | null | undefined, inverse = false): ScoreTone | undefined {
  if (value == null) return undefined
  if (inverse) return value <= 3.5 ? 'good' : value <= 6.5 ? 'mid' : 'low'
  return value >= 70 ? 'good' : value >= 40 ? 'mid' : 'low'
}

/** A due date the way the user reads it: "Mon 26/10/2026". */
export function dayDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  return `${day} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Whole days from `today` until `iso`; negative when it has passed. */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000)
}

/** "12 days left", "Due today" or "3 days late". */
export function daysLeftText(iso: string, today: string): string {
  const n = daysUntil(iso, today)
  if (n === 0) return 'Due today'
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} late`
  return `${n} ${n === 1 ? 'day' : 'days'} left`
}

/** Dropdown options in alphabetical order, with any "Other" kept last. */
export function alphabetical<T>(items: readonly T[], label: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const la = label(a)
    const lb = label(b)
    const oa = la.toLowerCase() === 'other'
    const ob = lb.toLowerCase() === 'other'
    return oa === ob ? la.localeCompare(lb, 'en', { sensitivity: 'base' }) : oa ? 1 : -1
  })
}
