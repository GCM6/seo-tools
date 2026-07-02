import { describe, it, expect } from 'vitest'
import { buildPromptSet, brandFromDomain } from './prompt-set'

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
