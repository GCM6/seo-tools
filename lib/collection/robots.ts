import { safeFetch } from '@/lib/security/safe-fetch'

export interface RobotsCheck {
  allowed: boolean
  rawText: string
}

export function parseRobotsAllowed(robotsTxt: string, path: string, userAgent = '*'): boolean {
  const lines = robotsTxt.split('\n').map((l) => l.trim())
  let inRelevantGroup = false
  let matchedGroup = false
  const disallowRules: string[] = []
  const allowRules: string[] = []

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (key === 'user-agent') {
      inRelevantGroup = value === '*' || value.toLowerCase() === userAgent.toLowerCase()
      if (inRelevantGroup) matchedGroup = true
      continue
    }
    if (!inRelevantGroup) continue
    if (key === 'disallow' && value) disallowRules.push(value)
    if (key === 'allow' && value) allowRules.push(value)
  }

  if (!matchedGroup) return true
  const longestMatch = (rules: string[]) =>
    rules.filter((rule) => path.startsWith(rule)).sort((a, b) => b.length - a.length)[0]

  const disallow = longestMatch(disallowRules)
  const allow = longestMatch(allowRules)
  if (!disallow) return true
  if (allow && allow.length >= disallow.length) return true
  return false
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
  return { allowed: parseRobotsAllowed(rawText, url.pathname || '/'), rawText }
}
