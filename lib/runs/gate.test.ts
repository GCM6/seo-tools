import { describe, it, expect } from 'vitest'
import { runGateError, resolveSessionRunGate } from './gate'

const ok = { industry: 'document metadata removal tool', market: 'global-en' }

describe('runGateError（SP-A §3.5：所有建 run / 派发采集的入口共用）', () => {
  it('合规 → null', () => {
    expect(runGateError(ok)).toBeNull()
  })
  it('品类优先于市场报错', () => {
    expect(runGateError({ industry: 'B2B SaaS · 项目协作', market: 'English · Global' })).toBe('category_required')
  })
  it.each([
    [{ industry: '', market: 'gb' }, 'category_required'],
    [{ industry: null, market: 'gb' }, 'category_required'],
    [{ industry: 'saas tool', market: '中文 · 中国大陆' }, 'market_required'],
    [{ industry: 'saas tool', market: null }, 'market_required'],
  ] as const)('%j → %s', (project, expected) => {
    expect(runGateError(project)).toBe(expected)
  })
})

describe('resolveSessionRunGate（分析会话入口：品类/市场无效 → 回到等待补充）', () => {
  it('项目旧值无效、会话补充了合规值 → 生成项目补丁并放行', () => {
    const r = resolveSessionRunGate({ industry: 'B2B SaaS · 项目协作', market: 'English · Global' }, { industry: 'saas tool', market: 'us' })
    expect(r).toEqual({ projectPatch: { industry: 'saas tool', market: 'us', language: 'en' }, gate: null, missingFields: [] })
  })
  it('项目已合规、会话值无效 → 不覆盖项目，放行', () => {
    const r = resolveSessionRunGate(ok, { industry: '其他…', market: 'Southeast Asia' })
    expect(r).toEqual({ projectPatch: { language: 'en' }, gate: null, missingFields: [] })
  })
  it('两边都无效 → 拦住，要求补 industry 与 market', () => {
    const r = resolveSessionRunGate({ industry: '', market: '' }, { industry: '', market: '东南亚' })
    expect(r.gate).toBe('category_required')
    expect(r.missingFields).toEqual(['industry', 'market'])
  })
  it('只缺市场 → 只要求补 market', () => {
    const r = resolveSessionRunGate({ industry: 'saas tool', market: '' }, { industry: '', market: '' })
    expect(r).toMatchObject({ gate: 'market_required', missingFields: ['market'] })
  })
})
