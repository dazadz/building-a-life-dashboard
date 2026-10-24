import { describe, expect, it } from 'vitest'
import { dayMode, nowAndNext, span } from './blocks'

const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

describe('dayMode', () => {
  it('follows the wake-up and sleep targets', () => {
    expect(dayMode(at('07:30'), '07:00', 8)).toBe('morning')
    expect(dayMode(at('09:59'), '07:00', 8)).toBe('morning')
    expect(dayMode(at('10:00'), '07:00', 8)).toBe('day')
    expect(dayMode(at('19:59'), '07:00', 8)).toBe('day')
    expect(dayMode(at('20:00'), '07:00', 8)).toBe('evening') // bed 23:00, minus 3 h
    expect(dayMode(at('01:30'), '07:00', 8)).toBe('evening')
  })

  it('works for late sleepers whose evening crosses midnight', () => {
    expect(dayMode(at('10:00'), '09:30', 8)).toBe('morning')
    expect(dayMode(at('21:00'), '09:30', 8)).toBe('day')
    expect(dayMode(at('22:30'), '09:30', 8)).toBe('evening') // bed 01:30, minus 3 h
    expect(dayMode(at('02:00'), '09:30', 8)).toBe('evening')
  })
})

describe('blocks across midnight', () => {
  const late = { start: '23:30', end: '00:30' }
  it('end after 1440 and counts as now after its start', () => {
    expect(span(late)).toEqual([1410, 1470])
    const blocks = [{ ...late, id: 1 }] as never[]
    expect(nowAndNext(blocks, at('23:45')).current).toBeDefined()
  })
})
