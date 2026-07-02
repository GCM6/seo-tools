import { describe, it, expect } from 'vitest'
import { clusterTemplates, selectRepresentative, planTemplates } from './template-cluster'

describe('clusterTemplates', () => {
  it('数字段→{id}、uuid→{uuid}、日期→{date}', () => {
    const out = clusterTemplates([
      'https://a.com/products/123',
      'https://a.com/products/456',
      'https://a.com/e/0f8fad5b-d9cb-469f-a165-70867728950e',
      'https://a.com/blog/2026/07',
    ])
    const patterns = out.map((c) => c.pattern).sort()
    expect(patterns).toContain('/products/{id}')
    expect(patterns).toContain('/e/{uuid}')
    expect(patterns).toContain('/blog/{date}/{date}')
    expect(out.find((c) => c.pattern === '/products/{id}')!.urls).toHaveLength(2)
  })

  it('同父路径 ≥3 个不同字面尾段聚为 {slug}，低基数导航页不聚', () => {
    const out = clusterTemplates([
      'https://a.com/docs/install',
      'https://a.com/docs/config',
      'https://a.com/docs/deploy',
      'https://a.com/about',
      'https://a.com/pricing',
    ])
    const patterns = out.map((c) => c.pattern)
    expect(patterns).toContain('/docs/{slug}')
    expect(patterns).toContain('/about')
    expect(patterns).toContain('/pricing')
  })

  it('多语言前缀保持字面段；入口页永远单独成组', () => {
    const out = clusterTemplates(
      ['https://a.com/', 'https://a.com/en/p1', 'https://a.com/en/p2', 'https://a.com/en/p3', 'https://a.com/zh/p1'],
      'https://a.com/',
    )
    const patterns = out.map((c) => c.pattern)
    expect(patterns).toContain('/')
    expect(patterns).toContain('/en/{slug}')
    expect(patterns).toContain('/zh/p1')
  })
})

describe('selectRepresentative', () => {
  it('取 200 且 checked 页面中 mainTextChars 的中位页', () => {
    const url = selectRepresentative([
      { url: 'u1', mainTextChars: 10, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u2', mainTextChars: 500, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u3', mainTextChars: 9000, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u4', mainTextChars: 99999, httpStatus: 404, checkStatus: 'checked' },
    ])
    expect(url).toBe('u2')
  })
  it('无健康页时回退第一个候选，空数组返回 null', () => {
    expect(selectRepresentative([{ url: 'u1', mainTextChars: 0, httpStatus: 500, checkStatus: 'checked' }])).toBe('u1')
    expect(selectRepresentative([])).toBeNull()
  })
})

describe('planTemplates', () => {
  it('输出 pattern/pageUrls/representativeUrl 三元组', () => {
    const plans = planTemplates(
      [
        { url: 'https://a.com/p/1', mainTextChars: 100, httpStatus: 200, checkStatus: 'checked' },
        { url: 'https://a.com/p/2', mainTextChars: 300, httpStatus: 200, checkStatus: 'checked' },
      ],
      'https://a.com/',
    )
    expect(plans).toEqual([
      { pattern: '/p/{id}', pageUrls: ['https://a.com/p/1', 'https://a.com/p/2'], representativeUrl: 'https://a.com/p/1' },
    ])
  })
})
