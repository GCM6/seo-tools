import { parseHTML } from 'linkedom'

export interface SchemaExtraction {
  types: string[]
  raw: unknown[]
}

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out))
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj['@type'] === 'string') out.push(obj['@type'])
    else if (Array.isArray(obj['@type'])) out.push(...(obj['@type'] as string[]))
    if (obj['@graph']) collectTypes(obj['@graph'], out)
  }
}

export function extractSchema(html: string): SchemaExtraction {
  const { document } = parseHTML(html)
  const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')]
  const raw: unknown[] = []
  const types: string[] = []

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.textContent ?? '')
      raw.push(parsed)
      collectTypes(parsed, types)
    } catch {
      // 单个 JSON-LD 块解析失败不应中断整页解析，跳过即可。
    }
  }

  return { types, raw }
}
