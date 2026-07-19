import { describe, it, expect, vi } from 'vitest'
import { createAioSerpProvider, isAioConfigured, createAioSerpProviderFromEnv } from './dataforseo'

// 响应 fixture 形状对齐官方文档摘录（交付报告附来源 URL）：
// items[] 里 type='ai_overview'，markdown 为整体摘要，references[] 为引用来源
// （source/domain/url/title/text），asynchronous_ai_overview 标记本次是否已完整展开。
function envelope(items: unknown[]) {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    tasks: [
      {
        status_code: 20000,
        status_message: 'Ok.',
        result: [{ keyword: 'best crm software', items }],
      },
    ],
  }
}

const AI_OVERVIEW_ITEM = {
  type: 'ai_overview',
  asynchronous_ai_overview: false,
  markdown: '## Best CRM software\nSeveral options exist...',
  items: [{ type: 'ai_overview_element', text: 'Several options exist', title: null }],
  references: [
    { source: 'Example', domain: 'example.com', url: 'https://example.com/crm-guide', title: 'CRM guide', text: 'Example text' },
    { source: 'Other', domain: 'other.com', url: 'https://other.com/review', title: 'Review', text: 'Other text' },
  ],
}

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
}

describe('createAioSerpProvider', () => {
  it('isConfigured() 为 false 当 login/password 缺失', () => {
    const provider = createAioSerpProvider({ login: '', password: '', fetchImpl: fakeFetch(envelope([])) })
    expect(provider.isConfigured()).toBe(false)
  })

  it('未配置时 fetchAioForKeyword 直接抛错，不发请求', async () => {
    const fetchImpl = fakeFetch(envelope([]))
    const provider = createAioSerpProvider({ login: '', password: '', fetchImpl })
    await expect(provider.fetchAioForKeyword('x', { locationCode: 2840, languageCode: 'en' })).rejects.toThrow(
      'dataforseo_aio_not_configured',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('解析 ai_overview 存在的响应：markdown/references/asynchronous 均正确提取', async () => {
    const fetchImpl = fakeFetch(envelope([AI_OVERVIEW_ITEM]))
    const provider = createAioSerpProvider({ login: 'l', password: 'p', fetchImpl })
    const result = await provider.fetchAioForKeyword('best crm software', { locationCode: 2840, languageCode: 'en' })

    expect(result.aioPresent).toBe(true)
    expect(result.asynchronous).toBe(false)
    expect(result.answerMarkdown).toBe('## Best CRM software\nSeveral options exist...')
    expect(result.references).toEqual([
      { source: 'Example', domain: 'example.com', url: 'https://example.com/crm-guide', title: 'CRM guide', text: 'Example text' },
      { source: 'Other', domain: 'other.com', url: 'https://other.com/review', title: 'Review', text: 'Other text' },
    ])

    // 请求体核实：keyword/location_code/language_code/load_async_ai_overview 四个字段。
    const call = fetchImpl.mock.calls[0]
    expect(call[0]).toBe('https://api.dataforseo.com/v3/serp/google/organic/live/advanced')
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body).toEqual([{ keyword: 'best crm software', location_code: 2840, language_code: 'en', load_async_ai_overview: true }])
  })

  it('响应无 ai_overview 条目（普通 SERP）：aioPresent 为 false，references 为空', async () => {
    const fetchImpl = fakeFetch(envelope([{ type: 'organic', domain: 'x.com', url: 'https://x.com', rank_absolute: 1 }]))
    const provider = createAioSerpProvider({ login: 'l', password: 'p', fetchImpl })
    const result = await provider.fetchAioForKeyword('foo', { locationCode: 2840, languageCode: 'en' })
    expect(result.aioPresent).toBe(false)
    expect(result.answerMarkdown).toBeNull()
    expect(result.references).toEqual([])
  })

  it('asynchronous_ai_overview=true：present 仍为 true 但标记未完整展开', async () => {
    const fetchImpl = fakeFetch(envelope([{ ...AI_OVERVIEW_ITEM, asynchronous_ai_overview: true, references: [] }]))
    const provider = createAioSerpProvider({ login: 'l', password: 'p', fetchImpl })
    const result = await provider.fetchAioForKeyword('foo', { locationCode: 2840, languageCode: 'en' })
    expect(result.aioPresent).toBe(true)
    expect(result.asynchronous).toBe(true)
  })

  it('HTTP 错误：抛错（复用 lib/dataforseo/client.ts 的错误分型，未配置 vs HTTP 失败 vs 余额不足）', async () => {
    const fetchImpl = fakeFetch({}, 500)
    const provider = createAioSerpProvider({ login: 'l', password: 'p', fetchImpl })
    await expect(provider.fetchAioForKeyword('foo', { locationCode: 2840, languageCode: 'en' })).rejects.toThrow(
      'dataforseo request failed: 500',
    )
  })

  it('信封级错误（如余额不足）：status_code>=40000 抛错', async () => {
    const fetchImpl = fakeFetch({ status_code: 40201, status_message: 'Insufficient funds.', tasks: [] })
    const provider = createAioSerpProvider({ login: 'l', password: 'p', fetchImpl })
    await expect(provider.fetchAioForKeyword('foo', { locationCode: 2840, languageCode: 'en' })).rejects.toThrow(/40201/)
  })
})

describe('isAioConfigured / createAioSerpProviderFromEnv', () => {
  it('env 两个 key 均存在才算已配置', () => {
    expect(isAioConfigured({ DATAFORSEO_LOGIN: 'l', DATAFORSEO_PASSWORD: 'p' })).toBe(true)
    expect(isAioConfigured({ DATAFORSEO_LOGIN: 'l' })).toBe(false)
    expect(isAioConfigured({})).toBe(false)
  })

  it('createAioSerpProviderFromEnv 反映当前 env', () => {
    const prev = { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }
    process.env.DATAFORSEO_LOGIN = ''
    process.env.DATAFORSEO_PASSWORD = ''
    expect(createAioSerpProviderFromEnv().isConfigured()).toBe(false)
    process.env.DATAFORSEO_LOGIN = prev.login
    process.env.DATAFORSEO_PASSWORD = prev.password
  })
})
