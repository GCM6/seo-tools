import { describe, it, expect } from 'vitest'
import { okResult, failResult, readRaw, reasonOf } from './result'
import { DataforseoTaskError } from '@/lib/dataforseo/client'

describe('CollectResult（SP-A §4.1：失败必须带原因，绝不收敛成 0/空/collected）', () => {
  it('readRaw 原样保留状态码、content-type 与 body', async () => {
    const raw = await readRaw(new Response('{"a":1}', { status: 429, headers: { 'content-type': 'application/json' } }))
    expect(raw).toEqual({ status: 429, contentType: 'application/json', body: '{"a":1}' })
  })

  it('okResult / failResult 形状', () => {
    expect(okResult(1)).toEqual({ ok: true, value: 1, raw: null })
    expect(failResult('http_403', 403)).toEqual({ ok: false, httpStatus: 403, reason: 'http_403', raw: null })
  })

  it('reasonOf：任务级错误 → task_<code>；HTTP 失败 → http_<status>；其他 → network_error', () => {
    expect(reasonOf(new DataforseoTaskError(40101, 'x'))).toBe('task_40101')
    expect(reasonOf(new Error('dataforseo request failed: 402'))).toBe('http_402')
    expect(reasonOf(new Error('gsc search analytics failed: 403 forbidden'))).toBe('http_403')
    expect(reasonOf(new Error('fetch failed'))).toBe('network_error')
    expect(reasonOf('weird')).toBe('network_error')
  })
  it('reasonOf：错误对象自带字符串 reason 时以它为准（如 CSE 返回非 JSON → invalid_json）', () => {
    expect(reasonOf(Object.assign(new Error('Google Custom Search failed: invalid_json'), { reason: 'invalid_json' }))).toBe('invalid_json')
  })
})
