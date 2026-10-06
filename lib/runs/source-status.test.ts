import { describe, it, expect } from 'vitest'
import { aggregateParentStatus, subSourceKey, parentOf } from './source-status'

describe('aggregateParentStatus（SP-A §4.2 父级状态由子阶段汇总）', () => {
  it.each([
    [['collected', 'collected'], 'collected'],
    [['collected', 'failed'], 'partial'],
    [['collected', 'not_attempted'], 'partial'],
    [['partial', 'failed'], 'partial'],
    [['failed', 'failed'], 'failed'],
    [['not_attempted', 'failed'], 'failed'],
    [['not_attempted', 'not_attempted'], 'not_attempted'],
    [[], 'not_attempted'],
  ] as const)('%j → %s', (children, expected) => {
    expect(aggregateParentStatus([...children])).toBe(expected)
  })

  it('子阶段键用冒号（next-intl 的点号会被当成嵌套路径）', () => {
    expect(subSourceKey('dataforseo', 'labs')).toBe('dataforseo:labs')
    expect(parentOf('dataforseo:labs')).toBe('dataforseo')
    expect(parentOf('psi')).toBe('psi')
  })
})

describe('SUB_SOURCES：子阶段清单真源（SP-A §4.2）', () => {
  it('与三个采集器实际使用的子阶段一致', async () => {
    const { SUB_SOURCES } = await import('./source-status')
    const { DFS_SUB_STAGES } = await import('@/lib/dataforseo/collect-stage')
    const { SOCIAL_PLATFORMS } = await import('@/lib/collection/social-presence')
    expect(SUB_SOURCES.dataforseo).toEqual(DFS_SUB_STAGES)
    expect(SUB_SOURCES.social_presence).toEqual(SOCIAL_PLATFORMS)
    expect(SUB_SOURCES.third_party).toEqual(['wikipedia', 'reddit'])
  })

  it('每个子阶段在 zh / en 的 report.contract.subSourceLabel 里都有文案，且没有多余的 key', async () => {
    const { SUB_SOURCES } = await import('./source-status')
    const { readFileSync } = await import('node:fs')
    const expected = Object.entries(SUB_SOURCES).flatMap(([parent, children]) => children.map((c) => `${parent}_${c}`)).sort()
    for (const locale of ['zh', 'en']) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
      expect(Object.keys(messages.report.contract.subSourceLabel).sort(), locale).toEqual(expected)
      expect(typeof messages.report.contract.subSourceTitle, locale).toBe('string')
    }
  })
})
