// 域名 → 市场/语言智能预填（向导第 1 步）。纯函数：由 ccTLD 启发式给默认，
// 用户可改。marketIndex 对应 screen1.marketOptions 下标（zh/en 同序）。（spec §SP-G2a-1）
export interface MarketGuess {
  marketIndex: number
  language: 'zh' | 'en'
}

// 东南亚主要市场 ccTLD（含二级公共后缀如 co.th）。
const SEA_TLDS = new Set(['sg', 'my', 'th', 'id', 'vn', 'ph'])

function hostnameOf(domain: string): string {
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  try {
    return new URL(withScheme).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function guessMarketLanguage(domain: string): MarketGuess {
  const host = hostnameOf(domain)
  const parts = host.split('.').filter(Boolean)
  const tld = parts[parts.length - 1] ?? ''
  // 二级后缀（com.cn / co.th）时国别码在倒数第一段。
  if (tld === 'cn') return { marketIndex: 0, language: 'zh' }
  if (SEA_TLDS.has(tld)) return { marketIndex: 2, language: 'en' }
  return { marketIndex: 1, language: 'en' }
}
