import { describe, it, expect, vi } from 'vitest'
import { parseRobotsAllowed, fetchRobotsCheck } from './robots'

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

describe('fetchRobotsCheck', () => {
  it('treats a 404 robots.txt as allowed with empty rawText', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    const result = await fetchRobotsCheck('https://teamflow.cn/', fetchImpl as never)
    expect(result).toEqual({ allowed: true, rawText: '' })
    expect(fetchImpl).toHaveBeenCalledWith('https://teamflow.cn/robots.txt')
  })

  it('parses a fetched robots.txt against the entry path', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: *\nDisallow: /', { status: 200 }))
    const result = await fetchRobotsCheck('https://teamflow.cn/pricing', fetchImpl as never)
    expect(result.allowed).toBe(false)
    expect(result.rawText).toContain('Disallow: /')
  })
})
