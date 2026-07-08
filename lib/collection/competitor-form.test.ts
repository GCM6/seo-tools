import { describe, it, expect, vi } from 'vitest'
import type { SeedSerpEntry } from '@/lib/dataforseo/types'
import type { LightCheckPage } from '@/lib/crawl/light-check'
import {
  selectCompetitorFormTargets,
  inferPageType,
  deriveContentForm,
  summarizeCompetitorForm,
  collectCompetitorForm,
  type CompetitorFormTarget,
} from './competitor-form'

const item = (domain: string, url: string, rank: number, title = 't') => ({ domain, url, rank, title, type: 'organic' })
const entry = (keyword: string, items: SeedSerpEntry['items']): SeedSerpEntry => ({ keyword, items })

const page = (o: Omit<Partial<LightCheckPage>, 'extra'> & { extra?: Partial<LightCheckPage['extra']> }): LightCheckPage => ({
  url: 'https://c.com/p', finalUrl: 'https://c.com/p', httpStatus: 200, title: 'T',
  canonicalUrl: null, metaRobots: null, mainTextChars: 1000, contentHash: 'h', internalLinks: [],
  checkStatus: 'checked', errorReason: null,
  ...o,
  extra: {
    hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 0, tableCount: 0,
    avgParagraphLen: 0, h2QuestionRate: 0, isHttps: true, mixedContentCount: 0, redirected: false,
    ...(o.extra ?? {}),
  },
})

describe('selectCompetitorFormTargets', () => {
  const serp: SeedSerpEntry[] = [
    entry('widget', [item('own.com', 'https://own.com/a', 1), item('acme.com', 'https://acme.com/w', 3), item('acme.com', 'https://acme.com/w2', 5)]),
    entry('gadget', [item('other.com', 'https://other.com/g', 1), item('acme.com', 'https://acme.com/g', 2)]),
  ]
  it('逐词取确认竞品最高排名 item（rank 最小）', () => {
    const t = selectCompetitorFormTargets(serp, ['acme.com'])
    expect(t).toEqual([
      { keyword: 'widget', url: 'https://acme.com/w', domain: 'acme.com' },
      { keyword: 'gadget', url: 'https://acme.com/g', domain: 'acme.com' },
    ])
  })
  it('排除非确认域', () => {
    expect(selectCompetitorFormTargets(serp, ['nope.com'])).toEqual([])
  })
  it('按 url 去重', () => {
    const dup = [entry('a', [item('acme.com', 'https://acme.com/x', 1)]), entry('b', [item('acme.com', 'https://acme.com/x', 1)])]
    expect(selectCompetitorFormTargets(dup, ['acme.com'])).toHaveLength(1)
  })
  it('截断 cap', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry(`k${i}`, [item('acme.com', `https://acme.com/${i}`, 1)]))
    expect(selectCompetitorFormTargets(many, ['acme.com'], 5)).toHaveLength(5)
  })
})

describe('inferPageType', () => {
  it('问答 H2 密集 → faq', () => expect(inferPageType({ h2QuestionRate: 0.4, listCount: 9, mainTextChars: 9999 })).toBe('faq'))
  it('列表多 → listicle', () => expect(inferPageType({ h2QuestionRate: 0, listCount: 6, mainTextChars: 100 })).toBe('listicle'))
  it('长文 → article', () => expect(inferPageType({ h2QuestionRate: 0, listCount: 1, mainTextChars: 3000 })).toBe('article'))
  it('否则 page', () => expect(inferPageType({ h2QuestionRate: 0, listCount: 1, mainTextChars: 500 })).toBe('page'))
})

describe('deriveContentForm', () => {
  it('从 LightCheckPage 组信号', () => {
    const target: CompetitorFormTarget = { keyword: 'widget', url: 'https://acme.com/w', domain: 'acme.com' }
    const s = deriveContentForm(target, page({ title: 'Best Widgets', mainTextChars: 3200, extra: { listCount: 6, tableCount: 1, h2QuestionRate: 0.1 } }))
    expect(s).toMatchObject({ keyword: 'widget', domain: 'acme.com', title: 'Best Widgets', pageType: 'listicle', mainTextChars: 3200, listCount: 6, tableCount: 1 })
  })
})

describe('summarizeCompetitorForm', () => {
  it('空 → 空串', () => expect(summarizeCompetitorForm([])).toBe(''))
  it('拼接每条形态', () => {
    const s = summarizeCompetitorForm([
      { keyword: 'widget', domain: 'acme.com', url: 'u', title: 'Best Widgets', pageType: 'listicle', mainTextChars: 3200, listCount: 6, tableCount: 1, h2QuestionRate: 0.1 },
    ])
    expect(s).toContain('acme.com')
    expect(s).toContain('榜单型')
    expect(s).toContain('3200')
  })
})

describe('collectCompetitorForm', () => {
  const targets: CompetitorFormTarget[] = [
    { keyword: 'a', url: 'https://acme.com/a', domain: 'acme.com' },
    { keyword: 'b', url: 'https://acme.com/b', domain: 'acme.com' },
  ]
  it('仅成功页派生信号，error/4xx 跳过', async () => {
    const fetchLightCheck = vi.fn(async (url: string) =>
      url.endsWith('/a')
        ? page({ url, mainTextChars: 3000 })
        : page({ url, httpStatus: 404, checkStatus: 'checked' }),
    )
    const signals = await collectCompetitorForm(targets, { fetchLightCheck })
    expect(signals).toHaveLength(1)
    expect(signals[0].keyword).toBe('a')
  })
  it('非法 url 跳过不抛', async () => {
    const fetchLightCheck = vi.fn(async () => page({}))
    const signals = await collectCompetitorForm([{ keyword: 'x', url: 'not a url', domain: 'd' }], { fetchLightCheck })
    expect(signals).toHaveLength(0)
    expect(fetchLightCheck).not.toHaveBeenCalled()
  })
})
