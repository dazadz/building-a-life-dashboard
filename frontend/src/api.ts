import type { Theme } from './theme'

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

export type ScoreKey = 'productivity' | 'focus' | 'energy' | 'discipline' | 'balance' | 'lifestyle' | 'day'
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
  theme: Theme | null
  suggestions: number
}

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

export interface Settings {
  name: string | null
  onboarded: boolean
  text_size: TextSize
  theme: Theme | null
  wake_target: string
  sleep_target_hours: number
  deep_work_target_hours: number
  habits: { key: string; name: string; auto: number; active: boolean }[]
}

export type SettingsChange = Partial<Pick<Settings, 'name' | 'onboarded' | 'text_size' | 'wake_target' | 'sleep_target_hours' | 'deep_work_target_hours'>> & {
  theme?: Theme | Record<string, never>
}

export interface Report {
  id: number
  kind: 'daily' | 'weekly' | 'monthly' | 'onboarding' | 'ask' | 'plan'
  date: string
  markdown: string
  created_at: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'samuel'
  text: string
  created_at: string
}

export interface ChatSummary {
  id: number
  title: string
  report_id: number | null
  created_at: string
  updated_at: string | null
  messages: number
  pending: boolean
}

export interface Chat {
  id: number
  title: string
  report_id: number | null
  created_at: string
  messages: ChatMessage[]
  pending: boolean
  error: string | null
  awaiting_reply: boolean
}

export interface TrashItem {
  id: number
  kind: 'goal' | 'milestone' | 'task' | 'routine' | 'chat'
  title: string
  deleted_at: string
}

export interface Links {
  days: number
  min_days: number
  links: {
    condition: string
    condition_label: string
    compared_with: string
    outcome: string
    outcome_label: string
    unit: string
    when: 'same day' | 'next day'
    with_avg: number
    without_avg: number
    difference: number
    with_days: number
    without_days: number
  }[]
}

export interface TimeLeaks {
  days: number
  checkins: number
  total_lost: number
  leaks: {
    name: string
    days: number
    dates: string[]
    deep_work_lost: number
    deep_work_avg: number | null
    deep_work_avg_other_days: number | null
    impact: 'high' | 'medium' | 'low'
  }[]
}

export interface Digest {
  now: string
  focus: { text: string; source: string } | null
  due: {
    overdue: number
    today: number
    items: { kind: 'task' | 'milestone'; id: number; title: string; time: string | null; overdue: boolean; high: boolean }[]
  }
  next: { name: string; start: string; end: string; state: 'now' | 'next' } | null
  yesterday: { date: string; score: number | null; change: number | null }
}

