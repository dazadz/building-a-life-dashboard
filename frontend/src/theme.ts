// Custom themes: every colour is built from one accent (see Custom themes in docs/PLAN.md).
// With no saved theme the app keeps the defaults in index.css.

export type Darkness = 'dim' | 'dark' | 'midnight'

export interface Theme {
  accent: string // #rrggbb
  darkness: Darkness
  tint: number // 0 (neutral) to 1 (tinted with the accent's hue)
}

export const DEFAULT_THEME: Theme = { accent: '#22e0e6', darkness: 'midnight', tint: 0.3 }

export const VIBES: { name: string; desc: string; accent: string }[] = [
  { name: 'Calm', desc: 'Electric cyan', accent: '#22e0e6' },
  { name: 'Clear', desc: 'Sky blue', accent: '#5cb8ff' },
  { name: 'Focus', desc: 'Iris', accent: '#8b8cff' },
  { name: 'Energise', desc: 'Sunrise orange', accent: '#ff9f43' },
  { name: 'Bold', desc: 'Hot pink', accent: '#ff5fa2' },
  { name: 'Fresh', desc: 'Mint green', accent: '#4ee59a' },
]

const DARK_TEXT = '#071016'
const WHITE = '#ffffff'

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

export function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

export function fromHsl(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Dark or white text on the accent, whichever contrasts more (it must reach 4.5:1 for AA). */
export function textOnAccent(accent: string): { color: string; name: string; ratio: number; passes: boolean } {
  const dark = contrast(accent, DARK_TEXT)
  const white = contrast(accent, WHITE)
  const useDark = dark >= white
  const ratio = Math.round((useDark ? dark : white) * 10) / 10
  return { color: useDark ? DARK_TEXT : WHITE, name: useDark ? 'Dark text' : 'White text', ratio, passes: ratio >= 4.5 }
}

/** A green accent would blur with the success colour, so success switches to blue. */
export function accentIsGreen(accent: string): boolean {
  const [h, s] = toHsl(accent)
  return s >= 25 && h >= 85 && h <= 165
}

// Lightness (%) of each surface per darkness level. Midnight keeps the page pure black.
const LEVELS: Record<Darkness, Record<'page' | 'sidebar' | 'card' | 'inset' | 'border' | 'divider' | 'borderStrong', number>> = {
  midnight: { page: 0, sidebar: 0, card: 5.5, inset: 3, border: 14, divider: 11, borderStrong: 22 },
  dark: { page: 4, sidebar: 5.5, card: 8, inset: 5, border: 16, divider: 12.5, borderStrong: 24 },
  dim: { page: 7, sidebar: 8.5, card: 10.5, inset: 7.5, border: 18.5, divider: 15, borderStrong: 26 },
}

/** The CSS variables for a theme. */
export function themeVars(theme: Theme): Record<string, string> {
  const [hue] = toHsl(theme.accent)
  const sat = Math.round(8 + 32 * Math.max(0, Math.min(1, theme.tint)))
  const surface = (l: number) => (l === 0 ? '#000000' : fromHsl(hue, sat, l))
  const lv = LEVELS[theme.darkness]
  const vars: Record<string, string> = {
    '--accent': theme.accent,
    '--on-accent': textOnAccent(theme.accent).color,
    '--page': surface(lv.page),
    '--sidebar': surface(lv.sidebar),
    '--card': surface(lv.card),
    '--inset': surface(lv.inset),
    '--border': surface(lv.border),
    '--divider': surface(lv.divider),
    '--border-strong': surface(lv.borderStrong),
    '--green': accentIsGreen(theme.accent) ? '#5cb8ff' : '#5be38a',
  }
  return vars
}

const APPLIED = Object.keys(themeVars(DEFAULT_THEME))

/** Apply a theme to the page, or go back to the stylesheet defaults with null. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement.style
  for (const name of APPLIED) root.removeProperty(name)
  if (theme) for (const [name, value] of Object.entries(themeVars(theme))) root.setProperty(name, value)
}
