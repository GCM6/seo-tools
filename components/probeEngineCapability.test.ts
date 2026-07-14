import { describe, it, expect } from 'vitest'
import { classifyBrandedAnswer, resolveWebSearchEnabled } from './probeEngineCapability'

describe('resolveWebSearchEnabled', () => {
  it('显式值优先于兜底表', () => {
    expect(resolveWebSearchEnabled('openai', false)).toBe(false)
    expect(resolveWebSearchEnabled('deepseek', true)).toBe(true)
  })

  it('无显式值时按 provider 静态能力表兜底', () => {
    expect(resolveWebSearchEnabled('deepseek', undefined)).toBe(false)
    expect(resolveWebSearchEnabled('openai', undefined)).toBe(true)
  })

  it('未登记的 provider 保守按检索型处理', () => {
    expect(resolveWebSearchEnabled('anthropic', undefined)).toBe(true)
  })

  it('provider 缺失也按检索型处理', () => {
    expect(resolveWebSearchEnabled(undefined, undefined)).toBe(true)
  })
})

describe('classifyBrandedAnswer（D3 五态）', () => {
  it('联网引擎：有引用 → grounded', () => {
    expect(classifyBrandedAnswer({ provider: 'openai', citedUrls: ['https://a.com'] })).toBe('grounded')
  })

  it('联网引擎：无引用但 hedged → speculative', () => {
    expect(classifyBrandedAnswer({ provider: 'openai', citedUrls: [], hedged: true })).toBe('speculative')
  })

  it('联网引擎：无引用、承认不知道 → unknown', () => {
    expect(classifyBrandedAnswer({ provider: 'openai', citedUrls: [], unknownAdmission: true })).toBe('unknown')
  })

  it('联网引擎：无引用、无 hedge、无承认 → unverified（断言无依据）', () => {
    expect(classifyBrandedAnswer({ provider: 'openai', citedUrls: [] })).toBe('unverified')
  })

  it('判定优先级：cited 优先于 hedged/unknownAdmission', () => {
    expect(classifyBrandedAnswer({ provider: 'openai', citedUrls: ['https://a.com'], hedged: true, unknownAdmission: true })).toBe(
      'grounded',
    )
  })

  it('非联网引擎（如 deepseek）：禁止把 citedUrls=[] 当无依据，只有 speculative/unknown/undetermined 三档', () => {
    expect(classifyBrandedAnswer({ provider: 'deepseek', citedUrls: [] })).toBe('undetermined')
    expect(classifyBrandedAnswer({ provider: 'deepseek', hedged: true })).toBe('speculative')
    expect(classifyBrandedAnswer({ provider: 'deepseek', unknownAdmission: true })).toBe('unknown')
  })

  it('非联网引擎即便意外带 citedUrls 也不判 grounded', () => {
    expect(classifyBrandedAnswer({ provider: 'deepseek', citedUrls: ['https://a.com'] })).toBe('undetermined')
  })

  it('webSearchEnabled 显式覆盖能推翻 provider 静态表', () => {
    expect(classifyBrandedAnswer({ provider: 'deepseek', webSearchEnabled: true, citedUrls: ['https://a.com'] })).toBe('grounded')
  })
})
