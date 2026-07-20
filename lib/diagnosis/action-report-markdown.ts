import { extractAffectedPagesSection } from './recommend'

export type ActionReportDecision = 'accepted' | 'edited' | 'rejected' | 'draft'

export interface ActionReportRecommendation {
  id: string
  what: string
  why: string
  expectedImpact: string
  effort: string
  risk: string
  validationMethod: string
  priority: string
  confidence: string
  // Repository rows are intentionally permissive strings. Unknown values are
  // treated as drafts so a newly introduced state can never become actionable
  // by accident.
  status: string
  evidenceRefs: string[]
  editedPayload?: unknown
}

export interface ActionReportMeta {
  domain: string
  runId: string
  capturedAt: string
}

// —— B2：证据引用人类可读摘要（P0-4）——
// 报告里逐条 `ev_xxx` 内部 ID 对交付对象没有意义；这里按 evidence_artifacts 的 type +
// capturedAt + payload 里的一句关键值拼成摘要，内部 ID 仍保留在括号里供系统内对账。
// 只读取证据分级代码（L1-L4）原样展示，绝不把它翻译成「实测」——该词在项目铁律里专属 L3/L4
// claim_type（见 CLAUDE.md「证据分级」），这里展示的是证据本身的等级，不是某条 claim 的定级。
export interface EvidenceSummaryInput {
  id: string
  type: string
  claimLevel: string
  source: string
  capturedAt: string
  payload: unknown
}

const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  gsc: 'GSC 关键词数据',
  ai_answer: 'AI 探针回答',
  page_fetch: '页面抓取',
  render_check: '渲染对比',
  schema: '结构化数据',
  serp_snapshot: 'SERP 快照',
  manual: '人工记录',
  sitemap: 'Sitemap',
  site_audit: '全站轻检',
  dataforseo_serp: 'DataForSEO SERP',
  dataforseo_labs: 'DataForSEO 关键词库',
  dataforseo_backlinks: 'DataForSEO 外链',
  psi: 'PageSpeed Insights',
  ua_probe: 'UA 爬虫探测',
  third_party_presence: '第三方语料存在度',
  serp_aio: 'AI Overview 探测',
  social_presence: '社媒/评价站前台检索',
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

// 每种证据类型挑一句能代表「测到了什么」的关键值；字段缺失时退化为通用占位文案，绝不编造数值。
function evidenceKeyValue(type: string, payload: unknown): string {
  const p = asRecord(payload)
  switch (type) {
    case 'site_audit': {
      const stats = asRecord(p.stats)
      return typeof stats.checked === 'number' ? `共检测 ${stats.checked} 页` : '全站轻检快照'
    }
    case 'gsc': {
      const query = typeof p.query === 'string' ? p.query : undefined
      const impressions = typeof p.impressions === 'number' ? p.impressions : undefined
      return query ? `关键词「${query}」展示 ${impressions ?? 0} 次` : 'GSC 指标行'
    }
    case 'page_fetch':
      return `robots 可抓取：${p.robotsAllowed === false ? '否' : '是'}`
    case 'render_check': {
      const initial = p.initialHtmlMainTextChars
      const rendered = p.renderedMainTextChars
      return typeof initial === 'number' && typeof rendered === 'number'
        ? `初始正文 ${initial} / 渲染后 ${rendered} 字符`
        : '渲染对比快照'
    }
    case 'schema': {
      const types = Array.isArray(p.types) ? p.types.join('、') : undefined
      return types ? `结构化类型：${types}` : '结构化数据快照'
    }
    case 'serp_snapshot': {
      const query = typeof p.query === 'string' ? p.query : undefined
      return query ? `SERP 查询「${query}」` : 'SERP 快照'
    }
    case 'ai_answer': {
      const provider = typeof p.provider === 'string' ? p.provider : undefined
      return provider ? `${provider} 探针 · 本站被引用：${p.targetDomainCited === true ? '是' : '否'}` : 'AI 探针回答'
    }
    case 'ua_probe': {
      const crawlers = Array.isArray(p.crawlers) ? p.crawlers.length : undefined
      return crawlers !== undefined ? `实测 ${crawlers} 个 UA 的爬虫可达性` : 'UA 爬虫探测快照'
    }
    case 'third_party_presence': {
      const reddit = asRecord(p.reddit)
      return typeof reddit.mentions === 'number' ? `Reddit 提及 ${reddit.mentions} 次` : '第三方语料存在度快照'
    }
    case 'social_presence': {
      const platforms = Array.isArray(p.platforms) ? p.platforms.length : undefined
      return platforms !== undefined ? `前台检索 ${platforms} 个平台` : '社媒/评价站前台检索快照'
    }
    case 'serp_aio':
      return `AIO 出现：${p.aioPresent === true ? '是' : '否'}`
    case 'dataforseo_backlinks': {
      const rd = p.referringDomains
      return typeof rd === 'number' ? `引荐域 ${rd} 个` : 'DataForSEO 外链快照'
    }
    default:
      return '已采集原始数据'
  }
}

