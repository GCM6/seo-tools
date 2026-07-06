import type { BrandFactStatus } from '@/lib/types'
import { assertInputFactsVerified } from '@/lib/repositories/validators'
import type { PromptType } from './templates'

// prompt 拼装（纯函数）：把已定稿建议 + verified 品牌事实 + 否定约束，拼成可直接执行的中文 prompt。
// 人在环闸门（accepted/edited）由 Route Handler 负责，本模块不碰状态与 DB。

export interface AssemblerRec {
  what: string
  why: string
  expectedImpact: string
  validationMethod: string
  promptType: PromptType
  evidenceRefs: string[]
  // 人工编辑覆盖：{ what?, why?, note? }，存在时以其覆盖并追加修订说明。
  editedPayload?: unknown
}

export interface VerifiedFactInput {
  id: string
  factText: string
  status: BrandFactStatus
}

export interface AssemblePromptInput {
  rec: AssemblerRec
  verifiedFacts: VerifiedFactInput[]
  domain: string
  negativeConstraints?: string[]
}

export interface AssembledPrompt {
  promptType: PromptType
  promptText: string
  inputFactRefs: string[]
  evidenceRefs: string[]
}

function editedOverrides(payload: unknown): { what?: string; why?: string; note?: string } {
  if (!payload || typeof payload !== 'object') return {}
  const p = payload as Record<string, unknown>
  return {
    what: typeof p.what === 'string' ? p.what : undefined,
    why: typeof p.why === 'string' ? p.why : undefined,
    note: typeof p.note === 'string' ? p.note : undefined,
  }
}

export function assemblePrompt(input: AssemblePromptInput): AssembledPrompt {
  const { rec, verifiedFacts, domain, negativeConstraints } = input

  // 契约：注入的品牌事实只能是 verified（§5.1-1）；空数组合法，不阻塞。
  assertInputFactsVerified(verifiedFacts)

  const isContent = rec.promptType === 'content'
  // 仅 content 通道注入品牌事实；technical 通道 inputFactRefs 允许为空。
  const facts = isContent ? verifiedFacts : []
  const ov = editedOverrides(rec.editedPayload)
  const what = ov.what ?? rec.what
  const why = ov.why ?? rec.why

  const lines: string[] = []
  lines.push(`[系统角色] 你是 ${domain || '目标站点'} 的资深 SEO/GEO 执行专家，请严格按下述要求产出可落地的执行方案。`)
  lines.push('')
  lines.push(`[任务] ${what}`)
  lines.push(`[原因] ${why}`)
  lines.push(`[预期影响] ${rec.expectedImpact}`)
  lines.push(`[验证方式] ${rec.validationMethod}`)
  if (ov.note) lines.push(`[人工修订] ${ov.note}`)

  if (isContent) {
    lines.push('')
    if (facts.length > 0) {
      lines.push('[可用品牌事实（仅 verified，须原样引用，不得改写/扩写）]')
      for (const f of facts) lines.push(`- ${f.factText}`)
    } else {
      lines.push('[品牌事实] 缺 verified 品牌事实，执行前请先补充；在补充前不得自行编造品牌信息。')
    }
    if (negativeConstraints && negativeConstraints.length > 0) {
      lines.push('')
      lines.push('[否定约束（红线，违反即重做）]')
      for (const c of negativeConstraints) lines.push(`- ${c}`)
    }
    lines.push('')
    lines.push('[数据纪律] 不得编造未提供的数字/事实/客户案例；所有数据须标注可追溯来源。AI 初稿必须人工终审后再发布。')
  }

  return {
    promptType: rec.promptType,
    promptText: lines.join('\n'),
    inputFactRefs: facts.map((f) => f.id),
    evidenceRefs: rec.evidenceRefs,
  }
}

// —— Content Brief 生成器（Phase D，spec §5）——：面向人类作者的结构化写作简报。
// 与内容 prompt 同源、同受人在环闸门与 verified brand_facts 约束（promptType='brief'）。
// 竞品内容形态（Q03）在数据可得时注入，否则标「待补」——不编造。
export interface ContentBriefInput {
  rec: {
    what: string
    why: string
    expectedImpact: string
    validationMethod: string
    evidenceRefs: string[]
    editedPayload?: unknown
  }
  verifiedFacts: VerifiedFactInput[]
  domain: string
  // 目标词与意图（来自关键词缺口/finding detail），可空。
  targetKeyword?: string
  intent?: string
  // 竞品代表页内容形态摘要（Q03 竞品轻检），当前多为空。
  competitorForm?: string
  negativeConstraints?: string[]
}

export interface ContentBrief {
  promptType: 'brief'
  promptText: string
  inputFactRefs: string[]
  evidenceRefs: string[]
}

export function assembleContentBrief(input: ContentBriefInput): ContentBrief {
  const { rec, verifiedFacts, domain, targetKeyword, intent, competitorForm, negativeConstraints } = input
  // 与内容 prompt 同约束：注入事实只能是 verified（§5.1-1）。
  assertInputFactsVerified(verifiedFacts)
  const ov = editedOverrides(rec.editedPayload)
  const what = ov.what ?? rec.what

  const lines: string[] = []
  lines.push(`[内容写作简报] 站点：${domain || '目标站点'}`)
  lines.push(`[写作任务] ${what}`)
  lines.push('')
  lines.push(`1. 目标关键词与意图：${targetKeyword ? targetKeyword : '（待补：从关键词缺口/机会表选定主词）'}${intent ? `｜意图：${intent}` : ''}`)
  lines.push(`2. SERP Top-5 内容形态参考：${competitorForm ? competitorForm : '（待补：需 DataForSEO 竞品轻检 Q03 数据；未配置时人工调研前排页面类型/字数/结构）'}`)
  lines.push('3. 推荐标题骨架：围绕主词与意图给出 1 个主标题 + 3-5 个 H2 小标题（覆盖疑虑解答 / 应用场景 / 参数与价值 / 对比选型）。')
  lines.push('4. 必须覆盖的实体与子话题：列出与主词强相关的实体、同义词/LSI、用户高频问题（可独立成答）。')
  lines.push('5. E-E-A-T 要求：作者署名 + 发布/更新日期；≥1 处第一手经验（实操截图/步骤/案例数据）；≥1 处权威来源引用（可追溯 URL）。')
  lines.push('6. GEO 格式要求：答案前置（前 30% 正文给出可独立成答段落）；关键结论配统计数据/来源引用；用列表/表格提升可提取性。')
  lines.push('')
  if (verifiedFacts.length > 0) {
    lines.push('[可用品牌事实（仅 verified，须原样引用，不得改写/扩写）]')
    for (const f of verifiedFacts) lines.push(`- ${f.factText}`)
  } else {
    lines.push('[品牌事实] 缺 verified 品牌事实，写作前先补充；补充前不得编造品牌信息。')
  }
  if (negativeConstraints && negativeConstraints.length > 0) {
    lines.push('')
    lines.push('[否定约束（红线，违反即重做）]')
    for (const c of negativeConstraints) lines.push(`- ${c}`)
  }
  lines.push('')
  lines.push('[交付纪律] 不得编造未提供的数字/事实/客户案例；所有数据标注可追溯来源。AI 初稿必须人工终审后再发布。')
  lines.push(`[验证方式] ${rec.validationMethod}`)

  return {
    promptType: 'brief',
    promptText: lines.join('\n'),
    inputFactRefs: verifiedFacts.map((f) => f.id),
    evidenceRefs: rec.evidenceRefs,
  }
}
