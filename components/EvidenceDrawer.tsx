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

type SummaryRow = [key: string, value: unknown]

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.join(', ')
  return undefined
}

export async function EvidenceDrawer({ evidence }: { evidence: EvidenceView }) {
  const t = await getTranslations('evidence')
  const payload = asRecord(evidence.payload)
  const rows: SummaryRow[] =
    evidence.type === 'render_check'
      ? [
          ['initialHtmlMainTextChars', payload.initialHtmlMainTextChars],
          ['renderedMainTextChars', payload.renderedMainTextChars],
          ['mainContentDelta', payload.mainContentDelta],
        ]
      : evidence.type === 'gsc'
        ? [
            ['query', payload.query],
            ['impressions', payload.impressions],
            ['ctr', payload.ctr],
            ['avgPosition', payload.avgPosition],
          ]
        : evidence.type === 'schema'
          ? [['types', payload.types]]
          : evidence.type === 'serp_snapshot'
            ? [
                ['query', payload.query],
                ['totalResults', payload.totalResults],
                ['resultCount', payload.resultCount],
                ['homePagePresent', payload.homePagePresent],
                ['firstResultUrl', payload.firstResultUrl],
              ]
          : evidence.type === 'page_fetch'
            ? [
                ['canonicalUrl', payload.canonicalUrl],
                ['metaRobots', payload.metaRobots],
                ['robotsAllowed', payload.robotsAllowed],
              ]
            : evidence.type === 'ai_answer'
              ? [
                  ['prompt', payload.prompt],
                  ['provider', payload.provider],
                  ['modelId', payload.modelId],
                  ['runIdx', payload.runIdx],
                  ['brandPresent', payload.brandPresent],
                  ['targetDomainCited', payload.targetDomainCited],
                  ['competitorsMentioned', payload.competitorsMentioned],
                  ['citedUrls', payload.citedUrls],
                ]
              : []

  const answerText = evidence.type === 'ai_answer' ? text(payload.answerText) : undefined

  return (
    <div>
      <div className="ev-label">
        {t('evidenceRef')} · {evidence.source} · {evidence.claimLevel}
      </div>
      {rows.length ? (
        <div className="ev-summary">
          {rows.map(([key, value]) => {
            const rendered = text(value)
            if (!rendered) return null
            return (
              <div key={key}>
                <span>{t(`summary.${key}`)}</span>
                <b>{rendered}</b>
              </div>
            )
          })}
        </div>
      ) : null}
      {answerText ? (
        <div className="ev-box" style={{ whiteSpace: 'pre-wrap' }}>
          {answerText}
        </div>
      ) : null}
      <details className="raw-evidence">
        <summary>{t('rawJson')}</summary>
        <div className="ev-box code">{JSON.stringify(evidence.payload, null, 2)}</div>
      </details>
    </div>
  )
}