// 单条证据 → 「类型 + 采集日期 + 关键值（内部 ID）」的人类可读摘要行。
export function summarizeEvidence(evidence: EvidenceSummaryInput): string {
  const label = EVIDENCE_TYPE_LABEL[evidence.type] ?? evidence.type
  const date = evidence.capturedAt ? evidence.capturedAt.slice(0, 10) : '—'
  const keyValue = evidenceKeyValue(evidence.type, evidence.payload)
  return `${label}（${date} · ${evidence.claimLevel}）：${keyValue}（${evidence.id}）`
}

// evidence_refs（原始 ID 数组）→ 摘要行数组；查不到对应证据时如实标注，不静默丢弃引用。
export function summarizeEvidenceRefs(
  refs: string[],
  evidenceById: Map<string, EvidenceSummaryInput> | Record<string, EvidenceSummaryInput>,
): string[] {
  const get = (id: string) => (evidenceById instanceof Map ? evidenceById.get(id) : evidenceById[id])
  return refs.map((ref) => {
    const evidence = get(ref)
    return evidence ? summarizeEvidence(evidence) : `未找到对应证据记录（${ref}）`
  })
}

export interface ActionReportOptions {
  verifiedFacts?: string[]
  // AI is allowed to write this concise section only. Every action record below
  // stays deterministic and traceable to its recommendation card.
  executiveSummary?: string
  // B2：evidenceRefs 原样是内部 ID，报告渲染时按此表解析成人类可读摘要；未提供时按原始 ID 展示
  // （向后兼容旧调用方/测试，但生产调用方——route.ts、output/page.tsx——恒会传入）。
  evidenceById?: Map<string, EvidenceSummaryInput> | Record<string, EvidenceSummaryInput>
}

const PRIORITY_ORDER: Record<string, number> = {
  quick_win: 0,
  strategic: 1,
  fill_in: 2,
  low: 3,
}

const PRIORITY_LABEL: Record<string, string> = {
  quick_win: '优先处理',
  strategic: '重点投入',
  fill_in: '顺手补齐',
  low: '暂缓处理',
}

function decisionStatus(status: string): ActionReportDecision {
  return status === 'accepted' || status === 'edited' || status === 'rejected' || status === 'draft'
    ? status
    : 'draft'
}

interface EditedValues {
  what: string
  why: string
  note?: string
  // B1：why 里追加的受影响页面清单已在此拆出，values.why 恒为清理后的干净文本。
  affected: ReturnType<typeof extractAffectedPagesSection>['affected']
}

