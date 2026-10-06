import { describe, it, expect } from 'vitest'
import { sitePhrases } from './site-phrases'

describe('sitePhrases（SP-A §3.3 第 4 来源）', () => {
  it('从 title/H1 切出 2–6 词英文短语、去品牌、去重、转小写（输入取自 metadocu 真实标题）', () => {
    expect(
      sitePhrases({
        titles: [
          'Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu',
          'Privacy Policy - MetaDocu | MetaDocu',
          'MetaDocu alternatives',
        ],
        h1s: ['Remove PDF Metadata Online'],
        brand: 'metadocu',
        aliases: [],
      }),
    ).toEqual(['remove pdf metadata online', 'free, no upload', 'privacy policy'])
  })

  it('单词、超过 6 词、中文都丢弃', () => {
    expect(sitePhrases({ titles: ['Home', 'one two three four five six seven', '清除元数据工具'], h1s: [], brand: 'x', aliases: [] })).toEqual([])
  })
})
