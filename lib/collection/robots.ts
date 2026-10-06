import { safeFetch } from '@/lib/security/safe-fetch'

export interface RobotsCheck {
  allowed: boolean
  rawText: string
}

// robots.txt 解析按 RFC 9309（最终审查 F3-1）：
//   - 分组：连续的 User-agent 行共用一组规则；规则行之后再出现 User-agent 才开新组；
//   - 选组：产品名大小写不敏感精确匹配；有具名组命中就只用具名组（同名多组合并），否则用 * 组；都没有 → 全放行；
//   - 匹配：去掉 # 注释；* 匹配任意字符串、结尾的 $ 锚定结尾；取最长匹配，长度相同时 Allow 优先。
interface RobotsRule {
  allow: boolean
  pattern: string
}
interface RobotsGroup {
  agents: string[]
  rules: RobotsRule[]
}

function parseGroups(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let lastWasAgent = false
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      // 产品名之后的版本号等（如 Googlebot/2.1）不参与匹配。
      current.agents.push(value.split(/[/\s]/)[0].toLowerCase())
      lastWasAgent = true
    } else if (key === 'allow' || key === 'disallow') {
      if (current && value) current.rules.push({ allow: key === 'allow', pattern: value })
      lastWasAgent = false
    } else if (key !== 'sitemap') {
      // crawl-delay 等组内的非标准行同样结束 User-agent 序列；sitemap 与分组无关。
      lastWasAgent = false
    }
  }
  return groups
}

function rulesFor(groups: RobotsGroup[], userAgent: string): RobotsRule[] | null {
  const ua = userAgent.toLowerCase()
  const named = ua === '*' ? [] : groups.filter((g) => g.agents.includes(ua))
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'))
  return chosen.length > 0 ? chosen.flatMap((g) => g.rules) : null
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path)
}

export function parseRobotsAllowed(robotsTxt: string, path: string, userAgent = '*'): boolean {
  const rules = rulesFor(parseGroups(robotsTxt), userAgent)
  if (!rules) return true
  let best: { allow: boolean; length: number } | null = null
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue
    const length = rule.pattern.length
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length }
  }
  return best ? best.allow : true
}

export async function fetchRobotsCheck(
  entryUrl: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<RobotsCheck> {
  const url = new URL(entryUrl)
  const robotsUrl = `${url.origin}/robots.txt`
  const res = await fetchImpl(robotsUrl)
  if (res.status === 404) return { allowed: true, rawText: '' }
  const rawText = await res.text()
  // 入口可抓性按 Googlebot 判定（消费方 T01 说的是"Googlebot 不可抓"；本工具爬虫自己仍按 * 组守规则）。
  return { allowed: parseRobotsAllowed(rawText, url.pathname || '/', 'Googlebot'), rawText }
}
