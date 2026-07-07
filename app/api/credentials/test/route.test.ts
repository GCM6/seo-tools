import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/credentials/test-connection', () => ({
  testCredentialConnection: async (_key: string, value: string) =>
    value === 'good' ? { ok: true } : { ok: false, error: 'auth_failed' },
}))

const { POST } = await import('./route')
const req = (body: unknown) =>
  new Request('http://x/api/credentials/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/credentials/test', () => {
  it('缺字段 → 422', async () => {
    expect((await POST(req({ credentialKey: 'OPENAI_API_KEY' }))).status).toBe(422)
  })
  it('转发测连接结果 ok', async () => {
    expect(await (await POST(req({ credentialKey: 'OPENAI_API_KEY', value: 'good' }))).json()).toEqual({ ok: true })
  })
  it('转发失败原因', async () => {
    expect(await (await POST(req({ credentialKey: 'OPENAI_API_KEY', value: 'bad' }))).json()).toEqual({ ok: false, error: 'auth_failed' })
  })
})
