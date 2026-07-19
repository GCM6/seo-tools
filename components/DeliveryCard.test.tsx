import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeliveryCard } from './DeliveryCard'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      'delivery.eyebrow': 'Delivery preview',
      'delivery.kind.content': 'Content execution brief',
      'delivery.kind.technical': 'Technical change plan',
      'delivery.viewLabel': 'Delivery draft view',
      'delivery.preview': 'Preview',
      'delivery.markdown': 'Edit Markdown',
      'delivery.markdownEditor': 'Delivery draft Markdown editor',
      'delivery.copy': 'Copy Markdown',
      'delivery.copied': 'Copied',
      'delivery.download': 'Download .md',
      'delivery.draftHint': 'Edits stay in this browser tab.',
      'delivery.handoffTitle': 'Executor handoff',
      'delivery.copyHandoff': 'Copy execution prompt',
      'delivery.handoffCopied': 'Execution prompt copied',
      'applied.mark': 'Mark as executed',
      'applied.done': `Executed · ${values?.at ?? ''}`,
      'applied.noteLabel': 'Execution note',
      'applied.notePlaceholder': 'What changed?',
      'applied.submit': 'Confirm executed',
      'applied.cancel': 'Cancel',
    }
    return messages[key] ?? key
  },
}))

const MARKDOWN = '# Content execution brief\n\n> Human review required\n\n## Executor handoff\n\n- Verify the facts'
const HANDOFF = '[Task] Draft the article without fabricating facts.'

describe('DeliveryCard', () => {
  const writeText = vi.fn(() => Promise.resolve())
  const originalFetch = global.fetch

  beforeEach(() => {
    writeText.mockClear()
    Object.assign(navigator, { clipboard: { writeText } })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function renderCard() {
    return render(
      <DeliveryCard
        recId="rec_1"
        title="Create a comparison page"
        kind="content"
        initialMarkdown={MARKDOWN}
        handoffText={HANDOFF}
      />,
    )
  }

  it('starts with a readable Markdown preview and lets the user edit it', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Content execution brief' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Edit Markdown' }))
    const editor = screen.getByLabelText('Delivery draft Markdown editor')
    fireEvent.change(editor, { target: { value: '# Refined delivery' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(screen.getByRole('heading', { name: 'Refined delivery' })).toBeInTheDocument()
  })

  it('copies the current Markdown delivery, not only the execution prompt', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('only shows executed after the recommendation API confirms it', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ appliedAt: '2026-07-19T10:00:00.000Z' }), { status: 200 }))
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Mark as executed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm executed' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/recommendations/rec_1',
      expect.objectContaining({ method: 'PATCH' }),
    ))
    expect(await screen.findByText('Executed · 2026-07-19')).toBeInTheDocument()
  })
})
