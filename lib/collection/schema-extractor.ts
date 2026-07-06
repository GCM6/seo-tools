import { parseHTML } from 'linkedom'

export interface SchemaExtraction {
  types: string[]
  raw: unknown[]
  // 实体消歧节点（Organization/Person 的 sameAs），供 E01 检查是否指向权威节点。
  sameAs: string[]
  // JSON-LD 块级解析结果：区分「块存在但解析失败」（C05b 语法错误）与「无块」。
  blocks: { ok: boolean; parsed: unknown | null; rawText: string }[]
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

function collectSameAs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectSameAs(n, out))
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const s = obj['sameAs']
    if (typeof s === 'string') out.push(s)
    else if (Array.isArray(s)) out.push(...s.filter((v): v is string => typeof v === 'string'))
    if (obj['@graph']) collectSameAs(obj['@graph'], out)
  }
}

export function extractSchema(html: string): SchemaExtraction {
  const { document } = parseHTML(html)
  const domBlocks = [...document.querySelectorAll('script[type="application/ld+json"]')]
  const raw: unknown[] = []
  const types: string[] = []
  const sameAs: string[] = []
  const blocks: SchemaExtraction['blocks'] = []

  for (const block of domBlocks) {
    const rawText = block.textContent ?? ''
    try {
      const parsed = JSON.parse(rawText)
      raw.push(parsed)
      collectTypes(parsed, types)
      collectSameAs(parsed, sameAs)
      blocks.push({ ok: true, parsed, rawText })
    } catch {
      // 单个 JSON-LD 块解析失败不中断整页解析；记为 ok:false 供 C05b 语法校验。
      blocks.push({ ok: false, parsed: null, rawText })
    }
  }

  return { types, raw, sameAs: [...new Set(sameAs)], blocks }
}
