import { describe, it, expect } from 'vitest'
import { classifyCitationPlatform, isUgcPlatform } from './citation-platform'

describe('classifyCitationPlatform', () => {
  it('classifies reddit.com and its aliases (old.reddit.com, redd.it)', () => {
    expect(classifyCitationPlatform('https://www.reddit.com/r/seo/comments/x')).toBe('reddit')
    expect(classifyCitationPlatform('https://old.reddit.com/r/seo')).toBe('reddit')
    expect(classifyCitationPlatform('https://redd.it/abc123')).toBe('reddit')
  })

  it('classifies youtube.com and its aliases (youtu.be, m.youtube.com)', () => {
    expect(classifyCitationPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube')
    expect(classifyCitationPlatform('https://youtu.be/abc')).toBe('youtube')
    expect(classifyCitationPlatform('https://m.youtube.com/watch?v=abc')).toBe('youtube')
  })

  it('classifies linkedin.com', () => {
    expect(classifyCitationPlatform('https://www.linkedin.com/in/someone')).toBe('linkedin')
  })

  it('classifies quora.com', () => {
    expect(classifyCitationPlatform('https://www.quora.com/What-is-SEO')).toBe('quora')
  })

  it('classifies wikipedia.org including language subdomains', () => {
    expect(classifyCitationPlatform('https://en.wikipedia.org/wiki/SEO')).toBe('wikipedia')
    expect(classifyCitationPlatform('https://zh.wikipedia.org/wiki/SEO')).toBe('wikipedia')
  })

  it('classifies github.com including gist subdomain', () => {
    expect(classifyCitationPlatform('https://github.com/vercel/next.js')).toBe('github')
    expect(classifyCitationPlatform('https://gist.github.com/foo/bar')).toBe('github')
  })

  it('classifies an unrelated domain as other', () => {
    expect(classifyCitationPlatform('https://notion.so/page')).toBe('other')
    expect(classifyCitationPlatform('https://metadocu.com/guide')).toBe('other')
  })

  it('does not false-positive on lookalike domains (no substring matching)', () => {
    expect(classifyCitationPlatform('https://notreddit.com/x')).toBe('other')
    expect(classifyCitationPlatform('https://reddit.com.evil.com/x')).toBe('other')
  })

  it('accepts a bare host (no protocol) as well as a full URL', () => {
    expect(classifyCitationPlatform('reddit.com')).toBe('reddit')
    expect(classifyCitationPlatform('en.wikipedia.org')).toBe('wikipedia')
  })

  it('falls back to other for a malformed, unparseable input', () => {
    expect(classifyCitationPlatform('not a url')).toBe('other')
  })
})

describe('isUgcPlatform', () => {
  it('treats reddit/quora/youtube/linkedin as UGC/社区讨论面', () => {
    expect(isUgcPlatform('reddit')).toBe(true)
    expect(isUgcPlatform('quora')).toBe(true)
    expect(isUgcPlatform('youtube')).toBe(true)
    expect(isUgcPlatform('linkedin')).toBe(true)
  })

  it('does not treat wikipedia/github/other as UGC (curated reference / non-discussion content)', () => {
    expect(isUgcPlatform('wikipedia')).toBe(false)
    expect(isUgcPlatform('github')).toBe(false)
    expect(isUgcPlatform('other')).toBe(false)
  })
})
