import { getTranslations } from 'next-intl/server'

export interface KeywordMetricRow {
  id: string
  keywordId: string
  clicks: number | null
  impressions: number | null
  ctr: string | null
  position: string | null
  source: string
}
export interface KeywordGapRow {
  id: string
  keywordId: string
  gapType: string
  ourPosition: string | null
  opportunityScore: string | null
}
export type KeywordTextMap = Map<string, { text: string; volume: number | null; difficulty: number | null }>

// 关键词表（metrics + gaps）。报告页 §4 与关键词现状 tab 同用。列标签复用 report.keywords.*。
export async function KeywordTable({
  keywordMetrics,
  keywordGaps,
  keywordText,
}: {
  keywordMetrics: KeywordMetricRow[]
  keywordGaps: KeywordGapRow[]
  keywordText: KeywordTextMap
}) {
  const t = await getTranslations('report')
  if (!keywordMetrics.length && !keywordGaps.length) {
    return <p className="note">{t('keywords.empty')}</p>
  }
  return (
    <>
      <p className="note">{t('keywords.estimateNote')}</p>
      {keywordMetrics.length ? (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>{t('keywords.col.keyword')}</th>
                <th>{t('keywords.col.clicks')}</th>
                <th>{t('keywords.col.impressions')}</th>
                <th>{t('keywords.col.ctr')}</th>
                <th>{t('keywords.col.position')}</th>
                <th>{t('keywords.col.source')}</th>
              </tr>
            </thead>
            <tbody>
              {keywordMetrics.map((m) => (
                <tr key={m.id}>
                  <td>{keywordText.get(m.keywordId)?.text ?? m.keywordId}</td>
                  <td>{m.clicks ?? '—'}</td>
                  <td>{m.impressions ?? '—'}</td>
                  <td>{m.ctr ?? '—'}</td>
                  <td>{m.position ?? '—'}</td>
                  <td className="mono">{m.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {keywordGaps.length ? (
        <div className="report-table-wrap">
          <h4>{t('keywords.gapsTitle')}</h4>
          <table className="report-table">
            <thead>
              <tr>
                <th>{t('keywords.col.keyword')}</th>
                <th>{t('keywords.col.gapType')}</th>
                <th>{t('keywords.col.ourPosition')}</th>
                <th>{t('keywords.col.opportunity')}</th>
                <th>{t('keywords.col.volume')}</th>
              </tr>
            </thead>
            <tbody>
              {keywordGaps.map((gp) => (
                <tr key={gp.id}>
                  <td>{keywordText.get(gp.keywordId)?.text ?? gp.keywordId}</td>
                  <td>{t(`keywords.gapType.${gp.gapType}`)}</td>
                  <td>{gp.ourPosition ?? '—'}</td>
                  <td>{gp.opportunityScore ?? '—'}</td>
                  <td>{keywordText.get(gp.keywordId)?.volume ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}
