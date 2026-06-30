'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DemoPrompt } from '@/lib/fixtures'

// Answer presence map — one cell per prompt; teal = brand appears, grey = absent.
// Client leaf: hover/focus shows a fixed-position tooltip with the exact prompt,
// reproducing the prototype <script> behaviour with React state instead of
// imperative DOM mutation.
type Tip = { text: string; left: number; top: number }

export function PresenceMap({ prompts }: { prompts: DemoPrompt[] }) {
  const t = useTranslations('screen2')
  const [tip, setTip] = useState<Tip | null>(null)

  function show(p: DemoPrompt, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const prefix = p.present ? '✓ ' : '✗ '
    setTip({
      text: prefix + p.text,
      left: Math.min(r.left, window.innerWidth - 250),
      top: r.bottom + 8,
    })
  }

  return (
    <div className="card map-wrap">
      <div className="map" id="map">
        {prompts.map((p, i) => (
          <div
            key={i}
            className={p.present ? 'cell on' : 'cell'}
            tabIndex={0}
            aria-label={(p.present ? '✓ ' : '✗ ') + p.text}
            onMouseEnter={(e) => show(p, e.currentTarget)}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => show(p, e.currentTarget)}
            onBlur={() => setTip(null)}
          />
        ))}
      </div>
      <div className="legend">
        <span>
          <span className="sw" style={{ background: 'var(--measured)' }} />
          {t('legendPresent')}
        </span>
        <span>
          <span
            className="sw"
            style={{ background: 'var(--ds-surface-2)', border: '1px solid var(--ds-border)' }}
          />
          {t('legendAbsent')}
        </span>
        <span style={{ color: 'var(--ds-muted)' }}>{t('legendHover')}</span>
      </div>
      {tip ? (
        <div className="tip" style={{ left: tip.left, top: tip.top, opacity: 1 }}>
          {tip.text}
        </div>
      ) : null}
    </div>
  )
}
