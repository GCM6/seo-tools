import { describe, it, expect } from 'vitest'
import { buildPromptSet, buildPromptSetV2, brandFromDomain } from './prompt-set'

const zhInput = {
  domain: 'https://metadocu.com/',
  industry: 'B2B SaaS · 项目协作',
  market: '中文 · 中国大陆',
  language: 'zh',
  competitors: ['Notion', 'Confluence'],
}

describe('brandFromDomain', () => {
  it('derives the brand token from a URL or bare domain', () => {
    expect(brandFromDomain('https://www.metadocu.com/')).toBe('metadocu')
    expect(brandFromDomain('metadocu.com')).toBe('metadocu')
    expect(brandFromDomain('https://docs.example.co.uk/x')).toBe('example')
  })
})

describe('buildPromptSet', () => {
  it('produces exactly 20 prompts, all non-empty, protocol fields filled', () => {
    const prompts = buildPromptSet(zhInput)
    expect(prompts).toHaveLength(20)
    for (const p of prompts) {
      expect(p.text.trim()).not.toBe('')
      expect(p.source).toBe('template_v1')
      expect(p.market).toBe(zhInput.market)
      expect(p.language).toBe('zh')
    }
  })

  it('covers at least 4 distinct intents', () => {
    const intents = new Set(buildPromptSet(zhInput).map((p) => p.intent))
    expect(intents.size).toBeGreaterThanOrEqual(4)
  })

  it('fills industry into category prompts and brand into brand prompts (zh)', () => {
    const prompts = buildPromptSet(zhInput)
    expect(prompts.some((p) => p.text.includes('B2B SaaS · 项目协作'))).toBe(true)
    expect(prompts.some((p) => p.text.includes('metadocu'))).toBe(true)
  })

  it('weaves competitors into comparison prompts when provided', () => {
    const prompts = buildPromptSet(zhInput)
    expect(prompts.some((p) => p.text.includes('Notion'))).toBe(true)
  })

  it('still produces 20 prompts without competitors', () => {
    const prompts = buildPromptSet({ ...zhInput, competitors: [] })
    expect(prompts).toHaveLength(20)
    expect(prompts.every((p) => p.text.trim() !== '')).toBe(true)
  })

  it('produces English prompts for non-zh language', () => {
    // en locale 下表单提供的行业文案本身就是英文（en.json industryOptions）
    const prompts = buildPromptSet({
      ...zhInput,
      language: 'en',
      market: 'English · Global',
      industry: 'B2B SaaS · Team collaboration',
    })
    expect(prompts).toHaveLength(20)
    expect(prompts.some((p) => /best|recommend|compare|alternatives/i.test(p.text))).toBe(true)
    expect(prompts.every((p) => !/[一-鿿]/.test(p.text))).toBe(true)
  })

  it('is deterministic: same input, same output（同协议回测前提）', () => {
    expect(buildPromptSet(zhInput)).toEqual(buildPromptSet(zhInput))
  })
})

