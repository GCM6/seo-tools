import { describe, it, expect, vi } from 'vitest'
import { fetchDataforseoUserData } from './user-data'
import { DFS_401_BODY, DFS_USER_DATA_SAMPLE } from '@/lib/test-fixtures/real-shapes'

const reply = (status: number, body: string) => vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } }))

describe('fetchDataforseoUserData（预检用免费账户信息接口，SP-A §4.5）', () => {
  it('GET /v3/appendix/user_data，带 Basic auth；余额取 tasks[0].result[0].money.balance', async () => {
    const fetchImpl = reply(200, DFS_USER_DATA_SAMPLE)
    const r = await fetchDataforseoUserData({ login: 'u', password: 'p' }, fetchImpl as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, balance: 12.34 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.dataforseo.com/v3/appendix/user_data')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('u:p')}`)
  })
  it('凭据被拒（真实 401 形态）→ { ok:false, status:401, reason:http_401 }', async () => {
    expect(await fetchDataforseoUserData({ login: 'u', password: 'bad' }, reply(401, DFS_401_BODY) as unknown as typeof fetch)).toEqual({ ok: false, status: 401, reason: 'http_401' })
  })
  it('网络错误 → { ok:false, status:null, reason:network_error }', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await fetchDataforseoUserData({ login: 'u', password: 'p' }, fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, status: null, reason: 'network_error' })
  })
  it('200 但余额字段缺失 → ok、balance 为 null（不编造 0）', async () => {
    const body = JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ money: {} }] }] })
    expect(await fetchDataforseoUserData({ login: 'u', password: 'p' }, reply(200, body) as unknown as typeof fetch)).toEqual({ ok: true, balance: null })
  })
})
