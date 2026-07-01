import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NewAnalysisForm } from './NewAnalysisForm'
import zhMessages from '@/messages/zh.json'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

function renderForm() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <NewAnalysisForm locale="zh" />
    </NextIntlClientProvider>,
  )
}

describe('NewAnalysisForm submit', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        if (url === '/api/runs') return new Response(JSON.stringify({ id: 'run_y' }), { status: 201 })
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
  })

  it('creates a project then a run, and navigates to the new run', async () => {
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_y'))

    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0][0]).toBe('/api/projects')
    expect(calls[1][0]).toBe('/api/runs')
    expect(JSON.parse(calls[1][1]?.body as string)).toMatchObject({ projectId: 'proj_x', runType: 'baseline' })
  })

  it('shows an error message when project creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'domain_required' }), { status: 422 })))
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))
    await waitFor(() => expect(screen.getByText('创建分析失败，请重试。')).toBeInTheDocument())
    expect(pushMock).not.toHaveBeenCalled()
  })
})
