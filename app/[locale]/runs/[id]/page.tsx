import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { StatStrip } from '@/components/StatStrip'
import { PresenceMap } from '@/components/PresenceMap'
import { SovBar } from '@/components/SovBar'
import { FindingList, type FindingItem } from '@/components/FindingList'
import { EvidenceDrawer, type EvidenceView } from '@/components/EvidenceDrawer'
import { getRun, getProject, getFindings, getEvidence, getRunEvidence } from '@/lib/repositories'
import { provenanceForClaim } from '@/lib/evidence'
import { deriveStatCards } from '@/lib/diagnostics'
import { DEMO_PROMPTS, DEMO_SOV, DEMO_RUN_ID } from '@/lib/fixtures'
import type { ClaimType } from '@/lib/types'

// Screen 2 — diagnosis dashboard. Server Component (Next 16): await params,
// pin the request locale, fetch the run + evidence + findings from the repo.
// The stat strip is derived from THIS run's real evidence (lib/diagnostics):
// measured where evidence exists, pending otherwise. The presence map / SoV
// depend on AI probes (SP4) — shown only for the demo run (clearly badged),
// and a pending placeholder for real runs. The issue list is data-driven.
export default async function RunDiagnosisPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const t = await getTranslations()
  const run = await getRun(id)
  const project = run ? await getProject(run.projectId) : undefined
  const findings = await getFindings(id)
  const isDemo = id === DEMO_RUN_ID

  // 从当前 run 的真实证据派生指标卡；measured 卡可点开对应证据原文。
  const evidenceRows = await getRunEvidence(id)
  const cards = deriveStatCards(
    evidenceRows.map((e) => ({ id: e.id, type: e.type, claimLevel: e.claimLevel, payload: e.payload })),
  )
  const evidenceById: Record<string, EvidenceView> = Object.fromEntries(
    evidenceRows.map((e) => [e.id, { id: e.id, type: e.type, claimLevel: e.claimLevel, source: e.source, payload: e.payload }]),
  )

  const items: FindingItem[] = await Promise.all(
    findings.map(async (f): Promise<FindingItem> => {
      const prov = provenanceForClaim(f.claimType as ClaimType)
      const artifacts = await Promise.all((f.evidenceRefs ?? []).map((ref) => getEvidence(ref)))
      return {
        id: f.id,
        side: f.side as FindingItem['side'],
        title: f.title,
        provVariant: prov.variant,
        provLabel: t(prov.labelKey),
        confidence: f.confidence,
        severity: f.severity === 'high' ? 'hi' : f.severity,
        evidence: artifacts
          .filter((a): a is NonNullable<typeof a> => Boolean(a))
          .map((a) => (
            <EvidenceDrawer
              key={a.id}
              evidence={{
                id: a.id,
                type: a.type,
                claimLevel: a.claimLevel,
                source: a.source,
                payload: a.payload,
              }}
            />
          )),
      }
    }),
  )

  return (
    <Shell active={2} locale={locale} runId={id} domain={project?.domain}>
      <section className="screen show" data-screen="2">
        <div className="sec-h">
          <h2>{t('screen2.currentTitle')}</h2>
          <span className="meta">{t('screen2.currentMeta')}</span>
        </div>
        <StatStrip cards={cards} evidenceById={evidenceById} />

        <div className="sec-h">
          <h2>{t('screen2.mapTitle')}</h2>
          <span className="meta">{isDemo ? t('screen2.demoBadge') : t('screen2.mapMeta')}</span>
        </div>
        {isDemo ? (
          <PresenceMap prompts={DEMO_PROMPTS} />
        ) : (
          <div className="card pending-block">{t('screen2.mapPending')}</div>
        )}

        <div className="sec-h">
          <h2>{t('screen2.sovTitle')}</h2>
          {isDemo ? <span className="meta">{t('screen2.demoBadge')}</span> : null}
        </div>
        {isDemo ? (
          <SovBar rows={DEMO_SOV} />
        ) : (
          <div className="card pending-block">{t('screen2.sovPending')}</div>
        )}

        <div className="sec-h">
          <h2>{t('screen2.findingsTitle')}</h2>
          <span className="meta">{t('screen2.findingsMeta')}</span>
        </div>
        {items.length ? (
          <FindingList items={items} />
        ) : (
          <div className="card pending-block">{t('screen2.emptyFindings')}</div>
        )}

        <div className="note">{t('screen2.note')}</div>
      </section>
    </Shell>
  )
}
