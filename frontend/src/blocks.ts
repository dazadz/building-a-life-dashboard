// Routine block helpers shared by Today, the Routine page and reminders.

import type { BlockKind, PlanBlock, Routine } from './api'

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const KIND_LABEL: Record<BlockKind, string> = {
  focus: 'Focus', fixed: 'Fixed', habit: 'Habit', recovery: 'Recovery', leisure: 'Leisure',
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Start and end in minutes after midnight; a block that runs past midnight ends after 1440. */
export function span(b: Pick<Routine, 'start' | 'end'>): [number, number] {
  const start = minutes(b.start)
  const end = minutes(b.end)
  return [start, end <= start ? end + 24 * 60 : end]
}

export function inText(mins: number): string {
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `in ${h} h ${m} min` : `in ${h} h`
}

export function remindText(b: Pick<Routine, 'remind_before' | 'remind_start'>): string {
  if (b.remind_before && b.remind_start) return '−5 · Start'
  if (b.remind_before) return '−5 min'
  if (b.remind_start) return 'Start'
  return 'Off'
}

/** What a block works on, in a few words. */
export function worksOn(b: Routine): string | null {
  if (b.goal_title) return `Goal · ${b.goal_title}`
  if (b.habit_name) return `Habit · ${b.habit_name}`
  return b.note
}

/** The block running now and the next one to start, from minutes after midnight. */
export function nowAndNext(blocks: PlanBlock[], at: number): { current?: PlanBlock; next?: PlanBlock } {
  const current = blocks.find((b) => { const [s, e] = span(b); return s <= at && at < e })
  const next = blocks.find((b) => span(b)[0] > at)
  return { current, next }
}
