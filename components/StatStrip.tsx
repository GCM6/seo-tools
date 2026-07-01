import { getTranslations } from 'next-intl/server'
import { ProvenanceTag } from './ProvenanceTag'
import { EvidenceDrawer, type EvidenceView } from './EvidenceDrawer'
import { labelKeyForLevel } from '@/lib/evidence'
import type { StatCard, StatCardKey } from '@/lib/diagnostics'
import type { EvidenceLevel } from '@/lib/types'

// Screen 2 stat strip — four fixed diagnosis dimensions derived from the
// current run's evidence (lib/diagnostics). A card is either `measured`
// (real value from a specific evidence artifact, tagged by its evidence level
// and openable to the raw payload) or `pending` (grey placeholder naming the
// SP that will supply its data source). No number is ever shown without
// backing evidence — the product's "证据先于结论" rule made literal.
const UNIT_KEY: Partial<Record<StatCardKey, string>> = {
  aiVisibility: 'stats.aiVisibilityUnit',
  avgRank: 'stats.avgRankUnit',
  schemaCoverage: 'stats.schemaCoverageUnit',
}
const UNIT_SUFFIX: Partial<Record<StatCardKey, string>> = { crawlableText: '%' }

function variantForLevel(level: EvidenceLevel): 'm' | 'i' {
  return level === 'L4' || level === 'L3' ? 'm' : 'i'
}

export async function StatStrip({
  cards,
  evidenceById,
}: {
  cards: StatCard[]
  evidenceById?: Record<string, EvidenceView>
}) {
  const t = await getTranslations('screen2')
  const tRoot = await getTranslations()

  return (
    <div className="stats">
      {cards.map((c) => {
        const label = t(`stats.${c.key}`)

        if (c.state === 'pending') {
          return (
            <div key={c.key} className="card stat pending" title={t('pendingHint', { dep: c.dependsOn })}>
              <div className="k">{label}</div>
              <div className="v muted">—</div>
              <div className="b">
                <ProvenanceTag variant="g" label={t('pending', { dep: c.dependsOn })} />
              </div>
            </div>
          )
        }

        const unitKey = UNIT_KEY[c.key]
        const unit = UNIT_SUFFIX[c.key] ?? (unitKey ? ` ${t(unitKey)}` : '')
        const ev = evidenceById?.[c.evidenceId]

        return (
          <div key={c.key} className="card stat">
            <div className="k">{label}</div>
            <div className="v">
              {c.value}
              <small>{unit}</small>
            </div>
            <div className="b">
              <ProvenanceTag variant={variantForLevel(c.level)} label={tRoot(labelKeyForLevel(c.level))} />
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
