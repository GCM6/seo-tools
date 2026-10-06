import { splitTitleSegments } from '@/lib/analysis/category-candidates'

// 站点关键短语（SP-A §3.3 第 4 来源）：已抓页 title + 深检页 H1 → 2–6 词英文短语，去品牌、去重、转小写。
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const ENGLISH_PHRASE = /^[a-z0-9][a-z0-9 &/,.'()+-]*$/

export function sitePhrases(input: { titles: string[]; h1s: string[]; brand: string; aliases: string[] }): string[] {
  const brandKeys = [input.brand, ...input.aliases].map(squash).filter(Boolean)
  const out = new Set<string>()
  for (const raw of [...input.titles, ...input.h1s]) {
    for (const seg of splitTitleSegments(raw)) {
      const t = seg.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!t || brandKeys.some((b) => squash(t).includes(b))) continue
      const words = t.split(' ').length
      if (words < 2 || words > 6 || !ENGLISH_PHRASE.test(t)) continue
      out.add(t)
    }
  }
  return [...out]
}
