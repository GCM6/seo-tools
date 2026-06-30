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
}: {
  facts?: ReportPanelFact[]
}) {
  const t = await getTranslations('screen4')
  const tCommon = await getTranslations('common')

  return (
    <div className="card report">
      <h2>{t('reportTitle')}</h2>
      <div className="rmeta">{t('reportMeta')}</div>

      <div className="rsec">
        <div className="rt">
          {t('report.snapshotTitle')}{' '}
          <ProvenanceTag variant="m" label={tCommon('tag.measured')} />
        </div>
        <div className="rd">{t('report.snapshotBody')}</div>
      </div>

      <div className="rsec">
        <div className="rt">{t('report.gapTitle')}</div>
        <div className="rd">{t('report.gapBody')}</div>
      </div>

      <div className="rsec">
        <div className="rt">{t('report.issuesTitle')}</div>
        <div className="rd">{t('report.issuesBody')}</div>
      </div>

      <div className="rsec">
        <div className="rt">{t('report.recsTitle')}</div>
        <div className="rd">{t('report.recsBody')}</div>
      </div>

      <div className="rsec">
        <div className="rt">
          {t('report.retestTitle')}{' '}
          <ProvenanceTag variant="i" label={t('report.retestTag')} />
        </div>
        <div className="rd">{t('report.retestBody')}</div>
      </div>

      {facts.length > 0 ? (
        <div className="rsec">
          <div className="rt">{tCommon('tag.measured')}</div>
          <div className="rd">
            <ul>
              {facts.map((f, i) => (
                <li key={i}>{f.factText}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <button className="export">{tCommon('actions.export')}</button>
    </div>
  )
}
