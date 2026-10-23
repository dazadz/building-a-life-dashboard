import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, VIBES, accentIsGreen, contrast, fromHsl, textOnAccent, themeVars, toHsl } from './theme'

describe('theme', () => {
  it('converts between hex and HSL', () => {
    expect(toHsl('#ff0000')).toEqual([0, 100, 50])
    expect(fromHsl(0, 100, 50)).toBe('#ff0000')
    // Whole-number HSL can shift a channel by a step or two on the way back.
    const back = fromHsl(...toHsl('#22e0e6'))
    for (const i of [1, 3, 5]) expect(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt('22e0e6'.slice(i - 1, i + 1), 16))).toBeLessThanOrEqual(2)
  })

  it('picks the text on the accent that passes AA', () => {
    expect(textOnAccent('#22e0e6')).toMatchObject({ name: 'Dark text', passes: true })
    expect(textOnAccent('#3b2bd1')).toMatchObject({ name: 'White text', passes: true })
    for (const v of VIBES) expect(textOnAccent(v.accent).passes).toBe(true)
  })

  it('switches success to blue when the accent is green', () => {
    expect(accentIsGreen('#4ee59a')).toBe(true)
    expect(accentIsGreen('#22e0e6')).toBe(false)
    expect(themeVars({ ...DEFAULT_THEME, accent: '#4ee59a' })['--green']).toBe('#5cb8ff')
  })

  it('keeps midnight pure black and makes dim lighter', () => {
    expect(themeVars(DEFAULT_THEME)['--page']).toBe('#000000')
    const dim = themeVars({ ...DEFAULT_THEME, darkness: 'dim' })
    expect(contrast(dim['--page'], '#000000')).toBeGreaterThan(1.1)
  })

  it('keeps body text readable on every surface at every darkness', () => {
    for (const darkness of ['dim', 'dark', 'midnight'] as const) {
      for (const v of VIBES) {
        const vars = themeVars({ accent: v.accent, darkness, tint: 1 })
        for (const s of ['--page', '--card', '--inset']) {
          expect(contrast('#7f8c9f', vars[s])).toBeGreaterThanOrEqual(4.5) // --text-faint, the dimmest text
        }
      }
    }
  })
})
