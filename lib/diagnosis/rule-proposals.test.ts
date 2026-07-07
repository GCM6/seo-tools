import { describe, it, expect } from 'vitest'
import {
  hasValidEvidence,
  deriveNextRulesVersion,
  assertReleasableVersion,
  computeArtifactUpdate,
  groupChangelog,
  rulesVersionDelta,
} from './rule-proposals'

const now = new Date('2026-08-01T00:00:00Z')

describe('hasValidEvidence', () => {
  it('至少一个非空白字符串才算有效', () => {
    expect(hasValidEvidence(['https://x'])).toBe(true)
    expect(hasValidEvidence([])).toBe(false)
    expect(hasValidEvidence(['  '])).toBe(false)
    expect(hasValidEvidence(null)).toBe(false)
    expect(hasValidEvidence(undefined)).toBe(false)
  })
})

describe('deriveNextRulesVersion', () => {
  it('空发布序列时基于 currentVersion 递增', () => {
    expect(deriveNextRulesVersion([], 'rules_v1')).toBe('rules_v2')
  })
  it('取所有版本最大值 +1', () => {
    expect(deriveNextRulesVersion(['rules_v2', 'rules_v3'], 'rules_v1')).toBe('rules_v4')
  })
  it('忽略非法格式', () => {
    expect(deriveNextRulesVersion(['garbage', 'rules_v5'], 'rules_v1')).toBe('rules_v6')
  })
  it('按数值取最大而非字符串序（v10 > v9）', () => {
    expect(deriveNextRulesVersion(['rules_v9', 'rules_v10'], 'rules_v1')).toBe('rules_v11')
  })
})

describe('assertReleasableVersion', () => {
  it('数值严格大于已发布最大值时通过', () => {
    expect(() => assertReleasableVersion('rules_v3', ['rules_v1', 'rules_v2'])).not.toThrow()
    expect(() => assertReleasableVersion('rules_v2', [])).not.toThrow()
  })
  it('重发已发布版本抛错', () => {
    expect(() => assertReleasableVersion('rules_v2', ['rules_v1', 'rules_v2'])).toThrow('rules_version_already_released')
  })
  it('发布不高于最大已发布版本抛错（含相等/更低）', () => {
    expect(() => assertReleasableVersion('rules_v2', ['rules_v3'])).toThrow('rules_version_not_monotonic')
  })
  it('按数值比较而非字符串序（v10 > v9 通过）', () => {
    expect(() => assertReleasableVersion('rules_v10', ['rules_v9'])).not.toThrow()
  })
  it('格式非法抛错', () => {
    expect(() => assertReleasableVersion('v2', [])).toThrow('rules_version_format_invalid')
  })
})

describe('computeArtifactUpdate', () => {
  it('无 payload diff 时仅 bump version + last_verified_at', () => {
    const patch = computeArtifactUpdate({ version: 'v1', payload: { a: 1 } }, null, now)
    expect(patch).toEqual({ version: 'v2', lastVerifiedAt: '2026-08-01T00:00:00.000Z' })
  })
  it('带 payload diff 时覆盖 payload', () => {
    const patch = computeArtifactUpdate({ version: 'v3', payload: null }, { payload: { ua: ['GPTBot'] } }, now)
    expect(patch).toEqual({ version: 'v4', lastVerifiedAt: '2026-08-01T00:00:00.000Z', payload: { ua: ['GPTBot'] } })
  })
  it('非标准 version 兜底为 v2', () => {
    expect(computeArtifactUpdate({ version: 'weird', payload: null }, null, now).version).toBe('v2')
  })
  it('显式 null payload 会覆盖写入 payload:null（当前行为，潜在脚枪，此测试钉死以便未来加守卫是自觉修改）', () => {
    const patch = computeArtifactUpdate({ version: 'v1', payload: { a: 1 } }, { payload: null }, now)
    expect(patch).toEqual({ version: 'v2', lastVerifiedAt: '2026-08-01T00:00:00.000Z', payload: null })
  })
})

describe('groupChangelog', () => {
  it('只收 approved+已发布，按版本降序分组', () => {
    const out = groupChangelog([
      { changeType: 'update_artifact', target: 'ai_crawler_ua_list', evidenceRefs: ['u1'], reviewedAt: 'r1', status: 'approved', releasedInRulesVersion: 'rules_v2' },
      { changeType: 'new_rule', target: 'X01', evidenceRefs: ['u2'], reviewedAt: 'r2', status: 'approved', releasedInRulesVersion: 'rules_v3' },
      { changeType: 'deprecate', target: 'Y', evidenceRefs: ['u3'], reviewedAt: null, status: 'approved', releasedInRulesVersion: null }, // 未发布，剔除
      { changeType: 'new_rule', target: 'Z', evidenceRefs: ['u4'], reviewedAt: null, status: 'rejected', releasedInRulesVersion: 'rules_v2' }, // rejected，剔除
    ])
    expect(out.map((e) => e.version)).toEqual(['rules_v3', 'rules_v2'])
    expect(out[1].proposals).toHaveLength(1)
    expect(out[1].proposals[0].target).toBe('ai_crawler_ua_list')
  })
  it('同一版本下的多个 approved+已发布提案合并为一条', () => {
    const out = groupChangelog([
      { changeType: 'update_artifact', target: 'A', evidenceRefs: ['u1'], reviewedAt: 'r1', status: 'approved', releasedInRulesVersion: 'rules_v2' },
      { changeType: 'new_rule', target: 'B', evidenceRefs: ['u2'], reviewedAt: 'r2', status: 'approved', releasedInRulesVersion: 'rules_v2' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].version).toBe('rules_v2')
    expect(out[0].proposals).toHaveLength(2)
  })
  it('版本降序按数值排（v10 在 v2 之前）', () => {
    const out = groupChangelog([
      { changeType: 'new_rule', target: 'A', evidenceRefs: ['u1'], reviewedAt: 'r1', status: 'approved', releasedInRulesVersion: 'rules_v2' },
      { changeType: 'new_rule', target: 'B', evidenceRefs: ['u2'], reviewedAt: 'r2', status: 'approved', releasedInRulesVersion: 'rules_v10' },
    ])
    expect(out.map((e) => e.version)).toEqual(['rules_v10', 'rules_v2'])
  })
})

describe('rulesVersionDelta', () => {
  it('相同或缺失返回 null', () => {
    expect(rulesVersionDelta('rules_v1', 'rules_v1')).toBeNull()
    expect(rulesVersionDelta(null, 'rules_v2')).toBeNull()
    expect(rulesVersionDelta('rules_v1', null)).toBeNull()
  })
  it('不同返回 from/to', () => {
    expect(rulesVersionDelta('rules_v1', 'rules_v2')).toEqual({ from: 'rules_v1', to: 'rules_v2' })
  })
})
