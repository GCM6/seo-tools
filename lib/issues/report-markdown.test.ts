import { describe, it, expect } from 'vitest'
import { renderIssueReport, renderIssueReportDocument } from './report-markdown'
import { replayHistory } from './backfill'
import type { IssueEventDraft, IssueRecord } from './types'

const issue = { id: 'iss_1', title: '不符合 Google 富媒体结果要求', ruleId: 'C05c', status: 'to_execute', decision: 'included', flags: ['unverified'], unverifiedReason: 'history_no_ledger', severity: 'mid' } as unknown as IssueRecord
const ev = (over: Partial<IssueEventDraft>): IssueEventDraft => ({
  id: 'e', issueId: 'iss_1', runId: 'run_1', kind: 'observed', checked: true, hit: true, severity: 'mid', affectedCount: 2,
  fromStatus: null, toStatus: 'pending', flags: ['new'], note: null, actor: 'system', createdAt: '2026-07-12T00:00:00.000Z', ...over,
})
const mk = (over: Partial<IssueRecord>): IssueRecord => ({ ...issue, flags: [], unverifiedReason: null, ...over }) as IssueRecord

describe('renderIssueReport', () => {
  it('计数 + 每个问题的当前状态与经过（按时间）', () => {
    const md = renderIssueReport({
      domain: 'metadocu.com',
      issues: [issue],
      events: [
        ev({ kind: 'decision', fromStatus: 'pending', toStatus: 'to_execute', actor: 'operator', note: '历史回填', createdAt: '2026-07-18T00:00:00.000Z', checked: null, hit: null }),
        ev({}),
      ],
    })
    expect(md).toContain('## metadocu.com')
    expect(md).toContain('待执行 1')
    expect(md).toContain('### 不符合 Google 富媒体结果要求（C05c）')
    expect(md).toContain('当前：待执行 · 决定：已纳入 · 标记：未复查（历史数据没有台账）')
    const first = md.indexOf('2026-07-12')
    const second = md.indexOf('2026-07-18')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(md).toContain('2026-07-12 体检：查出（受影响 2）→ 待处理 [新出现]')
    expect(md).toContain('2026-07-18 决定：待处理 → 待执行（历史回填）')
  })

  it('问题顺序确定：先按状态，再按规则编号，再按标题（与传入顺序无关）', () => {
    const issues = [
      mk({ id: 'i5', status: 'retired', ruleId: 'A01', title: '甲' }),
      mk({ id: 'i4', status: 'fixed', ruleId: 'B02', title: '乙二' }),
      mk({ id: 'i3', status: 'fixed', ruleId: 'B02', title: '乙一' }),
      mk({ id: 'i2', status: 'fixed', ruleId: 'A09', title: '丙' }),
      mk({ id: 'i1', status: 'pending', ruleId: 'Z99', title: '丁' }),
    ]
    const md = renderIssueReport({ domain: 'a.com', issues, events: [] })
    const order = ['丁（Z99）', '丙（A09）', '乙一（B02）', '乙二（B02）', '甲（A01）'].map((t) => md.indexOf(`### ${t}`))
    expect(order.every((n) => n > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // 反向传入得到完全相同的文档。
    expect(renderIssueReport({ domain: 'a.com', issues: [...issues].reverse(), events: [] })).toBe(md)
    // 计数行与状态顺序一致，零个的状态不出现。
    expect(md).toContain('共 5 个问题：待处理 1；已修复 3；已关闭（不可比） 1')
    expect(md).not.toContain('待执行 0')
  })

  it('同一时刻的事件：先体检、再决定、再执行（回填里一次体检与当时的人工决定同刻）', () => {
    const at = '2026-07-18T00:00:00.000Z'
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [issue],
      events: [
        ev({ id: 'z_exec', kind: 'execution', fromStatus: 'to_execute', toStatus: 'executed_awaiting', actor: 'operator', note: '已改标题', createdAt: at, checked: null, hit: null, flags: [] }),
        ev({ id: 'b_dec', kind: 'decision', fromStatus: 'pending', toStatus: 'to_execute', actor: 'operator', note: '历史回填', createdAt: at, checked: null, hit: null, flags: [] }),
        ev({ id: 'a_dec', kind: 'decision', fromStatus: 'to_execute', toStatus: 'pending', actor: 'operator', note: '撤销', createdAt: at, checked: null, hit: null, flags: [] }),
        ev({ id: 'm_obs', createdAt: at }),
      ],
    })
    const idx = ['体检：查出', '决定：待处理 → 待执行', '执行：待执行 → 已执行，待复查'].map((s) => md.indexOf(s))
    const decisionByIdTie = [md.indexOf('决定：待执行 → 待处理（撤销）'), md.indexOf('决定：待处理 → 待执行（历史回填）')]
    expect(idx.every((n) => n > -1)).toBe(true)
    // 体检在两个决定之前，决定之间按事件 id 排（a_dec 先于 b_dec），执行最后。
    expect(idx[0]).toBeLessThan(decisionByIdTie[0])
    expect(decisionByIdTie[0]).toBeLessThan(decisionByIdTie[1])
    expect(decisionByIdTie[1]).toBeLessThan(idx[2])
  })

  it('没查的体检写明原因；检测口径变化的措辞不声称考题一定换了', () => {
    const retired = mk({ id: 'iss_1', status: 'retired', flags: ['protocol_changed'], retiredReason: 'protocol_changed' } as Partial<IssueRecord>)
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [retired],
      events: [
        ev({ id: 'e1', createdAt: '2026-07-01T00:00:00.000Z', checked: false, hit: null, severity: null, affectedCount: null, flags: ['unverified'], toStatus: 'pending', note: 'data_gap' }),
        ev({ id: 'e2', createdAt: '2026-07-02T00:00:00.000Z', checked: true, hit: false, severity: null, affectedCount: null, fromStatus: 'pending', toStatus: 'retired', flags: ['protocol_changed'], note: 'protocol_changed' }),
      ],
    })
    expect(md).toContain('2026-07-01 体检：没查（缺数据源）→ 待处理 [未复查]')
    expect(md).toContain('检测口径已变或无法确认一致')
    expect(md).not.toContain('协议已变')
    expect(md).not.toContain('考题已换')
  })

  it('规则没有受影响数时不写问号，也不写成 0', () => {
    const md = renderIssueReport({ domain: 'a.com', issues: [issue], events: [ev({ affectedCount: null })] })
    expect(md).toContain('体检：查出（受影响数未记录）→ 待处理 [新出现]')
    expect(md).not.toContain('受影响 ?')
  })

  it('回填恢复的同刻决定链按生成顺序显示：待处理 → 待执行，再 待执行 → 已排除', () => {
    // 一次体检里，发现既有被接受的建议、又被忽略：回填在同一时刻写下两条决定，顺序只能靠事件 id 定。
    let i = 0
    let e = 0
    const out = replayHistory({
      projectId: 'proj_1',
      runs: [{ id: 'run_a', status: 'reviewing', startedAt: null, finishedAt: '2026-07-12T00:00:00.000Z' }],
      findings: [{ id: 'a1', runId: 'run_a', fingerprint: 'fp_1', ruleId: 'R1', title: '某问题', pillar: 'P2', side: 'seo', severity: 'mid', status: 'dismissed', dismissReason: '品牌站首页可以这样写', detail: null }],
      recommendations: [{ id: 'ra1', runId: 'run_a', findingId: 'a1', status: 'accepted', appliedAt: null, appliedNote: null }],
      newIssueId: () => `iss_${++i}`,
      newEventId: () => `iev_${String(++e).padStart(6, '0')}`,
    })
    const md = renderIssueReport({ domain: 'a.com', issues: out.issues, events: out.events })
    const include = md.indexOf('决定：待处理 → 待执行')
    const exclude = md.indexOf('决定：待执行 → 已排除')
    expect(include).toBeGreaterThan(-1)
    expect(exclude).toBeGreaterThan(-1)
    expect(include).toBeLessThan(exclude)
  })

  it('暂不处理 / 误报的问题在标题下写出理由', () => {
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [
        mk({ id: 'i1', ruleId: 'A01', title: '甲', status: 'excluded', decision: 'false_positive', decisionReason: '品牌站首页可以这样写' } as Partial<IssueRecord>),
        mk({ id: 'i2', ruleId: 'A02', title: '乙', status: 'pending', decision: 'deferred', decisionReason: '下个季度再做' } as Partial<IssueRecord>),
        mk({ id: 'i3', ruleId: 'A03', title: '丙', status: 'to_execute', decision: 'included', decisionReason: null } as Partial<IssueRecord>),
      ],
      events: [],
    })
    expect(md).toContain('当前：已排除 · 决定：误报（理由：品牌站首页可以这样写） · 标记：无')
    expect(md).toContain('当前：待处理 · 决定：暂不处理（理由：下个季度再做） · 标记：无')
    expect(md).toContain('当前：待执行 · 决定：已纳入 · 标记：无')
  })

  it('规则已下线（没查）与口径变化后查过（关闭）分开写', () => {
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [issue],
      events: [
        ev({ id: 'e1', createdAt: '2026-07-01T00:00:00.000Z', checked: false, hit: null, severity: null, affectedCount: null, flags: ['rule_changed'], toStatus: 'retired', note: 'rule_changed' }),
        ev({ id: 'e2', createdAt: '2026-07-02T00:00:00.000Z', checked: true, hit: false, severity: null, affectedCount: null, flags: ['rule_changed'], toStatus: 'retired', note: 'rule_changed' }),
      ],
    })
    expect(md).toContain('2026-07-01 体检：没查（规则已下线）→ 已关闭（不可比） [规则已更新或历史版本未知]')
    expect(md).toContain('2026-07-02 体检：查过，没查出（规则已更新或历史版本未知）→ 已关闭（不可比） [规则已更新或历史版本未知]')
  })

  it('没有括号说明时箭头前留一个空格', () => {
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [issue],
      events: [ev({ checked: true, hit: false, severity: null, affectedCount: null, flags: [], fromStatus: 'pending', toStatus: 'self_resolved', note: null })],
    })
    expect(md).toContain('2026-07-12 体检：查过，没查出 → 自行消失')
  })

  it('部分改善的变化（5 → 2）写进体检行', () => {
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [issue],
      events: [ev({ flags: ['partial'], note: '5 → 2', affectedCount: 2 })],
    })
    expect(md).toContain('体检：查出（受影响 2，变化 5 → 2）→ 待处理 [部分改善]')
  })
})

