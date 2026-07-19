'use client'

import { useTranslations } from 'next-intl'
import { EmptyStateCTA } from './EmptyStateCTA'
import type { AioExposureSummary } from '@/lib/serp/aio-summary'

// Google AI Overviews 实测曝光卡（口径边界见 spec）：全产品唯一允许用「实测曝光」
// 字样的卡片——数据来自真实 Google SERP 采样（DataForSEO），不是模型自述，与
// PresenceMap 的「代理指标口径」形成对照。三种空态按数据链路阶段拆分：
//   1) configured=false        → 未配置 DataForSEO，引导去设置页
//   2) configured=true && !summary → 已配置但本轮未采集（重新诊断即可出数）
//   3) summary 存在但 aioPresentCount=0 → 走正常渲染路径，如实展示 0，不当故障
// n=1 单轮采样：不展示置信区间（样本不支持 Wilson 区间），只提示日间波动。
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

  return (
    <div className="card aio-exposure">
      <div className="map-evidence-intro">
        <div>
          <span>{t('aioExposureEyebrow')}</span>
          <strong>{t('aioExposureTitle')}</strong>
        </div>
        <p>{t('aioExposureDetail')}</p>
        <div className="map-evidence-stats" aria-label={t('aioExposureBadgeLabel')}>
          <span>{t('aioExposureMeasuredBadge')}</span>
        </div>
      </div>

      {!configured ? (
        <EmptyStateCTA
          title={t('aioExposureEmptyConfigTitle')}
          impact={t('aioExposureEmptyConfigImpact')}
          actionLabel={t('aioExposureEmptyConfigAction')}
          href={settingsHref}
          icon="○"
        />
      ) : !summary ? (
        <p className="map-evidence-empty">{t('aioExposureEmptyUncollected')}</p>
      ) : (
        <>
          <div className="stats aio-exposure-stats">
            <div className="stat">
              <div className="k">{t('aioExposurePresentLabel')}</div>
              <div className="v">
                <b>{summary.aioPresentCount}</b>
                <small>{t('aioExposureOf', { total: summary.measuredQueries })}</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">{t('aioExposureOwnedLabel')}</div>
              <div className="v">
                <b>{summary.ownedCitedCount}</b>
                <small>{t('aioExposureOf', { total: summary.aioPresentCount })}</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">{t('aioExposureMeasuredLabel')}</div>
              <div className="v">
                <b>{summary.measuredQueries}</b>
                <small>{t('aioExposureOf', { total: summary.totalQueries })}</small>
              </div>
            </div>
          </div>

          {/* n=1 单轮采样：不给置信区间（样本不支持），只提示波动，措辞对齐
              PresenceMap 的 mapWilsonNote 诚实基调 */}
          <p className="map-wilson-note">{t('aioExposureSampleNote')}</p>

          <div className="aio-exposure-block">
            <div className="fb-l">{t('aioExposureDomainsTitle')}</div>
            {summary.citedDomains.length === 0 ? (
              <p className="map-evidence-empty">{t('aioExposureNoDomains')}</p>
            ) : (
              <ul className="aio-exposure-domains">
                {summary.citedDomains.map((d) => (
                  <li
                    key={d.domain}
                    className={d.origin === 'owned' ? 'aio-exposure-domain owned' : 'aio-exposure-domain'}
                  >
                    <span className="aio-exposure-domain-name">{d.domain}</span>
                    {d.origin === 'owned' ? (
                      <span className="tag ok">
                        <span className="dot" />
                        {t('aioExposureOwnedBadge')}
                      </span>
                    ) : null}
                    <span className="aio-exposure-domain-count">{t('aioExposureDomainCount', { count: d.count })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="aio-exposure-block">
            <div className="fb-l">{t('aioExposureQueryTitle')}</div>
            {summary.perQuery.length === 0 ? (
              <p className="map-evidence-empty">{t('aioExposureNoQueries')}</p>
            ) : (
              <div className="map-evidence-answers aio-exposure-query-list">
                {summary.perQuery.map((q, i) => (
                  <details key={`${q.query}-${i}`}>
                    <summary>
                      <span>{q.query}</span>
                      <b className={q.aioPresent ? 'hit' : 'miss'}>
                        {q.aioPresent ? t('aioExposurePresent') : t('aioExposureAbsent')}
                      </b>
                    </summary>
                    <div>
                      <p>{q.ownedCited ? t('aioExposureOwnedCited') : t('aioExposureNotOwnedCited')}</p>
                      {q.citedUrls.length > 0 ? (
                        <ul className="aio-exposure-cited-urls">
                          {q.citedUrls.map((url) => (
                            <li key={url}>
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="map-evidence-empty">{t('aioExposureNoCitedUrls')}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
