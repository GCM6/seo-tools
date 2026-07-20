import { describe, it, expect } from 'vitest'
import type { RuleHit } from './types'
import {
  generateRecommendation,
  priorityQuadrant,
  deriveAffectedPages,
  appendAffectedPagesSection,
  extractAffectedPagesSection,
} from './recommend'

function hit(partial: Partial<RuleHit> & { ruleId: string }): RuleHit {
  return {
    ruleId: partial.ruleId,
    pillar: partial.pillar ?? 'P1',
    side: partial.side ?? 'technical',
    severity: partial.severity ?? 'warning',
    claimType: partial.claimType ?? 'measured_hard',
    title: partial.title ?? 't',
    description: partial.description ?? '该规则命中描述。',
    evidenceRefs: partial.evidenceRefs ?? ['ev_1'],
    scope: partial.scope ?? 'site',
    fingerprint: partial.fingerprint ?? 'fp',
    detail: partial.detail,
  }
}

describe('priorityQuadrant (Impact×Effort)', () => {
  it('maps the four quadrants', () => {
    expect(priorityQuadrant('high', 'low')).toBe('quick_win')
    expect(priorityQuadrant('high', 'mid')).toBe('strategic')
    expect(priorityQuadrant('high', 'high')).toBe('strategic')
    expect(priorityQuadrant('low', 'low')).toBe('fill_in')
    expect(priorityQuadrant('low', 'mid')).toBe('fill_in')
    expect(priorityQuadrant('low', 'high')).toBe('low')
  })
})

describe('generateRecommendation', () => {
  it('T04 error + low effort → quick_win, technical, carries fixSnippet in what', () => {
    const rec = generateRecommendation(hit({ ruleId: 'T04', severity: 'error' }))
    expect(rec.priority).toBe('quick_win')
    expect(rec.promptType).toBe('technical')
    expect(rec.what).toContain('rel="canonical"') // fixSnippet 并入 what
    expect(rec.effort).toBe('低')
    expect(rec.evidenceRefs).toEqual(['ev_1'])
    expect(rec.why).toContain('该规则命中描述') // why 源自 description
  })

  it('warning with large scope escalates impact to high → strategic for mid effort', () => {
    const rec = generateRecommendation(hit({ ruleId: 'C04', severity: 'warning', side: 'seo', detail: { affectedCount: 12 } }))
    // C04 effort=high, impact high → strategic
    expect(rec.priority).toBe('strategic')
    expect(rec.expectedImpact).toContain('12')
  })

  it('notice → low impact', () => {
    const rec = generateRecommendation(hit({ ruleId: 'C11', severity: 'notice', side: 'seo' }))
    // C11 effort=low, impact low → fill_in
    expect(rec.priority).toBe('fill_in')
  })

  it('confidence derives from claimType', () => {
    expect(generateRecommendation(hit({ ruleId: 'T04', claimType: 'measured_hard' })).confidence).toMatch(/实测/)
    expect(generateRecommendation(hit({ ruleId: 'C08', claimType: 'hypothesis', side: 'geo' })).confidence).toMatch(/假设/)
  })

  it('unknown ruleId falls back by side', () => {
    const tech = generateRecommendation(hit({ ruleId: 'ZZ99', side: 'technical' }))
    expect(tech.promptType).toBe('technical')
    const content = generateRecommendation(hit({ ruleId: 'ZZ98', side: 'geo' }))
    expect(content.promptType).toBe('content')
  })

  // B1（P0-4）：命中侧算出的受影响 URL 清单要流入建议（这里落到 why），而不是被静态模板丢弃。
  describe('受影响页面清单（B1）', () => {
    it('T01 的 blockedUrls 会被写进 why，且总数取 detail.blockedCount', () => {
      const rec = generateRecommendation(
        hit({
          ruleId: 'T01',
          detail: {
            blockedCount: 12,
            blockedKeyUrls: [],
            blockedUrls: ['https://example.com/a', 'https://example.com/b'],
          },
        }),
      )
      expect(rec.why).toContain('受影响页面（共 12 个，已列前 2 个）：')
      expect(rec.why).toContain('- https://example.com/a')
      expect(rec.why).toContain('- https://example.com/b')
    })

    it('examples 为 {url,...} 对象数组时也能提取（如 T04 canonical 示例）', () => {
      const rec = generateRecommendation(
        hit({
          ruleId: 'T04',
          detail: { count: 2, examples: [{ url: 'https://example.com/x', canonical: 'https://other.com/x' }] },
        }),
      )
      expect(rec.why).toContain('受影响页面（共 2 个，已列前 1 个）：')
      expect(rec.why).toContain('- https://example.com/x')
    })

    it('没有 URL 清单可提取时，why 不追加受影响页面小节', () => {
      const rec = generateRecommendation(hit({ ruleId: 'C11', detail: { count: 3 } }))
      expect(rec.why).not.toContain('受影响页面')
    })

    it('extractAffectedPagesSection 是 appendAffectedPagesSection 的逆运算', () => {
      const affected = deriveAffectedPages(
        hit({ ruleId: 'T01', detail: { blockedCount: 1, blockedUrls: ['https://example.com/a'] } }),
      )
      expect(affected).toEqual({ total: 1, sample: ['https://example.com/a'] })

      const appended = appendAffectedPagesSection('原始 why 文本', affected)
      const { why, affected: parsed } = extractAffectedPagesSection(appended)
      expect(why).toBe('原始 why 文本')
      expect(parsed).toEqual({ total: 1, shown: 1, urls: ['https://example.com/a'] })
    })

    it('extractAffectedPagesSection 遇到没有清单的 why 时原样返回、affected 为 null', () => {
      const { why, affected } = extractAffectedPagesSection('普通 why 文本，不含清单')
      expect(why).toBe('普通 why 文本，不含清单')
      expect(affected).toBeNull()
    })
  })
})
