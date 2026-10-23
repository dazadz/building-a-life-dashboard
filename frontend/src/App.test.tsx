import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const emptyDay = (date: string) => ({
  date,
  checkin: null,
  habits: [{ key: 'reading', name: 'Reading done', auto: 0, status: null, source: null }],
  summary: {
    scores: { productivity: null, focus: null, energy: null, discipline: null, balance: null, day: null, stress: null },
    change: { productivity: null, focus: null, energy: null, discipline: null, balance: null, day: null },
    consistency: null,
    checkin_streak: 0,
  },
})

function mockServer(installed: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let body: unknown = []
    if (url === '/api/status') body = { coach: { installed, skills: ['daily-report'] }, today: '2026-10-24', name: 'Jordan' }
    else if (url.startsWith('/api/days/')) body = emptyDay(url.slice('/api/days/'.length))
    return new Response(JSON.stringify(body), { status: 200 })
  }))
}

describe('App', () => {
  beforeEach(() => { window.location.hash = '' })
  afterEach(() => vi.unstubAllGlobals())

  it('greets the user and shows dashes before any scores', async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /Jordan/ })).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  it('shows the needs-setup line when Claude Code is missing', async () => {
    mockServer(false)
    window.location.hash = '#/coach'
    render(<App />)
    expect(await screen.findByText(/Claude Code isn't installed/)).toBeInTheDocument()
  })

  it('shows all 12 check-in questions', async () => {
    mockServer(true)
    window.location.hash = '#/checkin'
    render(<App />)
    await screen.findByLabelText('What time did you wake up?')
    for (const label of ['Hours of sleep', 'Main goal today', 'Deep work (hours)', 'Wins today', 'Failures today', 'One improvement for tomorrow']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    for (const group of ['Mood', 'Energy level (1–10)', 'Workout completed?', 'Productivity rating (1–10)', 'Biggest distraction today']) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    }
  })

  it('explains how to start the server when it is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<App />)
    expect(await screen.findByText(/server isn't running/)).toBeInTheDocument()
  })
})
