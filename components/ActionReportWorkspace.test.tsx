import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActionReportWorkspace } from './ActionReportWorkspace'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      'actionReport.eyebrow': 'Decision report',
      'actionReport.title': 'Execution decision report',
      'actionReport.summary': 'A decision record and handoff document.',
      'actionReport.sourceLock': 'Only decided cards are source material.',
      'actionReport.aiGenerate': 'Generate AI summary',
      'actionReport.generating': 'Summarizing…',
      'actionReport.aiUnavailable': 'AI unavailable',
      'actionReport.viewLabel': 'Report view',
      'actionReport.expand': 'Expand preview',
      'actionReport.collapse': 'Collapse preview',
      'actionReport.overwriteConfirm': 'Overwrite your manual edits?',
      'delivery.preview': 'Preview',
      'delivery.markdown': 'Edit Markdown',
      'delivery.copied': 'Copied',
      'actionReport.copy': 'Copy report',
      'actionReport.download': 'Download .md',
      'actionReport.aiDone': 'AI summary added',
      'actionReport.aiErrorRunNotFound': 'Run not found',
      'actionReport.aiErrorSummaryFailed': 'AI request failed',
      'actionReport.aiErrorValidationFailed': 'AI output rejected by source validation',
      'actionReport.editorLabel': 'Report Markdown editor',
      'actionReport.draftHint': 'Edits stay in this browser tab.',
    }
    let text = map[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v))
    return text
  },
}))

describe('ActionReportWorkspace', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function renderWorkspace(aiAvailable = true) {
    return render(
      <ActionReportWorkspace
        runId="run_1"
        filenameBase="veris-run_1-action-report"
        aiAvailable={aiAvailable}
        initialMarkdown={'# Decision report\n\n## Action plan\n\n- `rec_1` Fix canonical'}
      />,
    )
  }

  it('defaults to collapsed: no execution register, no Markdown preview until expanded', () => {
    renderWorkspace()
    expect(screen.getByRole('heading', { name: 'Execution decision report' })).toBeInTheDocument()
    expect(screen.getByText('A decision record and handoff document.')).toBeInTheDocument()
    // 执行登记区块已迁到 ActionList，本卡不应再渲染它。
    expect(screen.queryByText('Execution register')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Action plan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand preview' })).toBeInTheDocument()
  })

  it('expanding reveals the full Markdown report; collapsing hides it again', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    expect(screen.getByRole('heading', { name: 'Action plan' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse preview' }))
    expect(screen.queryByRole('heading', { name: 'Action plan' })).not.toBeInTheDocument()
  })

  it('replaces the report only with the server-locked AI result', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ markdown: '# Decision report\n\n- `rec_1` is the first action.' }), { status: 200 }))
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/runs/run_1/action-report', { method: 'POST' }))
    expect(await screen.findByText('AI summary added')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    expect(screen.getByText('`rec_1` is the first action.')).toBeInTheDocument()
  })

  describe('AI error typing — distinct copy per HTTP status, not one folded message', () => {
    beforeEach(() => {
      renderWorkspace()
    })

    it('404 run_not_found', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'run_not_found' }), { status: 404 }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))
      expect(await screen.findByText('Run not found')).toBeInTheDocument()
    })

    it('409 ai_not_configured', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'ai_not_configured' }), { status: 409 }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))
      expect(await screen.findByText('AI unavailable')).toBeInTheDocument()
    })

    it('502 ai_summary_failed', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'ai_summary_failed' }), { status: 502 }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))
      expect(await screen.findByText('AI request failed')).toBeInTheDocument()
    })

    it('422 source-validation rejection is worded as a rejection, not a config problem', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'summary_source_validation_failed' }), { status: 422 }))
      fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))
      expect(await screen.findByText('AI output rejected by source validation')).toBeInTheDocument()
    })
  })

  it('confirms before overwriting a manually edited Markdown draft', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ markdown: '# replaced' }), { status: 200 }))
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Edit Markdown' }))
    fireEvent.change(screen.getByLabelText('Report Markdown editor'), { target: { value: '# hand edited' } })

    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))

    expect(confirmSpy).toHaveBeenCalledWith('Overwrite your manual edits?')
    // User declined the overwrite — no request is sent, edits survive.
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Report Markdown editor')).toHaveValue('# hand edited')
  })

  it('overwrites after the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ markdown: '# replaced by AI' }), { status: 200 }))
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Expand preview' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Edit Markdown' }))
    fireEvent.change(screen.getByLabelText('Report Markdown editor'), { target: { value: '# hand edited' } })

    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(await screen.findByText('AI summary added')).toBeInTheDocument()
  })
})