describe('buildPromptSetV2', () => {
  it('produces exactly 30 layered prompts, all non-empty, source=template_v2', () => {
    const prompts = buildPromptSetV2(zhInput)
    expect(prompts).toHaveLength(30)
    for (const p of prompts) {
      expect(p.text.trim()).not.toBe('')
      expect(p.source).toBe('template_v2')
      expect(p.market).toBe(zhInput.market)
      expect(p.language).toBe('zh')
    }
  })

  it('honors the per-category quota (brand 5 / recommendation 8 / comparison 6 / howto 8 / trust 3)', () => {
    const prompts = buildPromptSetV2(zhInput)
    const count = (intent: string) => prompts.filter((p) => p.intent === intent).length
    expect(count('brand')).toBe(5)
    expect(count('recommendation')).toBe(8)
    expect(count('comparison')).toBe(6)
    expect(count('howto')).toBe(8)
    expect(count('trust')).toBe(3)
  })

  it('includes the v2 brand-direct prompts (new vs v1)', () => {
    const prompts = buildPromptSetV2(zhInput)
    const brandPrompts = prompts.filter((p) => p.intent === 'brand')
    expect(brandPrompts).toHaveLength(5)
    expect(brandPrompts.some((p) => p.text.includes('是什么'))).toBe(true)
    expect(brandPrompts.some((p) => p.text.includes('靠谱'))).toBe(true)
    expect(brandPrompts.every((p) => p.text.includes('metadocu'))).toBe(true)
  })

  it('assigns priorities 0..29 in category order (deterministic ordering)', () => {
    const prompts = buildPromptSetV2(zhInput)
    expect(prompts.map((p) => p.priority)).toEqual(Array.from({ length: 30 }, (_, i) => i))
    // 品牌类在最前
    expect(prompts.slice(0, 5).every((p) => p.intent === 'brand')).toBe(true)
  })

  it('weaves competitors into brand/comparison prompts when provided', () => {
    const prompts = buildPromptSetV2(zhInput)
    expect(prompts.some((p) => p.text.includes('Notion'))).toBe(true)
  })

  it('still produces 30 prompts with category fallback when no competitors', () => {
    const prompts = buildPromptSetV2({ ...zhInput, competitors: [] })
    expect(prompts).toHaveLength(30)
    expect(prompts.every((p) => p.text.trim() !== '')).toBe(true)
    // 无竞品时不应残留竞品占位
    expect(prompts.some((p) => p.text.includes('Notion'))).toBe(false)
  })

  it('produces English prompts for non-zh language', () => {
    const prompts = buildPromptSetV2({
      ...zhInput,
      language: 'en',
      market: 'English · Global',
      industry: 'B2B SaaS · Team collaboration',
    })
    expect(prompts).toHaveLength(30)
    expect(prompts.every((p) => !/[一-鿿]/.test(p.text))).toBe(true)
    expect(prompts.some((p) => /what is/i.test(p.text))).toBe(true)
  })

  it('is deterministic: same input, same output', () => {
    expect(buildPromptSetV2(zhInput)).toEqual(buildPromptSetV2(zhInput))
  })
})

// D1：branded 标注——对生成后的问题文本跑与 parse.ts 同源的 mentions 匹配。
describe('buildPromptSetV2 — branded 标注 (D1)', () => {
  it('marks all 5 brand-category prompts as branded (template always includes the brand token)', () => {
    const prompts = buildPromptSetV2(zhInput)
    const brandPrompts = prompts.filter((p) => p.intent === 'brand')
    expect(brandPrompts).toHaveLength(5)
    expect(brandPrompts.every((p) => p.branded)).toBe(true)
  })

  it('marks pure category-recommendation prompts as unbranded (no brand token in the template)', () => {
    const prompts = buildPromptSetV2(zhInput)
    const recPrompts = prompts.filter((p) => p.intent === 'recommendation')
    expect(recPrompts.every((p) => !p.branded)).toBe(true)
  })

  it('conditional comparison template flips branded depending on whether a competitor is configured', () => {
    // 第一条对比模板：有 comp1 时写「品牌 和 comp1 相比」（含品牌）；无 comp1 时退化为品类问法（不含品牌）。
    const withCompetitor = buildPromptSetV2(zhInput).filter((p) => p.intent === 'comparison')[0]
    const withoutCompetitor = buildPromptSetV2({ ...zhInput, competitors: [] }).filter((p) => p.intent === 'comparison')[0]
    expect(withCompetitor.text).toContain('metadocu')
    expect(withCompetitor.branded).toBe(true)
    expect(withoutCompetitor.text).not.toContain('metadocu')
    expect(withoutCompetitor.branded).toBe(false)
  })

  it('D7: an alias-only mention (no literal brand token) still marks the prompt branded', () => {
    const prompts = buildPromptSetV2({ ...zhInput, aliases: ['小docu'] })
    // 用别名断言：模板本身不会自动织入别名，这里直接构造一个含别名的确定性场景验证判定逻辑本身。
    // 用 industry 兜底位注入别名文本，触发品类推荐句里出现别名 token。
    const withAliasInIndustry = buildPromptSetV2({ ...zhInput, industry: '小docu 所在的 B2B SaaS', aliases: ['小docu'] })
    expect(withAliasInIndustry.some((p) => p.branded && p.intent === 'recommendation')).toBe(true)
    expect(prompts.length).toBe(30) // aliases 不影响配额/条数
  })

  it('every prompt object exposes a boolean branded field', () => {
    const prompts = buildPromptSetV2(zhInput)
    expect(prompts.every((p) => typeof p.branded === 'boolean')).toBe(true)
  })
})

describe('buildPromptSet (v1) — branded 标注 (D1)', () => {
  it('exposes branded on legacy v1 prompts too', () => {
    const prompts = buildPromptSet(zhInput)
    expect(prompts.some((p) => p.branded)).toBe(true)
    expect(prompts.every((p) => typeof p.branded === 'boolean')).toBe(true)
  })
})
