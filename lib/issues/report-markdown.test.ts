import { describe, it, expect } from 'vitest'
import { renderIssueReport } from './report-markdown'
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
    expect(md).toContain('共 5 个问题：待处理 1，已修复 3，已关闭（不可比） 1')
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

  it('部分改善的变化（5 → 2）写进体检行', () => {
    const md = renderIssueReport({
      domain: 'a.com',
      issues: [issue],
      events: [ev({ flags: ['partial'], note: '5 → 2', affectedCount: 2 })],
    })
    expect(md).toContain('体检：查出（受影响 2，变化 5 → 2）→ 待处理 [部分改善]')
  })
})
