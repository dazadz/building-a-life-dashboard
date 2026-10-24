import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api, ApiError, type SearchResults } from '../api'

interface Item {
  key: string
  title: string
  meta?: string
  run: () => void | Promise<void>
}

interface Group {
  name: string
  items: Item[]
}

const go = (href: string) => () => { window.location.hash = href }

const SCREENS: [string, string][] = [
  ['Today', '#/'], ['About me', '#/about'], ['Check-in', '#/checkin'], ['Routine', '#/routine'], ['Tasks', '#/tasks'], ['Habits', '#/habits'], ['Goals', '#/goals'],
  ['Health & energy', '#/health'], ['Weekly review', '#/review'], ['Monthly evolution', '#/monthly'],
  ['Coach', '#/coach'], ['Profile', '#/profile'], ['Settings', '#/settings'],
]

/** Ctrl+K: jump to any screen, search your data, add a task or ask Samuel. */
export function Palette({ coachInstalled }: { coachInstalled: boolean }) {
  const [open, setOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        show()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('samuel:palette', show)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('samuel:palette', show)
    }
  }, [])

  if (!open) return null
  return (
    <PaletteDialog
      coachInstalled={coachInstalled}
      onClose={() => { setOpen(false); returnFocus.current?.focus?.() }}
    />
  )
}

function PaletteDialog({ coachInstalled, onClose }: { coachInstalled: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [found, setFound] = useState<SearchResults | null>(null)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // "> " shows commands only, "? " asks Samuel; anything else also searches your data.
  const mode = text.startsWith('>') ? 'commands' : text.startsWith('?') ? 'ask' : 'all'
  const q = (mode === 'all' ? text : text.slice(1)).trim()
  const searching = mode === 'all' && q.length >= 2
  const results = searching && found?.query === q ? found : null

  useEffect(() => {
    if (!searching) return
    let live = true
    const t = window.setTimeout(() => {
      api.search(q).then((r) => { if (live) setFound(r) }).catch(() => {})
    }, 150)
    return () => { live = false; window.clearTimeout(t) }
  }, [searching, q])

  const close = onClose

  const groups = useMemo<Group[]>(() => {
    const lower = q.toLowerCase()
    const screens: Item[] = SCREENS
      .filter(([name]) => !lower || name.toLowerCase().includes(lower))
      .map(([name, href]) => ({ key: `go-${href}`, title: name, meta: 'Go to screen', run: go(href) }))
    const commands: Item[] = [
      { key: 'cmd-chat', title: 'New chat with Samuel', meta: 'Coach', run: go('#/coach') },
      { key: 'cmd-checkin', title: "Start tonight's check-in", meta: 'About a minute', run: go('#/checkin') },
    ].filter((c) => !lower || c.title.toLowerCase().includes(lower))

    const actions: Item[] = []
    if (q && mode !== 'commands') {
      if (mode === 'all') {
        actions.push({
          key: 'add-task', title: `Create task “${q}”`, meta: 'Opens the new task form to set its time, type and goal',
          run: async () => { window.location.hash = `#/tasks?new=${encodeURIComponent(q)}` },
        })
      }
      if (coachInstalled) {
        actions.push({
          key: 'ask', title: `Ask Samuel: “${q}”`, meta: 'Starts a chat; Samuel answers from your own data',
          run: async () => {
            const chat = await api.startChat(q)
            window.location.hash = `#/coach?chat=${chat.id}`
          },
        })
      }
    }

    const found: Group[] = (results?.groups ?? []).map((g) => ({
      name: g.name,
      items: g.items.map((r) => ({ key: `${r.kind}-${r.id}`, title: r.title, meta: r.meta, run: go(r.href) })),
    }))

    if (mode === 'ask') return [{ name: 'Ask Samuel', items: actions }]
    return [
      ...found,
      { name: 'Go to', items: screens },
      { name: 'Commands', items: commands },
      { name: 'Actions', items: actions },
    ].filter((g) => g.items.length > 0)
  }, [q, mode, results, coachInstalled])

  const flat = groups.flatMap((g) => g.items)
  const current = Math.min(active, Math.max(0, flat.length - 1))

  const run = async (item: Item | undefined) => {
    if (!item) return
    setError(null)
    try {
      await item.run()
      close()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % Math.max(1, flat.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + flat.length) % Math.max(1, flat.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); void run(flat[current]) }
  }

  let index = -1
  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}>
        <div className="palette-search">
          <input
            autoFocus className="palette-input" value={text} maxLength={100}
            placeholder="Search or run a command" aria-label="Search or run a command"
            role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={flat.length ? `palette-${flat[current].key}` : undefined}
            onChange={(e) => { setText(e.target.value); setActive(0) }}
          />
          <kbd>Esc</kbd>
        </div>
        <div id="palette-list" className="palette-list" role="listbox" aria-label="Results">
          {groups.length === 0 && <p className="muted palette-empty">Nothing matches “{q}”.</p>}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name}>
              <div className="palette-group label-mono">{g.name}</div>
              {g.items.map((item) => {
                index += 1
                const i = index
                return (
                  <div
                    key={item.key} id={`palette-${item.key}`} role="option" aria-selected={i === current}
                    className="palette-item" onMouseEnter={() => setActive(i)} onClick={() => void run(item)}
                  >
                    <span className="palette-title">{item.title}</span>
                    {item.meta && <span className="faint palette-meta">{item.meta}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {error && <div className="notice warn" role="alert" style={{ margin: 8 }}>{error}</div>}
        <div className="palette-foot faint">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span>Type <kbd>&gt;</kbd> for commands, <kbd>?</kbd> to ask Samuel</span>
        </div>
      </div>
    </div>
  )
}
