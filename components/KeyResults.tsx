import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EvidenceBadge } from './EvidenceBadge'
import { EvidenceDrawer, type EvidenceView } from './EvidenceDrawer'
import { provenanceForLevel } from '@/lib/evidence'
import type { StatCard, StatCardKey } from '@/lib/diagnostics'
import type { HealthKey } from '@/lib/settings/data-source-health'
import { getDataSourceConnectHref, isExternalConnectHref } from '@/lib/settings/connect-links'

// 关键结果表（取代旧 StatStrip 卡片，ux-blueprint §3.1）：检测项目 / 结果 / 说明 / 证据。
// 有证据的行显示数值 + 证据等级，可展开看原始数据；没有证据的行如实写「未接入」或「本轮未测量」
// 和原因，给能完成连接的入口——不用骨架屏冒充加载，也不把开发者环境变量写进界面（design-system §3.6）。
const REASON_ANCHOR: Partial<Record<string, HealthKey>> = {
  search_provider: 'googleCse',
  ai_probe: 'aiProbe',
  gsc: 'gsc',
}
const NOT_CONNECTED = new Set(['search_provider', 'ai_probe', 'gsc'])

const UNIT_KEY: Partial<Record<StatCardKey, string>> = {
  indexVisibility: 'stats.indexVisibilityUnit',
  avgRank: 'stats.avgRankUnit',
  schemaCoverage: 'stats.schemaCoverageUnit',
}
const UNIT_SUFFIX: Partial<Record<StatCardKey, string>> = { crawlableText: '%' }

export async function KeyResults({
  cards,
  evidenceById,
  locale,
  projectId,
}: {
  cards: StatCard[]
  evidenceById?: Record<string, EvidenceView>
  locale: string
  projectId?: string
}) {
  const [t, ts, tRoot] = await Promise.all([getTranslations('overview'), getTranslations('screen2'), getTranslations()])

  return (
    <div className="ui-panel ui-result">
      <div className="ui-result__row ui-result__head" aria-hidden="true">
        <span>{t('col.item')}</span>
        <span>{t('col.result')}</span>
        <span>{t('col.note')}</span>
        <span>{t('col.evidence')}</span>
      </div>
      {cards.map((c) => {
        const label = t(`metric.${c.key}`)

        if (c.state === 'pending') {
          const anchor = REASON_ANCHOR[c.reason]
          const href = anchor ? getDataSourceConnectHref(anchor, locale, projectId) : null
          return (
            <div key={c.key} className="ui-result__row">
              <span className="ui-result__label">{label}</span>
              <span className="ui-result__value ui-result__value--muted">
                {NOT_CONNECTED.has(c.reason) ? t('notConnected') : t('notMeasured')}
              </span>
              <span className="ui-result__note">{t(`pending.${c.reason}`)}</span>
              <span className="ui-result__ev">
                {href ? (
                  isExternalConnectHref(href) ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {t('connect')} ↗
                    </a>
                  ) : (
                    <Link href={href}>{t('connect')}</Link>
                  )
                ) : null}
              </span>
            </div>
          )
        }

        const prov = provenanceForLevel(c.level)
        const ev = evidenceById?.[c.evidenceId]
        const unitKey = UNIT_KEY[c.key]
        const unit = UNIT_SUFFIX[c.key] ?? (unitKey ? ts(unitKey) : '')
        return (
          <div key={c.key} className="ui-result__row">
            <span className="ui-result__label">{label}</span>
            <span className="ui-result__value">
              {c.value}
              {unit ? <small> {unit}</small> : null}
            </span>
            <span className="ui-result__note">{t(`metricNote.${c.key}`)}</span>
            <span className="ui-result__ev">
              <EvidenceBadge grade={prov.grade} label={tRoot(prov.labelKey)} />
            </span>
            {ev ? (
              <details className="ui-disclosure ui-result__detail">
                <summary>{t('viewEvidence')}</summary>
                <div className="mt-3">
                  <EvidenceDrawer evidence={ev} />
                </div>
              </details>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
