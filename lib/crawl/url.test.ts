import { describe, it, expect } from 'vitest'
import { normalizeUrl, sameSiteHost, isSameSite } from './url'

describe('normalizeUrl', () => {
  it('去 fragment、去 tracking 参数、排序 query、去 www、去尾斜杠', () => {
    expect(normalizeUrl('https://www.example.com/products/?utm_source=x&b=2&a=1#top'))
      .toBe('https://example.com/products?a=1&b=2')
  })
  it('根路径保留尾斜杠', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
  it('相对路径基于 base 解析', () => {
    expect(normalizeUrl('../a/b', 'https://example.com/x/y/z')).toBe('https://example.com/x/a/b')
  })
  it('非 http(s) 与非法 URL 返回 null', () => {
    expect(normalizeUrl('mailto:a@b.com')).toBeNull()
    expect(normalizeUrl('javascript:void(0)')).toBeNull()
    expect(normalizeUrl('::::')).toBeNull()
  })
})

describe('isSameSite / sameSiteHost', () => {
  it('www 前缀归一后同 host 判定为同站，子域不算', () => {
    const host = sameSiteHost('https://www.example.com/')
    expect(host).toBe('example.com')
    expect(isSameSite('https://example.com/a', host)).toBe(true)
    expect(isSameSite('https://www.example.com/a', host)).toBe(true)
    expect(isSameSite('https://blog.example.com/a', host)).toBe(false)
  })
})
