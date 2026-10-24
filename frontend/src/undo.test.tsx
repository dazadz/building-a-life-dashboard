import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'
import { UndoToast } from './components/Undo'

afterEach(() => vi.unstubAllGlobals())

it('offers Undo after a delete and restores the item', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/tasks/7')) {
      return new Response('{"tasks":[]}', { status: 200, headers: { 'X-Samuel-Undo': '42', 'X-Samuel-Undo-Title': 'Budget%20draft' } })
    }
    return new Response('{"kind":"task","id":7,"title":"Budget draft"}', { status: 200 })
  }))
  const onRestored = vi.fn()
  render(<UndoToast onRestored={onRestored} />)
  await api.deleteTask('2026-10-24T10:00', 7)
  expect(await screen.findByText('Deleted “Budget draft”')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(onRestored).toHaveBeenCalled())
  expect(fetch).toHaveBeenCalledWith('/api/trash/42/restore', expect.objectContaining({ method: 'POST' }))
  expect(screen.queryByText('Deleted “Budget draft”')).not.toBeInTheDocument()
})
