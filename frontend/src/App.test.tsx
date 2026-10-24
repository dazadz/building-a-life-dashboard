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

const block = {
  kind: 'focus', goal_id: null, habit_key: null, steps: [], remind_before: true, remind_start: true, day_type_id: null,
  goal_title: null, habit_name: null, day_type: null, status: null, reason: null, tasks: [],
}
const planBody = {
  date: '2026-10-24', has_routine: true, due_today: [{ id: 11, title: '14 km long run', goal_title: 'Half marathon' }],
  day_type: null, day_types: [],
  blocks: [
    { ...block, id: 1, name: 'Morning routine', start: '00:00', end: '00:01', weekdays: [5], note: 'Water, light', status: 'done' },
    { ...block, id: 2, name: 'Wind down', start: '23:58', end: '23:59', weekdays: [5], note: null,
      tasks: [{ id: 9, title: 'Lay out running kit', due_date: '2026-10-23', notes: null, rolled: 1 }] },
  ],
}
const dayTypesBody = [{ id: 1, name: 'Office day', weekdays: [0, 1, 2], position: 1, blocks: 1 }]
const officeBlock = { ...block, id: 3, name: 'Commute', start: '07:45', end: '08:30', weekdays: [0, 1, 2, 3, 4, 5, 6], note: null, kind: 'fixed', day_type_id: 1, day_type: 'Office day' }

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
let blockReminders: unknown[] = []
let planOverride: unknown = null

const healthBody = {
  date: '2026-10-24', days: 30, sleep_target: 7.5,
  recovery: { score: 68, change: -7, sleep_avg: 6.6, rest_days: 1, stress_avg: 6, workouts: 3 },
  burnout: { level: 'moderate', reasons: ['3 short nights in a row', 'Caffeine after 15:00 on 4 days'] },
  series: [{ date: '2026-10-23', sleep: 6.2, energy: 4 }, { date: '2026-10-24', sleep: 7.4, energy: 7 }],
  energy_gap: 1.6,
  inputs: { water_l: 1.6, caffeine_cups: 3, caffeine_latest: '16:10', screens_late: 48, workouts: 3, logged_days: 5 },
  log_today: null,
  week_scores: { lifestyle: 72, lifestyle_change: 5, balance: 64, balance_change: null },
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

const linksBody = {
  days: 90, min_days: 3,
  links: [{ condition: 'sleep_target', condition_label: 'Slept to target', compared_with: 'nights under target', outcome: 'energy',
    outcome_label: 'Energy', unit: '/10', when: 'same day', with_avg: 7.2, without_avg: 5.4, difference: 1.8, with_days: 12, without_days: 9 }],
}

const leaksBody = {
  days: 30, checkins: 20, total_lost: 9.5,
  leaks: [{ name: 'Phone', days: 6, dates: [], deep_work_lost: 5.5, deep_work_avg: 1.6, deep_work_avg_other_days: 2.4, impact: 'high' }],
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

const noSuggestions = { pending: [], counts: { pain: 0, goal: 0, milestone: 0, habit: 0, task: 0, routine: 0 }, total: 0 }
const suggestionsBody = {
  pending: [
    { id: 7, kind: 'routine', title: 'Walk and coffee outside', reason: 'Your energy taps drop after 14:00.', batch: 'plan', status: 'pending', created_at: '',
      payload: { name: 'Walk and coffee outside', start: '15:30', end: '15:45', weekdays: [0, 1, 2], note: null } },
    { id: 8, kind: 'task', title: 'Book a physio check', reason: 'Knee soreness after long runs.', batch: 'plan', status: 'pending', created_at: '',
      payload: { title: 'Book a physio check', due_date: '2026-10-28' } },
  ],
  counts: { pain: 0, goal: 0, milestone: 0, habit: 0, task: 1, routine: 1 },
  total: 2,
}
const aboutBody = {
  notes: 'Office Mon–Wed.', notes_max: 4000, counts: { pain: 1, goal: 1 },
  items: [
    { id: 1, kind: 'pain', text: 'Late to bed on weeknights', area: 'Sleep', evidence: 'Under 6.5 h on 4 of 7 nights', goal_id: null,
      habit_key: 'c_lights', status: 'active', position: 1, goal_title: null, goal_done: null, habit_name: 'Lights out by 23:00' },
    { id: 2, kind: 'goal', text: 'Half marathon in March', area: 'Fitness', evidence: null, goal_id: 1,
      habit_key: null, status: 'active', position: 2, goal_title: 'Half marathon in March', goal_done: null, habit_name: null },
  ],
}

function mockServer(installed: boolean, hasCheckin = true, onboarded = true, suggestions: unknown = noSuggestions) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let body: unknown = []
    if (url === '/api/status') body = { coach: { installed, skills: ['daily-report'], has_recent_checkin: hasCheckin }, today: '2026-10-24', name: onboarded ? 'Jordan' : null, onboarded, suggestions: (suggestions as { total: number }).total }
    else if (url.startsWith('/api/suggestions')) body = url.includes('/accept') || url.includes('/dismiss') ? noSuggestions : suggestions
    else if (url.startsWith('/api/about') || url.startsWith('/api/pains-goals')) body = aboutBody
    else if (url.startsWith('/api/digest')) body = digestBody
    else if (url.startsWith('/api/leaks/')) body = leaksBody
    else if (url.startsWith('/api/links/')) body = linksBody
    else if (url.startsWith('/api/days/')) body = emptyDay(url.slice('/api/days/'.length))
    else if (url.startsWith('/api/settings')) body = settingsBody
    else if (url.startsWith('/api/habit-settings')) body = settingsBody.habits
    else if (url.startsWith('/api/habits?')) body = habitHistory
    else if (url.startsWith('/api/habits/')) body = emptyDay('2026-10-24')
    else if (url.startsWith('/api/profile')) body = profileBody
    else if (url.startsWith('/api/weekly')) body = weeklyBody
    else if (url.startsWith('/api/plan/')) body = planOverride ?? planBody
    else if (url.startsWith('/api/tasks')) body = tasksBody
    else if (url.startsWith('/api/health')) body = healthBody
    else if (url.startsWith('/api/monthly')) body = monthlyBody
    else if (url.startsWith('/api/reminders/due')) body = dueReminders
    else if (url.startsWith('/api/block-reminders/due')) body = blockReminders
    else if (url.startsWith('/api/block-reminders/')) body = { ok: true }
    else if (url.startsWith('/api/day-types')) body = dayTypesBody
    else if (url.startsWith('/api/routines')) body = [...planBody.blocks, officeBlock]
    else if (url.startsWith('/api/goals') || url.startsWith('/api/milestones')) body = goalsBody
    return new Response(JSON.stringify(body), { status: 200 })
  }))
}

