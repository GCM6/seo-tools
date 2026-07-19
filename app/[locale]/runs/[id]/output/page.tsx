import { setRequestLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { DeliveryCard, type DeliveryKind } from '@/components/DeliveryCard'
import { DeliveryExportActions } from '@/components/DeliveryExportActions'
import { ReportPanel } from '@/components/ReportPanel'
import {
  getRecommendations,
  getRun,
  getProject,
  getBrandFacts,
  getFindings,
  getRunEvidence,
} from '@/lib/repositories'
import { assembleContentBrief, assemblePrompt } from '@/lib/diagnosis/prompt-assembler'
import { GLOBAL_CONTENT_BLOCKERS } from '@/lib/diagnosis/templates'
import { summarizeCompetitorForm, type CompetitorFormSignal } from '@/lib/collection/competitor-form'

// Human-gate: only accepted/edited recommendations may yield execution prompts.
// Drafts and rejected recs never reach the output screen.
const GATED = new Set(['accepted', 'edited'])

function resolvedTitle(what: string, payload: unknown): string {
  if (!payload || typeof payload !== 'object') return what
  const p = payload as Record<string, unknown>
  return typeof p.what === 'string' && p.what.trim() ? p.what.trim() : what
}

export default async function OutputPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('screen4')

  // 真实 run 才有 project；不存在的 run 不再回退旧样例项目，避免误导。
  const run = await getRun(id)
  const project = run ? await getProject(run.projectId) : undefined
  const domain = project?.domain ?? ''

  const [recommendations, findings, allFacts, evidence] = await Promise.all([
    getRecommendations(id),
    getFindings(id),
    run ? getBrandFacts(run.projectId) : Promise.resolve([]),
    run ? getRunEvidence(run.id) : Promise.resolve([]),
  ])
  const gated = recommendations.filter((r) => GATED.has(r.status))
  const verifiedFacts = allFacts.filter((f) => f.status === 'verified')
  const verifiedFactInputs = verifiedFacts.map((fact) => ({
    id: fact.id,
    factText: fact.factText,
    status: 'verified' as const,
  }))
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]))
  const formRow = evidence.find(
    (item) => item.type === 'dataforseo_serp' && (item.payload as { kind?: string } | null)?.kind === 'competitor_content_form',
  )
  const signals = formRow ? ((formRow.payload as { signals?: CompetitorFormSignal[] }).signals ?? []) : []
  const competitorForm = summarizeCompetitorForm(signals) || undefined

  // Render a read-only server-composed handoff as a Markdown delivery draft.
  // It has no write side effect: users may refine it locally, copy/download it,
  // then publish in their CMS or codebase and explicitly mark that work applied.
  const deliveries = gated.map((rec) => {
    const finding = findingsById.get(rec.findingId)
    const kind: DeliveryKind = finding?.side === 'technical' ? 'technical' : 'content'
    const evidenceRefs = finding?.evidenceRefs?.length ? finding.evidenceRefs : rec.evidenceRefs
    const title = resolvedTitle(rec.what, rec.editedPayload)
    const handoff = assemblePrompt({
      rec: {
        what: rec.what,
        why: rec.why,
        expectedImpact: rec.expectedImpact,
        validationMethod: rec.validationMethod,
        promptType: kind,
        evidenceRefs,
        editedPayload: rec.editedPayload,
      },
      verifiedFacts: verifiedFactInputs,
      domain,
      negativeConstraints: kind === 'content' ? GLOBAL_CONTENT_BLOCKERS : undefined,
    }).promptText
    const executionText = kind === 'content'
      ? assembleContentBrief({
          rec: {
            what: rec.what,
            why: rec.why,
            expectedImpact: rec.expectedImpact,
            validationMethod: rec.validationMethod,
            evidenceRefs,
            editedPayload: rec.editedPayload,
          },
          verifiedFacts: verifiedFactInputs,
          domain,
          competitorForm,
          negativeConstraints: GLOBAL_CONTENT_BLOCKERS,
        }).promptText
      : handoff
    const markdown = [
      `# ${t(`delivery.kind.${kind}`)} · ${title}`,
      '',
      `> ${t('delivery.documentIntro')}`,
      '',
      `## ${t('delivery.handoffTitle')}`,
      '',
      executionText,
      '',
      `## ${t('delivery.reviewTitle')}`,
      '',
      `- ${t('delivery.reviewItemOne')}`,
      `- ${t('delivery.reviewItemTwo')}`,
    ].join('\n')

    return {
      rec,
      kind,
      title,
      handoff,
      markdown,
    }
  })

  return (
    <Shell runId={id} domain={domain}>
      <div className="sec-h output-page-head">
        <div>
          <h2>{t('title')}</h2>
          <span className="meta">{t('meta', { count: gated.length })}</span>
        </div>
        <div className="sec-h-actions">
          <Link href={`/${locale}/runs/${id}/report`} className="underline underline-offset-2">
            {t('viewReport')}
          </Link>
          <DeliveryExportActions
            documents={deliveries.map((delivery) => ({ title: delivery.title, markdown: delivery.markdown }))}
            filenameBase={`veris-${id}-deliveries`}
          />
        </div>
      </div>

      <div className="out-grid">
        <div>
          {gated.length ? (
            deliveries.map((delivery) => (
              <DeliveryCard
                key={delivery.rec.id}
                recId={delivery.rec.id}
                title={delivery.title}
                kind={delivery.kind}
                initialMarkdown={delivery.markdown}
                handoffText={delivery.handoff}
                initialAppliedAt={delivery.rec.appliedAt}
                initialAppliedNote={delivery.rec.appliedNote ?? ''}
              />
            ))
          ) : (
            <div className="card pending-block">{t('emptyGated')}</div>
          )}
        </div>

        <div>
          <ReportPanel facts={verifiedFacts} domain={domain} confirmedCount={gated.length} />
          <div className="note" style={{ marginTop: 12 }}>
            <Link href={`/${locale}/runs/${id}/facts`} className="underline underline-offset-2">
              {t('manageFacts')}
            </Link>
          </div>
        </div>
      </div>

      <div className="note">{t('note')}</div>
    </Shell>
  )
}
