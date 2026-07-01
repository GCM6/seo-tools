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
    expect(result).toEqual({ types: [], raw: [] })
  })

  it('skips a malformed JSON-LD block instead of throwing', () => {
    const html = '<html><head><script type="application/ld+json">{not valid json</script></head></html>'
    expect(() => extractSchema(html)).not.toThrow()
    expect(extractSchema(html)).toEqual({ types: [], raw: [] })
  })
})
