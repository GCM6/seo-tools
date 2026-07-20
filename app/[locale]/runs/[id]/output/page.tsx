import { setRequestLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { ActionReportWorkspace } from '@/components/ActionReportWorkspace'
import { ActionList, type ActionListItem, type ActionListPrompt, type ActionListRejectedItem } from '@/components/ActionList'
import { RetestPlanCard } from '@/components/RetestPlanCard'
import {
  getRecommendations,
  getRun,
  getProject,
  getBrandFacts,
  getGeneratedPromptsForRec,
  getRunEvidence,
} from '@/lib/repositories'
import { resolveCredential } from '@/lib/credentials/store'
import { renderActionReportMarkdown, summarizeEvidenceRefs, type EvidenceSummaryInput } from '@/lib/diagnosis/action-report-markdown'

// Human-gate: only accepted/edited recommendations may enter the execution
// register. The full report still records drafts and rejections as scope truth.
const GATED = new Set(['accepted', 'edited'])

// 四象限排序：quick_win（优先处理）最先，未知值兜底为最低优先级（对齐
// recommendations/page.tsx 的 PRIORITY_ORDER 排序惯例）。
const PRIORITY_ORDER: Record<string, number> = {
  quick_win: 0,
  strategic: 1,
  fill_in: 2,
  low: 3,
}

const PROMPT_TYPE_ORDER: Record<string, number> = { technical: 0, content: 1, brief: 2, cms: 3 }

function resolvedTitle(what: string, payload: unknown): string {
  const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
  const value = typeof p?.what === 'string' && p.what.trim() ? p.what.trim() : what
  // 模板中的静态修复示例属于交付正文，不应该把整段 HTML / JSON-LD
  // 展开到列表标题里；避免 15 条输出卡片的扫读被代码淹没。
  const exampleIndex = value.indexOf('参考修复示例')
  return exampleIndex >= 0 ? value.slice(0, exampleIndex).trim() : value
}

// 同一 promptType 可能因 regenerate 累积多条留痕记录；预载时按 createdAt 只取每类型最新一条
// （与 app/api/recommendations/[id]/prompt/route.ts 的 latestPerType 同一口径，独立实现——
// 该 route 不导出这个私有函数，也不允许本任务修改该文件）。
function latestPromptsByType(rows: { id: string; promptType: string; promptText: string; createdAt: string }[]): ActionListPrompt[] {
  const latestByType = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    const prev = latestByType.get(row.promptType)
    if (!prev || row.createdAt > prev.createdAt) latestByType.set(row.promptType, row)
  }
  return [...latestByType.values()]
    .sort((a, b) => (PROMPT_TYPE_ORDER[a.promptType] ?? 9) - (PROMPT_TYPE_ORDER[b.promptType] ?? 9))
    .map((row) => ({ id: row.id, promptType: row.promptType, promptText: row.promptText }))
}

