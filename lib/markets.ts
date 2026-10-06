// 英文 Google 市场单一真源（SP-A spec §3.1）：DataForSEO 主阶段 / AIO / GSC 国家过滤 / 向导下拉与默认值共用。
// locationCode = 2000 + ISO 3166-1 数字码（Google Ads 地理定位口径），2026-10-04 已用 DataForSEO
// /v3/dataforseo_labs/locations_and_languages 实测核对（9 国全部一致，均提供 en）。
// gscCountry 为 GSC searchAnalytics country 维度过滤值（ISO 3166-1 alpha-3；官方文档未说明大小写，
// 取与 GSC 返回值一致的小写，首次真实 GSC 运行时复核）。找不到市场一律抛错，不回落默认。
export const MARKET_CODES = ['global-en', 'us', 'gb', 'ca', 'au', 'ie', 'nz', 'sg', 'in', 'za'] as const
export type MarketCode = (typeof MARKET_CODES)[number]

export interface MarketSpec {
  code: MarketCode
  labelZh: string
  labelEn: string
  locationCode: number
  languageCode: 'en'
  gscCountry: string | null
  ccTlds: string[]
}

export const MARKETS: readonly MarketSpec[] = [
  { code: 'global-en', labelZh: '全球英文（以美国结果代理）', labelEn: 'Global English (US results as proxy)', locationCode: 2840, languageCode: 'en', gscCountry: null, ccTlds: [] },
  { code: 'us', labelZh: '美国', labelEn: 'United States', locationCode: 2840, languageCode: 'en', gscCountry: 'usa', ccTlds: ['us'] },
  { code: 'gb', labelZh: '英国', labelEn: 'United Kingdom', locationCode: 2826, languageCode: 'en', gscCountry: 'gbr', ccTlds: ['uk', 'co.uk', 'org.uk'] },
  { code: 'ca', labelZh: '加拿大', labelEn: 'Canada', locationCode: 2124, languageCode: 'en', gscCountry: 'can', ccTlds: ['ca'] },
  { code: 'au', labelZh: '澳大利亚', labelEn: 'Australia', locationCode: 2036, languageCode: 'en', gscCountry: 'aus', ccTlds: ['au', 'com.au'] },
  { code: 'ie', labelZh: '爱尔兰', labelEn: 'Ireland', locationCode: 2372, languageCode: 'en', gscCountry: 'irl', ccTlds: ['ie'] },
  { code: 'nz', labelZh: '新西兰', labelEn: 'New Zealand', locationCode: 2554, languageCode: 'en', gscCountry: 'nzl', ccTlds: ['nz', 'co.nz'] },
  { code: 'sg', labelZh: '新加坡', labelEn: 'Singapore', locationCode: 2702, languageCode: 'en', gscCountry: 'sgp', ccTlds: ['sg', 'com.sg'] },
  { code: 'in', labelZh: '印度', labelEn: 'India', locationCode: 2356, languageCode: 'en', gscCountry: 'ind', ccTlds: ['in', 'co.in'] },
  { code: 'za', labelZh: '南非', labelEn: 'South Africa', locationCode: 2710, languageCode: 'en', gscCountry: 'zaf', ccTlds: ['za', 'co.za'] },
]

export function isMarketCode(v: string): v is MarketCode {
  return (MARKET_CODES as readonly string[]).includes(v)
}

export function findMarket(code: string): MarketSpec | null {
  return MARKETS.find((m) => m.code === code) ?? null
}

export function getMarket(code: string): MarketSpec {
  const m = findMarket(code)
  if (!m) throw new Error(`unknown market code: "${code}"`)
  return m
}

function hostnameOf(domain: string): string {
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

// 向导默认值：先匹配二级公共后缀（co.uk），再匹配一级（uk）；都不中 → global-en。
export function guessMarketCode(domain: string): MarketCode {
  const labels = hostnameOf(domain).split('.').filter(Boolean)
  if (labels.length < 2) return 'global-en'
  const last2 = labels.slice(-2).join('.')
  const last1 = labels[labels.length - 1]
  return MARKETS.find((m) => m.ccTlds.includes(last2))?.code ?? MARKETS.find((m) => m.ccTlds.includes(last1))?.code ?? 'global-en'
}

// 展示用显示名：旧显示文案/空值返回 null，由调用方显示「未设置」。
export function marketLabel(code: string, locale: string): string | null {
  const m = findMarket(code)
  if (!m) return null
  return locale === 'zh' ? m.labelZh : m.labelEn
}
