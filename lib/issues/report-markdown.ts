import type { IssueEventDraft, IssueFlag, IssueRecord, IssueStatus } from './types'

// 问题清单文档（计划 Task 15）：验收时给你逐条核对每个问题的当前状态与经过。
const STATUS: Record<IssueStatus, string> = {
  pending: '待处理', to_execute: '待执行', executed_awaiting: '已执行，待复查', fixed: '已修复',
  not_effective: '改了没生效', self_resolved: '自行消失', excluded: '已排除', retired: '已关闭（不可比）',
}
// 文档里的问题顺序与计数顺序：先要你处理的，再到已有结论的，最后是不可比的。
const STATUS_ORDER: IssueStatus[] = ['pending', 'to_execute', 'executed_awaiting', 'not_effective', 'fixed', 'self_resolved', 'excluded', 'retired']
const DECISION: Record<string, string> = { pending: '未决定', included: '已纳入', deferred: '暂不处理', false_positive: '误报' }
// 台账里「协议已变」的真实含义：回填后的 AI 采样类问题协议指纹为空，首次实测时无法确认口径一致，
// 所以不能断言考题真的换了（controller 裁定，Task 8）。
const CHANGED_OR_UNCONFIRMED = '检测口径已变或无法确认一致'
const FLAG: Record<IssueFlag, string> = {
  new: '新出现', worse: '变严重', relapse: '复发', partial: '部分改善', unverified: '未复查', protocol_changed: CHANGED_OR_UNCONFIRMED, rule_changed: '规则已更新',
}
const REASON: Record<string, string> = {
  data_gap: '缺数据源', site_condition: '网站条件不满足', unsupported: '工具暂不支持', error: '规则出错', history_no_ledger: '历史数据没有台账',
  protocol_changed: CHANGED_OR_UNCONFIRMED, rule_changed: '规则已更新',
}
const KIND_ORDER: Record<IssueEventDraft['kind'], number> = { observed: 0, decision: 1, execution: 2 }

const day = (iso: string) => iso.slice(0, 10)
const status = (s: IssueStatus) => STATUS[s] ?? s
const reason = (r: string | null) => (r ? (REASON[r] ?? r) : '原因未记录')
// 按字符码比较，不依赖运行环境的 locale——同一份数据每次生成的文档必须逐字相同。
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function flagText(i: IssueRecord): string {
  if (!i.flags.length) return '无'
  return i.flags.map((f) => (f === 'unverified' && i.unverifiedReason ? `${FLAG[f]}（${reason(i.unverifiedReason)}）` : (FLAG[f] ?? f))).join('、')
}

function eventLine(e: IssueEventDraft): string {
  const from = e.fromStatus ? status(e.fromStatus) : null
  const to = status(e.toStatus)
  const flags = e.flags.length ? ` [${e.flags.map((f) => FLAG[f] ?? f).join('、')}]` : ''
  if (e.kind === 'observed') {
    let seen: string
    if (!e.checked) seen = `没查（${reason(e.note)}）`
    else if (e.hit) seen = `查出（${e.affectedCount === null ? '受影响数未记录' : `受影响 ${e.affectedCount}`}${e.note ? `，变化 ${e.note}` : ''}）`
    else seen = e.note ? `查过，没查出（${reason(e.note)}）` : '查过，没查出'
    return `- ${day(e.createdAt)} 体检：${seen}→ ${to}${flags}`
  }
  const label = e.kind === 'decision' ? '决定' : '执行'
  return `- ${day(e.createdAt)} ${label}：${from ?? '—'} → ${to}${e.note ? `（${e.note}）` : ''}`
}

// 同一时刻的事件（回填里一次体检与当时恢复的人工决定同刻）：先体检、再决定、再执行，最后按 id 定序。
const byTime = (a: IssueEventDraft, b: IssueEventDraft) =>
  cmp(a.createdAt, b.createdAt) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.id, b.id)

const byIssueOrder = (a: IssueRecord, b: IssueRecord) =>
  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || cmp(a.ruleId, b.ruleId) || cmp(a.title, b.title) || cmp(a.id, b.id)

export function renderIssueReport(input: { domain: string; issues: IssueRecord[]; events: IssueEventDraft[] }): string {
  const issues = [...input.issues].sort(byIssueOrder)
  const counts = STATUS_ORDER.map((s) => [s, issues.filter((i) => i.status === s).length] as const).filter(([, n]) => n > 0)
  const lines = [`## ${input.domain}`, '', `共 ${issues.length} 个问题：${counts.map(([s, n]) => `${STATUS[s]} ${n}`).join('，')}`, '']
  for (const i of issues) {
    lines.push(`### ${i.title}（${i.ruleId}）`, '', `当前：${status(i.status)} · 决定：${DECISION[i.decision] ?? i.decision} · 标记：${flagText(i)}`, '')
    const history = input.events.filter((e) => e.issueId === i.id).sort(byTime)
    lines.push(...history.map(eventLine), '')
  }
  return lines.join('\n')
}
