import type { ReactNode } from 'react'

/** A colour per kind of card, the same on every page, so cards are easy to tell apart at a glance. */
export type CardTone = 'accent' | 'green' | 'amber' | 'violet' | 'blue' | 'pink' | 'orange' | 'rose'

// Cards say what they are in their title, so the tone follows from it unless a card sets its own.
const TONES: [RegExp, CardTone][] = [
  [/suggest|own words/i, 'pink'],
  [/pain|focus area|leak|risk|burnout|slipped|patterns/i, 'amber'],
  [/goal|milestone|roadmap|vision|priority/i, 'green'],
  [/habit|consistency|tracker/i, 'violet'],
  [/task|due|reminder/i, 'orange'],
  [/health|energy|sleep|recovery|mood|input|lifestyle|balance/i, 'rose'],
  [/check-in|\breports?\b|\breview\b|coach|\bchat|profile|claude|numbers|\bmonth|wins/i, 'blue'],
]

function toneFor(title: string): CardTone {
  return TONES.find(([pattern]) => pattern.test(title))?.[1] ?? 'accent'
}

interface CardProps {
  title: string
  meta?: ReactNode
  /** Every card ends with an action. */
  action: ReactNode
  secondary?: ReactNode
  className?: string
  /** Overrides the colour that follows from the title. */
  tone?: CardTone
  children: ReactNode
}

export function Card({ title, meta, action, secondary, className, tone, children }: CardProps) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={id} data-tone={tone ?? toneFor(title)}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        {meta && <span className="card-meta">{meta}</span>}
      </div>
      {children}
      <div className="card-foot">
        <span>{secondary}</span>
        {action}
      </div>
    </section>
  )
}
