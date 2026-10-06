import { describe, it, expect } from 'vitest'
import { categoryCandidates, extractSitePreviewFacts, splitTitleSegments } from './category-candidates'

const html = `<!doctype html><html><head><title>Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu</title>
<meta name="description" content="Clean author, GPS and revision data from documents. Works in your browser.">
<meta property="og:site_name" content="MetaDocu"></head><body><h1>Remove PDF Metadata Online</h1></body></html>`

describe('站点预读事实与品类候选（SP-A §3.2）', () => {
  it('抽取首页 title / H1 / meta description / og:site_name', () => {
    expect(extractSitePreviewFacts(html)).toEqual({
      title: 'Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu',
      h1: 'Remove PDF Metadata Online',
      metaDescription: 'Clean author, GPS and revision data from documents. Works in your browser.',
      siteName: 'MetaDocu',
    })
  })

  it('缺失字段为 null；description 取首个非空（主题常输出先空后实的重复标签）', () => {
    const facts = extractSitePreviewFacts('<head><meta name="description" content=""><meta name="Description" content="Real one."></head><body></body>')
    expect(facts).toEqual({ title: null, h1: null, metaDescription: 'Real one.', siteName: null })
  })

  it('切段：| — – : · • 与两侧带空格的 -，保留连字符词', () => {
    expect(splitTitleSegments('A | B — C - D:E · F • G e-mail tool')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G e-mail tool'])
  })

  it('去品牌（域名品牌与 og:site_name）、去重、最多 3 个且全部通过品类校验', () => {
    expect(categoryCandidates(extractSitePreviewFacts(html), 'metadocu')).toEqual([
      'Remove PDF Metadata Online',
      'Free, No Upload',
      'Clean author, GPS and revision data from documents.',
    ])
  })

  it('中文站点给不出候选（只做英文）', () => {
    const zh = extractSitePreviewFacts('<title>文档元数据清除 | 某品牌</title><h1>清除元数据</h1>')
    expect(categoryCandidates(zh, 'brand')).toEqual([])
  })

  it('超长 description 首句截断到 80 字符以内且不截断单词', () => {
    const long = 'A very long description sentence that keeps going and going well beyond the eighty character limit for sure.'
    const c = categoryCandidates({ title: null, h1: null, metaDescription: long, siteName: null }, 'brand')
    expect(c).toHaveLength(1)
    expect(c[0].length).toBeLessThanOrEqual(80)
    expect(long.startsWith(c[0])).toBe(true)
    expect(long[c[0].length]).toBe(' ')
  })
})