export interface SearchResults {
  query: string
  groups: {
    name: string
    items: { kind: string; id: number | string; title: string; meta: string; href: string }[]
  }[]
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

export const AREAS = ['fitness', 'financial', 'career', 'learning', 'business', 'social', 'relationships', 'health', 'spiritual', 'other'] as const
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

// The types shared by routine blocks and tasks ("Type" in the app).
export type BlockKind = 'focus' | 'fixed' | 'work' | 'spiritual' | 'habit' | 'recovery' | 'leisure'

export interface Routine {
  id: number
  name: string
  start: string
  end: string // before the start when the block runs past midnight
  weekdays: number[]
  note: string | null
  kind: BlockKind
  goal_id: number | null
  habit_key: string | null
  steps: string[]
  remind_before: boolean
  remind_start: boolean
  day_type_id: number | null // set: runs on that day type's days; null: runs on its own weekdays
  goal_title?: string | null
  habit_name?: string | null
  day_type?: string | null
}

export type RoutineFields = Omit<Routine, 'id' | 'goal_title' | 'habit_name' | 'day_type'>

export interface QueuedTask {
  id: number
  title: string
  due_date: string | null
  notes: string | null
  rolled: number // how many runs of the block it has waited through
}

export interface PlanBlock extends Routine {
  status: 'done' | 'skipped' | null
  reason: string | null
  tasks: QueuedTask[]
}

export interface DayType {
  id: number
  name: string
  weekdays: number[]
  position: number
  blocks: number
}

export interface Plan {
  date: string
  day_type: { id: number; name: string; overridden: boolean } | null
  day_types: { id: number; name: string }[]
  blocks: PlanBlock[]
  due_today: { id: number; title: string; goal_title: string }[]
  has_routine: boolean
}

export interface BlockReminder {
  routine_id: number
  date: string
  which: 'heads_up' | 'start'
  name: string
  start: string
  end: string
  kind: BlockKind
  goal_title: string | null
  steps: string[]
  note: string | null
  task: string | null
}

export type Priority = 'high' | 'normal' | 'low'

export interface Task {
  id: number
  title: string
  notes: string | null
  list: string
  priority: Priority
  due_date: string | null
  due_time: string | null
  remind_at: string | null
  goal_id: number | null
  goal_title: string | null
  type: BlockKind | null
  routine_id: number | null
  done_at: string | null
  view: 'today' | 'upcoming' | 'someday' | 'overdue' | 'done'
  subtasks: { id: number; title: string; done: boolean }[]
}

export interface TasksSummary {
  tasks: Task[]
  counts: { today: number; upcoming: number; overdue: number; all: number; done: number }
  this_week: number
  lists: string[]
  reminders: { id: number; title: string; remind_at: string }[]
}

export interface NewTask {
  title: string
  list?: string
  priority?: Priority
  due_date?: string | null
  due_time?: string | null
  remind_at?: string | null
  notes?: string | null
  goal_id?: number | null
  type?: BlockKind | null
  routine_id?: number | null
  subtasks?: string[]
}

export interface DueReminder {
  id: number
  title: string
  list: string
  remind_at: string
}

export interface HealthLog {
  water_l: number | null
  caffeine_cups: number | null
  caffeine_last: string | null
  screens_late: number | null
}

export type EnergySlot = 'morning' | 'midday' | 'afternoon' | 'evening'
export type EnergyTaps = Record<EnergySlot, number | null>

export interface EnergyCurve {
  points: { slot: EnergySlot; average: number | null; days: number }[]
  peak: EnergySlot | null
  dip: EnergySlot | null
  min_days: number
}

export interface Health {
  date: string
  days: number
  sleep_target: number
  recovery: {
    score: number | null
    change: number | null
    sleep_avg: number | null
    rest_days: number
    stress_avg: number | null
    workouts: number
  }
  burnout: { level: 'low' | 'moderate' | 'high' | null; reasons: string[] }
  series: { date: string; sleep: number | null; energy: number | null }[]
  energy_gap: number | null
  energy_curve: EnergyCurve
  week_scores: { lifestyle: number | null; lifestyle_change: number | null; balance: number | null; balance_change: number | null }
  taps_today: EnergyTaps
  inputs: {
    water_l: number | null
    caffeine_cups: number | null
    caffeine_latest: string | null
    screens_late: number | null
    workouts: number
    logged_days: number
  }
  log_today: (HealthLog & { date: string }) | null
}

export interface MonthNumbers {
  days_in_month: number
  days_so_far: number
  days_logged: number
  discipline: number | null
  productivity: number | null
  energy: number | null
  consistency: number | null
  sleep: number | null
  milestones_done: number
  milestones_due: number
  goal_completion: number | null
}

export interface Monthly {
  month: string
  previous: string
  is_current: boolean
  numbers: MonthNumbers
  previous_numbers: MonthNumbers
  changes: Record<'discipline' | 'productivity' | 'energy' | 'consistency' | 'sleep' | 'goal_completion', number | null>
  habits: { key: string; name: string; now: number | null; then: number | null; change: number | null }[]
  trend: { date: string; discipline: number | null; average: number | null }[]
}

export interface PainGoal {
  id: number
  kind: 'pain' | 'goal'
  text: string
  area: string | null
  evidence: string | null
  goal_id: number | null
  habit_key: string | null
  status: 'active' | 'resolved'
  position: number
  goal_title: string | null
  goal_done: string | null
  habit_name: string | null
}

export type PainGoalFields = Pick<PainGoal, 'kind' | 'text' | 'area' | 'evidence'>

export interface About {
  notes: string | null
  notes_max: number
  items: PainGoal[]
  counts: { pain: number; goal: number }
}

export type SuggestionKind = 'pain' | 'goal' | 'milestone' | 'habit' | 'task' | 'routine'
export type SuggestionPayload = Record<string, unknown>

export interface Suggestion {
  id: number
  kind: SuggestionKind
  title: string
  payload: SuggestionPayload
  reason: string | null
  batch: string | null
  status: 'pending' | 'accepted' | 'dismissed'
  created_at: string
}

export interface Suggestions {
  pending: Suggestion[]
  counts: Record<SuggestionKind, number>
  total: number
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
  // A delete that can be undone says so in headers; the Undo toast picks it up.
  const undo = res.headers?.get?.('X-Samuel-Undo')
  if (undo) {
    const title = decodeURIComponent(res.headers.get('X-Samuel-Undo-Title') ?? '')
    window.dispatchEvent(new CustomEvent('samuel:undo', { detail: { id: Number(undo), title } }))
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
  renameHabit: (key: string, name: string) =>
    request<Settings['habits']>(`/api/habit-settings/${key}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  addHabit: (name: string) =>
    request<Settings['habits']>('/api/habit-settings', { method: 'POST', body: JSON.stringify({ name }) }),
  about: () => request<About>('/api/about'),
  saveAboutNotes: (notes: string) => request<About>('/api/about', { method: 'PUT', body: JSON.stringify({ notes }) }),
  addPainGoal: (fields: PainGoalFields) => request<About>('/api/pains-goals', { method: 'POST', body: JSON.stringify(fields) }),
  updatePainGoal: (id: number, changes: Partial<PainGoalFields> & { status?: PainGoal['status'] }) =>
    request<About>(`/api/pains-goals/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),
  deletePainGoal: (id: number) => request<About>(`/api/pains-goals/${id}`, { method: 'DELETE', body: '{}' }),
  suggestions: () => request<Suggestions>('/api/suggestions'),
  acceptSuggestion: (today: string, id: number, payload?: SuggestionPayload) =>
    request<Suggestions>(`/api/suggestions/${id}/accept?today=${today}`, { method: 'POST', body: JSON.stringify({ payload: payload ?? null }) }),
  dismissSuggestion: (id: number) => request<Suggestions>(`/api/suggestions/${id}/dismiss`, { method: 'POST', body: '{}' }),
  data: () => request<DataInfo>('/api/data'),
  backupNow: () => request<DataInfo>('/api/backup', { method: 'POST', body: '{}' }),
  reports: (kind?: string) => request<Report[]>(`/api/reports${kind ? `?kind=${kind}` : ''}`),
  runCoach: (skill = 'daily-report', goalId?: number) =>
    request<{ job_id: number }>('/api/coach/run', { method: 'POST', body: JSON.stringify({ skill, goal_id: goalId ?? null }) }),
  job: (id: number) => request<CoachJob>(`/api/coach/jobs/${id}`),
  trash: () => request<TrashItem[]>('/api/trash'),
  restore: (id: number) => request<{ kind: string; id: number; title: string }>(`/api/trash/${id}/restore`, { method: 'POST', body: '{}' }),
  emptyTrash: () => request<TrashItem[]>('/api/trash', { method: 'DELETE', body: '{}' }),
  links: (day: string, days: number) => request<Links>(`/api/links/${day}?days=${days}`),
  leaks: (day: string, days: number) => request<TimeLeaks>(`/api/leaks/${day}?days=${days}`),
  digest: (now: string) => request<Digest>(`/api/digest?now=${now}`),
  search: (q: string) => request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
  chats: () => request<ChatSummary[]>('/api/chats'),
  chat: (id: number) => request<Chat>(`/api/chats/${id}`),
  startChat: (text: string, reportId?: number) =>
    request<Chat>('/api/chats', { method: 'POST', body: JSON.stringify({ text, report_id: reportId ?? null }) }),
  sendChat: (id: number, text: string) =>
    request<Chat>(`/api/chats/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  retryChat: (id: number) => request<Chat>(`/api/chats/${id}/retry`, { method: 'POST', body: '{}' }),
  deleteChat: (id: number) => request<ChatSummary[]>(`/api/chats/${id}`, { method: 'DELETE', body: '{}' }),
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
  setDayType: (day: string, dayTypeId: number | null) =>
    request<Plan>(`/api/plan/${day}/day-type`, { method: 'PUT', body: JSON.stringify({ day_type_id: dayTypeId }) }),
  logBlock: (day: string, id: number, status: PlanBlock['status'], reason?: string) =>
    request<Plan>(`/api/plan/${day}/blocks/${id}`, { method: 'PUT', body: JSON.stringify({ status, reason: reason ?? null }) }),
  snoozeBlock: (day: string, id: number, until: string) =>
    request<Plan>(`/api/plan/${day}/blocks/${id}/snooze`, { method: 'POST', body: JSON.stringify({ until }) }),
  blockReminders: (now: string) => request<BlockReminder[]>(`/api/block-reminders/due?now=${now}`),
  blockShown: (now: string, id: number, which: BlockReminder['which']) =>
    request<{ ok: boolean }>(`/api/block-reminders/${id}/shown?which=${which}&now=${now}`, { method: 'POST', body: '{}' }),
  dayTypes: () => request<DayType[]>('/api/day-types'),
  addDayType: (name: string, weekdays: number[]) =>
    request<DayType[]>('/api/day-types', { method: 'POST', body: JSON.stringify({ name, weekdays }) }),
  updateDayType: (id: number, changes: { name?: string; weekdays?: number[] }) =>
    request<DayType[]>(`/api/day-types/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),
  deleteDayType: (id: number) => request<DayType[]>(`/api/day-types/${id}`, { method: 'DELETE', body: '{}' }),
  tasks: (now: string) => request<TasksSummary>(`/api/tasks?now=${now}`),
  addTask: (now: string, task: NewTask) =>
    request<TasksSummary>(`/api/tasks?now=${now}`, { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (now: string, id: number, changes: Partial<NewTask> & { done?: boolean }) =>
    request<TasksSummary>(`/api/tasks/${id}?now=${now}`, { method: 'PUT', body: JSON.stringify(changes) }),
  snoozeTask: (now: string, id: number, how: 'hour' | 'tomorrow') =>
    request<TasksSummary>(`/api/tasks/${id}/snooze?now=${now}`, { method: 'POST', body: JSON.stringify({ how }) }),
  deleteTask: (now: string, id: number) =>
    request<TasksSummary>(`/api/tasks/${id}?now=${now}`, { method: 'DELETE', body: '{}' }),
  addSubtask: (now: string, taskId: number, title: string) =>
    request<TasksSummary>(`/api/tasks/${taskId}/subtasks?now=${now}`, { method: 'POST', body: JSON.stringify({ title }) }),
  setSubtask: (now: string, id: number, done: boolean) =>
    request<TasksSummary>(`/api/subtasks/${id}?now=${now}`, { method: 'PUT', body: JSON.stringify({ done }) }),
  deleteSubtask: (now: string, id: number) =>
    request<TasksSummary>(`/api/subtasks/${id}?now=${now}`, { method: 'DELETE', body: '{}' }),
  dueReminders: (now: string) => request<DueReminder[]>(`/api/reminders/due?now=${now}`),
  markNotified: (now: string, id: number) =>
    request<{ ok: boolean }>(`/api/tasks/${id}/notified?now=${now}`, { method: 'POST', body: '{}' }),
  energy: (day: string) => request<EnergyTaps>(`/api/energy/${day}`),
  tapEnergy: (day: string, slot: EnergySlot, value: number | null, at: string) =>
    request<EnergyTaps>(`/api/energy/${day}/${slot}`, { method: 'PUT', body: JSON.stringify({ value, at }) }),
  health: (day: string, days: number) => request<Health>(`/api/health/${day}?days=${days}`),
  saveHealthLog: (day: string, log: Partial<HealthLog>) =>
    request<Health>(`/api/health-log/${day}`, { method: 'PUT', body: JSON.stringify(log) }),
  monthly: (today: string, month?: string) =>
    request<Monthly>(`/api/monthly?today=${today}${month ? `&month=${month}` : ''}`),
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
