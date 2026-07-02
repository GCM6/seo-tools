import { getTranslations } from 'next-intl/server'
import { ProvenanceTag } from './ProvenanceTag'
import { EvidenceDrawer, type EvidenceView } from './EvidenceDrawer'
import { provenanceForLevel } from '@/lib/evidence'
import type { StatCard, StatCardKey } from '@/lib/diagnostics'

// Screen 2 stat strip — four fixed diagnosis dimensions derived from the
// current run's evidence (lib/diagnostics). A card is either `measured`
// (real value from a specific evidence artifact, tagged by its evidence level
// and openable to the raw payload) or `pending` (grey placeholder naming the
// SP that will supply its data source). No number is ever shown without
// backing evidence — the product's "证据先于结论" rule made literal.
const UNIT_KEY: Partial<Record<StatCardKey, string>> = {
  indexVisibility: 'stats.indexVisibilityUnit',
  aiVisibility: 'stats.aiVisibilityUnit',
  avgRank: 'stats.avgRankUnit',
  schemaCoverage: 'stats.schemaCoverageUnit',
}
const UNIT_SUFFIX: Partial<Record<StatCardKey, string>> = { crawlableText: '%' }

export async function StatStrip({
  cards,
  evidenceById,
}: {
  cards: StatCard[]
  evidenceById?: Record<string, EvidenceView>
}) {
  const [t, tRoot] = await Promise.all([getTranslations('screen2'), getTranslations()])

  return (
    <div className="stats">
      {cards.map((c) => {
        const label = t(`stats.${c.key}`)

        if (c.state === 'pending') {
          // uncollected：数据源已就绪、本轮未采到（≠功能未建）；其余：数据源未接入。
          // 指引精确到环境变量（内部工具，直接告诉开发者配什么）。
          const isUncollected = c.reason === 'uncollected'
          const source =
            c.reason === 'search_provider'
              ? t('sourceSearchProvider')
              : c.reason === 'ai_probe'
                ? t('sourceAiProbe')
                : c.reason === 'gsc'
                  ? t('sourceGsc')
                  : c.reason === 'render_provider'
                    ? t('sourceRenderProvider')
                    : ''
          const tagLabel = isUncollected ? t('uncollected') : t('pendingSource', { source })
          const hint = t(`configHint.${c.reason}`)
          return (
            <div key={c.key} className="card stat pending" title={hint}>
              <div className="k">{label}</div>
              <div className="v muted">—</div>
              <div className="b">
                <ProvenanceTag variant="g" label={tagLabel} />
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ds-muted)', marginTop: 6 }}>{hint}</div>
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
