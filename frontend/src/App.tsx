import { useEffect } from 'react'
import { api, type TextSize } from './api'
import { ServerDown } from './components/States'
import { useCoachJob, useLoad, useRoute } from './hooks'
import { CheckinPage } from './pages/Checkin'
import { CoachPage } from './pages/Coach'
import { GoalsPage } from './pages/Goals'
import { HabitsPage } from './pages/Habits'
import { ProfilePage } from './pages/Profile'
import { ReviewPage } from './pages/Review'
import { HomePage } from './pages/Home'
import { OnboardingPage } from './pages/Onboarding'
import { SettingsPage } from './pages/Settings'

const NAV = [
  { href: '#/', route: '/', label: 'Today' },
  { href: '#/checkin', route: '/checkin', label: 'Check-in' },
  { href: '#/habits', route: '/habits', label: 'Habits' },
  { href: '#/goals', route: '/goals', label: 'Goals' },
  { href: '#/review', route: '/review', label: 'Review' },
  { href: '#/coach', route: '/coach', label: 'Coach' },
]
const SETTINGS = { href: '#/settings', route: '/settings', label: 'Settings' }
const TEXT_SCALE: Record<TextSize, number> = { small: 1, medium: 1.1, large: 1.25, xlarge: 1.4 }

export default function App() {
  const route = useRoute()
  // Reload on each screen change, so the Coach page knows about a check-in saved a moment ago.
  const status = useLoad(() => api.status(), [route])
  const coach = useCoachJob()
  // The text size setting scales the whole interface (see --ui-scale in index.css).
  const textSize = status.data?.text_size
  useEffect(() => {
    if (textSize) document.documentElement.style.setProperty('--ui-scale', String(TEXT_SCALE[textSize]))
  }, [textSize])
  // Check in every 30 seconds: a server started by `samuel app` stops once no window checks in.
  useEffect(() => {
    const id = window.setInterval(() => void api.status().catch(() => {}), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (status.error) return <ServerDown onRetry={status.reload} />
  if (status.data && !status.data.onboarded) {
    return <OnboardingPage onDone={() => { window.location.hash = '#/'; status.reload() }} />
  }

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
        <div className="sidebar-bottom">
          <div className="sidebar-foot">Local · private</div>
          <a href={SETTINGS.href} className="nav-link" aria-current={route === SETTINGS.route ? 'page' : undefined}>
            {SETTINGS.label}
          </a>
        </div>
      </nav>
      <main>
        {route === '/checkin' ? (
          <CheckinPage coach={coach} coachInstalled={status.data?.coach.installed ?? false} />
        ) : route === '/habits' ? (
          <HabitsPage />
        ) : route === '/goals' ? (
          <GoalsPage />
        ) : route === '/review' ? (
          <ReviewPage coach={coach} status={status.data} />
        ) : route === '/profile' ? (
          <ProfilePage coach={coach} status={status.data} />
        ) : route === '/settings' ? (
          <SettingsPage onSaved={status.reload} />
        ) : route === '/coach' ? (
          <CoachPage coach={coach} status={status.data} />
        ) : (
          <HomePage status={status.data} />
        )}
      </main>
    </div>
  )
}
