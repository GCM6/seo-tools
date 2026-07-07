import { describe, it, expect, vi, beforeEach } from 'vitest'

const saved: { key: string; value: string }[] = []
const deleted: string[] = []
vi.mock('@/lib/repositories', () => ({
  setProviderCredential: async (key: string, value: string) => { saved.push({ key, value }) },
  deleteProviderCredential: async (key: string) => { deleted.push(key) },
}))

const { POST, DELETE } = await import('./route')

function req(method: string, body: unknown) {
  return new Request('http://x/api/credentials', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('/api/credentials', () => {
  beforeEach(() => { saved.length = 0; deleted.length = 0 })

  it('缺 key → 422', async () => {
    expect((await POST(req('POST', { value: 'x' }))).status).toBe(422)
  })
  it('未知键 → 422 unknown_credential_key', async () => {
    const res = await POST(req('POST', { credentialKey: 'HACK', value: 'x' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('unknown_credential_key')
  })
  it('缺 value → 422', async () => {
    expect((await POST(req('POST', { credentialKey: 'OPENAI_API_KEY' }))).status).toBe(422)
  })
  it('合法 → 保存（trim）', async () => {
    const res = await POST(req('POST', { credentialKey: 'OPENAI_API_KEY', value: ' sk ' }))
    expect(res.status).toBe(200)
    expect(saved).toEqual([{ key: 'OPENAI_API_KEY', value: 'sk' }])
  })
  it('DELETE 合法键 → 删除', async () => {
    const res = await DELETE(req('DELETE', { credentialKey: 'GEMINI_API_KEY' }))
    expect(res.status).toBe(200)
    expect(deleted).toEqual(['GEMINI_API_KEY'])
  })
})
