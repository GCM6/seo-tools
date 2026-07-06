// 市场 → DataForSEO location_code（国家级）+ language_code 映射。范围限欧美市场（spec §3.2）。
// location_code 为 DataForSEO 国家代码；language_code 为该市场默认语言（德法等本地语言）。
// 真源：DataForSEO Locations（国家级 code），随市场枚举固化。

interface LocationSpec {
  locationCode: number
  languageCode: string
}

// 键为项目 market 枚举（小写国家码）。缺省回落 US/en。
const MARKET_LOCATIONS: Record<string, LocationSpec> = {
  us: { locationCode: 2840, languageCode: 'en' },
  gb: { locationCode: 2826, languageCode: 'en' },
  uk: { locationCode: 2826, languageCode: 'en' }, // 'uk' 常见误写，等同 gb
  ca: { locationCode: 2124, languageCode: 'en' },
  au: { locationCode: 2036, languageCode: 'en' },
  de: { locationCode: 2276, languageCode: 'de' },
  fr: { locationCode: 2250, languageCode: 'fr' },
  es: { locationCode: 2724, languageCode: 'es' },
  it: { locationCode: 2380, languageCode: 'it' },
  nl: { locationCode: 2528, languageCode: 'nl' },
}

const DEFAULT_LOCATION: LocationSpec = { locationCode: 2840, languageCode: 'en' }

export function resolveLocation(market: string): LocationSpec {
  return MARKET_LOCATIONS[(market || '').trim().toLowerCase()] ?? DEFAULT_LOCATION
}
