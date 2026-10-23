// Typed calls to the Samuel backend. In development Vite proxies /api to `samuel serve`.

export type Mood = 'low' | 'flat' | 'okay' | 'good' | 'great'
export type Workout = 'yes' | 'no' | 'rest'
export type HabitStatus = 'done' | 'missed' | 'skipped'

export interface Checkin {
  wake_time: string | null
  sleep_hours: number | null
  mood: Mood | null
  energy: number | null
  main_goal: string | null
  workout: Workout | null
  deep_work_hours: number | null
  productivity: number | null
  distraction: string | null
  wins: string | null
  failures: string | null
  improvement: string | null
}

export type ScoreKey = 'productivity' | 'focus' | 'energy' | 'discipline' | 'balance' | 'day'
export type Scores = Record<ScoreKey, number | null> & { stress: number | null }

export interface Habit {
  key: string
  name: string
  auto: number
  status: HabitStatus | null
  source: 'auto' | 'manual' | null
}

export interface Day {
  date: string
  checkin: Checkin | null
  habits: Habit[]
  summary: {
    scores: Scores
    change: Record<ScoreKey, number | null>
    consistency: number | null
    checkin_streak: number
  }
}

export interface Status {
  coach: { installed: boolean; skills: string[]; has_recent_checkin: boolean }
  today: string
  name: string | null
  onboarded: boolean
}

export interface Settings {
  name: string | null
  onboarded: boolean
  wake_target: string
  sleep_target_hours: number
  deep_work_target_hours: number
  habits: { key: string; name: string; auto: number; active: boolean }[]
}

export type SettingsChange = Partial<Pick<Settings, 'name' | 'onboarded' | 'wake_target' | 'sleep_target_hours' | 'deep_work_target_hours'>>

export interface Report {
  id: number
  kind: 'daily' | 'weekly' | 'monthly' | 'onboarding' | 'ask'
  date: string
  markdown: string
  created_at: string
}

export interface CoachJob {
  id: number
  skill: string
  status: 'running' | 'done' | 'failed'
  error: string | null
  report_id: number | null
  started_at: string
  finished_at: string | null
}

export interface HabitHistory {
  end: string
  dates: string[]
  habits: {
    key: string
    name: string
    auto: number
    days: (HabitStatus | null)[]
    streak: number
    best: number
    rate: number | null
  }[]
  consistency: number | null
  weekly: { week_start: string; consistency: number | null }[]
  patterns: { key: string; name: string; weekday: string; missed: number; of: number }[]
}

export interface DataInfo {
  data_dir: string
  last_backup: { file: string; at: string } | null
  backups: number
  keep_daily: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiError(0, "Can't reach Samuel's server")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  status: () => request<Status>('/api/status'),
  day: (date: string) => request<Day>(`/api/days/${date}`),
  saveCheckin: (date: string, answers: Partial<Checkin>) =>
    request<Day>(`/api/checkins/${date}`, { method: 'PUT', body: JSON.stringify(answers) }),
  logHabit: (date: string, key: string, status: HabitStatus | null) =>
    request<Day>(`/api/habits/${date}/${key}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  habits: (end: string, days: number) => request<HabitHistory>(`/api/habits?end=${end}&days=${days}`),
  settings: (today: string) => request<Settings>(`/api/settings?today=${today}`),
  saveSettings: (today: string, changes: SettingsChange) =>
    request<Settings>(`/api/settings?today=${today}`, { method: 'PUT', body: JSON.stringify(changes) }),
  setHabitActive: (key: string, active: boolean) =>
    request<Settings['habits']>(`/api/habit-settings/${key}`, { method: 'PUT', body: JSON.stringify({ active }) }),
  data: () => request<DataInfo>('/api/data'),
  backupNow: () => request<DataInfo>('/api/backup', { method: 'POST', body: '{}' }),
  reports: (kind?: string) => request<Report[]>(`/api/reports${kind ? `?kind=${kind}` : ''}`),
  runCoach: (skill = 'daily-report') =>
    request<{ job_id: number }>('/api/coach/run', { method: 'POST', body: JSON.stringify({ skill }) }),
  job: (id: number) => request<CoachJob>(`/api/coach/jobs/${id}`),
}
