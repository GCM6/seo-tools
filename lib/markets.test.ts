import { describe, it, expect } from 'vitest'
import { MARKETS, MARKET_CODES, findMarket, getMarket, guessMarketCode, isMarketCode } from './markets'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'

describe('markets（SP-A §3.1 英文 Google 市场单一真源）', () => {
  it('每个 code 唯一、顺序与 MARKET_CODES 一致、语言恒为 en', () => {
    expect(new Set(MARKETS.map((m) => m.code)).size).toBe(MARKETS.length)
    expect(MARKETS.map((m) => m.code)).toEqual([...MARKET_CODES])
    for (const m of MARKETS) expect(m.languageCode).toBe('en')
  })

  it('global-en 以美国结果代理，且 GSC 不按国家过滤', () => {
    const g = getMarket('global-en')
    expect(g.locationCode).toBe(getMarket('us').locationCode)
    expect(g.gscCountry).toBeNull()
  })

  it('location_code 与 DataForSEO 实测一致（2026-10-04 locations_and_languages 核对）', () => {
    expect(Object.fromEntries(MARKETS.map((m) => [m.code, m.locationCode]))).toEqual({
      'global-en': 2840, us: 2840, gb: 2826, ca: 2124, au: 2036, ie: 2372, nz: 2554, sg: 2702, in: 2356, za: 2710,
    })
  })

  it('旧显示文案与未知值查不到；getMarket 抛错而不是回落默认', () => {
    for (const legacy of ['English · Global', '中文 · 中国大陆', '东南亚', 'Chinese · Mainland China', 'Southeast Asia', '']) {
      expect(findMarket(legacy)).toBeNull()
      expect(isMarketCode(legacy)).toBe(false)
      expect(() => getMarket(legacy)).toThrow()
    }
  })

  it('ccTLD 推断（输入为 normalizeDomain 的真实输出）', () => {
    const g = (d: string) => guessMarketCode(normalizeDomain(d)!)
    expect(g('shop.co.uk')).toBe('gb')
    expect(g('brand.uk')).toBe('gb')
    expect(g('brand.com.au')).toBe('au')
    expect(g('brand.co.nz')).toBe('nz')
    expect(g('brand.ca')).toBe('ca')
    expect(g('brand.ie')).toBe('ie')
    expect(g('metadocu.com')).toBe('global-en')
    expect(g('brand.co')).toBe('global-en')
    expect(guessMarketCode('not a url')).toBe('global-en')
  })
})

import { marketLabel } from './markets'

describe('marketLabel（项目列表/首页展示用）', () => {
  it('按语言返回显示名；旧文案/空值返回 null（调用方显示"未设置"）', () => {
    expect(marketLabel('gb', 'zh')).toBe('英国')
    expect(marketLabel('gb', 'en')).toBe('United Kingdom')
    expect(marketLabel('English · Global', 'zh')).toBeNull()
    expect(marketLabel('', 'en')).toBeNull()
  })
})
