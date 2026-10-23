import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quickadd'

const TODAY = '2026-10-24' // a Saturday

describe('parseQuickAdd', () => {
  it('picks up a date, time, list and priority', () => {
    expect(parseQuickAdd('Call Sarah tomorrow at 9 #work !high', TODAY)).toEqual({
      title: 'Call Sarah', list: 'Work', priority: 'high',
      due_date: '2026-10-25', due_time: '09:00', remind_at: '2026-10-25T09:00',
    })
  })

  it('reads weekdays as the next one, never today', () => {
    expect(parseQuickAdd('Gym fri', TODAY).due_date).toBe('2026-10-30')
    expect(parseQuickAdd('Plan the week on monday', TODAY).due_date).toBe('2026-10-26')
    expect(parseQuickAdd('Long run saturday', TODAY).due_date).toBe('2026-10-31')
    expect(parseQuickAdd('Brunch on sun', TODAY).due_date).toBe('2026-10-25')
  })

  it('reads day and month, rolling into next year when past', () => {
    expect(parseQuickAdd('Renew insurance 3 Nov', TODAY).due_date).toBe('2026-11-03')
    expect(parseQuickAdd('Tax return Jan 31', TODAY).due_date).toBe('2027-01-31')
    expect(parseQuickAdd('Birthday 2 Oct', TODAY).due_date).toBe('2027-10-02')
  })

  it('reads 12-hour and 24-hour times, defaulting to today', () => {
    expect(parseQuickAdd('Standup 9:30am', TODAY)).toMatchObject({ due_date: TODAY, due_time: '09:30' })
    expect(parseQuickAdd('Dinner 7pm', TODAY).due_time).toBe('19:00')
    expect(parseQuickAdd('Report 13:45', TODAY).remind_at).toBe('2026-10-24T13:45')
  })

  it('leaves ordinary words and numbers alone', () => {
    expect(parseQuickAdd('Read 3 chapters of Dune', TODAY)).toEqual({ title: 'Read 3 chapters of Dune' })
    expect(parseQuickAdd('Fix the sun shade', TODAY)).toEqual({ title: 'Fix the sun shade' })
    expect(parseQuickAdd('Plan marketing launch', TODAY)).toEqual({ title: 'Plan marketing launch' })
  })

  it('understands relative days and low priority', () => {
    expect(parseQuickAdd('Water plants in 3 days !low', TODAY)).toEqual({ title: 'Water plants', due_date: '2026-10-27', priority: 'low' })
    expect(parseQuickAdd('Book flights next week', TODAY).due_date).toBe('2026-10-26')
  })
})
