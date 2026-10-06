import { parseHTML } from 'linkedom'
import { isValidCategory } from '@/lib/repositories/validators'

// 站点预读事实与品类候选（SP-A §3.2）。确定性、零 LLM：候选只是起点，用户必须点选或编辑后确认。
export interface SitePreviewFacts {
  title: string | null
  h1: string | null
  metaDescription: string | null
  siteName: string | null
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t || null
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function extractSitePreviewFacts(html: string): SitePreviewFacts {
  const { document } = parseHTML(html)
  // 主题重复输出时常见「先空后实」两个 description 标签：取首个非空。
  const metaDescription =
    [...document.querySelectorAll('meta[name]')]
      .filter((m) => m.getAttribute('name')?.trim().toLowerCase() === 'description')
      .map((m) => clean(m.getAttribute('content')))
      .find(Boolean) ?? null
  return {
    title: clean(document.querySelector('title')?.textContent),
    h1: clean(document.querySelector('h1')?.textContent),
    metaDescription,
    siteName: clean(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')),
  }
}

// 标题分隔符：| — – : · • 以及两侧带空格的 -（保留 e-mail 这类连字符词）。
export function splitTitleSegments(text: string): string[] {
  return text.split(/\s*[|—–:·•]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean)
}

function firstSentence(s: string | null): string | null {
  if (!s) return null
  const first = s.split(/(?<=[.!?])\s+/)[0] ?? s
  return first.length > 80 ? first.slice(0, 80).replace(/\s+\S*$/, '') : first
}

export function categoryCandidates(facts: SitePreviewFacts, brand: string): string[] {
  const brandKeys = [brand, facts.siteName ?? ''].map(norm).filter(Boolean)
  const out: string[] = []
  const push = (s: string | null) => {
    const t = clean(s)
    if (!t || brandKeys.includes(norm(t)) || !isValidCategory(t)) return
    if (out.some((o) => norm(o) === norm(t))) return
    out.push(t)
  }
  for (const seg of splitTitleSegments(facts.title ?? '')) push(seg)
  push(facts.h1)
  push(firstSentence(facts.metaDescription))
  return out.slice(0, 3)
}
