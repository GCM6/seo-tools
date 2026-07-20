import { NextResponse } from 'next/server'
import {
  getRecommendation,
  getFinding,
  getRun,
  getProject,
  getBrandFacts,
  getRunEvidence,
  createGeneratedPrompt,
  getGeneratedPromptsForRec,
  assertCanGeneratePrompt,
} from '@/lib/repositories'
import type { RecommendationStatus } from '@/lib/types'
import { assemblePrompt, assembleContentBrief } from '@/lib/diagnosis/prompt-assembler'
import { GLOBAL_CONTENT_BLOCKERS } from '@/lib/diagnosis/templates'
import { summarizeCompetitorForm, type CompetitorFormSignal } from '@/lib/collection/competitor-form'

// 幂等返回时的展示顺序：technical/content 通道各自最多一条，content 类额外带 brief。
const PROMPT_TYPE_ORDER = ['technical', 'content', 'brief', 'cms'] as const

interface StoredPromptRow {
  id: string
  promptType: string
  promptText: string
  createdAt: string
}

// 同一 promptType 可能因 regenerate=1 累积多条留痕记录；输出前按 createdAt 只取每类型最新一条。
function latestPerType(rows: StoredPromptRow[]) {
  const latestByType = new Map<string, StoredPromptRow>()
  for (const row of rows) {
    const prev = latestByType.get(row.promptType)
    if (!prev || row.createdAt > prev.createdAt) latestByType.set(row.promptType, row)
  }
  return [...latestByType.values()].sort(
    (a, b) =>
      PROMPT_TYPE_ORDER.indexOf(a.promptType as (typeof PROMPT_TYPE_ORDER)[number]) -
      PROMPT_TYPE_ORDER.indexOf(b.promptType as (typeof PROMPT_TYPE_ORDER)[number]),
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rec = await getRecommendation(id)
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    // 人在环内：只有 accepted|edited 才能生成 prompt
    assertCanGeneratePrompt(rec.status as RecommendationStatus)

    // 幂等：已存在记录且未显式要求 regenerate 时，直接复用既有记录，不重复调采集/拼装逻辑。
    const regenerate = new URL(req.url).searchParams.get('regenerate') === '1'
    if (!regenerate) {
      const existing = await getGeneratedPromptsForRec(id)
      if (existing.length) {
        return NextResponse.json({
          prompts: latestPerType(existing as StoredPromptRow[]).map((p) => ({
            id: p.id,
            promptType: p.promptType,
            promptText: p.promptText,
          })),
        })
      }
    }

    // 证据取自对应 finding（回落到建议自身 evidenceRefs）；promptType 由 finding.side 派生。
    const finding = await getFinding(rec.findingId)
    const evidenceRefs = finding?.evidenceRefs?.length ? finding.evidenceRefs : rec.evidenceRefs
    const promptType = finding?.side === 'technical' ? 'technical' : 'content'

    // 品牌事实取该项目 verified brand_facts；technical 通道不注入。
    const run = await getRun(rec.runId)
    const project = run ? await getProject(run.projectId) : null
    const allFacts = run ? await getBrandFacts(run.projectId) : []
    const verifiedFacts = allFacts
      .filter((f) => f.status === 'verified')
      .map((f) => ({ id: f.id, factText: f.factText, status: f.status as 'verified' }))

    const assembled = assemblePrompt({
      rec: {
        what: rec.what,
        why: rec.why,
        expectedImpact: rec.expectedImpact,
        validationMethod: rec.validationMethod,
        promptType,
        evidenceRefs,
        editedPayload: rec.editedPayload,
      },
      verifiedFacts,
      domain: project?.domain ?? '',
      negativeConstraints: promptType === 'content' ? GLOBAL_CONTENT_BLOCKERS : undefined,
    })

    const primaryId = `gp_${crypto.randomUUID()}`
    await createGeneratedPrompt({
      id: primaryId,
      recommendationId: id,
      promptType: assembled.promptType,
      promptText: assembled.promptText,
      inputFactRefs: assembled.inputFactRefs,
      evidenceRefs: assembled.evidenceRefs,
    })
    const prompts: { id: string; promptType: string; promptText: string }[] = [
      { id: primaryId, promptType: assembled.promptType, promptText: assembled.promptText },
    ]

    // 内容类建议另产出面向人类作者的结构化写作简报（promptType='brief'，Phase D §5，同受人工闸门约束）。
    if (promptType === 'content') {
      // Q03 竞品内容形态（SP-A2）：有 competitor_content_form 证据时汇总注入 brief 第 2 段，否则留「待补」。
      const evidence = run ? await getRunEvidence(run.id) : []
      const formRow = evidence.find(
        (e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'competitor_content_form',
      )
      const signals = formRow ? ((formRow.payload as { signals?: CompetitorFormSignal[] }).signals ?? []) : []
      const competitorForm = summarizeCompetitorForm(signals) || undefined

      const brief = assembleContentBrief({
        rec: {
          what: rec.what,
          why: rec.why,
          expectedImpact: rec.expectedImpact,
          validationMethod: rec.validationMethod,
          evidenceRefs,
          editedPayload: rec.editedPayload,
        },
        verifiedFacts,
        domain: project?.domain ?? '',
        competitorForm,
        negativeConstraints: GLOBAL_CONTENT_BLOCKERS,
      })
      const briefId = `gp_${crypto.randomUUID()}`
      await createGeneratedPrompt({
        id: briefId,
        recommendationId: id,
        promptType: brief.promptType,
        promptText: brief.promptText,
        inputFactRefs: brief.inputFactRefs,
        evidenceRefs: brief.evidenceRefs,
      })
      prompts.push({ id: briefId, promptType: brief.promptType, promptText: brief.promptText })
    }

    return NextResponse.json({ prompts })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
