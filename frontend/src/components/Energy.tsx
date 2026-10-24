import { useState } from 'react'
import { api, ApiError, type EnergyCurve, type EnergySlot } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { useLoad } from '../hooks'

const SLOTS: { key: EnergySlot; label: string; from: string }[] = [
  { key: 'morning', label: 'Morning', from: '00:00' },
  { key: 'midday', label: 'Midday', from: '11:00' },
  { key: 'afternoon', label: 'Afternoon', from: '14:00' },
  { key: 'evening', label: 'Evening', from: '18:00' },
]
const SCALE = Array.from({ length: 10 }, (_, i) => i + 1)

/** The slot a local HH:MM falls in (the same rule as backend/samuel/energy.py). */
function slotAt(hhmm: string): EnergySlot {
  return SLOTS.filter((s) => hhmm >= s.from).at(-1)!.key
}

/** Quick energy taps on Home: one 1–10 rating per part of the day, about two seconds each. */
export function EnergyTapCard({ today, hhmm }: { today: string; hhmm: string }) {
  const taps = useLoad(() => api.energy(today), [today])
  const now = slotAt(hhmm)
  const [picked, setPicked] = useState<EnergySlot | null>(null)
  const slot = picked ?? now
  const [error, setError] = useState<string | null>(null)
  const nowIndex = SLOTS.findIndex((s) => s.key === now)

  const tap = async (value: number | null) => {
    setError(null)
    try {
      taps.setData(await api.tapEnergy(today, slot, value, hhmm))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }
  const current = taps.data?.[slot] ?? null

  return (
    <Card
      title="Energy now"
      meta={taps.data ? `${SLOTS.filter((s) => taps.data![s.key] != null).length} of 4 today` : undefined}
      action={<a href="#/health">Energy curve →</a>}
    >
      {taps.error ? <ErrorLine message={taps.error} onRetry={taps.reload} /> : !taps.data ? <Loading lines={2} /> : (
        <>
          <div className="pills" role="group" aria-label="Part of the day">
            {SLOTS.map((s, i) => (
              <button key={s.key} type="button" className="pill" aria-pressed={s.key === slot}
                disabled={i > nowIndex} onClick={() => setPicked(s.key)}>
                {s.label} <span className="mono">{taps.data![s.key] ?? '—'}</span>
              </button>
            ))}
          </div>
          <div className="scale" role="group" aria-label={`${SLOTS.find((s) => s.key === slot)!.label} energy (1–10)`}>
            {SCALE.map((n) => (
              <button key={n} type="button" className="pill" aria-pressed={current === n}
                onClick={() => void tap(current === n ? null : n)}>{n}</button>
            ))}
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Optional. A tap now and then draws your energy curve; it never changes your check-in or scores.
          </p>
          {error && <ErrorLine message={error} />}
        </>
      )}
    </Card>
  )
}

/** The average tap per part of the day, with the peak and dip. */
export function EnergyCurveCard({ curve, days }: { curve: EnergyCurve | null; days: number }) {
  const shown = curve?.points.filter((p) => p.average != null) ?? []
  const label = (key: EnergySlot | null) => SLOTS.find((s) => s.key === key)?.label.toLowerCase()
  return (
    <Card
      title="Energy curve"
      meta={`Average tap · ${days} days`}
      action={<a href="#/">Tap your energy →</a>}
    >
      {!curve ? <Loading lines={4} /> : shown.length === 0 ? (
        <NeedsSetup>
          Tap your energy on Today a few times a day. Each part of the day shows once it has taps on {curve.min_days} days.
        </NeedsSetup>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {curve.peak && curve.dip
              ? `You peak in the ${label(curve.peak)} and dip in the ${label(curve.dip)}. Put deep work at the peak and easy tasks in the dip.`
              : 'Keep tapping: the peak and dip show once two parts of the day have enough taps.'}
          </p>
          <div className="bars" role="img"
            aria-label={`Energy curve: ${curve.points.map((p) => `${label(p.slot)} ${p.average ?? 'not enough taps'}`).join(', ')}`}>
            {curve.points.map((p) => (
              <div className="bar-col" key={p.slot}>
                <span className="bar-value mono">{p.average ?? '—'}</span>
                <div className="bar" data-current={p.slot === curve.peak}
                  style={{ height: p.average != null ? `${(p.average / 10) * 100}%` : 0 }} />
                <span className="bar-label">{SLOTS.find((s) => s.key === p.slot)!.label}</span>
                <span className="faint mono">{p.days} d</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
