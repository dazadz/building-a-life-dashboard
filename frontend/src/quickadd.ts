// Quick add: "Call Sarah tomorrow at 9 #work !high" becomes a task with a date, time, list and priority.

import { addDays } from './format'

export interface QuickTask {
  title: string
  list?: string
  priority?: 'high' | 'low'
  due_date?: string
  due_time?: string
  remind_at?: string
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const SHORT_DAYS = ['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function weekdayIndex(word: string): number {
  const w = word.toLowerCase()
  return w.length >= 3 ? WEEKDAYS.findIndex((d) => d.startsWith(w)) : -1
}

/** Monday = 0, as in the backend. */
function weekdayOf(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The date in a month and day from today on: "24 Oct" in November means next year. */
function nextDate(today: string, month: number, day: number): string | undefined {
  const year = Number(today.slice(0, 4))
  for (const y of [year, year + 1]) {
    const iso = `${y}-${pad(month + 1)}-${pad(day)}`
    const d = new Date(`${iso}T12:00:00`)
    if (d.getMonth() !== month) return undefined // 31 Feb and the like
    if (iso >= today) return iso
  }
  return undefined
}

export function parseQuickAdd(text: string, today: string): QuickTask {
  let rest = ` ${text} `
  const out: Omit<QuickTask, 'title'> = {}
  // Try the pattern at every word boundary, left to right, until `fn` accepts a match.
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const sticky = new RegExp(re.source, `${re.flags.replace('g', '')}y`)
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] !== ' ') continue
      sticky.lastIndex = i
      const m = sticky.exec(rest)
      if (m && fn(m) !== false) {
        rest = `${rest.slice(0, i)} ${rest.slice(i + m[0].length)}`
        return
      }
    }
  }

  take(/\s#([\p{L}\d][\p{L}\d-]*)(?=\s)/u, (m) => { out.list = m[1][0].toUpperCase() + m[1].slice(1) })
  take(/\s(!!|!high|!low)(?=\s)/i, (m) => { out.priority = m[1].toLowerCase() === '!low' ? 'low' : 'high' })

  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => { out.due_date = m[1] })
  if (!out.due_date) take(/\s(today|tonight)(?=\s)/i, () => { out.due_date = today })
  if (!out.due_date) take(/\s(tomorrow|tmrw?)(?=\s)/i, () => { out.due_date = addDays(today, 1) })
  if (!out.due_date) take(/\snext week(?=\s)/i, () => { out.due_date = addDays(today, 7 - weekdayOf(today)) })
  if (!out.due_date) take(/\sin (\d{1,3}) days?(?=\s)/i, (m) => { out.due_date = addDays(today, Number(m[1])) })
  if (!out.due_date) {
    take(/\s(?:on )?(\d{1,2}) ([a-z]{3})[a-z]*(?=\s)|\s(?:on )?([a-z]{3})[a-z]* (\d{1,2})(?=\s)/i, (m) => {
      const day = Number(m[1] ?? m[4])
      const month = MONTHS.indexOf((m[2] ?? m[3]).toLowerCase())
      const iso = month >= 0 ? nextDate(today, month, day) : undefined
      if (!iso) return false
      out.due_date = iso
    })
  }
  if (!out.due_date) {
    take(/\s(?:on |next )?([a-z]{3,9})(?=\s)/i, (m) => {
      const word = m[1].toLowerCase()
      const target = weekdayIndex(word)
      if (target < 0) return false
      // "sat" and "sun" are ordinary words too, so they need "on" or "next" unless written in full.
      const prefixed = /^\s(on|next) /i.test(m[0])
      if (!prefixed && word !== WEEKDAYS[target] && !SHORT_DAYS.includes(word)) return false
      out.due_date = addDays(today, ((target - weekdayOf(today) + 7) % 7) || 7)
    })
  }

  take(/\s(?:at )?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)|\s(?:at )?(\d{1,2}):(\d{2})(?=\s)|\sat (\d{1,2})(?=\s)/i, (m) => {
    let h = Number(m[1] ?? m[4] ?? m[6])
    const min = Number(m[2] ?? m[5] ?? 0)
    const half = m[3]?.toLowerCase()
    if (half === 'pm' && h < 12) h += 12
    if (half === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) return false
    out.due_time = `${pad(h)}:${pad(min)}`
  })
  if (out.due_time) {
    out.due_date ??= today
    out.remind_at = `${out.due_date}T${out.due_time}`
  }

  return { title: rest.replace(/\s+/g, ' ').trim(), ...out }
}
