import { describe, it, expect, vi } from 'vitest'
import { createOpenAiProbeProvider } from './openai'
import { createPerplexityProbeProvider } from './perplexity'
import { createGeminiProbeProvider } from './gemini'
import { createDeepseekProbeProvider } from './deepseek'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('OpenAI probe provider', () => {
  const openaiBody = {
    output: [
      { type: 'web_search_call', id: 'ws_1' },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'Metadocu is a docs tool.',
            annotations: [{ type: 'url_citation', url: 'https://metadocu.com/' }],
          },
        ],
      },
    ],
  }

  it('is unconfigured without an api key and refuses to ask', async () => {
    const p = createOpenAiProbeProvider({ apiKey: '' })
    expect(p.isConfigured()).toBe(false)
    await expect(p.ask('q')).rejects.toThrow('openai_not_configured')
  })

  it('calls the Responses API with web_search enabled and parses text + citations', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(openaiBody))
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: fetchMock })
    const answer = await p.ask('best docs tool?')

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-x')
    const body = JSON.parse(init.body as string)
    expect(body.input).toBe('best docs tool?')
    expect(body.tools).toEqual([{ type: 'web_search' }])
    expect(body.model).toBe(p.modelId)

    expect(answer.answerText).toBe('Metadocu is a docs tool.')
    expect(answer.citedUrls).toEqual(['https://metadocu.com/'])
    expect(answer.retrievedUrls).toEqual([])
    expect(answer.webSearchEnabled).toBe(true)
    expect(answer.rawResponse).toEqual(openaiBody)
    // 有检索证据：output 里出现 web_search_call 工具调用项 + url_citation 标注
    expect(answer.searchEvidenceObserved).toBe(true)
  })

  it('observes no search evidence when the response has a plain message with no annotations or tool calls', async () => {
    const body = {
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'Metadocu is a docs tool.' }] },
      ],
    }
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: vi.fn(async () => jsonResponse(body)) })
    const answer = await p.ask('q')
    expect(answer.answerText).toBe('Metadocu is a docs tool.')
    expect(answer.citedUrls).toEqual([])
    // 结构正常、回答正常，只是这次确实没有检索/引用痕迹——不能因此判定"没联网"
    expect(answer.searchEvidenceObserved).toBe(false)
  })

  it('throws with provider and status on non-2xx', async () => {
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: vi.fn(async () => jsonResponse({}, 429)) })
    await expect(p.ask('q')).rejects.toThrow('openai probe failed: 429')
  })

  it('flags protocol_mismatch when HTTP 200 but output is missing entirely', async () => {
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: vi.fn(async () => jsonResponse({ unexpected: 'shape' })) })
    await expect(p.ask('q')).rejects.toThrow('openai_protocol_mismatch')
  })

  it('flags protocol_mismatch when output is structurally fine but parses to an empty answer', async () => {
    const body = { output: [{ type: 'message', content: [] }] }
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: vi.fn(async () => jsonResponse(body)) })
    await expect(p.ask('q')).rejects.toThrow('openai_protocol_mismatch')
  })
})