function editedValues(rec: ActionReportRecommendation): EditedValues {
  const payload =
    rec.editedPayload && typeof rec.editedPayload === 'object' ? (rec.editedPayload as Record<string, unknown>) : {}
  const what = typeof payload.what === 'string' && payload.what.trim() ? payload.what.trim() : rec.what
  const rawWhy = typeof payload.why === 'string' && payload.why.trim() ? payload.why.trim() : rec.why
  const note = typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim() : undefined
  const { why, affected } = extractAffectedPagesSection(rawWhy)
  return { what, why, note, affected }
}

function displayTitle(value: string): string {
  const exampleIndex = value.indexOf('参考修复示例')
  return exampleIndex >= 0 ? value.slice(0, exampleIndex).trim() : value
}

function statusCounts(recommendations: ActionReportRecommendation[]) {
  return recommendations.reduce(
    (counts, recommendation) => ({
      ...counts,
      [decisionStatus(recommendation.status)]: counts[decisionStatus(recommendation.status)] + 1,
    }),
    { accepted: 0, edited: 0, rejected: 0, draft: 0 } as Record<ActionReportDecision, number>,
  )
}

function evidenceRefLines(rec: ActionReportRecommendation, evidenceById?: ActionReportOptions['evidenceById']): string {
  if (!rec.evidenceRefs.length) return ''
  // 有 evidenceById 时解析成人类可读摘要；未提供时回退裸 ID（向后兼容未传该选项的旧调用）。
  return evidenceById
    ? summarizeEvidenceRefs(rec.evidenceRefs, evidenceById).join('；')
    : rec.evidenceRefs.map((ref) => `\`${ref}\``).join(' · ')
}

function actionRecord(lines: string[], rec: ActionReportRecommendation, evidenceById?: ActionReportOptions['evidenceById']) {
  const values = editedValues(rec)
  lines.push(`### ${displayTitle(values.what)}`)
  lines.push('')
  lines.push(`- 决策来源：\`${rec.id}\` · ${decisionStatus(rec.status) === 'edited' ? '已编辑后采纳' : '已接受'}`)
  lines.push(`- 优先级：${PRIORITY_LABEL[rec.priority] ?? rec.priority}`)
  if (values.why) lines.push(`- 为什么：${values.why}`)
  if (values.affected) {
    lines.push(
      `- 受影响页面：共 ${values.affected.total} 个，已列前 ${values.affected.shown} 个：${values.affected.urls.join('、')}`,
    )
  }
  if (rec.expectedImpact) lines.push(`- 预期影响：${rec.expectedImpact}`)
  if (rec.effort) lines.push(`- 工作量：${rec.effort}`)
  if (rec.risk) lines.push(`- 风险：${rec.risk}`)
  if (rec.confidence) lines.push(`- 置信度：${rec.confidence}`)
  if (rec.validationMethod) lines.push(`- 验证方式：${rec.validationMethod}`)
  if (rec.evidenceRefs.length) lines.push(`- 证据引用：${evidenceRefLines(rec, evidenceById)}`)
  if (values.note) lines.push(`- 人工编辑说明：${values.note}`)
  lines.push('')
}

/**
 * Final delivery report: every actionable line is rendered from a decided
 * recommendation record. This is deliberately deterministic so an LLM cannot
 * silently turn a rejected decision into a task or invent a validation target.
 */
