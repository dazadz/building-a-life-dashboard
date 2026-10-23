import { useState } from 'react'
import { shortDate } from '../format'

/** A small single-series bar chart over dates, with a hover readout and an optional dashed target line. */
export function MiniBars({ label, series, max, target, unit }: {
  label: string; series: { date: string; value: number | null }[]; max: number; target?: number; unit: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 100 / series.length
  const shown = hover != null ? series[hover] : null
  return (
    <figure className="mini-chart">
      <figcaption>
        <span className="meter-label">{label}</span>
        <span className="mono faint">{shown ? `${shortDate(shown.date)} · ${shown.value ?? 'no answer'}${shown.value != null ? ` ${unit}` : ''}` : target ? `Target ${target} h` : ''}</span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img"
        aria-label={`${label}: ${series.filter((d) => d.value != null).length} days with answers`}
        onMouseLeave={() => setHover(null)}>
        {series.map((d, i) => (
          <g key={d.date} onMouseEnter={() => setHover(i)}>
            <rect x={i * w} y={0} width={w} height={40} fill="transparent" />
            {d.value != null && (
              <rect className="mini-bar" data-hover={hover === i} x={i * w + w * 0.15} width={w * 0.7}
                y={40 - (d.value / max) * 40} height={Math.max((d.value / max) * 40, 0.5)} />
            )}
          </g>
        ))}
        {target != null && <line className="mini-target" x1={0} x2={100} y1={40 - (target / max) * 40} y2={40 - (target / max) * 40} />}
      </svg>
      <div className="mini-axis faint mono">
        <span>{shortDate(series[0].date)}</span>
        <span>{shortDate(series[series.length - 1].date)}</span>
      </div>
    </figure>
  )
}
