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
  text_size: TextSize
}

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

export interface Settings {
  name: string | null
  onboarded: boolean
  text_size: TextSize
  wake_target: string
  sleep_target_hours: number
  deep_work_target_hours: number
  habits: { key: string; name: string; auto: number; active: boolean }[]
}

export type SettingsChange = Partial<Pick<Settings, 'name' | 'onboarded' | 'text_size' | 'wake_target' | 'sleep_target_hours' | 'deep_work_target_hours'>>

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

export const AREAS = ['fitness', 'financial', 'career', 'learning', 'business', 'social', 'relationships', 'health', 'other'] as const
export type Area = (typeof AREAS)[number]

export interface Milestone {
  id: number
  goal_id: number
  title: string
  due_date: string | null
  done_date: string | null
}

export interface Goal {
  id: number
  title: string
  area: Area
  impact: number
  effort: number
  target_date: string | null
  done_date: string | null
  created_at: string
  milestones: Milestone[]
  progress: number | null
  next_milestone: Milestone | null
}

export interface GoalsSummary {
  goals: Goal[]
  week: (Milestone & { goal_title: string; overdue: boolean })[]
  vision: string | null
  completed_this_year: number
}

export type GoalFields = Pick<Goal, 'title' | 'area' | 'impact' | 'effort' | 'target_date'>

export type ProfileValue = string | number | string[] | null

export interface ProfileQuestion {
  key: string
  group: string
  label: string
  type: 'text' | 'long' | 'number' | 'time' | 'scale' | 'choice' | 'multi'
  options?: string[]
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  optional?: boolean
  sensitive?: boolean
  answer: ProfileValue
}

export interface ProfileSection {
  key: string
  title: string
  intro: string
  minutes: number
  questions: ProfileQuestion[]
  answered: number
  total: number
  done: boolean
  snapshot: { label: string; value: string | null; note: string | null }[]
}

export interface Profile {
  sections: ProfileSection[]
  answered: number
  total: number
}

export interface WeeklyMilestone {
  id: number
  title: string
  goal_title: string
  due_date: string | null
}

export interface WeeklyReview {
  week_start: string
  week_end: string
  week_number: number
  is_current: boolean
  numbers: {
    day_score: number | null
    day_score_change: number | null
    checkins: number
    sleep_avg: number | null
    deep_work_total: number | null
    habit_rate: number | null
    workouts: number
  }
  wins: { date: string; text: string }[]
  slipped: { date: string; text: string }[]
  questions: { key: string; question: string; answer: string | null }[]
  priorities: string[]
  carry_over: (WeeklyMilestone & { carry: boolean })[]
  coming_up: WeeklyMilestone[]
  status: 'draft' | 'done' | null
  updated_at: string | null
}

export interface WeeklyChange {
  answers: Record<string, string>
  priorities: string[]
  carry: number[]
  status: 'draft' | 'done'
}

export interface Routine {
  id: number
  name: string
  start: string
  end: string
  weekdays: number[]
  note: string | null
}

export type RoutineFields = Omit<Routine, 'id'>

export interface Plan {
  date: string
  blocks: Routine[]
  due_today: { id: number; title: string; goal_title: string }[]
  has_routine: boolean
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
  // Goals writes return the whole Goals screen. DELETE sends '{}' because every write must be JSON.
  weekly: (today: string, week?: string) =>
    request<WeeklyReview>(`/api/weekly?today=${today}${week ? `&week=${week}` : ''}`),
  saveWeekly: (today: string, week: string, change: WeeklyChange) =>
    request<WeeklyReview>(`/api/weekly/${week}?today=${today}`, { method: 'PUT', body: JSON.stringify(change) }),
  routines: () => request<Routine[]>('/api/routines'),
  addRoutine: (fields: RoutineFields) => request<Routine[]>('/api/routines', { method: 'POST', body: JSON.stringify(fields) }),
  addSuggestedRoutine: (today: string) =>
    request<Routine[]>(`/api/routines/suggested?today=${today}`, { method: 'POST', body: '{}' }),
  updateRoutine: (id: number, changes: Partial<RoutineFields>) =>
    request<Routine[]>(`/api/routines/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),
  deleteRoutine: (id: number) => request<Routine[]>(`/api/routines/${id}`, { method: 'DELETE', body: '{}' }),
  plan: (day: string) => request<Plan>(`/api/plan/${day}`),
  profile: () => request<Profile>('/api/profile'),
  saveProfile: (section: string, answers: Record<string, ProfileValue>, done?: boolean) =>
    request<Profile>(`/api/profile/${section}`, { method: 'PUT', body: JSON.stringify({ answers, done }) }),
  goals: (today: string) => request<GoalsSummary>(`/api/goals?today=${today}`),
  addGoal: (today: string, fields: GoalFields) =>
    request<GoalsSummary>(`/api/goals?today=${today}`, { method: 'POST', body: JSON.stringify(fields) }),
  updateGoal: (today: string, id: number, changes: Partial<GoalFields> & { done?: boolean }) =>
    request<GoalsSummary>(`/api/goals/${id}?today=${today}`, { method: 'PUT', body: JSON.stringify(changes) }),
  deleteGoal: (today: string, id: number) =>
    request<GoalsSummary>(`/api/goals/${id}?today=${today}`, { method: 'DELETE', body: '{}' }),
  addMilestone: (today: string, goalId: number, fields: { title: string; due_date: string | null }) =>
    request<GoalsSummary>(`/api/goals/${goalId}/milestones?today=${today}`, { method: 'POST', body: JSON.stringify(fields) }),
  updateMilestone: (today: string, id: number, changes: { title?: string; due_date?: string | null; done?: boolean }) =>
    request<GoalsSummary>(`/api/milestones/${id}?today=${today}`, { method: 'PUT', body: JSON.stringify(changes) }),
  deleteMilestone: (today: string, id: number) =>
    request<GoalsSummary>(`/api/milestones/${id}?today=${today}`, { method: 'DELETE', body: '{}' }),
  saveVision: (today: string, vision: string) =>
    request<GoalsSummary>(`/api/vision?today=${today}`, { method: 'PUT', body: JSON.stringify({ vision }) }),
}
