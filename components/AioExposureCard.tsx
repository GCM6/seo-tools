'use client'

import { useTranslations } from 'next-intl'
import { ButtonLink } from './Button'
import { DomainCountTable } from './DomainCountTable'
import { EmptyState } from './EmptyState'
import { EvidenceBadge } from './EvidenceBadge'
import type { AioExposureSummary } from '@/lib/serp/aio-summary'

// Google AI Overviews 实测曝光卡（口径边界见 spec）：全产品唯一允许用「实测曝光」
// 字样的卡片——数据来自真实 Google SERP 采样（DataForSEO），不是模型自述，与
// PresenceMap 的「代理指标口径」形成对照。三种空态按数据链路阶段拆分：
//   1) configured=false        → 未配置 DataForSEO，引导去设置页
//   2) configured=true && !summary → 已配置但本轮未采集（重新诊断即可出数）
//   3) summary 存在但 aioPresentCount=0 → 走正常渲染路径，如实展示 0，不当故障
// n=1 单轮采样：不展示置信区间（样本不支持 Wilson 区间），只提示日间波动。
// 引用域名超过 10 个默认折叠；逐条查询明细默认收起（design-system §1.2：长列表不全部展开）。
export function AioExposureCard({
  summary,
  configured,
  settingsHref,
}: {
  summary: AioExposureSummary | null
  configured: boolean
  settingsHref: string
}) {
  const t = useTranslations('screen2')
  const to = useTranslations('overview')

  return (
    <div className="ui-panel">
      <div className="ui-panel__body grid grid-cols-1 gap-4">
        <div className="ui-detail__head">
          <span>{t('aioExposureEyebrow')}</span>
          <EvidenceBadge grade="hard" label={t('aioExposureMeasuredBadge')} />
        </div>
        <div>
          <h3 className="ui-panel__title">{t('aioExposureTitle')}</h3>
          <p className="ui-result__note mt-1">{t('aioExposureDetail')}</p>
        </div>

        {!configured ? (
          <EmptyState
            title={t('aioExposureEmptyConfigTitle')}
            description={t('aioExposureEmptyConfigImpact')}
            action={
              <ButtonLink href={settingsHref} size="sm">
                {t('aioExposureEmptyConfigAction')}
              </ButtonLink>
            }
          />
        ) : !summary ? (
          <EmptyState title={t('aioExposureEmptyUncollected')} />
        ) : (
          <>
            <div className="ui-trio">
              <div>
                <span className="ui-big">
                  <b>{summary.aioPresentCount}</b>
                  <small> {t('aioExposureOf', { total: summary.measuredQueries })}</small>
                </span>
                <span className="ui-trio__cap">{t('aioExposurePresentLabel')}</span>
              </div>
              <div>
                <span className="ui-big">
                  <b>{summary.ownedCitedCount}</b>
                  <small> {t('aioExposureOf', { total: summary.aioPresentCount })}</small>
                </span>
                <span className="ui-trio__cap">{t('aioExposureOwnedLabel')}</span>
              </div>
              <div>
                <span className="ui-big">
                  <b>{summary.measuredQueries}</b>
                  <small> {t('aioExposureOf', { total: summary.totalQueries })}</small>
                </span>
                <span className="ui-trio__cap">{t('aioExposureMeasuredLabel')}</span>
              </div>
            </div>

            {/* n=1 单轮采样：不给置信区间（样本不支持），只提示波动 */}
            <p className="ui-footnote">{t('aioExposureSampleNote')}</p>

            <div className="grid grid-cols-1 gap-2">
              <h4 className="ui-label">{t('aioExposureDomainsTitle')}</h4>
              {summary.citedDomains.length === 0 ? (
                <p className="ui-result__note">{t('aioExposureNoDomains')}</p>
              ) : (
                <DomainCountTable
                  rows={summary.citedDomains.map((d) => ({ domain: d.domain, count: d.count, own: d.origin === 'owned' }))}
                  labels={{
                    domain: to('domainCol'),
                    count: to('countCol'),
                    own: t('aioExposureOwnedBadge'),
                    showAll: to('showAll', { n: summary.citedDomains.length }),
                    showLess: to('showLess', { n: 10 }),
                  }}
                />
              )}
            </div>

            <details className="ui-disclosure">
              <summary>{`${t('aioExposureQueryTitle')} · ${summary.perQuery.length}`}</summary>
              {summary.perQuery.length === 0 ? (
                <p className="ui-result__note mt-2">{t('aioExposureNoQueries')}</p>
              ) : (
                <ul className="ui-qlist">
                  {summary.perQuery.map((q, i) => (
                    <li key={`${q.query}-${i}`}>
                      <details className="ui-disclosure">
                        <summary>
                          <span className="ui-qlist__q">{q.query}</span>
                          <span className={q.aioPresent ? 'ui-qlist__status' : 'ui-qlist__status ui-muted'}>
                            {q.aioPresent ? t('aioExposurePresent') : t('aioExposureAbsent')}
                          </span>
                        </summary>
                        <div className="ui-qlist__body">
                          <p>{q.ownedCited ? t('aioExposureOwnedCited') : t('aioExposureNotOwnedCited')}</p>
                          {q.citedUrls.length > 0 ? (
                            <ul className="ui-qlist__urls">
                              {q.citedUrls.map((url) => (
                                <li key={url}>
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="ui-mono">
                                    {url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="ui-muted">{t('aioExposureNoCitedUrls')}</p>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </>
        )}
      </div>
    </div>
  )
}
