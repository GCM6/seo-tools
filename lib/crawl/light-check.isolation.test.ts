import { describe, it, expect, vi } from 'vitest'

// 抽取器隔离（第三轮独立审查 P0-1）：附加抽取器抛错不能把整页变成抓取错误、丢掉出链。
vi.mock('./article-signals', () => ({
  extractArticleSignals: () => {
    throw new URIError('URI malformed')
  },
}))

const { parseLightCheckHtml } = await import('./light-check')

describe('文章信号抽取器抛错时', () => {
  it('页面照常解析：出链保留，article 字段为空', () => {
    const out = parseLightCheckHtml('<html><body><a href="/a">a</a></body></html>', 'https://example.com/', 'example.com')
    expect(out.internalLinks).toEqual(['https://example.com/a'])
    expect(out.extra.article).toBeUndefined()
  })
})