export default async function OutputPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('screen4')

  // 无效 run 直接 404（对齐 components/ReportView.tsx 的做法），不再静默降级成空白页。
  const run = await getRun(id)
  if (!run) notFound()

  const project = await getProject(run.projectId)
  const domain = project?.domain ?? ''

  const [recommendations, allFacts, openAiKey, evidenceRows] = await Promise.all([
    getRecommendations(id),
    getBrandFacts(run.projectId),
    resolveCredential('OPENAI_API_KEY'),
    getRunEvidence(id),
  ])

  // B2（P0-4）：evidenceRefs 原样是内部 ev_xxx ID，这里按 run 证据表解析成人类可读摘要，
  // 首屏报告与行动清单才不会展示裸 ID（照抄 app/api/runs/[id]/action-report/route.ts 的组装逻辑）。
  const evidenceById = new Map<string, EvidenceSummaryInput>(
    evidenceRows.map((row) => [
      row.id,
      {
        id: row.id,
        type: row.type,
        claimLevel: row.claimLevel,
        source: row.source,
        capturedAt: row.capturedAt,
        payload: row.payload,
      },
    ]),
  )

  const gated = [...recommendations.filter((r) => GATED.has(r.status))].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  )
  const rejected = recommendations.filter((r) => r.status === 'rejected')
  const draftCount = recommendations.filter((r) => r.status === 'draft').length
  const verifiedFacts = allFacts.filter((f) => f.status === 'verified')

  const gatedPrompts = await Promise.all(gated.map((rec) => getGeneratedPromptsForRec(rec.id)))

  const actionItems: ActionListItem[] = gated.map((rec, index) => {
    // B2（P0-4）：evidenceRefs 逐条解析成摘要，供 ActionList 展示人类可读文本而不是裸 ev_xxx ID。
    const summaries = summarizeEvidenceRefs(rec.evidenceRefs, evidenceById)
    return {
      id: rec.id,
      priority: rec.priority,
      title: resolvedTitle(rec.what, rec.editedPayload),
      status: rec.status as 'accepted' | 'edited',
      expectedImpact: rec.expectedImpact,
      effort: rec.effort,
      risk: rec.risk,
      confidence: rec.confidence,
      why: rec.why,
      validationMethod: rec.validationMethod,
      evidenceRefs: rec.evidenceRefs,
      evidenceSummaries: Object.fromEntries(rec.evidenceRefs.map((ref, i) => [ref, summaries[i]])),
      appliedAt: rec.appliedAt,
      appliedNote: rec.appliedNote ?? '',
      prompts: latestPromptsByType(gatedPrompts[index]),
    }
  })

  const rejectedItems: ActionListRejectedItem[] = rejected.map((rec) => ({
    id: rec.id,
    title: resolvedTitle(rec.what, rec.editedPayload),
    note: rec.why,
  }))

  const appliedCount = gated.filter((rec) => rec.appliedAt).length
  const gatedCount = gated.length
  const progressPct = gatedCount ? Math.round((appliedCount / gatedCount) * 100) : 0
  const retestReady = gatedCount > 0 && appliedCount === gatedCount

  const actionReportMarkdown = renderActionReportMarkdown(recommendations, {
    domain,
    runId: id,
    capturedAt: run.finishedAt ?? run.startedAt ?? '',
  }, {
    verifiedFacts: verifiedFacts.map((fact) => fact.factText),
    evidenceById,
  })

  return (
    <Shell runId={id} domain={domain}>
      <div className="sec-h output-page-head">
        <div>
          <h2>{t('title')}</h2>
        </div>
        <div className="sec-h-actions">
          <Link href={`/${locale}/runs/${id}/report`} className="sec-h-link">
            {t('viewReport')}
          </Link>
        </div>
      </div>

      <div className="card output-progress">
        <div
          className="output-progress-track"
          role="progressbar"
          aria-label={t('output.progressAria')}
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="output-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="output-progress-meta">
          <span className="output-progress-count">{t('output.progressCount', { done: appliedCount, total: gatedCount })}</span>
          <span className="output-progress-scope">{t('output.scopeCount', { count: gatedCount, rejected: rejected.length })}</span>
          {draftCount > 0 ? (
            <Link href={`/${locale}/runs/${id}/recommendations`} className="output-progress-warning">
              {t('output.draftWarning', { count: draftCount })} · {t('output.draftWarningLink')}
            </Link>
          ) : null}
        </div>
      </div>

      <ActionList items={actionItems} rejectedItems={rejectedItems} />

      <div className="output-summary-grid">
        <RetestPlanCard
          runId={id}
          locale={locale}
          dueAt={project?.nextRetestDueAt ?? null}
          appliedDone={appliedCount}
          appliedTotal={gatedCount}
          retestReady={retestReady}
        />

        <div className="card output-facts-card">
          <h3>{t('output.factsGateTitle')}</h3>
          <p className="output-facts-count">{t('output.factsGateCount', { count: verifiedFacts.length })}</p>
          {verifiedFacts.length ? (
            <ul className="output-facts-preview">
              {verifiedFacts.slice(0, 3).map((fact) => (
                <li key={fact.id}>{fact.factText}</li>
              ))}
            </ul>
          ) : (
            <p className="output-facts-empty">{t('output.factsGateEmpty')}</p>
          )}
          <Link href={`/${locale}/runs/${id}/facts`} className="sec-h-link">
            {t('output.factsGateManage')}
          </Link>
        </div>
      </div>

      <ActionReportWorkspace
        runId={id}
        initialMarkdown={actionReportMarkdown}
        filenameBase={`veris-${id}-execution-decision-report`}
        aiAvailable={Boolean(openAiKey)}
      />

      <div className="note">{t('note')}</div>
    </Shell>
  )
}
