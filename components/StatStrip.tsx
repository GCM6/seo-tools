'use client'

import { useTranslations } from 'next-intl'
import { ProvenanceTag } from './ProvenanceTag'

// Screen 2 stat strip — four headline numbers from the baseline run.
// Values mirror the prototype demo snapshot; the evidence-grade tag on each
// card keeps measurement (m) and inference (i) visually distinct, per the
// "measurement vs. inference must stay layered" rule.
type Card = {
  labelKey: string
  value: string
  unitKey?: string
  variant: 'm' | 'i'
  tagKey: string
}

const CARDS: Card[] = [
  { labelKey: 'stats.aiVisibility', value: '6', unitKey: 'stats.aiVisibilityUnit', variant: 'm', tagKey: 'statTag.sampleMeasured' },
  { labelKey: 'stats.avgRank', value: '14.2', unitKey: 'stats.avgRankUnit', variant: 'm', tagKey: 'statTag.gscMeasured' },
  { labelKey: 'stats.crawlablePages', value: '62', unitKey: undefined, variant: 'm', tagKey: 'statTag.crawlMeasured' },
  { labelKey: 'stats.competitorVisibility', value: '11', unitKey: 'stats.competitorVisibilityUnit', variant: 'i', tagKey: 'statTag.inferredSample' },
]

export function StatStrip() {
  const t = useTranslations('screen2')

  return (
    <div className="stats">
      {CARDS.map((c) => (
        <div key={c.labelKey} className="card stat">
          <div className="k">{t(c.labelKey)}</div>
          <div className="v">
            {c.value}
            <small>{c.labelKey === 'stats.crawlablePages' ? '%' : c.unitKey ? ` ${t(c.unitKey)}` : ''}</small>
          </div>
          <div className="b">
            <ProvenanceTag variant={c.variant} label={t(c.tagKey)} />
          </div>
        </div>
      ))}
    </div>
  )
}