export function renderActionReportMarkdown(
  recommendations: ActionReportRecommendation[],
  meta: ActionReportMeta,
  options: ActionReportOptions = {},
): string {
  const lines: string[] = []
  const counts = statusCounts(recommendations)
  const executable = recommendations
    .filter((rec) => decisionStatus(rec.status) === 'accepted' || decisionStatus(rec.status) === 'edited')
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99))
  const rejected = recommendations.filter((rec) => decisionStatus(rec.status) === 'rejected')
  const pending = recommendations.filter((rec) => decisionStatus(rec.status) === 'draft')

  lines.push(`# 执行决策报告 · ${meta.domain || '未识别项目'}`)
  lines.push('')
  lines.push(`- 运行 ID：\`${meta.runId}\``)
  lines.push(`- 诊断采集时间：${meta.capturedAt || '—'}`)
  lines.push(`- 决策计数：接受 ${counts.accepted} / 已编辑 ${counts.edited} / 否决 ${counts.rejected} / 待确认 ${counts.draft}`)
  lines.push('')
  lines.push('> 报告边界：行动项只来自本轮已接受或已编辑的建议卡；否决项只保留决策记录，不会进入执行计划。AI 如参与，仅可归纳本报告中的既有内容，不得新增事实、动作、指标或来源。')
  lines.push('')

  lines.push('## 1. 决策摘要')
  lines.push('')
  if (options.executiveSummary?.trim()) {
    lines.push(options.executiveSummary.trim())
  } else {
    lines.push(`- 本轮已形成 ${executable.length} 项可执行动作；它们均带有原建议卡、验证方式和证据引用。`)
    if (rejected.length) lines.push(`- ${rejected.length} 项建议已被否决，已明确排除出执行范围。`)
    if (pending.length) lines.push(`- 仍有 ${pending.length} 项待确认；在其被决定前，不能将本报告视为最终执行范围。`)
  }
  lines.push('')

  lines.push('## 2. 执行范围与决策台账')
  lines.push('')
  for (const rec of recommendations) {
    const values = editedValues(rec)
    const status = decisionStatus(rec.status)
    const statusLabel = status === 'accepted' ? '接受' : status === 'edited' ? '编辑后接受' : status === 'rejected' ? '否决' : '待确认'
    lines.push(`- [${statusLabel}] \`${rec.id}\`：${displayTitle(values.what)}`)
  }
  if (!recommendations.length) lines.push('- 本轮尚无建议卡。')
  lines.push('')

  lines.push('## 3. 已确认执行计划')
  lines.push('')
  if (executable.length) {
    for (const rec of executable) actionRecord(lines, rec, options.evidenceById)
  } else {
    lines.push('尚无已接受或已编辑的建议，不能生成执行计划。')
    lines.push('')
  }

  lines.push('## 4. 已否决与未纳入范围')
  lines.push('')
  if (rejected.length) {
    for (const rec of rejected) {
      const values = editedValues(rec)
      lines.push(`### ${displayTitle(values.what)}`)
      lines.push('')
      lines.push(`- 决策来源：\`${rec.id}\` · 已否决`)
      lines.push('- 处理：不进入本轮执行计划，也不作为回测归因对象。')
      if (values.why) lines.push(`- 原建议理由：${values.why}`)
      if (values.affected) {
        lines.push(
          `- 受影响页面：共 ${values.affected.total} 个，已列前 ${values.affected.shown} 个：${values.affected.urls.join('、')}`,
        )
      }
      if (rec.evidenceRefs.length) lines.push(`- 证据引用：${evidenceRefLines(rec, options.evidenceById)}`)
      lines.push('')
    }
  } else {
    lines.push('本轮没有已否决建议。')
    lines.push('')
  }

  lines.push('## 5. 可用品牌事实与发布闸门')
  lines.push('')
  if (options.verifiedFacts?.length) {
    lines.push('以下品牌事实已验证；内容执行只能使用这些事实，不得扩写或编造：')
    lines.push('')
    for (const fact of options.verifiedFacts) lines.push(`- ${fact}`)
    lines.push('')
  } else {
    lines.push('- 本轮没有已验证品牌事实；涉及品牌信息的内容在发布前必须补充核验，不能由模型自行补写。')
    lines.push('')
  }
  lines.push('- 发布或代码变更由人工完成；本报告不会自动写入 CMS 或生产环境。')
  lines.push('- 每项实际落地后，在执行登记中标记“已执行”，系统才会安排同协议回测。')
  lines.push('- 回测只比较同协议、同范围的真实数据；多项变更同时发生时，不归因给某一条建议。')
  lines.push('')

  return lines.join('\n')
}
