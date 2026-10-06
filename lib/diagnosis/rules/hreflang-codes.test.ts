import { describe, it, expect } from 'vitest'
import { checkHreflang, ISO_639_1, ISO_3166_1_A2 } from './hreflang-codes'

describe('checkHreflang（SP-A §5.2 #1：BCP 47 子集）', () => {
  it('合法：语言 / 语言-地区 / 语言-文字 / 语言-文字-地区 / x-default；uk（乌克兰语）、eu（巴斯克语）是语言码', () => {
    for (const code of ['en', 'uk', 'eu', 'x-default', 'X-Default', 'zh-Hant', 'zh-Hant-TW', 'en-GB', 'en-gb']) {
      expect(checkHreflang(code), code).toEqual({ ok: true })
    }
  })

  it('en-uk → bad_region，建议改为 en-gb（英国的 ISO 代码是 GB）', () => {
    expect(checkHreflang('en-uk')).toEqual({ ok: false, reason: 'bad_region', suggestion: 'en-gb' })
  })

  it('下划线、整词、多余段 → bad_language / bad_format', () => {
    expect(checkHreflang('en_us')).toMatchObject({ ok: false, reason: 'bad_language' })
    expect(checkHreflang('english')).toMatchObject({ ok: false, reason: 'bad_language' })
    expect(checkHreflang('en-UK-x-y')).toMatchObject({ ok: false, reason: 'bad_format' })
    expect(checkHreflang('zh-TW-Hant')).toMatchObject({ ok: false, reason: 'bad_format' })
  })

  it('EU / UN 等非 ISO 3166-1 正式分配的地区码不算合法地区', () => {
    expect(checkHreflang('en-eu')).toMatchObject({ ok: false, reason: 'bad_region' })
    expect(checkHreflang('en-un')).toMatchObject({ ok: false, reason: 'bad_region' })
  })

  it('代码表规模与来源一致：语言 184、地区 249', () => {
    expect(ISO_639_1.size).toBe(184)
    expect(ISO_3166_1_A2.size).toBe(249)
  })
})
