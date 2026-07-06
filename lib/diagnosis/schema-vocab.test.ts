import { describe, it, expect } from 'vitest'
import { SCHEMA_VOCAB, SCHEMA_VOCAB_VERSION, schemaRuleFor } from './schema-vocab'

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

  it('Product requires name+image; Article requires headline+datePublished', () => {
    expect(SCHEMA_VOCAB['Product'].required).toContain('name')
    expect(SCHEMA_VOCAB['Product'].required).toContain('image')
    expect(SCHEMA_VOCAB['Article'].required).toContain('headline')
    expect(SCHEMA_VOCAB['Article'].required).toContain('datePublished')
  })

  it('is versioned and returns rule for known type', () => {
    expect(SCHEMA_VOCAB_VERSION).toMatch(/^google_rich_results_/)
    expect(schemaRuleFor('JobPosting')?.required).toContain('title')
  })
})
