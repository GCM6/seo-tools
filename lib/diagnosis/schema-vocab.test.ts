import { describe, it, expect } from 'vitest'
import { SCHEMA_VOCAB, SCHEMA_VOCAB_VERSION, LOCAL_BUSINESS_SUBTYPES, schemaRuleFor, hasField } from './schema-vocab'

describe('SCHEMA_VOCAB', () => {
  it('covers the 2026 rich-result types', () => {
    for (const t of [
      'Product',
      'Article',
      'NewsArticle',
      'BlogPosting',
      'BreadcrumbList',
      'Organization',
      'Recipe',
      'Event',
      'Review',
      'AggregateRating',
      'VideoObject',
      'Course',
      'JobPosting',
      'SoftwareApplication',
      'LocalBusiness',
    ]) {
      expect(SCHEMA_VOCAB[t]).toBeTruthy()
      expect(Array.isArray(SCHEMA_VOCAB[t].required)).toBe(true)
      expect(Array.isArray(SCHEMA_VOCAB[t].recommended)).toBe(true)
    }
  })

  it('excludes deprecated FAQ/HowTo types', () => {
    expect(SCHEMA_VOCAB['FAQPage']).toBeUndefined()
    expect(SCHEMA_VOCAB['HowTo']).toBeUndefined()
    expect(schemaRuleFor('FAQPage')).toBeNull()
  })

  it('每个类型都注明 Google 文档出处', () => {
    for (const [type, rule] of Object.entries(SCHEMA_VOCAB)) {
      expect(rule.source, type).toMatch(/^https:\/\/developers\.google\.com\/search\/docs\/appearance\/structured-data\/[a-z-]+$/)
    }
  })

  it('按 2026-09 Google 文档：Article/Organization 无必填；Product 走商品摘要口径（image 非必填，三选一）', () => {
    expect(SCHEMA_VOCAB['Article'].required).toEqual([])
    expect(SCHEMA_VOCAB['Article'].recommended).toEqual(expect.arrayContaining(['headline', 'datePublished', 'image']))
    expect(SCHEMA_VOCAB['Organization'].required).toEqual([])
    expect(SCHEMA_VOCAB['Product'].required).toEqual(['name'])
    expect(SCHEMA_VOCAB['Product'].oneOf).toEqual([['review', 'aggregateRating', 'offers']])
    expect(SCHEMA_VOCAB['Product'].recommended).toContain('image')
    expect(SCHEMA_VOCAB['VideoObject'].required).not.toContain('description')
  })

  it('SoftwareApplication 必填 name + offers.price，评分/评论二选一；Google 支持的子类型共用规则', () => {
    const rule = schemaRuleFor('SoftwareApplication')!
    expect(rule.required).toEqual(['name', 'offers.price'])
    expect(rule.oneOf).toEqual([['aggregateRating', 'review']])
    expect(schemaRuleFor('WebApplication')).toBe(rule)
    expect(schemaRuleFor('MobileApplication')).toBe(rule)
    expect(schemaRuleFor('VideoGame')).toBeNull()
  })

  it('JobPosting：全远程岗位用 applicantLocationRequirements 代替 jobLocation', () => {
    expect(SCHEMA_VOCAB['JobPosting'].required).not.toContain('jobLocation')
    expect(SCHEMA_VOCAB['JobPosting'].oneOf).toEqual([['jobLocation', 'applicantLocationRequirements']])
  })

  it('LocalBusiness 常见子类型映射到 LocalBusiness 规则', () => {
    const rule = schemaRuleFor('LocalBusiness')!
    expect(rule.required).toEqual(['name', 'address'])
    for (const sub of ['Restaurant', 'Dentist', 'Store', 'LegalService']) {
      expect(LOCAL_BUSINESS_SUBTYPES).toContain(sub)
      expect(schemaRuleFor(sub)).toBe(rule)
    }
  })

  it('is versioned 2026-10', () => {
    expect(SCHEMA_VOCAB_VERSION).toBe('google_rich_results_2026-10')
    expect(schemaRuleFor('JobPosting')?.required).toContain('title')
  })
})

describe('hasField（一层点路径，数组取首元素）', () => {
  it('顶层字段：缺失 / 空串 / 空数组都算缺', () => {
    expect(hasField({ name: 'x' }, 'name')).toBe(true)
    expect(hasField({}, 'name')).toBe(false)
    expect(hasField({ name: '  ' }, 'name')).toBe(false)
    expect(hasField({ image: [] }, 'image')).toBe(false)
    expect(hasField({ image: { '@id': 'https://e.com/#img' } }, 'image')).toBe(true)
  })

  it('点路径下钻，遇数组取第一个元素；价格 0 是有效值（免费应用）', () => {
    expect(hasField({ offers: { price: 0 } }, 'offers.price')).toBe(true)
    expect(hasField({ offers: [{ price: '9.99' }, {}] }, 'offers.price')).toBe(true)
    expect(hasField({ offers: [{}, { price: '9.99' }] }, 'offers.price')).toBe(false)
    expect(hasField({ offers: {} }, 'offers.price')).toBe(false)
    expect(hasField({ reviewRating: { ratingValue: 4 } }, 'reviewRating.ratingValue')).toBe(true)
  })

  it('offers.price 也接受 priceSpecification.price 与 AggregateOffer 的 lowPrice', () => {
    expect(hasField({ offers: { priceSpecification: { price: 10 } } }, 'offers.price')).toBe(true)
    expect(hasField({ offers: { '@type': 'AggregateOffer', lowPrice: 5 } }, 'offers.price')).toBe(true)
  })
})
