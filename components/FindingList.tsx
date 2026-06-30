'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ProvenanceTag } from './ProvenanceTag'

// One issue row. Client leaf: `open` state toggles the evidence drawer.
// Visibility is driven by an inline `display` style (not the .find.open CSS
// rule alone) so the toggle is observable in jsdom, where globals.css isn't
// loaded — the production stylesheet still styles padding/colours via classes.
export function FindingCard({
  title,
  provVariant,
  provLabel,
  confidence,
  severity,
  children,
}: {
  title: string
  provVariant: 'm' | 'i' | 'g' | 'ok'
  provLabel: string
  confidence: string
  severity: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={open ? 'find open' : 'find'}>
      <button
        type="button"
        className="find-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`sev ${severity}`} />
        <span className="find-title">{title}</span>
        <ProvenanceTag variant={provVariant} label={provLabel} />
        {confidence ? <span className="find-conf">{confidence}</span> : null}
        <span className="chev">▶</span>
      </button>
      <div className="evidence" style={{ display: open ? 'block' : 'none' }}>
        {children}
      </div>
    </div>
  )
}

export interface FindingItem {
  id: string
  side: 'seo' | 'geo' | 'technical'
  title: string
  provVariant: 'm' | 'i' | 'g' | 'ok'
  provLabel: string
  confidence: string
  severity: string
  evidence: ReactNode
}

// Issue list with GEO / SEO tabs. Tabs filter the rows by `side`
// (`technical` groups under GEO, since crawlability is a GEO concern).
export function FindingList({ items }: { items: FindingItem[] }) {
  const t = useTranslations('screen2')
  const [tab, setTab] = useState<'geo' | 'seo'>('geo')

  const shown = items.filter((it) =>
    tab === 'geo' ? it.side === 'geo' || it.side === 'technical' : it.side === 'seo',
  )

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div className="tabs">
          <button
            type="button"
            className={tab === 'geo' ? 'tab active' : 'tab'}
            onClick={() => setTab('geo')}
          >
            {t('tabGeo')}
          </button>
          <button
            type="button"
            className={tab === 'seo' ? 'tab active' : 'tab'}
            onClick={() => setTab('seo')}
          >
            {t('tabSeo')}
          </button>
        </div>
      </div>
      <div className="card">
        {shown.map((it) => (
          <FindingCard
            key={it.id}
            title={it.title}
            provVariant={it.provVariant}
            provLabel={it.provLabel}
            confidence={it.confidence}
            severity={it.severity}
          >
            {it.evidence}
          </FindingCard>
        ))}
      </div>
    </>
  )
}
