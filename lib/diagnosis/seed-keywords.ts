// 种子词收集（SP-A §3.3）：用户目标词 → 本期 GSC → 历史 GSC → 站点关键短语；去品牌（含别名）、去重、截断。
// 探针问句不再作为种子——它们是自然语言问题，且曾被行业下拉默认值污染（审计 §3.1）。
// 纯函数、确定性：同输入同输出，保证同协议回测可比。
export type SeedSource = 'manual' | 'gsc' | 'gsc_history' | 'site_phrase'

export interface Seed {
  text: string
  source: SeedSource
  lastSeenAt?: string
}

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
// 品牌比较口径：去掉大小写、空白与符号（'Meta Docu' / 'meta-docu' / 'MetaDocu' 视为同一品牌）。
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function gatherSeedKeywords(input: {
  manualKeywords: string[]
  gscQueries: { keyText: string; impressions: number }[]
  historicalGsc: { keyText: string; lastSeenAt: string }[]
  sitePhrases: string[]
  brand: string
  aliases: string[]
  limit: number
}): Seed[] {
  const brandKeys = [input.brand, ...input.aliases].map(squash).filter(Boolean)
  const isBrand = (t: string) => brandKeys.some((b) => squash(t).includes(b))
  const seen = new Set<string>()
  const out: Seed[] = []

  const push = (raw: string, source: SeedSource, lastSeenAt?: string) => {
    const text = raw.trim()
    if (!text || isBrand(text)) return
    const key = normalize(text)
    if (seen.has(key)) return
    seen.add(key)
    out.push(lastSeenAt ? { text, source, lastSeenAt } : { text, source })
  }

  for (const k of input.manualKeywords) push(k, 'manual')
  for (const q of [...input.gscQueries].sort((a, b) => b.impressions - a.impressions)) push(q.keyText, 'gsc')
  for (const h of [...input.historicalGsc].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)))
    push(h.keyText, 'gsc_history', h.lastSeenAt)
  for (const p of input.sitePhrases) push(p, 'site_phrase')

  return out.slice(0, Math.max(0, input.limit))
}
