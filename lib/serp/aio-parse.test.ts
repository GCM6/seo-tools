import { describe, it, expect } from 'vitest'
import { parseAioResult, AIO_PARSER_VERSION } from './aio-parse'

describe('parseAioResult', () => {
  it('AIO 不存在：targetDomainCited 恒 false，citedUrls 为空', () => {
    const result = parseAioResult({ aioPresent: false, references: [{ domain: 'example.com', url: 'https://example.com/x', title: null, source: null, text: null }], domain: 'example.com' })
    expect(result.aioPresent).toBe(false)
    expect(result.targetDomainCited).toBe(false)
    expect(result.citedUrls).toEqual(['https://example.com/x']) // citedUrls 原样透传引用 URL，即便本次未展示 AIO
  })

  it('AIO 存在且 references 命中目标域名（含子域）：targetDomainCited 为 true', () => {
    const result = parseAioResult({
      aioPresent: true,
      references: [{ domain: 'blog.example.com', url: 'https://blog.example.com/post', title: null, source: null, text: null }],
      domain: 'example.com',
    })
    expect(result.targetDomainCited).toBe(true)
  })

  it('AIO 存在但 references 全是第三方域名：targetDomainCited 为 false', () => {
    const result = parseAioResult({
      aioPresent: true,
      references: [{ domain: 'other.com', url: 'https://other.com/review', title: null, source: null, text: null }],
      domain: 'example.com',
    })
    expect(result.targetDomainCited).toBe(false)
    expect(result.citedUrls).toEqual(['https://other.com/review'])
  })

  it('references 里 url 为 null 或畸形：忽略该条，不抛错', () => {
    const result = parseAioResult({
      aioPresent: true,
      references: [
        { domain: null, url: null, title: null, source: null, text: null },
        { domain: 'example.com', url: 'not a url', title: null, source: null, text: null },
      ],
      domain: 'example.com',
    })
    expect(result.targetDomainCited).toBe(false)
    expect(result.citedUrls).toEqual(['not a url']) // 畸形 URL 仍原样收进 citedUrls，只是不参与域名匹配
  })

  it('PROBE_PARSER_VERSION 风格：升版本号有留痕', () => {
    expect(AIO_PARSER_VERSION).toBe('v1')
  })
})