describe('App', () => {
  beforeEach(() => { window.location.hash = '' })
  afterEach(() => { vi.unstubAllGlobals(); planOverride = null; blockReminders = [] })

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
    expect(await screen.findByRole('rowheader', { name: 'Phone' })).toBeInTheDocument()
    expect(screen.getByText('5.5 h')).toBeInTheDocument()
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

  it("shows today's plan on Home with done marks and queued tasks", async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByText('Morning routine')).toBeInTheDocument()
    expect(screen.getByText('14 km long run')).toBeInTheDocument()
    expect(screen.getByText('Done', { selector: '.status-done' })).toBeInTheDocument()
    expect(screen.getByText(/Task: Lay out running kit/)).toBeInTheDocument()
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument()
  })

  it('shows the block running now with its task and steps, and marks it done', async () => {
    planOverride = { ...planBody, day_type: { id: 1, name: 'Office day', overridden: false }, day_types: [{ id: 1, name: 'Office day' }, { id: 2, name: 'Home day' }],
      blocks: [{ ...block, id: 5, name: 'Deep work 2', start: '00:00', end: '23:59', weekdays: [0, 1, 2, 3, 4, 5, 6], note: null,
        goal_title: 'Side project', steps: ['Phone in another room'],
        tasks: [{ id: 9, title: 'Write the CSV loader', due_date: '2026-10-23', notes: null, rolled: 1 }] }] }
    mockServer(true)
    render(<App />)
    await screen.findByText('Write the CSV loader')
    const now = screen.getByRole('region', { name: 'Now' })
    expect(now).toHaveTextContent('waited 1 run')
    expect(now).toHaveTextContent('Goal · Side project')
    expect(screen.getByLabelText('Phone in another room')).not.toBeChecked()
    expect(screen.getByText(/Deep work 2 is on/)).toBeInTheDocument()
    fireEvent.click(within(now).getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/plan\/[\d-]+\/blocks\/5$/), expect.objectContaining({
        method: 'PUT', body: '{"status":"done","reason":null}',
      })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Home day' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/day-type$/), expect.objectContaining({ body: '{"day_type_id":2}' })),
    )
    planOverride = null
  })

  it('edits the routine by day type and removes a block', async () => {
    mockServer(true)
    window.location.hash = '#/routine'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Routine' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Office day' }))
    expect(screen.getByText('Commute')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Own days/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Wind down' }))
    fireEvent.change(screen.getByLabelText('New step'), { target: { value: 'Phone on the charger' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save block' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/routines/2', expect.objectContaining({
        method: 'PUT', body: expect.stringContaining('"steps":["Phone on the charger"]'),
      })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Wind down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/routines/2', expect.objectContaining({ method: 'DELETE' })),
    )
  })

  it('reminds when a block starts and asks what got in the way on skip', async () => {
    blockReminders = [{ routine_id: 2, date: '2026-10-24', which: 'start', name: 'Deep work 2', start: '14:00', end: '15:30',
      kind: 'focus', goal_title: 'Side project', steps: ['Phone in another room'], note: null, task: 'Write the CSV loader' }]
    mockServer(true)
    render(<App />)
    const toast = await screen.findByText('Deep work 2 · Side project')
    expect(toast).toBeInTheDocument()
    expect(screen.getByText('Task: Write the CSV loader')).toBeInTheDocument()
    expect(screen.getByText('Phone in another room')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/block-reminders/2/shown?which=start'), expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Skip…' }))
    fireEvent.change(screen.getByLabelText('What got in the way?'), { target: { value: 'Meeting ran over' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/plan/2026-10-24/blocks/2', expect.objectContaining({
        method: 'PUT', body: '{"status":"skipped","reason":"Meeting ran over"}',
      })),
    )
    blockReminders = []
  })

  it('creates a task with a type and goal, edits it, and snoozes from a task', async () => {
    mockServer(true)
    window.location.hash = '#/tasks'
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Add hiring costs' })).toBeInTheDocument()
    expect(screen.queryByText('Send expense report')).not.toBeInTheDocument() // overdue, not today
    expect(screen.queryByRole('textbox', { name: 'Quick add' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Draft the Q4 budget summary' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'work' } })
    fireEvent.change(await screen.findByLabelText('Goal it achieves'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-26' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '21:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\?now=/), expect.objectContaining({ method: 'POST' })),
    )
    const post = vi.mocked(fetch).mock.calls.find(([u, i]) => String(u).startsWith('/api/tasks?') && i?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({
      title: 'Draft the Q4 budget summary', type: 'work', goal_id: 1, due_date: '2026-10-26', due_time: '21:00',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add hiring costs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'focus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\/1\?now=/), expect.objectContaining({
        method: 'PUT', body: expect.stringContaining('"type":"focus"'),
      })),
    )

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
    expect(await screen.findByText('Slept to target')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Lifestyle 72 of 100' })).toBeInTheDocument()
    expect(screen.getByText('+1.8')).toBeInTheDocument()
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
    window.location.hash = '#/settings?tab=appearance'
    render(<App />)
    fireEvent.click(await screen.findByRole('radio', { name: /Energise/ }))
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff9f43')
    fireEvent.click(screen.getByRole('button', { name: 'Save theme →' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings?today='), expect.objectContaining({
        method: 'PUT', body: '{"theme":{"accent":"#ff9f43","darkness":"midnight","tint":0.3}}',
      })),
    )
  })

  it('switches Settings sections from the tabs', async () => {
    mockServer(true)
    window.location.hash = '#/settings'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Profile and targets' })).toBeInTheDocument()
    window.location.hash = '#/settings?tab=data'
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(await screen.findByRole('heading', { name: 'Your data' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Data & privacy' })).toHaveAttribute('aria-current', 'page')
  })

  it('turns the accent with the hue ring from the keyboard', async () => {
    mockServer(true)
    window.location.hash = '#/settings?tab=appearance'
    render(<App />)
    const ring = await screen.findByRole('slider', { name: 'Accent hue' })
    const before = Number(ring.getAttribute('aria-valuenow'))
    fireEvent.keyDown(ring, { key: 'ArrowRight', shiftKey: true })
    expect(Number(ring.getAttribute('aria-valuenow'))).toBe((before + 10) % 360)
    expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('#22e0e6')
  })

  it('shows waiting suggestions on Home and accepts one', async () => {
    mockServer(true, true, true, suggestionsBody)
    render(<App />)
    expect(await screen.findByText('Walk and coffee outside')).toBeInTheDocument()
    expect(screen.getByText('Mon Tue Wed · 15:30–15:45')).toBeInTheDocument()
    expect(screen.getByLabelText('2 suggestions waiting')).toHaveTextContent('2')
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0])
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/suggestions/7/accept?today='), expect.objectContaining({
        method: 'POST', body: '{"payload":null}',
      })),
    )
    expect(await screen.findByText(/See it in Routine/)).toBeInTheDocument()
  })

  it('edits a suggestion before accepting it', async () => {
    mockServer(true, true, true, suggestionsBody)
    window.location.hash = '#/about'
    render(<App />)
    const edit = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(edit.find((b) => b.getAttribute('aria-expanded') === 'false')!)
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '15:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and accept' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/suggestions/7/accept'), expect.objectContaining({
        body: expect.stringContaining('"start":"15:00"'),
      })),
    )
  })

  it('adds a fixed part of the week from About me', async () => {
    mockServer(true)
    window.location.hash = '#/about'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a fixed block' }))
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Office hours' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '08:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add fixed block' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/routines', expect.objectContaining({
        method: 'POST', body: expect.stringContaining('"name":"Office hours","start":"08:30","end":"17:00","weekdays":[0,1,2,3,4]'),
      })),
    )
    const post = vi.mocked(fetch).mock.calls.find(([u, i]) => u === '/api/routines' && i?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ kind: 'fixed', remind_before: false, remind_start: false })
    expect(screen.getByText('Your day types')).toBeInTheDocument()
  })

  it('renames and turns off habits from the Habits page', async () => {
    mockServer(true)
    window.location.hash = '#/habits'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit habits' }))
    const name = await screen.findByLabelText('Reading done name')
    fireEvent.change(name, { target: { value: 'Read 20 pages' } })
    fireEvent.blur(name)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/habit-settings/reading', expect.objectContaining({ method: 'PUT', body: '{"name":"Read 20 pages"}' })),
    )
    fireEvent.change(screen.getByLabelText('New habit'), { target: { value: 'Stretch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add habit' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/habit-settings', expect.objectContaining({ method: 'POST', body: '{"name":"Stretch"}' })),
    )
  })

  it('edits a milestone name and date in place', async () => {
    mockServer(true)
    window.location.hash = '#/goals'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Half marathon in March' }))
    const title = screen.getByLabelText('14 km long run name')
    fireEvent.change(title, { target: { value: '15 km long run' } })
    fireEvent.blur(title)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/milestones\/11\?/), expect.objectContaining({ method: 'PUT', body: '{"title":"15 km long run"}' })),
    )
    fireEvent.change(screen.getByLabelText('14 km long run due date'), { target: { value: '2026-11-01' } })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/milestones\/11\?/), expect.objectContaining({ body: '{"due_date":"2026-11-01"}' })),
    )
  })

  it('shows days left on goals and changes a goal priority', async () => {
    mockServer(true)
    window.location.hash = '#/goals'
    render(<App />)
    expect(await screen.findByText(/days left|days late|Due today/)).toBeInTheDocument()
    expect(screen.getByText(/Sun 14\/03\/2027/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Half marathon in March priority'), { target: { value: '5' } })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/goals\/1\?/), expect.objectContaining({ method: 'PUT', body: '{"impact":5}' })),
    )
  })

  it('adds subtasks when creating a task', async () => {
    mockServer(true)
    window.location.hash = '#/tasks?new=Plan%20the%20trip'
    render(<App />)
    fireEvent.change(await screen.findByLabelText('New subtask'), { target: { value: 'Book flights' } })
    fireEvent.keyDown(screen.getByLabelText('New subtask'), { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('New subtask'), { target: { value: 'Pack' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/tasks\?now=/), expect.objectContaining({ method: 'POST' })),
    )
    const post = vi.mocked(fetch).mock.calls.find(([u, i]) => String(u).startsWith('/api/tasks?') && i?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ title: 'Plan the trip', subtasks: ['Book flights', 'Pack'] })
  })

  it('asks Samuel to break a goal down', async () => {
    mockServer(true)
    window.location.hash = '#/goals'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Half marathon in March' }))
    fireEvent.click(screen.getByRole('button', { name: 'Break this down with Samuel →' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/coach/run', expect.objectContaining({ body: '{"skill":"plan-builder","goal_id":1}' })),
    )
  })

  it('groups suggestions by plan and breakdown and accepts a whole group', async () => {
    const breakdown = { ...suggestionsBody.pending[1], id: 9, title: 'Write the CSV loader', batch: 'breakdown: Side project' }
    mockServer(true, true, true, { ...suggestionsBody, pending: [...suggestionsBody.pending, breakdown], total: 3 })
    window.location.hash = '#/about'
    render(<App />)
    expect(await screen.findByText('Break down · Side project')).toBeInTheDocument()
    expect(screen.getByText('Your plan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accept all 1' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/suggestions/9/accept'), expect.anything()),
    )
  })

  it('shows what Samuel knows on About me and resolves a pain', async () => {
    mockServer(true)
    window.location.hash = '#/about'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'What Samuel knows' })).toBeInTheDocument()
    expect(await screen.findByText('Late to bed on weeknights')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Habit · Lights out by 23:00' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0])
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/pains-goals/1', expect.objectContaining({ method: 'PUT', body: '{"status":"resolved"}' })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask Samuel to build my plan →' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/coach/run', expect.objectContaining({ body: '{"skill":"plan-builder","goal_id":null}' })),
    )
  })

  it('shows the focus and what is due on Home', async () => {
    mockServer(true)
    render(<App />)
    expect(await screen.findByText('Phone out of the bedroom')).toBeInTheDocument()
    expect(screen.getByText('Send invoice')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument()
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
