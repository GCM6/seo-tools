import { describe, it, expect } from 'vitest'
import { guessMarketLanguage } from './locale-guess'

// marketIndex 对应 screen1.marketOptions 下标：0=中文·中国大陆, 1=English·Global, 2=东南亚。
describe('guessMarketLanguage', () => {
  it('.cn 域名 → 中国大陆 + zh', () => {
    expect(guessMarketLanguage('example.cn')).toEqual({ marketIndex: 0, language: 'zh' })
    expect(guessMarketLanguage('https://shop.example.com.cn')).toEqual({ marketIndex: 0, language: 'zh' })
  })

  it('东南亚 ccTLD → 东南亚 + en', () => {
    for (const d of ['brand.sg', 'brand.my', 'brand.co.th', 'brand.id', 'brand.vn', 'brand.ph']) {
      expect(guessMarketLanguage(d)).toEqual({ marketIndex: 2, language: 'en' })
    }
  })

  it('其余（.com/.io/.co.uk 等）→ English · Global', () => {
    expect(guessMarketLanguage('example.com')).toEqual({ marketIndex: 1, language: 'en' })
    expect(guessMarketLanguage('brand.io')).toEqual({ marketIndex: 1, language: 'en' })
    expect(guessMarketLanguage('brand.co.uk')).toEqual({ marketIndex: 1, language: 'en' })
  })

  it('带 scheme / 裸域名 / 无法解析都不抛', () => {
    expect(guessMarketLanguage('https://www.example.cn/path')).toEqual({ marketIndex: 0, language: 'zh' })
    expect(guessMarketLanguage('not a url')).toEqual({ marketIndex: 1, language: 'en' })
    expect(guessMarketLanguage('')).toEqual({ marketIndex: 1, language: 'en' })
  })
})
