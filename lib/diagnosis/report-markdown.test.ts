import { describe, it, expect } from 'vitest'
import { buildReport, type ReportFinding, type ReportRecommendation } from './report'
import { renderReportMarkdown } from './report-markdown'
import type { ReferenceArtifactRow } from './reference-artifacts'

const NOW = new Date('2026-07-06T00:00:00Z')

function finding(over: Partial<ReportFinding>): ReportFinding {
  return {
    id: 'f1',
    side: 'technical',
    pillar: 'P1',
    title: '示例发现',
    description: '',
    severity: 'high',
    claimType: 'inferred',
    confidence: '',
    evidenceRefs: ['ev1'],
    status: 'open',
    ...over,
  }
}

function rec(over: Partial<ReportRecommendation>): ReportRecommendation {
  return {
    id: 'r1',
    findingId: 'f1',
    what: '修复 robots 屏蔽',
    why: '',
    expectedImpact: '恢复抓取',
    effort: '低',
    priority: 'quick_win',
    confidence: '',
    status: 'accepted',
    outcome: 'unknown',
    validationMethod: '重跑轻检确认 200',
    ...over,
  }
}

const staleArtifact: ReferenceArtifactRow = {
  artifactKey: 'ai_crawler_ua_list',
  sourceUrl: 'https://darkvisitors.com/agents',
  // 上次校验在很久以前 → 超过 30 天 cadence，判 stale。
  lastVerifiedAt: '2026-01-01T00:00:00Z',
  refreshCadenceDays: 30,
}

describe('renderReportMarkdown', () => {
  it('renders all eight section headings and the report title', () => {
    const model = buildReport({
      findings: [finding({})],
      recommendations: [rec({})],
      pillarsWithData: ['P1'],
      artifacts: [],
      now: NOW,
    })
    const md = renderReportMarkdown(model, { domain: 'example.com', runId: 'run_1', capturedAt: '2026-07-06' })

    expect(md).toContain('# 综合诊断报告 · example.com')
    for (const h of [
      '## 1. 执行摘要',
      '## 2. 方法与范围',
      '## 3. 五支柱明细',
      '## 4. 关键词现状与缺口',
      '## 5. 竞品对比',
      '## 6. 优先级矩阵',
      '## 7. 行动路线图',
      '## 8. 回测计划与闭环结果',
    ]) {
      expect(md).toContain(h)
    }
  })

  it('reflects the four-quadrant counts from the priority matrix', () => {
    const model = buildReport({
      findings: [finding({})],
      recommendations: [
        rec({ id: 'a', priority: 'quick_win' }),
        rec({ id: 'b', priority: 'quick_win' }),
        rec({ id: 'c', priority: 'strategic' }),
      ],
      pillarsWithData: ['P1'],
      artifacts: [],
      now: NOW,
    })
    const md = renderReportMarkdown(model, { domain: 'example.com', runId: 'run_1', capturedAt: '2026-07-06' })

    expect(md).toContain('速赢（高影响 · 低成本） · 2 项')
    expect(md).toContain('战略（高影响 · 高成本） · 1 项')
    expect(md).toContain('填充（低影响 · 低成本） · 0 项')
  })

  it('emits the constraint-locator phrase (systemic_basics on a P1 high finding)', () => {
    const model = buildReport({
      findings: [finding({ pillar: 'P1', severity: 'high' })],
      recommendations: [],
      pillarsWithData: ['P1'],
      artifacts: [],
      now: NOW,
    })
    const md = renderReportMarkdown(model, { domain: 'x', runId: 'r', capturedAt: '' })
    expect(md).toContain('系统性基础问题')
    expect(md).toContain('约束定位（推断）')
  })

  it('renders the health score (overall + per-pillar) labeled 推断, never 实测', () => {
    const model = buildReport({
      findings: [finding({ pillar: 'P1', severity: 'mid' })],
      recommendations: [],
      pillarsWithData: ['P1'],
      artifacts: [],
      now: NOW,
    })
    const md = renderReportMarkdown(model, { domain: 'x', runId: 'r', capturedAt: '' })
    expect(md).toContain('总健康分：')
    // 健康分标题恒标「推断」，绝不冒用「实测」。
    expect(md).toContain('### 健康分（推断）')
    expect(md).not.toContain('健康分（实测）')
    // P2 未采集 → 未评分，不得写成 0。
    expect(md).toContain('P2 结构化数据与可解析性：未评分')
  })

  it('renders the stale rule-freshness warning with the last-verified date and label', () => {
    const model = buildReport({
      findings: [finding({})],
      recommendations: [],
      pillarsWithData: ['P1'],
      artifacts: [staleArtifact],
      now: NOW,
    })
    const md = renderReportMarkdown(model, { domain: 'x', runId: 'r', capturedAt: '' })
    expect(md).toContain('规则保鲜告警')
    expect(md).toContain('规则库最后校验于 2026-01-01T00:00:00Z')
    expect(md).toContain('AI 爬虫 User-Agent 清单')
  })

  it('renders the report contract and incomplete data-source states', () => {
    const model = buildReport({
      findings: [],
      recommendations: [],
      scope: { domain: 'example.com', entryUrl: 'https://example.com/', capturedAt: '2026-07-06' },
      dataSources: [{
        sourceKey: 'ai_probe', configured: true, authorized: true, attempted: true,
        status: 'partial', capturedEvidenceCount: 2,
      }],
      coverageStats: { checkedPages: 3, aiValidSamples: 2 },
      now: NOW,
    })

    const md = renderReportMarkdown(model, { domain: 'example.com', runId: 'run_1', capturedAt: '2026-07-06' })
    expect(md).toContain('### 诊断范围与覆盖度')
    expect(md).toContain('报告等级：R0')
    expect(md).toContain('ai_probe：partial（证据 2）')
    expect(md).toContain('未覆盖项：ai_probe')
  })
})
