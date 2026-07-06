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