describe('Perplexity probe provider', () => {
  it('splits citations[] (cited, "有依据") from search_results[].url (retrieved-only, weaker)', async () => {
    const body = {
      choices: [{ message: { content: '试试 Notion 或 Metadocu。' } }],
      citations: ['https://a.com/1'],
      search_results: [{ url: 'https://b.com/2' }],
    }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    const answer = await p.ask('文档工具推荐？')

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe('https://api.perplexity.ai/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer pplx-x')
    const reqBody = JSON.parse(init.body as string)
    expect(reqBody.messages).toEqual([{ role: 'user', content: '文档工具推荐？' }])

    expect(answer.answerText).toBe('试试 Notion 或 Metadocu。')
    // 拆分后：citations[] 只进 citedUrls，search_results[].url 只进 retrievedUrls——
    // 此前两者被压平合并进同一个 citedUrls，导致 targetDomainCited/grounded 判定虚高（本次修复目的）。
    expect(answer.citedUrls).toEqual(['https://a.com/1'])
    expect(answer.retrievedUrls).toEqual(['https://b.com/2'])
    expect(answer.webSearchEnabled).toBe(true)
    // 有检索证据：citations 字段出现
    expect(answer.searchEvidenceObserved).toBe(true)
  })

  it('observes search evidence from an empty-but-present citations/search_results field (field presence, not array length)', async () => {
    const body = {
      choices: [{ message: { content: '没有找到相关引用。' } }],
      citations: [] as string[],
      search_results: [] as { url?: string }[],
    }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    const answer = await p.ask('q')
    // 空数组仍是"引擎回应了这个结构"的证据，不等于字段缺失
    expect(answer.searchEvidenceObserved).toBe(true)
    expect(answer.citedUrls).toEqual([])
  })

  it('observes no search evidence when citations/search_results fields are entirely absent', async () => {
    const body = { choices: [{ message: { content: '没有找到相关引用。' } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    const answer = await p.ask('q')
    expect(answer.searchEvidenceObserved).toBe(false)
  })

  it('flags protocol_mismatch when HTTP 200 but choices is missing entirely', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unexpected: 'shape' }))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    await expect(p.ask('q')).rejects.toThrow('perplexity_protocol_mismatch')
  })

  it('flags protocol_mismatch when message content is an empty string', async () => {
    const body = { choices: [{ message: { content: '' } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    await expect(p.ask('q')).rejects.toThrow('perplexity_protocol_mismatch')
  })

  it('dedupes: a URL present in both citations[] and search_results[] counts only as cited', async () => {
    const body = {
      choices: [{ message: { content: 'x' } }],
      citations: ['https://a.com/1'],
      search_results: [{ url: 'https://a.com/1' }, { url: 'https://c.com/3' }],
    }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createPerplexityProbeProvider({ apiKey: 'pplx-x', fetchImpl: fetchMock })
    const answer = await p.ask('q')

    expect(answer.citedUrls).toEqual(['https://a.com/1'])
    // 重叠 URL 不重复计入 retrievedUrls（否则同一 URL 会同时算"有依据"和"仅检索到"）。
    expect(answer.retrievedUrls).toEqual(['https://c.com/3'])
  })

  it('is unconfigured without an api key', () => {
    expect(createPerplexityProbeProvider({ apiKey: '' }).isConfigured()).toBe(false)
  })
})

describe('DeepSeek probe provider', () => {
  it('calls the OpenAI-compatible chat completions endpoint and parses content', async () => {
    const body = { choices: [{ message: { content: '推荐 Metadocu 和 Notion。' } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createDeepseekProbeProvider({ apiKey: 'ds-x', fetchImpl: fetchMock })
    const answer = await p.ask('文档工具推荐？')

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer ds-x')
    const reqBody = JSON.parse(init.body as string)
    expect(reqBody.model).toBe(p.modelId)
    expect(reqBody.messages).toEqual([{ role: 'user', content: '文档工具推荐？' }])

    expect(answer.answerText).toBe('推荐 Metadocu 和 Notion。')
    // DeepSeek 开放 API 无联网搜索：无引用，协议如实记 web_search_enabled=false
    expect(answer.citedUrls).toEqual([])
    expect(answer.retrievedUrls).toEqual([])
    expect(answer.webSearchEnabled).toBe(false)
    expect(p.webSearchEnabled).toBe(false)
    // DeepSeek 开放 API 无联网搜索结构，恒 false——即便这条回答结构完全正常
    expect(answer.searchEvidenceObserved).toBe(false)
  })

  it('is unconfigured without an api key and refuses to ask', async () => {
    const p = createDeepseekProbeProvider({ apiKey: '' })
    expect(p.isConfigured()).toBe(false)
    await expect(p.ask('q')).rejects.toThrow('deepseek_not_configured')
  })

  it('throws with provider and status on non-2xx', async () => {
    const p = createDeepseekProbeProvider({ apiKey: 'ds-x', fetchImpl: vi.fn(async () => jsonResponse({}, 402)) })
    await expect(p.ask('q')).rejects.toThrow('deepseek probe failed: 402')
  })

  it('flags protocol_mismatch when HTTP 200 but choices is missing entirely', async () => {
    const p = createDeepseekProbeProvider({ apiKey: 'ds-x', fetchImpl: vi.fn(async () => jsonResponse({ unexpected: 'shape' })) })
    await expect(p.ask('q')).rejects.toThrow('deepseek_protocol_mismatch')
  })

  it('flags protocol_mismatch when message content is an empty string', async () => {
    const body = { choices: [{ message: { content: '' } }] }
    const p = createDeepseekProbeProvider({ apiKey: 'ds-x', fetchImpl: vi.fn(async () => jsonResponse(body)) })
    await expect(p.ask('q')).rejects.toThrow('deepseek_protocol_mismatch')
  })
})

describe('Gemini probe provider', () => {
  it('calls generateContent with google_search grounding and parses text + grounding uris', async () => {
    const body = {
      candidates: [
        {
          content: { parts: [{ text: '推荐 ' }, { text: 'Metadocu。' }] },
          groundingMetadata: { groundingChunks: [{ web: { uri: 'https://metadocu.com/blog' } }] },
        },
      ],
    }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createGeminiProbeProvider({ apiKey: 'g-x', fetchImpl: fetchMock })
    const answer = await p.ask('推荐文档工具')

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(String(url)).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${p.modelId}:generateContent`)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-x')
    const reqBody = JSON.parse(init.body as string)
    expect(reqBody.contents).toEqual([{ parts: [{ text: '推荐文档工具' }] }])
    expect(reqBody.tools).toEqual([{ google_search: {} }])

    expect(answer.answerText).toBe('推荐 Metadocu。')
    expect(answer.citedUrls).toEqual(['https://metadocu.com/blog'])
    expect(answer.retrievedUrls).toEqual([])
    // 有检索证据：groundingMetadata 结构出现
    expect(answer.searchEvidenceObserved).toBe(true)
  })

  it('observes no search evidence when groundingMetadata is entirely absent (structure normal otherwise)', async () => {
    const body = { candidates: [{ content: { parts: [{ text: '推荐 Metadocu。' }] } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createGeminiProbeProvider({ apiKey: 'g-x', fetchImpl: fetchMock })
    const answer = await p.ask('推荐文档工具')
    expect(answer.answerText).toBe('推荐 Metadocu。')
    expect(answer.searchEvidenceObserved).toBe(false)
  })

  it('is unconfigured without an api key', () => {
    expect(createGeminiProbeProvider({ apiKey: '' }).isConfigured()).toBe(false)
  })

  it('flags protocol_mismatch when HTTP 200 but candidates is missing entirely', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unexpected: 'shape' }))
    const p = createGeminiProbeProvider({ apiKey: 'g-x', fetchImpl: fetchMock })
    await expect(p.ask('q')).rejects.toThrow('gemini_protocol_mismatch')
  })

  it('flags protocol_mismatch when candidates is structurally fine but parses to an empty answer', async () => {
    const body = { candidates: [{ content: { parts: [] } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const p = createGeminiProbeProvider({ apiKey: 'g-x', fetchImpl: fetchMock })
    await expect(p.ask('q')).rejects.toThrow('gemini_protocol_mismatch')
  })
})
