import { useEffect, useState } from 'react'
import { api, ApiError, type TrashItem } from '../api'
import { Card } from './Card'
import { ErrorLine, Loading } from './States'
import { useLoad } from '../hooks'

const SHOW_FOR = 10_000
const KIND_LABEL: Record<TrashItem['kind'], string> = {
  goal: 'Goal', milestone: 'Milestone', task: 'Task', routine: 'Routine block', chat: 'Chat',
}

/** After any delete, offer Undo for a few seconds. The API flags undoable deletes (see api.ts). */
export function UndoToast({ onRestored }: { onRestored: () => void }) {
  const [item, setItem] = useState<{ id: number; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onUndo = (e: Event) => {
      setError(null)
      setItem((e as CustomEvent<{ id: number; title: string }>).detail)
    }
    window.addEventListener('samuel:undo', onUndo)
    return () => window.removeEventListener('samuel:undo', onUndo)
  }, [])

  useEffect(() => {
    if (!item) return
    const t = window.setTimeout(() => setItem(null), SHOW_FOR)
    return () => window.clearTimeout(t)
  }, [item])

  const undo = async () => {
    if (!item) return
    try {
      await api.restore(item.id)
      setItem(null)
      onRestored()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (!item) return null
  return (
    <div className="toasts undo-toasts" role="region" aria-label="Undo">
      <div className="toast" role="status">
        <div className="toast-head">
          <span>Deleted “{item.title}”</span>
          <button type="button" className="btn btn-primary" onClick={() => void undo()}>Undo</button>
        </div>
        {error && <span className="warn-text">{error}</span>}
      </div>
    </div>
  )
}

/** Settings → Recently deleted: restore anything deleted in the last 30 days, or empty it now. */
export function TrashCard({ onRestored }: { onRestored: () => void }) {
  const list = useLoad(() => api.trash(), [])
  const [error, setError] = useState<string | null>(null)
  const items = list.data ?? []

  const restore = async (id: number) => {
    setError(null)
    try {
      await api.restore(id)
      list.reload()
      onRestored()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }
  const emptyNow = async () => {
    if (!window.confirm('Remove everything in Recently deleted for good? This cannot be undone.')) return
    list.setData(await api.emptyTrash())
  }

  return (
    <Card
      title="Recently deleted"
      meta={list.data ? `${items.length} · kept 30 days` : undefined}
      secondary={items.length > 0 && <button type="button" className="link-btn" onClick={() => void emptyNow()}>Empty now</button>}
      action={<a href="#/tasks">Tasks →</a>}
    >
      {list.error ? <ErrorLine message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing here. Deleted goals, tasks, routine blocks and chats stay here for 30 days.</p>
      ) : (
        <ul className="list">
          {items.slice(0, 10).map((t) => (
            <li key={t.id}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="faint">{KIND_LABEL[t.kind]} · </span>{t.title}
              </span>
              <button type="button" className="btn" onClick={() => void restore(t.id)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorLine message={error} />}
    </Card>
  )
}
