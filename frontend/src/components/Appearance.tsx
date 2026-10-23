import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Card } from './Card'
import { ErrorLine } from './States'
import { DEFAULT_THEME, VIBES, accentIsGreen, applyTheme, contrast, fromHsl, isHex, textOnAccent, themeVars, toHsl, type Darkness, type Theme } from '../theme'

const DARKNESS: { key: Darkness; label: string }[] = [
  { key: 'dim', label: 'Dim' }, { key: 'dark', label: 'Dark' }, { key: 'midnight', label: 'Midnight' },
]

/** Settings → Appearance: pick an accent and Samuel builds the rest of the theme around it. Changes preview live. */
export function AppearanceCard({ today, saved, onSaved }: { today: string; saved: Theme | null; onSaved: () => void }) {
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
  const readable = contrast(theme.accent, card) >= 4.5
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
    <Card
      title="Appearance"
      className="wide"
      meta="Live preview"
      secondary={
        <button type="button" className="link-btn" disabled={state.saving} onClick={() => { setTheme(DEFAULT_THEME); setHex(DEFAULT_THEME.accent); void save(null) }}>
          Reset to Calm cyan
        </button>
      }
      action={<button type="button" className="link-btn accent" disabled={state.saving || !readable} onClick={() => void save(theme)}>Save theme →</button>}
    >
      <div className="appearance">
        <div className="form" style={{ gap: 16 }}>
          <div className="field">
            <span className="label" id="vibes">Vibes</span>
            <div className="pills" role="group" aria-labelledby="vibes">
              {VIBES.map((v) => (
                <button key={v.name} type="button" className="pill vibe" aria-pressed={theme.accent === v.accent} onClick={() => setAccent(v.accent)}>
                  <span className="swatch" style={{ background: v.accent }} aria-hidden="true" />{v.name}
                </button>
              ))}
            </div>
          </div>
          <div className="fields">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="hue">Hue <span className="hint">{h}°</span></label>
              <input id="hue" type="range" className="hue-range" min={0} max={359} value={h} onChange={(e) => setHsl(Number(e.target.value), s, l)} />
            </div>
            <div className="field">
              <label htmlFor="vibrancy">Vibrancy <span className="hint">{s}%</span></label>
              <input id="vibrancy" type="range" min={40} max={100} value={Math.max(40, s)} onChange={(e) => setHsl(h, Number(e.target.value), l)} />
            </div>
            <div className="field">
              <label htmlFor="brightness">Brightness <span className="hint">{l}%</span></label>
              <input id="brightness" type="range" min={50} max={75} value={Math.min(75, Math.max(50, l))} onChange={(e) => setHsl(h, s, Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="hex">Hex</label>
              <input id="hex" className="input mono" maxLength={7} value={hex}
                onChange={(e) => { setHex(e.target.value); if (isHex(e.target.value)) setTheme((t) => ({ ...t, accent: e.target.value.toLowerCase() })) }} />
            </div>
            <div className="field">
              <label htmlFor="tint">Surface tint <span className="hint">{Math.round(theme.tint * 100)}%</span></label>
              <input id="tint" type="range" min={0} max={100} value={Math.round(theme.tint * 100)} onChange={(e) => setTheme((t) => ({ ...t, tint: Number(e.target.value) / 100 }))} />
            </div>
          </div>
          <div className="field">
            <span className="label" id="darkness">Darkness</span>
            <div className="pills" role="group" aria-labelledby="darkness">
              {DARKNESS.map((d) => (
                <button key={d.key} type="button" className="pill" aria-pressed={theme.darkness === d.key} onClick={() => setTheme((t) => ({ ...t, darkness: d.key }))}>{d.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="preview" aria-label="Preview">
          <div className="preview-head">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="eyebrow mono">{vibe ? vibe.name : 'Custom'} <span className="faint">//</span> {theme.accent}</span>
          </div>
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
          <button type="button" className="btn btn-primary" tabIndex={-1}>Start check-in</button>
          <ul className="list preview-notes">
            <li><span className="mono">{onAccent.name} on accent · {onAccent.ratio}:1</span><span className={onAccent.passes ? 'delta-up' : 'warn-text'}>{onAccent.passes ? 'AA' : 'Low'}</span></li>
            <li><span className="mono">Accent on cards · {contrast(theme.accent, card).toFixed(1)}:1</span><span className={readable ? 'delta-up' : 'warn-text'}>{readable ? 'AA' : 'Too dark'}</span></li>
            {accentIsGreen(theme.accent) && <li className="faint">Your accent is green, so "on track" switches to blue.</li>}
          </ul>
        </div>
      </div>
      {!readable && <ErrorLine message="This accent is too dark to read on the background. Raise the brightness or pick another colour." />}
      {state.error && <ErrorLine message={state.error} />}
      {state.message && <div className="notice ok" role="status">{state.message}</div>}
    </Card>
  )
}
