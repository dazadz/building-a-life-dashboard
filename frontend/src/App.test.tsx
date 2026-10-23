import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const habitHistory = {
  end: '2026-10-24',
  dates: ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'],
  habits: [
    { key: 'reading', name: 'Reading done', auto: 0, days: ['done', 'done', 'missed', 'done', 'done', 'done', null], streak: 3, best: 3, rate: 83 },
    { key: 'water', name: 'Water target', auto: 0, days: [null, null, null, null, null, null, null], streak: 0, best: 0, rate: null },
  ],
  consistency: 83,
  weekly: [{ week_start: '2026-10-19', consistency: 80 }],
  patterns: [{ key: 'reading', name: 'Reading done', weekday: 'Wednesday', missed: 3, of: 4 }],
}

function mockServer(installed: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let body: unknown = []
    if (url === '/api/status') body = { coach: { installed, skills: ['daily-report'] }, today: '2026-10-24', name: 'Jordan' }
    else if (url.startsWith('/api/days/')) body = emptyDay(url.slice('/api/days/'.length))
    else if (url.startsWith('/api/habits?')) body = habitHistory
    else if (url.startsWith('/api/habits/')) body = emptyDay('2026-10-24')
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

  it('shows habit streaks and logs a square when clicked', async () => {
    mockServer(true)
    window.location.hash = '#/habits'
    render(<App />)
    expect(await screen.findAllByText('3 d')).toHaveLength(2) // streak and best
    expect(screen.getByText(/missed 3 of the last 4 Wednesdays/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Water target, 24 Oct: Not logged/ }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/habits/2026-10-24/water', expect.objectContaining({ method: 'PUT', body: '{"status":"done"}' })),
    )
  })
})
