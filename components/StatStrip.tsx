import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ProvenanceTag } from './ProvenanceTag'
import { EvidenceDrawer, type EvidenceView } from './EvidenceDrawer'
import { provenanceForLevel } from '@/lib/evidence'
import { Skeleton } from './Skeleton'
import type { StatCard, StatCardKey } from '@/lib/diagnostics'
import type { HealthKey } from '@/lib/settings/data-source-health'
import { getDataSourceConnectHref, isExternalConnectHref } from '@/lib/settings/connect-links'

// pending 卡的缺源 reason → 数据源 key（uncollected 无入口：数据源已就绪、
// 只是本轮未采到，给不出「去连接」出路）。入口由 connect-links 统一判定：GSC 回项目，
// 本地 BYOK 回设置页，外部服务直达对应控制台。（spec §SP-G2b-7）
const REASON_ANCHOR: Partial<Record<string, HealthKey>> = {
  search_provider: 'googleCse',
  ai_probe: 'aiProbe',
  gsc: 'gsc',
}

// Screen 2 stat strip — four fixed diagnosis dimensions derived from the
// current run's evidence (lib/diagnostics). A card is either `measured`
// (real value from a specific evidence artifact, tagged by its evidence level
// and openable to the raw payload) or `pending` (grey placeholder naming the
// SP that will supply its data source). No number is ever shown without
// backing evidence — the product's "证据先于结论" rule made literal.
// aiVisibility 不在这里：value 已是 unbranded 口径的「present/total」组合字符串
// （lib/diagnostics.ts deriveAiVisibility），denominator 随 run 变化，不能再拼一个
// 固定的「/ 20 提问」后缀。
const UNIT_KEY: Partial<Record<StatCardKey, string>> = {
  indexVisibility: 'stats.indexVisibilityUnit',
  avgRank: 'stats.avgRankUnit',
  schemaCoverage: 'stats.schemaCoverageUnit',
}
const UNIT_SUFFIX: Partial<Record<StatCardKey, string>> = { crawlableText: '%' }

export async function StatStrip({
  cards,
  evidenceById,
  locale,
  projectId,
}: {
  cards: StatCard[]
  evidenceById?: Record<string, EvidenceView>
  locale?: string
  projectId?: string
}) {
  const [t, tRoot] = await Promise.all([getTranslations('screen2'), getTranslations()])

  return (
    <div className="stats">
      {cards.map((c) => {
        const label = t(`stats.${c.key}`)

        if (c.state === 'pending') {
          // uncollected：数据源已就绪、本轮未采到（≠功能未建）；render_fallback 表示
          // 基础 HTML 已采，只是没有浏览器级 JS 差异证据，因此不强迫用户接 Cloudflare。
          // 指引精确到环境变量（内部工具，直接告诉开发者配什么）。
          const hint = t(`configHint.${c.reason}`)
          // 缺源卡给真正能完成连接的入口（uncollected 除外，见 REASON_ANCHOR 注释）。
          const anchor = locale && c.reason ? REASON_ANCHOR[c.reason] : undefined
          const connectHref = anchor && locale ? getDataSourceConnectHref(anchor, locale, projectId) : null
          return (
            <div key={c.key} className="card stat pending" title={hint} style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
              <div className="k">{label}</div>
              {/* 优雅的骨架屏值 */}
              <div className="v muted" style={{ display: 'flex', alignItems: 'center', minHeight: '32px' }}>
                <Skeleton width="60%" height={24} />
              </div>
              <div className="b" style={{ display: 'flex', alignItems: 'center', minHeight: '20px' }}>
                <Skeleton width="45%" height={16} />
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ds-muted)', marginTop: 4 }}>{hint}</div>
              {connectHref
                ? isExternalConnectHref(connectHref) ? (
                    <a href={connectHref} target="_blank" rel="noopener noreferrer" className="stat-connect" style={{ fontSize: '11.5px', textDecoration: 'none', color: 'var(--ds-primary)', fontWeight: 500, marginTop: '4px' }}>
                      {tRoot('dataHealth.connect')} &rarr;
                    </a>
                  ) : (
                    <Link href={connectHref} className="stat-connect" style={{ fontSize: '11.5px', textDecoration: 'none', color: 'var(--ds-primary)', fontWeight: 500, marginTop: '4px' }}>
                      {tRoot('dataHealth.connect')} &rarr;
                    </Link>
                  )
                : null}
            </div>
          )
        }

        const unitKey = UNIT_KEY[c.key]
        const unit = UNIT_SUFFIX[c.key] ?? (unitKey ? ` ${t(unitKey)}` : '')
        const ev = evidenceById?.[c.evidenceId]
        const prov = provenanceForLevel(c.level)

        return (
          <div key={c.key} className="card stat">
            <div className="k">{label}</div>
            <div className="v">
              {c.value}
              <small>{unit}</small>
            </div>
            <div className="b">
              <ProvenanceTag variant={prov.variant} label={tRoot(prov.labelKey)} />
            </div>
            {ev ? (
              <details className="ev-details">
                <summary>{t('viewEvidence')}</summary>
                <EvidenceDrawer evidence={ev} />
              </details>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
