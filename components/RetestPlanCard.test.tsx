import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import zhMessages from '@/messages/zh.json'

// RetestPlanCard 是 async Server Component（顶层 `await getTranslations(...)`），照抄
// components/ReportView.test.tsx 已验证过的先例：先 `await Component(props)` 拿到已解析的
// element 再 render，而不是把 async 组件直接丢进 render()（React 19 client renderer 不支持）。
function resolveMessage(namespace: string, key: string, vars?: Record<string, unknown>): string {
  const path = [...namespace.split('.'), ...key.split('.')]
  let node: unknown = zhMessages
  for (const p of path) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string, vars?: Record<string, unknown>) =>
    resolveMessage(namespace, key, vars),
}))

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

import { RetestPlanCard } from './RetestPlanCard'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  pushMock.mockClear()
})

describe('RetestPlanCard', () => {
  it('有到期日期时展示日期与口径说明，且渲染发起复测按钮', async () => {
    const element = await RetestPlanCard({
      runId: 'run_1',
      locale: 'zh',
      dueAt: '2026-08-16T00:00:00.000Z',
      appliedDone: 2,
      appliedTotal: 3,
      retestReady: false,
    })
    render(element)

    expect(screen.getByText('2026-08-16')).toBeInTheDocument()
    // 口径说明：明确交代"每次标记执行都会顺延"，不是静默行为。
    expect(screen.getByText(/每次标记执行都会把复测日期顺延至该次执行后 28 天/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发起回测' })).toBeInTheDocument()
    // 手动调整入口的偏离说明必须出现（本次降级为只读）。
    expect(screen.getByText(/手动调整到期日期暂不支持/)).toBeInTheDocument()
  })

  it('尚无到期日期时展示空态文案而不是空白', async () => {
    const element = await RetestPlanCard({
      runId: 'run_1',
      locale: 'zh',
      dueAt: null,
      appliedDone: 0,
      appliedTotal: 3,
      retestReady: false,
    })
    render(element)

    expect(screen.getByText('尚未安排复测（暂无标记已执行的建议）')).toBeInTheDocument()
  })

  it('点击发起复测按钮会 POST 到 /api/runs/{runId}/retest（复用 RetestButton 既有契约）', async () => {
    global.fetch = vi.fn(async () => ({
      status: 201,
      ok: true,
      json: async () => ({ retest: { id: 'run_new' } }),
    })) as unknown as typeof fetch

    const element = await RetestPlanCard({
      runId: 'run_1',
      locale: 'zh',
      dueAt: '2026-08-16T00:00:00.000Z',
      appliedDone: 3,
      appliedTotal: 3,
      retestReady: true,
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/runs/run_1/retest', { method: 'POST' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_new'))
  })
})
