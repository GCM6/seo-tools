import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { RecommendationList, type RecListItem } from '@/components/RecommendationList'
import type { RecStatus } from '@/components/RecCard'
import { getRun, getRecommendations, getFindings, getRunEvidence } from '@/lib/repositories'
import { gradeForClaim } from '@/lib/evidence'
import { isRunFinished } from '@/lib/runs/workspace'
import { extractAffectedPagesSection } from '@/lib/diagnosis/recommend'
import { summarizeEvidenceRefs } from '@/lib/diagnosis/action-report-markdown'
import type { ClaimType, RunStatus } from '@/lib/types'

// editedPayload 里人工改过的标题与修订说明；兼容旧格式 { angle, injectedFacts }（合并成说明展示）。
function editedFields(payload: unknown): { what?: string; note: string } {
  if (!payload || typeof payload !== 'object') return { note: '' }
  const p = payload as Record<string, unknown>
  const what = typeof p.what === 'string' && p.what.trim() ? p.what : undefined
  if (typeof p.note === 'string') return { what, note: p.note }
  const legacy = [p.angle, p.injectedFacts].filter((v): v is string => typeof v === 'string' && v.length > 0)
  return { what, note: legacy.join('\n') }
}

// 建议（ux-blueprint §3.3）：逐条确认建议，决定哪些进入执行清单。
// 本页只取数并组装行数据；筛选、分组、接受 / 否决 / 编辑都在 RecommendationList（client）里。
export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const t = await getTranslations('screen3')
  const run = await getRun(id)
  if (!run) notFound()
  const [recRows, findingRows, evidenceRows] = await Promise.all([getRecommendations(id), getFindings(id), getRunEvidence(id)])

  const findingById = new Map(findingRows.map((f) => [f.id, f]))
  const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]))

  const items: RecListItem[] = recRows.map((r) => {
    const finding = r.findingId ? findingById.get(r.findingId) : undefined
    const edited = editedFields(r.editedPayload)
    const { why, affected } = extractAffectedPagesSection(r.why)
    return {
      id: r.id,
      priority: r.priority,
      title: edited.what ?? r.what,
      initialStatus: r.status as RecStatus,
      severity: finding?.severity,
      // 建议的证据等级 = 它所针对 finding 的 claim_type（design-system §3.1）；找不到 finding 时不猜。
      confidenceGrade: finding ? gradeForClaim(finding.claimType as ClaimType) : undefined,
      target: finding ? { title: finding.title, href: `/${locale}/runs/${id}/issues#${finding.id}` } : undefined,
      editNote: edited.note,
      fields: {
        why: why || undefined,
        affected,
        evidence: r.evidenceRefs.length ? summarizeEvidenceRefs(r.evidenceRefs, evidenceById) : undefined,
        impact: r.expectedImpact || undefined,
        effort: r.effort || undefined,
        risk: r.risk || undefined,
        validationMethod: r.validationMethod || undefined,
        confidence: r.confidence || undefined,
        editedNote: edited.note || undefined,
      },
    }
  })

  return (
    <RunWorkspace runId={id} locale={locale} current="recs">
      <section className="ui-section">
        <SectionHeader title={t('title')} note={t('sectionNote')} />
        {items.length ? (
          <RecommendationList items={items} checklistHref={`/${locale}/runs/${id}/output`} />
        ) : (
          // 诊断还没跑完时没有建议是正常的，不能说成「没发现问题」。
          isRunFinished(run.status as RunStatus) ? (
            <EmptyState title={t('emptyTitle')} description={t('empty')} />
          ) : (
            <EmptyState title={t('emptyPendingTitle')} description={t('emptyPending')} />
          )
        )}
      </section>
      <p className="ui-footnote">{t('note')}</p>
    </RunWorkspace>
  )
}
