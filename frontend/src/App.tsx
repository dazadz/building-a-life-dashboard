import { api } from './api'
import { ServerDown } from './components/States'
import { useCoachJob, useLoad, useRoute } from './hooks'
import { CheckinPage } from './pages/Checkin'
import { CoachPage } from './pages/Coach'
import { HabitsPage } from './pages/Habits'
import { HomePage } from './pages/Home'

const NAV = [
  { href: '#/', route: '/', label: 'Today' },
  { href: '#/checkin', route: '/checkin', label: 'Check-in' },
  { href: '#/habits', route: '/habits', label: 'Habits' },
  { href: '#/coach', route: '/coach', label: 'Coach' },
]

export default function App() {
  const route = useRoute()
  // Reload on each screen change, so the Coach page knows about a check-in saved a moment ago.
  const status = useLoad(() => api.status(), [route])
  const coach = useCoachJob()

  if (status.error) return <ServerDown onRetry={status.reload} />

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">S</div>
          <span className="brand-name">Samuel</span>
        </div>
        {NAV.map((item) => (
          <a
            key={item.route}
            href={item.href}
            className="nav-link"
            aria-current={route === item.route ? 'page' : undefined}
          >
            {item.label}
            {item.route === '/coach' && coach.running && <span className="badge faint">Writing…</span>}
          </a>
        ))}
        <div className="sidebar-foot">Local · private</div>
      </nav>
      <main>
        {route === '/checkin' ? (
          <CheckinPage coach={coach} coachInstalled={status.data?.coach.installed ?? false} />
        ) : route === '/habits' ? (
          <HabitsPage />
        ) : route === '/coach' ? (
          <CoachPage coach={coach} status={status.data} />
        ) : (
          <HomePage status={status.data} />
        )}
      </main>
    </div>
  )
}
