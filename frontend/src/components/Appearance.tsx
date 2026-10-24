import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { api } from '../api'
import { Card } from './Card'
import { ErrorLine } from './States'
import { DEFAULT_THEME, VIBES, accentIsGreen, applyTheme, contrast, fromHsl, isHex, textOnAccent, themeVars, toHsl, type Darkness, type Theme } from '../theme'

const DARKNESS: { key: Darkness; label: string }[] = [
  { key: 'dim', label: 'Dim' }, { key: 'dark', label: 'Dark' }, { key: 'midnight', label: 'Midnight' },
]

const PREVIEW_ID = 'card-live-preview'

/** Every card but the preview ends by jumping to it, which matters when the preview sits below on a narrow window. */
function ToPreview() {
  const go = () => document.getElementById(PREVIEW_ID)?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <button type="button" className="link-btn accent" onClick={go}>See the preview →</button>
}

/**
 * Settings → Appearance, laid out as on the design canvas: the accent ring and vibes on the left,
 * the live preview and theme options on the right. Pick an accent and Samuel builds the rest around it.
 */
export function AppearanceSection({ today, saved, onSaved }: { today: string; saved: Theme | null; onSaved: () => void }) {
  const [theme, setTheme] = useState<Theme>(saved ?? DEFAULT_THEME)
  const [hex, setHex] = useState(theme.accent)
  const [state, setState] = useState<{ saving: boolean; error: string | null; message: string | null }>({ saving: false, error: null, message: null })
  const savedRef = useRef(saved)
  useEffect(() => { savedRef.current = saved }, [saved])

  // Preview live; leaving Settings without saving goes back to the saved theme.
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => () => applyTheme(savedRef.current), [])

  const [h, s, l] = toHsl(theme.accent)
  const card = themeVars(theme)['--card']
  const onCards = contrast(theme.accent, card)
  const readable = onCards >= 4.5
  const onAccent = textOnAccent(theme.accent)
  const vibe = VIBES.find((v) => v.accent === theme.accent)

  const setAccent = (accent: string) => { setTheme((t) => ({ ...t, accent })); setHex(accent) }
  const setHsl = (nh: number, ns: number, nl: number) => setAccent(fromHsl(nh, ns, nl))

  const save = async (next: Theme | null) => {
    setState({ saving: true, error: null, message: null })
    try {
      await api.saveSettings(today, { theme: next ?? {} })
      savedRef.current = next // so leaving Settings keeps what was just saved
      onSaved()
      setState({ saving: false, error: null, message: next ? 'Theme saved.' : 'Back to the default look.' })
    } catch (e) {
      setState({ saving: false, error: e instanceof Error ? e.message : String(e), message: null })
    }
  }

  return (
    <div className="appearance-grid">
      <div className="stack">
        <Card title="Accent colour" meta="Drag the ring or type a hex" action={<ToPreview />}>
          <div className="accent-picker">
            <HueRing hue={h} onChange={(nh) => setHsl(nh, s, l)} accent={theme.accent} textColor={onAccent.color} name={vibe ? vibe.name : 'Custom'} />
            <div className="form accent-fields">
              <div className="fields">
                <div className="field">
                  <label htmlFor="hex">Hex</label>
                  <input id="hex" className="input mono" maxLength={7} value={hex}
                    onChange={(e) => { setHex(e.target.value); if (isHex(e.target.value)) setTheme((t) => ({ ...t, accent: e.target.value.toLowerCase() })) }} />
                </div>
                <div className="field">
                  <span className="label">HSL</span>
                  <span className="mono hsl-readout">{h}° · {s}% · {l}%</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="vibrancy">Vibrancy <span className="hint">{s}%</span></label>
                <input id="vibrancy" type="range" min={40} max={100} value={Math.max(40, s)} onChange={(e) => setHsl(h, Number(e.target.value), l)} />
                <span className="hint">Saturation. Lower is calmer, higher is punchier.</span>
              </div>
              <div className="field">
                <label htmlFor="brightness">Brightness <span className="hint">{l}%</span></label>
                <input id="brightness" type="range" min={50} max={75} value={Math.min(75, Math.max(50, l))} onChange={(e) => setHsl(h, s, Number(e.target.value))} />
                <span className="hint">Kept between 50 and 75 so text stays readable.</span>
              </div>
              <ul className="list contrast-checks">
                <li>
                  <span className="mono" style={{ flex: 1 }}>{onAccent.name} on accent · {onAccent.ratio}:1</span>
                  <span className={onAccent.passes ? 'delta-up' : 'warn-text'}>{onAccent.passes ? 'Passes AA' : 'Below AA'}</span>
                </li>
                <li>
                  <span className="mono" style={{ flex: 1 }}>Accent on cards · {onCards.toFixed(1)}:1</span>
                  <span className={readable ? 'delta-up' : 'warn-text'}>{readable ? 'Passes AA' : 'Too dark'}</span>
                </li>
              </ul>
            </div>
          </div>
          {!readable && <ErrorLine message="This accent is too dark to read on the background. Raise the brightness or pick another colour." />}
        </Card>

        <Card title="Vibes" meta="One tap" action={<ToPreview />}>
          <div className="vibe-grid" role="radiogroup" aria-label="Vibe presets">
            {VIBES.map((v) => (
              <button key={v.name} type="button" role="radio" className="vibe-tile" aria-checked={theme.accent === v.accent} onClick={() => setAccent(v.accent)}>
                <span className="vibe-swatch" style={{ background: v.accent }} aria-hidden="true" />
                <span className="vibe-text"><span className="item-name">{v.name}</span><span className="faint">{v.desc}</span></span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Each vibe sets the accent, and the surfaces take a hint of its hue.</p>
        </Card>
      </div>

      <div className="stack">
        <Card
          title="Live preview"
          meta="Updates as you pick"
          secondary={
            <button type="button" className="link-btn" disabled={state.saving} onClick={() => { setTheme(DEFAULT_THEME); setHex(DEFAULT_THEME.accent); void save(null) }}>
              Reset to Calm cyan
            </button>
          }
          action={<button type="button" className="link-btn accent" disabled={state.saving || !readable} onClick={() => void save(theme)}>Save theme →</button>}
        >
          <div className="mini-app" role="img" aria-label="Preview of Samuel with the chosen theme">
            <div className="mini-side">
              <div className="mini-brand"><span className="brand-mark">S</span><span className="brand-name">Samuel</span></div>
              <span className="mini-nav" data-on="true">Today</span>
              <span className="mini-nav">Habits</span>
              <span className="mini-nav">Goals</span>
            </div>
            <div className="mini-main">
              <span className="mono mini-eyebrow">{vibe ? vibe.name : 'Custom'} <span className="faint">//</span> {theme.accent}</span>
              <strong className="preview-title">Good morning, Jordan</strong>
              <div className="meter">
                <div className="meter-top"><span className="meter-label">Discipline</span><span className="meter-value">71</span></div>
                <div className="meter-track">{Array.from({ length: 20 }, (_, i) => <span key={i} className="meter-seg" data-on={i < 14} />)}</div>
              </div>
              <div className="pills">
                <span className="tag" style={{ marginLeft: 0, color: 'var(--green)' }}>On track</span>
                <span className="tag" style={{ marginLeft: 0, color: 'var(--amber)' }}>At risk</span>
                <span className="tag" style={{ marginLeft: 0, color: 'var(--blue)' }}>Info</span>
              </div>
              <span className="btn btn-primary mini-btn">Start check-in</span>
            </div>
          </div>
          {state.error && <ErrorLine message={state.error} />}
          {state.message && <div className="notice ok" role="status">{state.message}</div>}
        </Card>

        <Card title="Theme" meta="Applies everywhere" action={<ToPreview />}>
          <div className="form" style={{ gap: 16 }}>
            <div className="field">
              <span className="label" id="darkness">Darkness</span>
              <div className="pills" role="radiogroup" aria-labelledby="darkness">
                {DARKNESS.map((d) => (
                  <button key={d.key} type="button" role="radio" className="pill" aria-checked={theme.darkness === d.key}
                    onClick={() => setTheme((t) => ({ ...t, darkness: d.key }))}>{d.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="tint">Surface tint <span className="hint">{Math.round(theme.tint * 100)}% · neutral to tinted</span></label>
              <input id="tint" type="range" min={0} max={100} value={Math.round(theme.tint * 100)} onChange={(e) => setTheme((t) => ({ ...t, tint: Number(e.target.value) / 100 }))} />
            </div>
            <div className="field">
              <span className="label">Automatic adjustments</span>
              <ul className="adjustments">
                <li>Surfaces take a hint of your accent's hue.</li>
                <li>Text on buttons switches between dark and white, whichever reads better.</li>
                <li>{accentIsGreen(theme.accent)
                  ? 'Your accent is green, so "on track" switches to blue to stay distinct.'
                  : '"On track" stays green; amber and blue are unchanged.'}</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

const RING = 220
const RING_WIDTH = 24
const MARKER = 26

/** A colour wheel for the hue. Drag or click it, or use the arrow keys (Shift for steps of 10). */
function HueRing({ hue, onChange, accent, textColor, name }: {
  hue: number; onChange: (h: number) => void; accent: string; textColor: string; name: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const x = e.clientX - (box.left + box.width / 2)
    const y = e.clientY - (box.top + box.height / 2)
    onChange(Math.round((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) % 360)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1
    const next: Record<string, number> = {
      ArrowRight: hue + step, ArrowUp: hue + step, ArrowLeft: hue - step, ArrowDown: hue - step,
      PageUp: hue + 10, PageDown: hue - 10, Home: 0, End: 359,
    }
    if (!(e.key in next)) return
    e.preventDefault()
    onChange(((next[e.key] % 360) + 360) % 360)
  }

  const angle = hue * Math.PI / 180
  const radius = (RING - RING_WIDTH) / 2
  const marker = {
    left: RING / 2 + radius * Math.sin(angle) - MARKER / 2,
    top: RING / 2 - radius * Math.cos(angle) - MARKER / 2,
    background: accent,
  }

  return (
    <div
      ref={ref}
      className="hue-ring"
      role="slider"
      tabIndex={0}
      aria-label="Accent hue"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`${hue} degrees`}
      onKeyDown={onKey}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e) }}
      onPointerMove={(e) => { if (dragging.current) fromPointer(e) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      <span className="hue-ring-track" aria-hidden="true" />
      <span className="hue-ring-center" aria-hidden="true">
        <span className="aa-swatch" style={{ background: accent, color: textColor }}>Aa</span>
        <span className="mono">{accent}</span>
        <span className="faint">{name}</span>
      </span>
      <span className="hue-ring-marker" style={marker} aria-hidden="true" />
    </div>
  )
}
