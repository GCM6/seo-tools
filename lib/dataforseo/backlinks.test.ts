import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient } from './client'
import { backlinksSummary } from './backlinks'
import { reasonOf } from '@/lib/collection/result'

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const clientWith = (body: unknown) => createDataforseoClient({ login: 'u', password: 'p', fetchImpl: vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch })

describe('backlinksSummary', () => {
  it('映射引荐域 / 外链 / rank', async () => {
    const r = await backlinksSummary(clientWith({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ referring_domains: 12, backlinks: 340, rank: 210 }] }] }), 'example.com')
    expect(r).toMatchObject({ target: 'example.com', referringDomains: 12, backlinks: 340, rank: 210 })
  })
  it('任务成功但没有 result → 抛错 empty_result，不编成"0 引荐域 / 0 外链"（第二波审查 C1）', async () => {
    expect(reasonOf(await backlinksSummary(clientWith({ status_code: 20000, tasks: [{ status_code: 20000, result: null }] }), 'example.com').catch((e: unknown) => e))).toBe('empty_result')
  })
})

describe('任务成功、JSON 合法但缺计数字段（最终审查 F1-1）', () => {
  it('result 为 [{}] → 抛错 invalid_shape（不是"0 引荐域 / 0 外链"）', async () => {
    expect(reasonOf(await backlinksSummary(clientWith({ status_code: 20000, tasks: [{ status_code: 20000, result: [{}] }] }), 'example.com').catch((e: unknown) => e))).toBe('invalid_shape')
  })
  it('计数字段是数字 0（真没有外链）→ 照常返回 0', async () => {
    const r = await backlinksSummary(clientWith({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ referring_domains: 0, backlinks: 0, rank: 0 }] }] }), 'example.com')
    expect(r).toMatchObject({ referringDomains: 0, backlinks: 0 })
  })
})
