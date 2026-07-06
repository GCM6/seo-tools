import { setRequestLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { PromptCard } from '@/components/PromptCard'
import { ReportPanel } from '@/components/ReportPanel'
import {
  getRecommendations,
  getRun,
  getProject,
  getBrandFacts,
} from '@/lib/repositories'

type Recommendation = Awaited<ReturnType<typeof getRecommendations>>[number]
type BrandFact = Awaited<ReturnType<typeof getBrandFacts>>[number]

// Human-gate: only accepted/edited recommendations may yield execution prompts.
// Drafts and rejected recs never reach the output screen.
const GATED = new Set(['accepted', 'edited'])

function editedInstructions(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  if (typeof p.note === 'string' && p.note.trim()) return [p.note.trim()]
  return [p.angle, p.injectedFacts].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

export default async function OutputPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('screen4')

  // Seed/sample execution prompt composed from the recommendation plus the
  // verified brand facts (only `verified` facts may be injected — §6.2). This is
  // a directional seed for V0; the real prompt-generation pipeline lands later.
  // All scaffolding copy comes from `screen4.promptTpl` so it switches locale.
  const buildPromptText = (rec: Recommendation, facts: BrandFact[], domain: string): string => {
    const lines = [t('promptTpl.system', { domain }), rec.what, '']
    if (rec.why) lines.push(`${t('promptTpl.why')}${rec.why}`)
    if (rec.expectedImpact) lines.push(`${t('promptTpl.impact')}${rec.expectedImpact}`)
    if (rec.validationMethod) lines.push(`${t('promptTpl.validation')}${rec.validationMethod}`)
    const edited = editedInstructions(rec.editedPayload)
    if (rec.status === 'edited' && edited.length > 0) {
      lines.push('', t('promptTpl.edited'))
      for (const item of edited) lines.push(`- ${item}`)
    }
    if (facts.length > 0) {
      lines.push('', t('promptTpl.brandFacts'))
      for (const f of facts) lines.push(`- ${f.factText}`)
    }
    return lines.join('\n')
  }

  // 真实 run 才有 project；不存在的 run 不再回退旧样例项目，避免误导。
  const run = await getRun(id)
  const project = run ? await getProject(run.projectId) : undefined
  const domain = project?.domain ?? ''

  const recommendations = await getRecommendations(id)
  const gated = recommendations.filter((r) => GATED.has(r.status))

  const allFacts = run ? await getBrandFacts(run.projectId) : []
  const verifiedFacts = allFacts.filter((f) => f.status === 'verified')

  return (
    <Shell active={4} locale={locale} runId={id} domain={domain}>
      <div className="sec-h">
        <h2>{t('title')}</h2>
        <span className="meta">{t('meta', { count: gated.length })}</span>
        <Link href={`/${locale}/runs/${id}/report`} className="underline underline-offset-2">
          {t('viewReport')}
        </Link>
      </div>

      <div className="out-grid">
        <div>
          {gated.length ? (
            gated.map((rec) => (
              <PromptCard
                key={rec.id}
                recId={rec.id}
                title={rec.what}
                promptText={buildPromptText(rec, verifiedFacts, domain)}
                initialAppliedAt={rec.appliedAt}
                initialAppliedNote={rec.appliedNote ?? ''}
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
