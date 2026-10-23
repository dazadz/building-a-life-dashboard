import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  name: null, onboarded: false, text_size: 'medium', theme: null, wake_target: '07:00', sleep_target_hours: 7.5, deep_work_target_hours: 3,
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

const weeklyBody = {
  week_start: '2026-10-19', week_end: '2026-10-25', week_number: 43, is_current: true,
  numbers: { day_score: 61, day_score_change: 4, checkins: 5, sleep_avg: 6.8, deep_work_total: 12.5, habit_rate: 64, workouts: 3 },
  wins: [{ date: '2026-10-20', text: 'Sent the brief' }],
  slipped: [{ date: '2026-10-22', text: 'Review the doc (Onboarding doc) is still open' }],
  questions: [
    { key: 'best_day', question: 'Wednesday was your best focus day (4.2 h). What made it work?', answer: null },
    { key: 'slipped', question: 'Review the doc slipped. Keep it, move it, or drop it?', answer: null },
    { key: 'differently', question: "What's one thing you'd do differently next week?", answer: null },
  ],
  priorities: ['', '', ''],
  carry_over: [{ id: 5, title: 'Review the doc', goal_title: 'Onboarding doc', due_date: '2026-10-22', carry: false }],
  coming_up: [],
  status: null, updated_at: null,
}

const planBody = {
  date: '2026-10-24', has_routine: true, due_today: [{ id: 11, title: '14 km long run', goal_title: 'Half marathon' }],
  blocks: [
    { id: 1, name: 'Morning routine', start: '00:00', end: '00:01', weekdays: [5], note: 'Water, light' },
    { id: 2, name: 'Wind down', start: '23:58', end: '23:59', weekdays: [5], note: null },
  ],
}

const tasksBody = {
  counts: { today: 1, upcoming: 0, overdue: 1, all: 2, done: 0 }, this_week: 0, lists: ['Personal', 'Work'],
  reminders: [{ id: 1, title: 'Add hiring costs', remind_at: '2026-10-24T13:45' }],
  tasks: [
    { id: 1, title: 'Add hiring costs', notes: null, list: 'Work', priority: 'high', due_date: '2026-10-24', due_time: '14:00',
      remind_at: '2026-10-24T13:45', goal_id: null, goal_title: null, done_at: null, view: 'today',
      subtasks: [{ id: 9, title: 'Export hiring plan', done: false }] },
    { id: 2, title: 'Send expense report', notes: null, list: 'Work', priority: 'normal', due_date: '2026-10-23', due_time: null,
      remind_at: null, goal_id: null, goal_title: null, done_at: null, view: 'overdue', subtasks: [] },
  ],
}

let dueReminders: unknown[] = []

const healthBody = {
  date: '2026-10-24', days: 30, sleep_target: 7.5,
  recovery: { score: 68, change: -7, sleep_avg: 6.6, rest_days: 1, stress_avg: 6, workouts: 3 },
  burnout: { level: 'moderate', reasons: ['3 short nights in a row', 'Caffeine after 15:00 on 4 days'] },
  series: [{ date: '2026-10-23', sleep: 6.2, energy: 4 }, { date: '2026-10-24', sleep: 7.4, energy: 7 }],
  energy_gap: 1.6,
  inputs: { water_l: 1.6, caffeine_cups: 3, caffeine_latest: '16:10', screens_late: 48, workouts: 3, logged_days: 5 },
  log_today: null,
}

const monthlyBody = {
  month: '2026-10', previous: '2026-09', is_current: true,
  numbers: { days_in_month: 31, days_so_far: 24, days_logged: 20, discipline: 71, productivity: 68, energy: 62, consistency: 66, sleep: 6.6, milestones_done: 5, milestones_due: 8, goal_completion: 63 },
  previous_numbers: { days_in_month: 30, days_so_far: 30, days_logged: 25, discipline: 65, productivity: 64, energy: 65, consistency: 57, sleep: 6.9, milestones_done: 2, milestones_due: 4, goal_completion: 50 },
  changes: { discipline: 6, productivity: 4, energy: -3, consistency: 9, sleep: -0.3, goal_completion: 13 },
  habits: [
    { key: 'reading', name: 'Reading done', now: 41, then: 70, change: -29 },
    { key: 'wake_on_time', name: 'Wake up on time', now: 86, then: 71, change: 15 },
  ],
  trend: [{ date: '2026-10-01', discipline: 70, average: 70 }, { date: '2026-10-02', discipline: 80, average: 75 }],
}

