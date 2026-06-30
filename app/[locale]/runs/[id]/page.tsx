import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { StatStrip } from '@/components/StatStrip'
import { PresenceMap } from '@/components/PresenceMap'
import { SovBar } from '@/components/SovBar'
import { FindingList, type FindingItem } from '@/components/FindingList'
import { EvidenceDrawer } from '@/components/EvidenceDrawer'
import { getRun, getProject, getFindings, getEvidence } from '@/lib/repositories'
import { provenanceForClaim } from '@/lib/evidence'
import { DEMO_PROMPTS, DEMO_SOV } from '@/lib/fixtures'
import type { ClaimType } from '@/lib/types'

// Screen 2 — diagnosis dashboard. Server Component (Next 16): await params,
// pin the request locale, fetch the run + findings from the repo, then hand
// each interactive piece to a client leaf. The stat strip / presence map / SoV
// use the fixed demo snapshot; the issue list is data-driven from findings,
// each with its raw evidence rendered into the (server) <EvidenceDrawer>.
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
        <StatStrip />

        <div className="sec-h">
          <h2>{t('screen2.mapTitle')}</h2>
          <span className="meta">{t('screen2.mapMeta')}</span>
        </div>
        <PresenceMap prompts={DEMO_PROMPTS} />

        <div className="sec-h">
          <h2>{t('screen2.sovTitle')}</h2>
        </div>
        <SovBar rows={DEMO_SOV} />

        <div className="sec-h">
          <h2>{t('screen2.findingsTitle')}</h2>
          <span className="meta">{t('screen2.findingsMeta')}</span>
        </div>
        <FindingList items={items} />

        <div className="note">{t('screen2.note')}</div>
      </section>
    </Shell>
  )
}
