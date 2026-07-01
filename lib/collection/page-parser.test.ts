import { describe, it, expect, vi } from 'vitest'
import { extractMainTextChars, parsePageFacts, fetchPageFacts } from './page-parser'

const HTML = `<!doctype html><html><head>
  <title>Team Flow</title>
  <link rel="canonical" href="https://teamflow.cn/" />
  <meta name="robots" content="index,follow" />
</head><body><main><h1>Team Flow</h1><p>协作工具，帮团队更快交付。</p></main></body></html>`

describe('extractMainTextChars', () => {
  it('counts visible text, ignoring tags/scripts/styles', () => {
    const html = '<html><body><script>var x=1</script><style>.a{}</style><p>Hello world</p></body></html>'
    expect(extractMainTextChars(html)).toBe('Hello world'.length)
  })
})

describe('parsePageFacts', () => {
  it('extracts main text length, canonical, and meta robots', () => {
    const facts = parsePageFacts(HTML)
    expect(facts.canonicalUrl).toBe('https://teamflow.cn/')
    expect(facts.metaRobots).toBe('index,follow')
    expect(facts.mainTextChars).toBeGreaterThan(0)
  })

  it('returns null canonical/meta robots when absent', () => {
    const facts = parsePageFacts('<html><body><p>no meta here</p></body></html>')
    expect(facts.canonicalUrl).toBeNull()
    expect(facts.metaRobots).toBeNull()
  })
})

describe('fetchPageFacts', () => {
  it('fetches the URL and returns rawHtml alongside parsed facts', async () => {
    const fetchImpl = vi.fn(async () => new Response(HTML, { status: 200 }))
    const result = await fetchPageFacts('https://teamflow.cn', fetchImpl as never)
    expect(result.rawHtml).toBe(HTML)
    expect(result.canonicalUrl).toBe('https://teamflow.cn/')
    expect(fetchImpl).toHaveBeenCalledWith('https://teamflow.cn')
  })
})