const digestBody = {
  now: '2026-10-24T10:37',
  focus: { text: 'Phone out of the bedroom', source: "Your improvement from last night's check-in" },
  due: { overdue: 1, today: 1, items: [
    { kind: 'task', id: 4, title: 'Send invoice', time: null, overdue: true, high: false },
    { kind: 'task', id: 5, title: 'Call the bank', time: '16:00', overdue: false, high: false },
  ] },
  next: { name: 'Deep work', start: '11:00', end: '13:00', state: 'next' },
  yesterday: { date: '2026-10-23', score: 65, change: 4 },
}

function mockServer(installed: boolean, hasCheckin = true, onboarded = true) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let body: unknown = []
    if (url === '/api/status') body = { coach: { installed, skills: ['daily-report'], has_recent_checkin: hasCheckin }, today: '2026-10-24', name: onboarded ? 'Jordan' : null, onboarded }
    else if (url.startsWith('/api/digest')) body = digestBody
    else if (url.startsWith('/api/days/')) body = emptyDay(url.slice('/api/days/'.length))
    else if (url.startsWith('/api/settings')) body = settingsBody
    else if (url.startsWith('/api/habit-settings/')) body = settingsBody.habits
    else if (url.startsWith('/api/habits?')) body = habitHistory
    else if (url.startsWith('/api/habits/')) body = emptyDay('2026-10-24')
    else if (url.startsWith('/api/profile')) body = profileBody
    else if (url.startsWith('/api/weekly')) body = weeklyBody
    else if (url.startsWith('/api/plan/')) body = planBody
    else if (url.startsWith('/api/tasks')) body = tasksBody
    else if (url.startsWith('/api/health')) body = healthBody
    else if (url.startsWith('/api/monthly')) body = monthlyBody
    else if (url.startsWith('/api/reminders/due')) body = dueReminders
    else if (url.startsWith('/api/routines')) body = planBody.blocks
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

  it('runs a weekly review and saves answers, priorities and carry-over', async () => {
    mockServer(false)
    window.location.hash = '#/review'
    render(<App />)
    expect(await screen.findByText('Sent the brief')).toBeInTheDocument()
    expect(screen.getByText('+4 vs last week')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/best focus day/), { target: { value: 'No meetings before 13:00' } })
    fireEvent.change(screen.getByLabelText('Priority 1'), { target: { value: 'Ship the budget' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Review the doc/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/weekly\/2026-10-19\?today=/), expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          answers: { best_day: 'No meetings before 13:00', slipped: '', differently: '' },
          priorities: ['Ship the budget', '', ''], carry: [5], status: 'done',
        }),
      })),
    )
  })

  it("shows today's plan on Home and edits the routine in Settings", async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByText('Morning routine')).toBeInTheDocument()
    expect(screen.getByText('14 km long run')).toBeInTheDocument()

    window.location.hash = '#/settings'
    fireEvent(window, new HashChangeEvent('hashchange'))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Wind down' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/routines/2', expect.objectContaining({ method: 'DELETE' })),
    )
  })

  it('lists tasks, adds one with quick add, and snoozes from a task', async () => {
    mockServer(true)
    window.location.hash = '#/tasks'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Add hiring costs' })).toBeInTheDocument()
    expect(screen.queryByText('Send expense report')).not.toBeInTheDocument() // overdue, not today

    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add' }), { target: { value: 'Buy gels fri #personal' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Quick add' }), { key: 'Enter' })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\?now=/), expect.objectContaining({ method: 'POST' })),
    )
    const post = vi.mocked(fetch).mock.calls.find(([u, i]) => String(u).startsWith('/api/tasks?') && i?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ title: 'Buy gels', list: 'Personal' })

    fireEvent.click(screen.getByRole('button', { name: 'Add hiring costs' }))
    fireEvent.click(await screen.findByRole('button', { name: '+1 hour' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\/1\/snooze/), expect.objectContaining({ body: '{"how":"hour"}' })),
    )
  })

  it('shows a due reminder with Done, +1 hour and Tomorrow', async () => {
    dueReminders = [{ id: 1, title: 'Add hiring costs', list: 'Work', remind_at: '2026-10-24T13:45' }]
    mockServer(true)
    render(<App />)
    const region = await screen.findByRole('region', { name: 'Reminders' })
    expect(region).toHaveTextContent('Add hiring costs')
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\/1\/notified/), expect.objectContaining({ method: 'POST' }))
    dueReminders = []
  })

  it('shows recovery, burnout reasons and the sleep-energy link, and logs today', async () => {
    mockServer(true)
    window.location.hash = '#/health'
    render(<App />)
    expect(await screen.findByText('Caffeine after 15:00 on 4 days')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Burnout risk: moderate' })).toBeInTheDocument()
    expect(screen.getByText('Energy is 1.6 points lower on days with less than 6.5 h of sleep.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(screen.getByRole('columnheader', { name: 'Sleep (h)' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Water (litres)'), { target: { value: '1.75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save log →' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/health-log\/\d{4}-\d{2}-\d{2}$/), expect.objectContaining({
        method: 'PUT', body: '{"water_l":1.75,"caffeine_cups":null,"caffeine_last":null,"screens_late":null}',
      })),
    )
  })

  it('compares the month with the last one, habits sorted by change', async () => {
    mockServer(true)
    window.location.hash = '#/monthly'
    render(<App />)
    expect(await screen.findByText('20 of 24 days logged so far. Compared with September 2026.')).toBeInTheDocument()
    expect(screen.getByText('5 / 8')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').map((r) => r.textContent)
    expect(rows[1]).toContain('Wake up on time') // biggest gain first
    expect(screen.getByRole('link', { name: 'Weekly' })).toHaveAttribute('href', '#/review')
  })

  it('previews a vibe live and saves the theme', async () => {
    mockServer(true)
    window.location.hash = '#/settings'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Energise' }))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff9f43')
    fireEvent.click(screen.getByRole('button', { name: 'Save theme →' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings?today='), expect.objectContaining({
        method: 'PUT', body: '{"theme":{"accent":"#ff9f43","darkness":"midnight","tint":0.3}}',
      })),
    )
  })

  it('shows today at a glance on Home', async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByText('Phone out of the bedroom')).toBeInTheDocument()
    expect(screen.getByText('Send invoice')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument()
    expect(screen.getByText('Deep work')).toBeInTheDocument()
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

  it('chats with Samuel, starting from a suggested question', async () => {
    mockServer(true)
    const base = fetch as (url: string, init?: RequestInit) => Promise<Response>
    const chat = {
      id: 3, title: 'What should I focus on tomorrow?', report_id: null, created_at: '2026-10-24T09:00:00Z',
      messages: [{ id: 1, role: 'user', text: 'What should I focus on tomorrow?', created_at: '2026-10-24T09:00:00Z' }],
      pending: false, error: null, awaiting_reply: false,
    }
    const replied = { ...chat, messages: [...chat.messages, { id: 2, role: 'samuel', text: 'The **budget draft**: due Monday.', created_at: '2026-10-24T09:01:00Z' }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/chats' && init?.method === 'POST') return new Response(JSON.stringify({ ...chat, pending: true }), { status: 201 })
      if (url === '/api/chats/3') return new Response(JSON.stringify(replied), { status: 200 })
      return base(url, init)
    }))
    window.location.hash = '#/coach'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'What should I focus on tomorrow?' }))
    expect(await screen.findByText('budget draft')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/chats', expect.objectContaining({
      method: 'POST', body: '{"text":"What should I focus on tomorrow?","report_id":null}',
    }))
    expect(screen.getByLabelText('Ask a follow-up')).toBeInTheDocument()
  })

  it('opens the Ctrl+K palette, searches and jumps to a result', async () => {
    mockServer(true)
    const base = fetch as (url: string, init?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/search')) {
        return new Response(JSON.stringify({ query: 'budget', groups: [{ name: 'Reports', items: [
          { kind: 'report', id: 12, title: 'Daily report · Thursday 22 October', meta: 'The budget meeting cost you 2 h.', href: '#/coach?report=12' },
        ] }] }), { status: 200 })
      }
      return base(url, init)
    }))
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /Jordan/ })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const box = await screen.findByRole('combobox', { name: 'Search or run a command' })
    fireEvent.change(box, { target: { value: 'budget' } })
    expect(await screen.findByText('Daily report · Thursday 22 October')).toBeInTheDocument()
    expect(screen.getByText('Create task “budget”')).toBeInTheDocument()
    expect(screen.getByText('Ask Samuel: “budget”')).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(window.location.hash).toBe('#/coach?report=12'))
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('taps energy on Home for the current part of the day', async () => {
    mockServer(true)
    render(<App />)
    const scale = await screen.findByRole('group', { name: /energy \(1–10\)/ })
    fireEvent.click(within(scale).getByRole('button', { name: '7' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/energy\/\d{4}-\d{2}-\d{2}\/(morning|midday|afternoon|evening)$/),
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"value":7') }),
    ))
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
