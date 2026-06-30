import { getTranslations } from 'next-intl/server'

// Raw evidence view inside an expanded finding. Server Component: renders the
// stored artifact verbatim (source + grade + raw payload) so every conclusion
// stays traceable to immutable evidence. Composed as `children` into the
// client <FindingCard>, which is valid RSC composition.
export interface EvidenceView {
  id: string
  type: string
  claimLevel: string
  source: string
  payload: unknown
}

export async function EvidenceDrawer({ evidence }: { evidence: EvidenceView }) {
  const t = await getTranslations('evidence')

  return (
    <div>
      <div className="ev-label">
        {t('evidenceRef')} · {evidence.source} · {evidence.claimLevel}
      </div>
      <div className="ev-box code">{JSON.stringify(evidence.payload, null, 2)}</div>
    </div>
  )
}
