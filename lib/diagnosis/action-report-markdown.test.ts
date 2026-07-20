import { describe, expect, it } from 'vitest'
import {
  renderActionReportMarkdown,
  summarizeEvidence,
  summarizeEvidenceRefs,
  type ActionReportRecommendation,
  type EvidenceSummaryInput,
} from './action-report-markdown'
import { appendAffectedPagesSection } from './recommend'

function recommendation(over: Partial<ActionReportRecommendation> = {}): ActionReportRecommendation {
  return {
    id: 'rec_1',
    what: '修复 canonical 指向',
    why: '信号错配',
    expectedImpact: '恢复规范化信号',
    effort: '低',
    risk: '改错会影响收录',
    validationMethod: '重新抓取确认自指',
    priority: 'quick_win',
    confidence: '高（实测）',
    status: 'accepted',
    evidenceRefs: ['ev_1'],
    ...over,
  }
}

function evidence(over: Partial<EvidenceSummaryInput> = {}): EvidenceSummaryInput {
  return {
    id: 'ev_1',
    type: 'site_audit',
    claimLevel: 'L4',
    source: 'site_audit',
    capturedAt: '2026-07-18T03:00:00.000Z',
    payload: { stats: { checked: 128 } },
    ...over,
  }
}

describe('renderActionReportMarkdown', () => {
  it('keeps accepted and edited cards as traceable execution records', () => {
    const markdown = renderActionReportMarkdown([
      recommendation(),
      recommendation({
        id: 'rec_2',
        status: 'edited',
        editedPayload: { what: '仅修复产品页 canonical', why: '人工缩小范围', note: '不要修改归档页' },
      }),
    ], { domain: 'example.com', runId: 'run_1', capturedAt: '2026-07-19' })

    expect(markdown).toContain('## 3. 已确认执行计划')
    expect(markdown).toContain('`rec_1` · 已接受')
    expect(markdown).toContain('`rec_2` · 已编辑后采纳')
    expect(markdown).toContain('仅修复产品页 canonical')
    expect(markdown).toContain('人工编辑说明：不要修改归档页')
    expect(markdown).toContain('证据引用：`ev_1`')
  })

  it('keeps rejected cards out of the execution plan but retains their decision trail', () => {
    const markdown = renderActionReportMarkdown([
      recommendation(),
      recommendation({ id: 'rec_rejected', what: '批量购买外链', status: 'rejected' }),
    ], { domain: 'example.com', runId: 'run_1', capturedAt: '' })

    const execution = markdown.slice(markdown.indexOf('## 3. 已确认执行计划'), markdown.indexOf('## 4. 已否决与未纳入范围'))
    expect(execution).not.toContain('批量购买外链')
    expect(markdown).toContain('`rec_rejected` · 已否决')
    expect(markdown).toContain('不进入本轮执行计划')
  })

  it('only replaces the summary section when an AI summary is supplied', () => {
    const markdown = renderActionReportMarkdown(
      [recommendation()],
      { domain: 'example.com', runId: 'run_1', capturedAt: '' },
      { executiveSummary: '- [rec_1] 先修复 canonical，再按原验证方式复测。' },
    )

    expect(markdown).toContain('- [rec_1] 先修复 canonical，再按原验证方式复测。')
    expect(markdown).toContain('## 3. 已确认执行计划')
    expect(markdown).toContain('验证方式：重新抓取确认自指')
  })

  // B1（P0-4）：命中侧算出的受影响 URL 清单要出现在报告的独立小节，而不是淹没在「为什么」里。
  it('renders an "受影响页面" section for recommendations carrying an affected-pages block in why, and keeps 为什么 clean', () => {
    const why = appendAffectedPagesSection('robots.txt 屏蔽了关键页。', {
      total: 12,
      sample: ['https://example.com/a', 'https://example.com/b'],
    })
    const markdown = renderActionReportMarkdown(
      [recommendation({ why })],
      { domain: 'example.com', runId: 'run_1', capturedAt: '' },
    )

    expect(markdown).toContain('- 为什么：robots.txt 屏蔽了关键页。')
    expect(markdown).not.toContain('- 为什么：robots.txt 屏蔽了关键页。\n\n受影响页面')
    expect(markdown).toContain('- 受影响页面：共 12 个，已列前 2 个：https://example.com/a、https://example.com/b')
  })

  it('does not render an 受影响页面 section when the recommendation has no affected-pages block', () => {
    const markdown = renderActionReportMarkdown(
      [recommendation()],
      { domain: 'example.com', runId: 'run_1', capturedAt: '' },
    )
    expect(markdown).not.toContain('受影响页面')
  })

  // B2（P0-4）：证据引用要从裸 ID 变成「类型 + 采集时间 + 关键值」的人类可读摘要，ID 仍保留在括号里。
  describe('证据引用人类可读摘要（B2）', () => {
    it('summarizeEvidence 拼出类型/日期/关键值/内部 ID', () => {
      const summary = summarizeEvidence(evidence())
      expect(summary).toContain('全站轻检')
      expect(summary).toContain('2026-07-18')
      expect(summary).toContain('共检测 128 页')
      expect(summary).toContain('（ev_1）')
    })

    it('summarizeEvidenceRefs 对查不到的 ref 如实标注，不静默丢弃', () => {
      const summaries = summarizeEvidenceRefs(['ev_missing'], new Map())
      expect(summaries).toEqual(['未找到对应证据记录（ev_missing）'])
    })

    it('renderActionReportMarkdown 在提供 evidenceById 时用摘要替换裸 ID', () => {
      const markdown = renderActionReportMarkdown(
        [recommendation({ evidenceRefs: ['ev_1'] })],
        { domain: 'example.com', runId: 'run_1', capturedAt: '' },
        { evidenceById: new Map([['ev_1', evidence()]]) },
      )
      expect(markdown).toContain('- 证据引用：全站轻检（2026-07-18 · L4）：共检测 128 页（ev_1）')
      expect(markdown).not.toContain('证据引用：`ev_1`')
    })

    it('未提供 evidenceById 时回退裸 ID，向后兼容既有调用', () => {
      const markdown = renderActionReportMarkdown(
        [recommendation({ evidenceRefs: ['ev_1'] })],
        { domain: 'example.com', runId: 'run_1', capturedAt: '' },
      )
      expect(markdown).toContain('证据引用：`ev_1`')
    })

    it('已否决建议同样按 evidenceById 解析证据引用', () => {
      const markdown = renderActionReportMarkdown(
        [recommendation({ id: 'rec_rejected', status: 'rejected', evidenceRefs: ['ev_1'] })],
        { domain: 'example.com', runId: 'run_1', capturedAt: '' },
        { evidenceById: new Map([['ev_1', evidence()]]) },
      )
      expect(markdown).toContain('- 证据引用：全站轻检（2026-07-18 · L4）：共检测 128 页（ev_1）')
    })
  })
})