describe('renderIssueReportDocument', () => {
  it('标题下有说明；没问题的项目写明尚无问题记录；有问题的项目照常成节', () => {
    const md = renderIssueReportDocument([
      { domain: 'metadocu.com', issues: [issue], events: [ev({})] },
      { domain: 'empty.com', issues: [], events: [] },
    ])
    expect(md.startsWith('# 问题清单（问题台账验收）\n')).toBe(true)
    const legend = md.slice(0, md.indexOf('## metadocu.com'))
    for (const phrase of ['「待执行」= 旧界面里接受过的建议', '「历史回填」', '那次体检的完成时间', '「没查（历史数据没有台账）」', '「受影响数未记录」', '日期为 UTC']) {
      expect(legend).toContain(phrase)
    }
    // 回填出的「执行」行日期取旧建议标记已执行的时间，不是体检完成时间：说明里两种日期都要讲清（终审 F5）。
    expect(legend).toContain('执行的日期是旧建议被标记为已执行的时间')
    expect(md).toContain('## metadocu.com')
    expect(md).toContain('## empty.com：尚无问题记录')
    expect(md).not.toContain('所有项目都还没有问题记录')
  })

  it('所有项目都没有问题时，单独说明一句', () => {
    const md = renderIssueReportDocument([{ domain: 'empty.com', issues: [], events: [] }])
    expect(md).toContain('## empty.com：尚无问题记录')
    expect(md).toContain('所有项目都还没有问题记录')
    expect(renderIssueReportDocument([])).toContain('所有项目都还没有问题记录')
  })
})
