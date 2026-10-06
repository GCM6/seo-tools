import { describe, it, expect } from 'vitest'
import { socialPlatformOf, detectSocialProfiles, isSocialHost } from './social-links'

describe('socialPlatformOf（spec S4 §4；Review Focus 3）', () => {
  it.each([
    ['https://www.linkedin.com/company/acme', 'linkedin'], ['https://twitter.com/acme', 'x'], ['https://x.com/acme', 'x'],
    ['https://www.youtube.com/@acme', 'youtube'], ['https://github.com/acme', 'github'], ['https://weibo.com/u/123', 'weibo'],
    ['https://www.zhihu.com/org/acme', 'zhihu'], ['https://space.bilibili.com/42', 'bilibili'], ['https://www.xiaohongshu.com/user/profile/abc', 'xiaohongshu'],
  ])('%s → %s', (url, platform) => {
    expect(socialPlatformOf(url)).toBe(platform)
  })
  it.each([
    'https://www.facebook.com/sharer/sharer.php?u=x', 'https://twitter.com/intent/tweet?url=x', 'https://www.linkedin.com/shareArticle?mini=true',
    'https://www.facebook.com/', 'https://example.com/acme',
  ])('%s 不是社媒主页', (url) => {
    expect(socialPlatformOf(url)).toBeNull()
  })
  it('isSocialHost 认子域', () => {
    expect([isSocialHost('m.facebook.com'), isSocialHost('www.youtube.com'), isSocialHost('example.com')]).toEqual([true, true, false])
  })
})

describe('detectSocialProfiles', () => {
  it('同一主页按不同源页计数、合并区域，按页数降序；分享链接忽略', () => {
    const out = detectSocialProfiles([
      { from: '/', url: 'https://linkedin.com/company/acme', region: 'footer' },
      { from: '/a', url: 'https://linkedin.com/company/acme', region: 'footer' },
      { from: '/a', url: 'https://linkedin.com/company/acme', region: 'main' },
      { from: '/', url: 'https://youtube.com/@acme', region: 'header' },
      { from: '/p', url: 'https://twitter.com/intent/tweet?url=x', region: 'main' },
    ])
    expect(out).toEqual([
      { platform: 'linkedin', url: 'https://linkedin.com/company/acme', pages: 2, regions: ['footer', 'main'] },
      { platform: 'youtube', url: 'https://youtube.com/@acme', pages: 1, regions: ['header'] },
    ])
  })
})

describe('主页形态收紧与区域过滤（第三轮独立审查 P1-4）', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc', 'https://twitter.com/acme/status/1', 'https://github.com/facebook/react',
    'https://www.pinterest.com/pin/create/button/?url=x', 'https://www.instagram.com/p/abc/', 'https://www.zhihu.com/question/1',
    'https://www.bilibili.com/video/BV1', 'https://www.linkedin.com/posts/acme_1', 'https://www.facebook.com/watch',
  ])('%s 不是主页', (url) => expect(socialPlatformOf(url)).toBeNull())

  it('微信公众号链接识别为 wechat', () => {
    expect(socialPlatformOf('https://mp.weixin.qq.com/s/AbCdEf')).toBe('wechat')
  })

  it('正文里引用的第三方主页不算；无语义标签站点里出现在 ≥3 页且 ≥30% 页面的同一链接算（全站模板）', () => {
    const body = (from: string) => ({ from, url: 'https://github.com/acme', region: 'body' as const })
    expect(detectSocialProfiles([{ from: '/post', url: 'https://github.com/someone', region: 'main' }], { fetchedPages: 10 })).toEqual([])
    expect(detectSocialProfiles(['/', '/a', '/b'].map(body), { fetchedPages: 8 }).map((p) => p.url)).toEqual(['https://github.com/acme'])
    expect(detectSocialProfiles(['/', '/a', '/b'].map(body), { fetchedPages: 20 })).toEqual([])
  })
})

