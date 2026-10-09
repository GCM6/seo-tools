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
// 「规则已更新」同样有两种来源：真的升了版本，或问题来自历史回填、版本记为未知（0），首次真实体检时必然不一致。
const RULE_CHANGED_OR_UNKNOWN = '规则已更新或历史版本未知'
const FLAG: Record<IssueFlag, string> = {
  new: '新出现', worse: '变严重', relapse: '复发', partial: '部分改善', unverified: '未复查', protocol_changed: CHANGED_OR_UNCONFIRMED, rule_changed: RULE_CHANGED_OR_UNKNOWN,
}
const REASON: Record<string, string> = {
  data_gap: '缺数据源', site_condition: '网站条件不满足', unsupported: '工具暂不支持', error: '规则出错', history_no_ledger: '历史数据没有台账',
  protocol_changed: CHANGED_OR_UNCONFIRMED, rule_changed: RULE_CHANGED_OR_UNKNOWN,
}
const KIND_ORDER: Record<IssueEventDraft['kind'], number> = { observed: 0, decision: 1, execution: 2 }

const day = (iso: string) => iso.slice(0, 10)
const status = (s: IssueStatus) => STATUS[s] ?? s
const reason = (r: string | null) => (r ? (REASON[r] ?? r) : '原因未记录')
// 按字符码比较，不依赖运行环境的 locale——同一份数据每次生成的文档必须逐字相同。
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 决定为暂不处理 / 误报时，把当时写下的理由带在后面，核对时不用再去翻。
function decisionText(i: IssueRecord): string {
  const label = DECISION[i.decision] ?? i.decision
  const why = i.decisionReason?.trim()
  return (i.decision === 'deferred' || i.decision === 'false_positive') && why ? `${label}（理由：${why}）` : label
}

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
    // 没查 + rule_changed = 规则已不在台账里（已下线）；查过 + rule_changed 才是「规则版本更新或历史版本未知」。
    if (!e.checked) seen = `没查（${e.note === 'rule_changed' ? '规则已下线' : reason(e.note)}）`
    else if (e.hit) seen = `查出（${e.affectedCount === null ? '受影响数未记录' : `受影响 ${e.affectedCount}`}${e.note ? `，变化 ${e.note}` : ''}）`
    else seen = e.note ? `查过，没查出（${reason(e.note)}）` : '查过，没查出'
    // 带括号说明时箭头紧跟右括号；没有括号时前面留一个空格，免得文字和箭头贴在一起。
    return `- ${day(e.createdAt)} 体检：${seen}${seen.endsWith('）') ? '' : ' '}→ ${to}${flags}`
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
  const lines = [`## ${input.domain}`, '', `共 ${issues.length} 个问题：${counts.map(([s, n]) => `${STATUS[s]} ${n}`).join('；')}`, '']
  for (const i of issues) {
    lines.push(`### ${i.title}（${i.ruleId}）`, '', `当前：${status(i.status)} · 决定：${decisionText(i)} · 标记：${flagText(i)}`, '')
    const history = input.events.filter((e) => e.issueId === i.id).sort(byTime)
    lines.push(...history.map(eventLine), '')
  }
  return lines.join('\n')
}

// 文档开头的说明：验收时容易误读的几个词，一次讲清（这些词都来自历史回填）。
const LEGEND =
  '> 说明：「待执行」= 旧界面里接受过的建议；「历史回填」= 根据旧建议状态补的决定与执行：决定的日期是那次体检的完成时间而不是当时做决定的时间，' +
  '执行的日期是旧建议被标记为已执行的时间；' +
  '「没查（历史数据没有台账）」= 旧体检没有逐条检查记录，无法区分「没查出」和「没查」；「受影响数未记录」= 历史发现没有记录数量；日期为 UTC。'

// 整份文档：标题 + 说明 + 每个项目一节。没有问题的项目也要写一行，免得读的人以为漏了。
export function renderIssueReportDocument(projects: { domain: string; issues: IssueRecord[]; events: IssueEventDraft[] }[]): string {
  const out: string[] = ['# 问题清单（问题台账验收）', '', LEGEND, '']
  if (!projects.some((p) => p.issues.length)) out.push('所有项目都还没有问题记录。', '')
  for (const p of projects) out.push(p.issues.length ? renderIssueReport(p) : `## ${p.domain}：尚无问题记录\n`)
  return out.join('\n')
}
