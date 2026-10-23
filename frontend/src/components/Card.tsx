import type { ReactNode } from 'react'

interface CardProps {
  title: string
  meta?: ReactNode
  /** Every card ends with an action. */
  action: ReactNode
  secondary?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, meta, action, secondary, className, children }: CardProps) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={id}>
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
