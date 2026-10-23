import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type CoachJob } from './api'

/** The current route from the URL hash, e.g. "#/checkin" gives "/checkin". */
export function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/** Load data with loading and error states, and a reload function. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    setError(null)
    load()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, setData, error, reload }
}

/** Start a coach run and poll it until it finishes. */
export function useCoachJob() {
  const [job, setJob] = useState<CoachJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const start = useCallback(async (skill = 'daily-report') => {
    setError(null)
    window.clearTimeout(timer.current)
    const poll = (id: number) => {
      timer.current = window.setTimeout(async () => {
        try {
          const next = await api.job(id)
          setJob(next)
          if (next.status === 'running') poll(id)
        } catch (e) {
          setError(e instanceof ApiError ? e.message : String(e))
        }
      }, 2000)
    }
    try {
      const { job_id } = await api.runCoach(skill)
      setJob(await api.job(job_id))
      poll(job_id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }, [])

  return { job, error, start, running: job?.status === 'running' }
}
