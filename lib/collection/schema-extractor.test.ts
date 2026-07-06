import { describe, it, expect } from 'vitest'
import { extractSchema } from './schema-extractor'

describe('extractSchema', () => {
  it('extracts @type from a single JSON-LD block', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Team Flow"}
    </script></head><body></body></html>`
    const result = extractSchema(html)
    expect(result.types).toEqual(['Organization'])
    expect(result.raw).toHaveLength(1)
  })

  it('handles multiple script blocks and @graph arrays', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"WebSite"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"Product"},{"@type":"FAQPage"}]}</script>
    </head><body></body></html>`
    const result = extractSchema(html)
    expect(result.types.sort()).toEqual(['FAQPage', 'Product', 'WebSite'])
  })

  it('returns empty result when there is no structured data', () => {
    const result = extractSchema('<html><body><p>no schema here</p></body></html>')
    expect(result).toEqual({ types: [], raw: [], sameAs: [], blocks: [] })
  })

  it('records a malformed JSON-LD block (ok:false) instead of throwing', () => {
    const html = '<html><head><script type="application/ld+json">{not valid json</script></head></html>'
    expect(() => extractSchema(html)).not.toThrow()
    const result = extractSchema(html)
    // 语法错误的块不进 raw/types，但记入 blocks 供 C05b 语法校验命中。
    expect(result.types).toEqual([])
    expect(result.raw).toEqual([])
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].ok).toBe(false)
  })

  it('extracts sameAs from Organization entity', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Organization","sameAs":["https://www.wikidata.org/wiki/Q1","https://linkedin.com/company/x"]}
    </script></head></html>`
    expect(extractSchema(html).sameAs).toEqual([
      'https://www.wikidata.org/wiki/Q1',
      'https://linkedin.com/company/x',
    ])
  })
})
