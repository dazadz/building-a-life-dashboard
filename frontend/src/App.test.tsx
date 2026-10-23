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

const settingsBody = {
  name: null, onboarded: false, wake_target: '07:00', sleep_target_hours: 7.5, deep_work_target_hours: 3,
  habits: [{ key: 'reading', name: 'Reading done', auto: 0, active: true }],
}

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

const goalsBody = {
  goals: [
    {
      id: 1, title: 'Half marathon in March', area: 'fitness', impact: 4, effort: 4, target_date: '2027-03-14',
      done_date: null, created_at: '2026-09-01', progress: 40,
      milestones: [{ id: 11, goal_id: 1, title: '14 km long run', due_date: '2026-10-25', done_date: null }],
      next_milestone: { id: 11, goal_id: 1, title: '14 km long run', due_date: '2026-10-25', done_date: null },
    },
    {
      id: 2, title: 'Dinner with friends weekly', area: 'social', impact: 2, effort: 1, target_date: null,
      done_date: null, created_at: '2026-09-01', progress: null, milestones: [], next_milestone: null,
    },
  ],
  week: [{ id: 11, goal_id: 1, title: '14 km long run', due_date: '2026-10-25', done_date: null, goal_title: 'Half marathon in March', overdue: false }],
  vision: 'By 2030: fit and free.',
  completed_this_year: 1,
}

const profileBody = {
  answered: 1, total: 45,
  sections: [
    {
      key: 'life', title: 'Life structure', intro: 'Where your life stands today.', minutes: 3, answered: 1, total: 2, done: false,
      snapshot: [{ label: 'Stress', value: '7 / 10', note: null }],
      questions: [
        { key: 'age', group: 'About you', label: 'Age', type: 'number', min: 14, max: 100, answer: 29 },
        { key: 'stress', group: 'How it feels', label: 'Stress lately', type: 'scale', answer: null },
      ],
    },
    {
      key: 'routine', title: 'Daily routine', intro: 'A normal weekday.', minutes: 4, answered: 0, total: 1, done: false, snapshot: [],
      questions: [{ key: 'wake_time', group: 'Your day', label: 'Wake-up time', type: 'time', answer: null }],
    },
  ],
}

function mockServer(installed: boolean, hasCheckin = true, onboarded = true) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let body: unknown = []
    if (url === '/api/status') body = { coach: { installed, skills: ['daily-report'], has_recent_checkin: hasCheckin }, today: '2026-10-24', name: onboarded ? 'Jordan' : null, onboarded }
    else if (url.startsWith('/api/days/')) body = emptyDay(url.slice('/api/days/'.length))
    else if (url.startsWith('/api/settings')) body = settingsBody
    else if (url.startsWith('/api/habit-settings/')) body = settingsBody.habits
    else if (url.startsWith('/api/habits?')) body = habitHistory
    else if (url.startsWith('/api/habits/')) body = emptyDay('2026-10-24')
    else if (url.startsWith('/api/profile')) body = profileBody
    else if (url.startsWith('/api/goals') || url.startsWith('/api/milestones')) body = goalsBody
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

  it('lists goals, shows a dash for no progress, and ticks a milestone', async () => {
    mockServer(true)
    window.location.hash = '#/goals'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Half marathon in March' })).toBeInTheDocument()
    expect(screen.getByText('2 active goals across 2 areas. 1 milestone due this week.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No milestones yet' })).toBeInTheDocument()
    expect(screen.getByText(/By 2030: fit and free/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark 14 km long run done' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/milestones\/11\?today=/),
        expect.objectContaining({ method: 'PUT', body: '{"done":true}' })),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Half marathon in March' }))
    expect(await screen.findByRole('heading', { name: 'Edit goal' })).toBeInTheDocument()
    expect(screen.getByLabelText('Goal')).toHaveValue('Half marathon in March')
  })

  it('walks through a profile section and saves only what changed', async () => {
    mockServer(true)
    window.location.hash = '#/profile'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Life structure' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Age/)).toHaveValue(29)
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and finish later' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/profile/life', expect.objectContaining({ method: 'PUT', body: '{"answers":{"stress":7}}' })),
    )
  })

  it('reminds the user to finish the profile on Home', async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByText('Samuel knows 1 of 45 things about you.')).toBeInTheDocument()
  })

  it('asks for a check-in before offering a report', async () => {
    mockServer(true, false)
    window.location.hash = '#/coach'
    render(<App />)
    expect(await screen.findByText('Save a check-in first.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate daily report' })).not.toBeInTheDocument()
  })

  it('walks a new user through setup', async () => {
    mockServer(true, true, false)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Enter a first name to continue.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Jordan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Your day' })).toBeInTheDocument()
    expect(screen.getByText(/Nice to meet you, Jordan\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Sleep target (hours)')).toHaveValue(7.5)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Your habits' })).toBeInTheDocument()
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings?today='),
      expect.objectContaining({ method: 'PUT', body: '{"name":"Jordan"}' }))
  })
})
