import { describe, it, expect, vi } from 'vitest'
import { createOpenAiProbeProvider } from './openai'
import { createPerplexityProbeProvider } from './perplexity'
import { createGeminiProbeProvider } from './gemini'

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
    expect(answer.webSearchEnabled).toBe(true)
    expect(answer.rawResponse).toEqual(openaiBody)
  })

  it('throws with provider and status on non-2xx', async () => {
    const p = createOpenAiProbeProvider({ apiKey: 'sk-x', fetchImpl: vi.fn(async () => jsonResponse({}, 429)) })
    await expect(p.ask('q')).rejects.toThrow('openai probe failed: 429')
  })
})

describe('Perplexity probe provider', () => {
  it('calls chat completions and parses content + citations (both shapes)', async () => {
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
    expect(answer.citedUrls).toEqual(['https://a.com/1', 'https://b.com/2'])
    expect(answer.webSearchEnabled).toBe(true)
  })

  it('is unconfigured without an api key', () => {
    expect(createPerplexityProbeProvider({ apiKey: '' }).isConfigured()).toBe(false)
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
  })

  it('is unconfigured without an api key', () => {
    expect(createGeminiProbeProvider({ apiKey: '' }).isConfigured()).toBe(false)
  })
})
