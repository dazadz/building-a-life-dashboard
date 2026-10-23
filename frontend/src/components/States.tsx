import type { ReactNode } from 'react'

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  )
}

/** A one-line prompt shown in place of an empty card. */
export function NeedsSetup({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice warn" role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function ServerDown({ onRetry }: { onRetry: () => void }) {
  return (
    <main>
      <div className="page" style={{ maxWidth: 560, paddingTop: '12vh' }}>
        <div className="page-head">
          <div className="eyebrow">Samuel</div>
          <h1>Samuel's server isn't running</h1>
          <p>The app needs the local server to read and save your data. Start it in a terminal, then try again.</p>
        </div>
        <div className="notice"><code>samuel serve</code></div>
        <div><button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button></div>
      </div>
    </main>
  )
}
