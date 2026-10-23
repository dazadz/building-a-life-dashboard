import { useEffect, useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import { api, ApiError, type Report, type Status } from '../api'
import { Card } from '../components/Card'
import { ChatPanel } from '../components/Chat'
import { ErrorLine, Loading, NeedsSetup } from '../components/States'
import { longDate } from '../format'
import { useLoad, useQuery, type useCoachJob } from '../hooks'

const KINDS = [
  ['', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['onboarding', 'Profile'],
] as const
const KIND_LABEL: Record<Report['kind'], string> = {
  daily: 'Daily report', weekly: 'Weekly review', monthly: 'Monthly evolution',
  onboarding: 'Onboarding', ask: 'Asked',
}
const VISIBLE = 8

interface Props {
  coach: ReturnType<typeof useCoachJob>
  status: Status | null
}

export function CoachPage({ coach, status }: Props) {
  // Ctrl+K search links straight to a chat or a report: "#/coach?chat=3", "#/coach?report=12".
  const query = useQuery()
  const linkedChat = Number(query.get('chat')) || null
  const linkedReport = Number(query.get('report')) || null
  const [view, setView] = useState<'chat' | 'reports'>(linkedReport ? 'reports' : 'chat')
  const [openChat, setOpenChat] = useState<number | null>(linkedChat)
  const [kind, setKind] = useState('')
  const [selected, setSelected] = useState<number | null>(linkedReport)
  useEffect(() => {
    if (linkedChat) { setOpenChat(linkedChat); setView('chat') }
    if (linkedReport) { setSelected(linkedReport); setKind(''); setView('reports') }
  }, [linkedChat, linkedReport])
  const [showAll, setShowAll] = useState(false)
  const reports = useLoad(() => api.reports(kind || undefined), [kind])
  const { job } = coach

  // When a run finishes, reload the list and open the new report.
  useEffect(() => {
    if (job?.status === 'done') {
      reports.reload()
      setSelected(job.report_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.report_id])

  const list = reports.data ?? []
  const current = list.find((r) => r.id === selected) ?? list[0]
  const installed = status?.coach.installed ?? false

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Coach</div>
        <h1>Samuel</h1>
        <p>Talk with Samuel about your days, or read the reports. Samuel reads your logs with Claude Code on this computer.</p>
      </header>

      {!status ? <Loading lines={1} /> : installed && !status.coach.has_recent_checkin ? (
        <NeedsSetup>
          <span style={{ flex: 1 }}>
            <strong>Save a check-in first.</strong> Samuel needs at least one from the last 7 days to write a report.
          </span>
          <a href="#/checkin">Start check-in →</a>
        </NeedsSetup>
      ) : installed ? (
        <div className="notice ok" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}><strong>Claude Code is ready on this PC.</strong> Reports use your own Claude Code login.</span>
          <button type="button" className="btn btn-primary" disabled={coach.running} onClick={() => coach.start('daily-report')}>
            {coach.running ? 'Writing…' : 'Generate daily report'}
          </button>
        </div>
      ) : (
        <NeedsSetup>
          <span>
            <strong>Claude Code isn't installed.</strong> Samuel's reports need it. Install Claude Code, log in once in a
            terminal with <code>claude</code>, then restart <code>samuel serve</code>. Scores work without it.
          </span>
        </NeedsSetup>
      )}

      {coach.running && <RunningLine startedAt={job!.started_at} />}
      {job?.status === 'failed' && <ErrorLine message={`The report didn't finish: ${job.error ?? 'unknown error'}`} />}
      {coach.error && <ErrorLine message={coach.error} />}

      <div className="pills" role="group" aria-label="Coach view">
        <button type="button" className="pill" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Chat</button>
        <button type="button" className="pill" aria-pressed={view === 'reports'} onClick={() => setView('reports')}>Reports</button>
      </div>

      {view === 'chat' ? (
        <ChatPanel installed={installed} openId={openChat} onShowReports={() => setView('reports')} />
      ) : (
      <div className="coach-layout">
        <Card
          title="Reports"
          meta={reports.data ? `${list.length}` : undefined}
          secondary={list.length > VISIBLE && (
            <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show ${list.length - VISIBLE} more`}
            </button>
          )}
          action={<a href="#/checkin">Check-in →</a>}
        >
          <div className="pills" role="group" aria-label="Filter reports">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className="pill" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          {reports.error ? <ErrorLine message={reports.error} onRetry={reports.reload} /> : !reports.data ? <Loading /> : (
            list.length === 0 ? (
              <NeedsSetup>No reports yet. Save a check-in, then generate a daily report.</NeedsSetup>
            ) : (
              <ul className="list">
                {(showAll ? list : list.slice(0, VISIBLE)).map((r) => (
                  <li key={r.id} style={{ padding: '2px 0' }}>
                    <button type="button" className="report-item" aria-current={r.id === current?.id}
                      onClick={() => setSelected(r.id)}>
                      <span style={{ fontWeight: 600 }}>{KIND_LABEL[r.kind]}</span>
                      <span className="faint">
                        {longDate(r.date)} · {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </Card>

        <Card
          title={current ? KIND_LABEL[current.kind] : 'Report'}
          meta={current ? `Written ${new Date(current.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
          action={installed && status?.coach.has_recent_checkin
            ? <button type="button" className="link-btn" style={{ color: 'var(--link)' }} disabled={coach.running}
                onClick={() => coach.start('daily-report')}>Write a new one →</button>
            : <a href="#/checkin">Check-in →</a>}
        >
          {current ? (
            <>
              <article className="report"><Markdown>{current.markdown}</Markdown></article>
              {installed && (
                <AskAboutReport reportId={current.id} onStarted={(id) => { setOpenChat(id); setView('chat') }} />
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Reports appear here once Samuel has written one.</p>
          )}
        </Card>
      </div>
      )}
    </div>
  )
}

/** Start a chat about the open report, as in the Coach design. */
function AskAboutReport({ reportId, onStarted }: { reportId: number; onStarted: (chatId: number) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const chat = await api.startChat(text.trim(), reportId)
      setText('')
      onStarted(chat.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    }
    setSending(false)
  }
  return (
    <form className="chat-composer" onSubmit={(e) => void submit(e)}>
      <label htmlFor="ask-report" className="sr-only">Ask Samuel about this report</label>
      <input id="ask-report" className="input" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Ask Samuel about this report, e.g. which bottleneck to fix first" />
      <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>Ask</button>
      {error && <ErrorLine message={error} />}
    </form>
  )
}

function RunningLine({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.round((now - Date.parse(startedAt)) / 1000))
  return (
    <div className="notice" role="status">
      <span style={{ flex: 1 }}>Samuel is writing your daily report with Claude Code. This usually takes a minute or two.</span>
      <span className="mono faint">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
    </div>
  )
}
