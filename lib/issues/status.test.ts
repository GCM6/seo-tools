import { describe, it, expect } from 'vitest'
import { deriveStatus, type StatusInput } from './status'

const T0 = '2026-10-01T00:00:00.000Z' // 执行时间
const BEFORE = '2026-09-30T00:00:00.000Z'
const AFTER = '2026-10-02T00:00:00.000Z'
const s = (over: Partial<StatusInput>): StatusInput => ({
  decision: 'pending', executedAt: null, detection: 'present', lastCheckedAt: BEFORE, retiredReason: null, ...over,
})

describe('deriveStatus（spec 4.2 / 4.4）', () => {
  it.each<[string, Partial<StatusInput>, string]>([
    ['待处理 + 查出 → 待处理', {}, 'pending'],
    ['待处理 + 没了 → 自行消失', { detection: 'gone' }, 'self_resolved'],
    ['已纳入未执行 + 查出 → 待执行', { decision: 'included' }, 'to_execute'],
    ['已纳入未执行 + 没了 → 自行消失', { decision: 'included', detection: 'gone' }, 'self_resolved'],
    ['已执行，最近检查早于执行 → 已执行待复查', { decision: 'included', executedAt: T0, lastCheckedAt: BEFORE }, 'executed_awaiting'],
    ['已执行，还没有检查时间 → 已执行待复查', { decision: 'included', executedAt: T0, lastCheckedAt: null }, 'executed_awaiting'],
    ['已执行，执行后检查仍查出 → 改了没生效', { decision: 'included', executedAt: T0, lastCheckedAt: AFTER }, 'not_effective'],
    ['已执行，执行后检查没了 → 已修复', { decision: 'included', executedAt: T0, lastCheckedAt: AFTER, detection: 'gone' }, 'fixed'],
    ['检查与执行同一时刻算执行之后（与 isRetestAttributable 同口径）', { decision: 'included', executedAt: T0, lastCheckedAt: T0, detection: 'gone' }, 'fixed'],
    ['执行时间无法解析 → 保守为待复查', { decision: 'included', executedAt: 'not-a-date', lastCheckedAt: AFTER, detection: 'gone' }, 'executed_awaiting'],
    ['暂不处理 → 已排除', { decision: 'deferred' }, 'excluded'],
    ['误报 → 已排除', { decision: 'false_positive', detection: 'gone' }, 'excluded'],
    ['已关闭 → retired', { decision: 'included', retiredReason: 'protocol_changed' }, 'retired'],
    ['排除优先于关闭（4.4-9）', { decision: 'false_positive', retiredReason: 'rule_changed' }, 'excluded'],
  ])('%s', (_name, over, expected) => {
    expect(deriveStatus(s(over))).toBe(expected)
  })
})
