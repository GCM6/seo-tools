import { describe, it, expect, vi } from 'vitest'

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }))
vi.mock('@/lib/runs/preflight-probe', () => ({ probePreflight: probeMock, defaultPreflightDeps: {} }))

const { POST } = await import('./route')
const call = (id: string) => POST(new Request(`http://x/api/projects/${id}/preflight`, { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/projects/[id]/preflight（SP-A §4.5）', () => {
  it('项目不存在 → 404 not_found', async () => {
    probeMock.mockResolvedValueOnce(null)
    const res = await call('nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('返回预检项清单（纯逻辑 buildPreflight 的结果）', async () => {
    probeMock.mockResolvedValueOnce({
      categoryValid: true, marketValid: true,
      gsc: { platformConfigured: true, connected: true, siteSelected: true, tokenOk: false, tokenError: 'invalid_grant' },
      dataforseo: { hasCredentials: true, authOk: true, balance: 12.34 },
      psi: { hasKey: false }, render: { configured: true },
      ai: { engines: [{ provider: 'deepseek', webSearch: false }] },
    })
    const res = await call('proj_1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: { source: string; state: string; reason: string | null }[] }
    expect(body.items.map((i) => [i.source, i.state, i.reason])).toEqual([
      ['project', 'ready', null],
      ['gsc', 'unavailable', 'gsc_token_invalid'],
      ['dataforseo', 'ready', null],
      ['psi', 'degraded', 'psi_no_key'],
      ['render', 'ready', null],
      ['ai_probe', 'degraded', 'ai_memory_only'],
    ])
    expect(probeMock).toHaveBeenCalledWith('proj_1', expect.anything())
  })
})
