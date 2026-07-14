'use client'

import { useState, type ReactNode } from 'react'

export function PillarGroupCard({
  pillarName,
  scoreText,
  isScored,
  unscoredLabel,
  noFindingsLabel,
  findingsCount,
  findingsLabel,
  children,
}: {
  pillarName: string
  scoreText: string
  isScored: boolean
  unscoredLabel: string
  noFindingsLabel: string
  findingsCount: number
  findingsLabel: string
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className={`card report-pillar mb-4 ${isOpen ? 'open' : 'closed'}`} style={{ marginBottom: '16px' }}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="report-pillar-h"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 0,
          padding: '16px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={isOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="chev"
            style={{
              display: 'inline-block',
              transition: 'transform var(--transition-default)',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              color: 'var(--ds-muted)',
              fontSize: '11px',
              marginRight: '4px'
            }}
          >
            ▶
          </span>
          <span className="report-pillar-name" style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--ds-ink)' }}>
            {pillarName}
          </span>
          <span
            className="report-pillar-findings-badge"
            style={{
              fontSize: '11px',
              color: 'var(--ds-muted)',
              background: 'var(--ds-surface-2)',
              padding: '2px 8px',
              borderRadius: '12px'
            }}
          >
            {findingsLabel}
          </span>
        </div>
        <span className={isScored ? 'report-pillar-score' : 'report-pillar-score muted'} style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {isScored ? scoreText : unscoredLabel}
        </span>
      </button>

      {/* 展开内容折叠区 */}
      <div
        style={{
          display: isOpen ? 'block' : 'none',
          borderTop: '1px solid var(--ds-border-subtle)',
          padding: '0 16px 16px 16px',
          animation: isOpen ? 'ds-slide-up var(--transition-fast) forwards' : 'none'
        }}
      >
        {findingsCount > 0 ? children : (
          <p className="note" style={{ margin: '16px 0 0 0', fontSize: '13px', color: 'var(--ds-muted)' }}>{noFindingsLabel}</p>
        )}
      </div>
    </div>
  )
}
