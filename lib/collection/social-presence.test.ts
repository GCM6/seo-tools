import { describe, it, expect, vi } from 'vitest'
import { checkSocialPresence, type SocialPresenceSearchFn } from './social-presence'

// 按 query 里携带的域名路由到各平台的固定应答；未登记的域名默认零结果。
function makeSearch(byDomain: Record<string, { resultCount: number; results: { title: string; link: string }[] } | 'throw'>): SocialPresenceSearchFn {
  return vi.fn(async (query: string) => {
    const domain = Object.keys(byDomain).find((d) => query.includes(d))
    const outcome = domain ? byDomain[domain] : undefined
    if (outcome === 'throw') throw new Error('rate limited')
    if (!outcome) return { resultCount: 0, results: [] }
    return outcome
  })
}

describe('checkSocialPresence', () => {
  it('四平台命中：查询串与 topResults 截前 3、resultCount 原样透传', async () => {
    const search = makeSearch({
      'youtube.com': {
        resultCount: 5,
        results: [
          { title: 'Acme 官方频道', link: 'https://youtube.com/acme1' },
          { title: 'Acme 评测', link: 'https://youtube.com/acme2' },
          { title: 'Acme 教程', link: 'https://youtube.com/acme3' },
          { title: 'Acme 第四条', link: 'https://youtube.com/acme4' },
        ],
      },
      'g2.com': { resultCount: 1, results: [{ title: 'Acme reviews', link: 'https://g2.com/acme' }] },
      'trustpilot.com': { resultCount: 0, results: [] },
      'capterra.com': { resultCount: 2, results: [{ title: 'Acme on Capterra', link: 'https://capterra.com/acme' }] },
    })

    const result = await checkSocialPresence({ brand: 'Acme' }, search)

    expect(result.brand).toBe('Acme')
    expect(typeof result.checkedAt).toBe('string')
    expect(result.platforms).toHaveLength(4)

    const youtube = result.platforms.find((p) => p.platform === 'youtube')
    expect(youtube).toMatchObject({ platform: 'youtube', query: 'site:youtube.com "Acme"', resultCount: 5 })
    expect(youtube!.topResults).toHaveLength(3) // 截前 3
    expect(youtube!.topResults[0]).toEqual({ title: 'Acme 官方频道', url: 'https://youtube.com/acme1' })

    const g2 = result.platforms.find((p) => p.platform === 'g2')
    expect(g2).toMatchObject({ query: 'site:g2.com "Acme"', resultCount: 1 })
    expect(g2!.topResults).toEqual([{ title: 'Acme reviews', url: 'https://g2.com/acme' }])
  })

  it('零结果平台 → resultCount:0, topResults:[]', async () => {
    const search = makeSearch({
      'youtube.com': { resultCount: 0, results: [] },
      'g2.com': { resultCount: 0, results: [] },
      'trustpilot.com': { resultCount: 0, results: [] },
      'capterra.com': { resultCount: 0, results: [] },
    })

    const result = await checkSocialPresence({ brand: 'NoSuchBrandXYZ' }, search)

    result.platforms.forEach((p) => {
      expect(p.resultCount).toBe(0)
      expect(p.topResults).toEqual([])
    })
  })

  it('单平台查询抛错 → 该平台降级为空结果，不影响其他平台，且不抛出', async () => {
    const search = makeSearch({
      'youtube.com': 'throw',
      'g2.com': { resultCount: 3, results: [{ title: 'Acme G2', link: 'https://g2.com/acme' }] },
      'trustpilot.com': { resultCount: 0, results: [] },
      'capterra.com': { resultCount: 0, results: [] },
    })

    const result = await checkSocialPresence({ brand: 'Acme' }, search)

    const youtube = result.platforms.find((p) => p.platform === 'youtube')
    expect(youtube).toMatchObject({ resultCount: 0, topResults: [] })
    const g2 = result.platforms.find((p) => p.platform === 'g2')
    expect(g2).toMatchObject({ resultCount: 3 })
  })

  it('全部平台抛错 → 整体降级为全零结果，不抛出', async () => {
    const search: SocialPresenceSearchFn = vi.fn(async () => { throw new Error('rate limited') })

    const result = await checkSocialPresence({ brand: 'Acme' }, search)

    expect(result.platforms).toHaveLength(4)
    result.platforms.forEach((p) => expect(p).toMatchObject({ resultCount: 0, topResults: [] }))
  })

  it('查询串使用 site:<domain> "<brand>" 格式', async () => {
    const search = vi.fn(async () => ({ resultCount: 0, results: [] }))

    const result = await checkSocialPresence({ brand: 'Acme Corp' }, search)

    expect(result.platforms.map((p) => p.query)).toEqual([
      'site:youtube.com "Acme Corp"',
      'site:g2.com "Acme Corp"',
      'site:trustpilot.com "Acme Corp"',
      'site:capterra.com "Acme Corp"',
    ])
  })
})
