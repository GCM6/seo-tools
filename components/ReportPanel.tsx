import { getTranslations } from 'next-intl/server'
import { ProvenanceTag } from './ProvenanceTag'

export interface ReportPanelFact {
  factText: string
}

// Step-4 analysis report — pure display (async Server Component). Copy comes from
// screen4.report.* and common.*. Optionally lists the verified brand facts that
// were injected into the execution prompts, so the report stays evidence-bound.
// Mirrors the prototype .report / .rsec / .export markup.
export async function ReportPanel({
  facts = [],
  domain = '',
  confirmedCount = 0,
}: {
  facts?: ReportPanelFact[]
  domain?: string
  confirmedCount?: number
}) {
  const t = await getTranslations('screen4')
  const tCommon = await getTranslations('common')

  return (
    <div className="card report">
      <h2>{t('reportTitle')}</h2>
      <div className="rmeta">{t('reportMeta', { domain: domain || t('unknownDomain') })}</div>

      <div className="rsec">
        <div className="rt">{t('report.outputTitle')}</div>
        <div className="rd">{t('report.outputBody', { count: confirmedCount })}</div>
      </div>

      <div className="rsec">
        <div className="rt">
          {t('report.factsTitle')}{' '}
          {facts.length ? <ProvenanceTag variant="m" label={tCommon('tag.measured')} /> : null}
        </div>
        <div className="rd">
          {facts.length ? (
            <ul>
              {facts.map((f, i) => (
                <li key={i}>{f.factText}</li>
              ))}
            </ul>
          ) : (
            t('report.emptyFacts')
          )}
        </div>
      </div>

      <div className="rsec">
        <div className="rt">
          {t('report.retestTitle')}{' '}
          <ProvenanceTag variant="i" label={t('report.retestTag')} />
        </div>
        <div className="rd">{t('report.retestBody')}</div>
      </div>

      <button className="export">{tCommon('actions.export')}</button>
    </div>
  )
}
