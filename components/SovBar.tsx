'use client'

import { useTranslations } from 'next-intl'
import type { DemoSov } from '@/lib/fixtures'

// Share-of-Voice bars — competitor visibility vs. yours. The "you" row is
// tinted with the measured colour and carries the localized "(you)" suffix.
export function SovBar({ rows }: { rows: DemoSov[] }) {
  const t = useTranslations('screen2')

  return (
    <div className="card sov">
      {rows.map((r) => (
        <div key={r.name} className="sov-row">
          <span className={r.you ? 'nm you' : 'nm'}>
            {r.name}
            {r.you ? t('youSuffix') : ''}
          </span>
          <div className={r.you ? 'bar you' : 'bar'}>
            <i style={{ width: `${r.pct}%` }} />
          </div>
          <span className="pct">{r.pct}%</span>
        </div>
      ))}
    </div>
  )
}
