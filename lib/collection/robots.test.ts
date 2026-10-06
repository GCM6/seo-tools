import { describe, it, expect, vi } from 'vitest'
import { parseRobotsAllowed, fetchRobotsCheck } from './robots'
import { LINKEDIN_ROBOTS_EXCERPT, NYTIMES_ROBOTS_TXT } from '@/lib/test-fixtures/real-shapes'

describe('parseRobotsAllowed', () => {
  it('allows everything when there is no matching Disallow', () => {
    expect(parseRobotsAllowed('User-agent: *\nAllow: /', '/pricing')).toBe(true)
  })

  it('disallows a path blocked for User-agent: *', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin\n'
    expect(parseRobotsAllowed(robotsTxt, '/admin/users')).toBe(false)
    expect(parseRobotsAllowed(robotsTxt, '/pricing')).toBe(true)
  })

  it('treats an empty robots.txt as allow-all', () => {
    expect(parseRobotsAllowed('', '/anything')).toBe(true)
  })
})

// RFC 9309 分组选择（最终审查 F3-1）：具名组命中时只用具名组；同一组可连写多行 User-agent；
// 去掉 # 注释；支持 * 与 $ 通配；产品名大小写不敏感；同名多组合并。
describe('parseRobotsAllowed — RFC 9309 分组（真实 robots）', () => {
  it('LinkedIn：OAI-SearchBot、Googlebot 有具名组 → 不套用末尾 * 组的 Disallow: /', () => {
    expect(parseRobotsAllowed(LINKEDIN_ROBOTS_EXCERPT, '/', 'OAI-SearchBot')).toBe(true)
    expect(parseRobotsAllowed(LINKEDIN_ROBOTS_EXCERPT, '/public-profile/abc', 'OAI-SearchBot')).toBe(false)
    expect(parseRobotsAllowed(LINKEDIN_ROBOTS_EXCERPT, '/', 'Googlebot')).toBe(true)
  })
  it('LinkedIn：没有具名组的爬虫回落到 * 组 → 全站禁抓', () => {
    expect(parseRobotsAllowed(LINKEDIN_ROBOTS_EXCERPT, '/', '*')).toBe(false)
    expect(parseRobotsAllowed(LINKEDIN_ROBOTS_EXCERPT, '/', 'PerplexityBot')).toBe(false)
  })
  it('NYTimes：User-agent: * 与 Googlebot 连写共用一组规则 → 两者都受约束', () => {
    expect(parseRobotsAllowed(NYTIMES_ROBOTS_TXT, '/athletic/checkout/x', '*')).toBe(false)
    expect(parseRobotsAllowed(NYTIMES_ROBOTS_TXT, '/athletic/checkout/x', 'Googlebot')).toBe(false)
  })
  it('NYTimes：Allow: /athletic/search/$ 只放行这个路径本身，子路径仍被 /athletic/search/* 禁止', () => {
    expect(parseRobotsAllowed(NYTIMES_ROBOTS_TXT, '/athletic/search/', '*')).toBe(true)
    expect(parseRobotsAllowed(NYTIMES_ROBOTS_TXT, '/athletic/search/foo', '*')).toBe(false)
  })
})

describe('parseRobotsAllowed — 语法细节', () => {
  it('去掉行尾 # 注释；* 匹配任意串、$ 锚定结尾', () => {
    const t = 'User-agent: *\nDisallow: /private # internal only\nDisallow: /*.pdf$\n'
    expect(parseRobotsAllowed(t, '/private/a')).toBe(false)
    expect(parseRobotsAllowed(t, '/docs/a.pdf')).toBe(false)
    expect(parseRobotsAllowed(t, '/docs/a.pdf?dl=1')).toBe(true)
    expect(parseRobotsAllowed(t, '/docs/a.html')).toBe(true)
  })
  it('产品名匹配大小写不敏感', () => {
    const t = 'User-agent: googlebot\nDisallow: /x\n'
    expect(parseRobotsAllowed(t, '/x', 'Googlebot')).toBe(false)
    expect(parseRobotsAllowed(t, '/x', '*')).toBe(true)
  })
  it('同一爬虫写在两个组里 → 规则合并', () => {
    const t = 'User-agent: Googlebot\nDisallow: /a\n\nUser-agent: Googlebot\nDisallow: /b\n'
    expect(parseRobotsAllowed(t, '/a/1', 'Googlebot')).toBe(false)
    expect(parseRobotsAllowed(t, '/b/1', 'Googlebot')).toBe(false)
  })
})

describe('fetchRobotsCheck', () => {
  it('入口可抓性按 Googlebot 判定（白名单式 robots：* 全禁、Googlebot 放行 → allowed）', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n', { status: 200 }))
    expect((await fetchRobotsCheck('https://example.com/pricing', fetchImpl as never)).allowed).toBe(true)
  })

  it('treats a 404 robots.txt as allowed with empty rawText', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    const result = await fetchRobotsCheck('https://example.com/', fetchImpl as never)
    expect(result).toEqual({ allowed: true, rawText: '' })
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/robots.txt')
  })

  it('parses a fetched robots.txt against the entry path', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: *\nDisallow: /', { status: 200 }))
    const result = await fetchRobotsCheck('https://example.com/pricing', fetchImpl as never)
    expect(result.allowed).toBe(false)
    expect(result.rawText).toContain('Disallow: /')
  })
})
