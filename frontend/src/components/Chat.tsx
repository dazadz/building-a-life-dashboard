import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import { api, ApiError, type Chat, type ChatSummary } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading, NeedsSetup } from './States'
import { useLoad } from '../hooks'

const STARTERS = [
  'Why has my energy been low this week?',
  'What should I focus on tomorrow?',
  'Which habit is slipping most, and why?',
  'Am I on track with my goals?',
]
const VISIBLE = 8

function when(stamp: string | null): string {
  if (!stamp) return ''
  const d = new Date(stamp)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Props {
  installed: boolean
  /** Open this chat, e.g. one just started from a report. */
  openId?: number | null
  onShowReports: () => void
}

/** Chat with Samuel: the prompt's coach mode, a conversation with follow-ups. */
export function ChatPanel({ installed, openId, onShowReports }: Props) {
  const list = useLoad(() => api.chats(), [])
  const [selected, setSelected] = useState<number | null>(openId ?? null)
  const [chat, setChat] = useState<Chat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => { if (openId) setSelected(openId) }, [openId])

  // Load the open chat, and poll it while Samuel is answering.
  const pending = chat?.pending ?? false
  useEffect(() => {
    if (selected == null) { setChat(null); return }
    let live = true
    let timer: number | undefined
    const load = async () => {
      try {
        const next = await api.chat(selected)
        if (!live) return
        setChat(next)
        if (next.pending) timer = window.setTimeout(load, 2000)
        else list.reload()
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : String(e))
      }
    }
    void load()
    return () => { live = false; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pending])

  const send = async (text: string) => {
    setError(null)
    try {
      const next = chat ? await api.sendChat(chat.id, text) : await api.startChat(text)
      setChat(next)
      setSelected(next.id)
      list.reload()
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      return false
    }
  }

  const retry = async () => {
    if (!chat) return
    setError(null)
    try { setChat(await api.retryChat(chat.id)) } catch (e) { setError(e instanceof ApiError ? e.message : String(e)) }
  }

  const remove = async (id: number) => {
    try {
      list.setData(await api.deleteChat(id))
      if (selected === id) setSelected(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const chats: ChatSummary[] = list.data ?? []

  return (
    <div className="coach-layout">
      <Card
        title="Conversations"
        meta={list.data ? `${chats.length}` : undefined}
        secondary={chats.length > VISIBLE && (
          <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show ${chats.length - VISIBLE} more`}
          </button>
        )}
        action={<button type="button" className="link-btn accent" onClick={() => setSelected(null)}>New chat →</button>}
      >
        {list.error ? <ErrorLine message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
          chats.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No conversations yet. Ask Samuel anything about your days.</p>
          ) : (
            <ul className="list">
              {(showAll ? chats : chats.slice(0, VISIBLE)).map((c) => (
                <li key={c.id} style={{ padding: '2px 0' }}>
                  <button type="button" className="report-item" aria-current={c.id === selected} onClick={() => setSelected(c.id)}>
                    <span style={{ fontWeight: 600 }}>{c.title}</span>
                    <span className="faint">
                      {c.pending ? 'Samuel is answering…' : `${when(c.updated_at ?? c.created_at)} · ${c.messages} messages`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      <Card
        title={chat ? 'Chat' : 'New chat'}
        meta={chat ? `Started ${when(chat.created_at)}` : undefined}
        secondary={chat && (
          <button type="button" className="link-btn" disabled={chat.pending} onClick={() => void remove(chat.id)}>
            Delete chat
          </button>
        )}
        action={<button type="button" className="link-btn accent" onClick={onShowReports}>Reports →</button>}
      >
        {!installed ? (
          <NeedsSetup>
            <span>
              <strong>Chat needs Claude Code.</strong> Install it, log in once in a terminal with <code>claude</code>, then
              restart Samuel.
            </span>
          </NeedsSetup>
        ) : (
          <>
            {chat ? (
              <Thread chat={chat} />
            ) : (
              <div className="chat-starters">
                <p className="muted" style={{ margin: 0 }}>
                  Ask about your sleep, energy, habits, goals or plans. Samuel answers from your own data and remembers
                  the conversation, so you can ask follow-ups.
                </p>
                <div className="pills" role="group" aria-label="Suggested questions">
                  {STARTERS.map((q) => (
                    <button key={q} type="button" className="pill" onClick={() => void send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {chat?.error && !chat.pending && (
              <ErrorLine message={`Samuel couldn't answer: ${chat.error}`} onRetry={() => void retry()} />
            )}
            {error && <ErrorLine message={error} />}
            <Composer disabled={chat?.pending ?? false} followUp={chat != null} onSend={send} />
          </>
        )}
      </Card>
    </div>
  )
}

function Thread({ chat }: { chat: Chat }) {
  // Scroll the thread itself to the newest message, never the page.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [chat.messages.length, chat.pending])
  return (
    <div className="chat-thread" aria-live="polite" ref={box}>
      {chat.report_id != null && <div className="faint">About a report · Samuel can see it</div>}
      {chat.messages.map((m) => (
        <div key={m.id} className={`chat-msg ${m.role}`}>
          <div className="label-mono">{m.role === 'user' ? 'You' : 'Samuel'} · {when(m.created_at)}</div>
          {m.role === 'samuel' ? <article className="report"><Markdown>{m.text}</Markdown></article> : <p>{m.text}</p>}
        </div>
      ))}
      {chat.pending && <Thinking />}
    </div>
  )
}

function Thinking() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="chat-msg samuel" role="status">
      <div className="label-mono">Samuel · thinking</div>
      <p className="muted">
        Reading your data with Claude Code… <span className="mono faint">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
      </p>
    </div>
  )
}

function Composer({ disabled, followUp, onSend }: { disabled: boolean; followUp: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value || disabled || sending) return
    setSending(true)
    if (await onSend(value)) setText('')
    setSending(false)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }
  return (
    <form className="chat-composer" onSubmit={(e) => void submit(e)}>
      <label htmlFor="chat-input" className="sr-only">{followUp ? 'Ask a follow-up' : 'Ask Samuel'}</label>
      <textarea
        id="chat-input" className="input" rows={2} maxLength={2000} value={text}
        placeholder={followUp ? 'Ask a follow-up…' : 'Ask Samuel… (Enter to send, Shift+Enter for a new line)'}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled || sending || !text.trim()}>
        {disabled ? 'Answering…' : 'Send'}
      </button>
    </form>
  )
}
