// Daily targets as typed in a form, and turning them into numbers for the API.

import type { Settings } from './api'

export interface Targets {
  wake_target: string
  sleep_target_hours: string
  deep_work_target_hours: string
}

export function targetsFrom(s: Settings): Targets {
  return {
    wake_target: s.wake_target,
    sleep_target_hours: String(s.sleep_target_hours),
    deep_work_target_hours: String(s.deep_work_target_hours),
  }
}

/** Turns the target fields into numbers, or explains what's wrong. */
export function parseTargets(t: Targets): { ok: true; value: { wake_target: string; sleep_target_hours: number; deep_work_target_hours: number } } | { ok: false; error: string } {
  const sleep = Number(t.sleep_target_hours)
  const deep = Number(t.deep_work_target_hours)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.wake_target)) return { ok: false, error: 'Enter a wake-up time.' }
  if (!(sleep >= 4 && sleep <= 12)) return { ok: false, error: 'Sleep target must be between 4 and 12 hours.' }
  if (!(deep >= 0.5 && deep <= 12)) return { ok: false, error: 'Deep work target must be between 0.5 and 12 hours.' }
  return { ok: true, value: { wake_target: t.wake_target, sleep_target_hours: sleep, deep_work_target_hours: deep } }
}
