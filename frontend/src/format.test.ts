import { describe, expect, it } from 'vitest'
import { addDays, answeredCount, deltaText, greeting, scoreText } from './format'

describe('format', () => {
  it('shows a dash for a missing score, never 0', () => {
    expect(scoreText(null)).toBe('—')
    expect(scoreText(undefined)).toBe('—')
    expect(scoreText(0)).toBe('0')
  })

  it('writes changes with a sign', () => {
    expect(deltaText(6)).toBe('+6')
    expect(deltaText(-9)).toBe('−9')
    expect(deltaText(0)).toBe('')
    expect(deltaText(null)).toBe('')
  })

  it('counts only real answers', () => {
    expect(answeredCount({ energy: 0 as unknown as number, wins: '  ', mood: 'good', sleep_hours: null })).toBe(2)
  })

  it('moves dates across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('greets by time of day', () => {
    expect(greeting(8)).toBe('Good morning')
    expect(greeting(13)).toBe('Good afternoon')
    expect(greeting(21)).toBe('Good evening')
  })
})
