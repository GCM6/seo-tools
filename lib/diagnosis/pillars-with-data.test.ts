import { describe, it, expect } from 'vitest'
import { pillarsWithData } from './pillars-with-data'

describe('pillarsWithData', () => {
  // 锚点用例①（本次修复的核心回归）：P4 唯一证据类型 dataforseo_serp 存在，
  // 但确认竞品数为 0 —— lib/diagnosis/rules/competitors.ts 的 Q01/Q02/Q03 会
  // 全部 no-op（0 finding），P4 不应被判定为「已评分」。
  it('excludes P4 when dataforseo_serp evidence exists but confirmedCompetitorCount is 0', () => {
    const result = pillarsWithData(['dataforseo_serp'], [], 0)
    expect(result).not.toContain('P4')
  })

  // 锚点用例②：同样的证据，确认竞品数 > 0 时，P4 应被判定为「已评分」
  // （此时 Q01/Q02/Q03 才有可能真正产出 finding）。
  it('includes P4 when dataforseo_serp evidence exists and confirmedCompetitorCount > 0', () => {
    const result = pillarsWithData(['dataforseo_serp'], [], 2)
    expect(result).toContain('P4')
  })

  it('includes P4 when a P4 finding exists even if confirmedCompetitorCount is 0 (already-evaluated evidence)', () => {
    // findingPillars 里出现 P4 说明规则确实评估过并产出结论，视为已评分，不受竞品数闸门影响。
    const result = pillarsWithData([], ['P4'], 0)
    expect(result).toContain('P4')
  })

  it('marks a pillar scored from evidence type alone (P1 via psi)', () => {
    const result = pillarsWithData(['psi'], [], 0)
    expect(result).toContain('P1')
  })

  it('marks a pillar scored from evidence type alone (P2 via schema)', () => {
    const result = pillarsWithData(['schema'], [], 0)
    expect(result).toContain('P2')
  })

  it('marks a pillar scored from evidence type alone (P3 via gsc)', () => {
    const result = pillarsWithData(['gsc'], [], 0)
    expect(result).toContain('P3')
  })

  it('marks a pillar scored from evidence type alone (P5 via ua_probe)', () => {
    const result = pillarsWithData(['ua_probe'], [], 0)
    expect(result).toContain('P5')
  })

  it('marks a pillar scored via finding pillars alone (no matching evidence types)', () => {
    const result = pillarsWithData([], ['P3'], 0)
    expect(result).toContain('P3')
  })

  it('returns pillars in canonical P1..P5 order regardless of input order', () => {
    const result = pillarsWithData(['ua_probe', 'psi', 'gsc'], ['P2'], 0)
    expect(result).toEqual(['P1', 'P2', 'P3', 'P5'])
  })

  it('ignores unknown evidence types and unknown finding pillar strings', () => {
    const result = pillarsWithData(['unknown_type'], ['P9', null], 0)
    expect(result).toEqual([])
  })

  it('returns an empty array when there is no evidence and no findings', () => {
    const result = pillarsWithData([], [], 0)
    expect(result).toEqual([])
  })
})
