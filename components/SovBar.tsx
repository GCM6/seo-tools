'use client'

import { useTranslations } from 'next-intl'

export interface SovRow {
  name: string
  pct: number
  you: boolean
}

// 竞品提及占比（Share of Voice）：一行一个品牌，自有品牌用强调色条并带「（你）」后缀。
export function SovBar({ rows }: { rows: SovRow[] }) {
  const t = useTranslations('screen2')

  return (
    <div className="ui-panel">
      <div className="ui-panel__body">
        <ul className="ui-sov">
          {rows.map((r) => (
            <li key={r.name} className={r.you ? 'is-you' : undefined}>
              <span className="ui-sov__name">
                {r.name}
                {r.you ? t('youSuffix') : ''}
              </span>
              <span className={r.you ? 'ui-bar ui-bar--own' : 'ui-bar'} aria-hidden="true">
                <i style={{ width: `${r.pct}%` }} />
              </span>
              <b className="ui-num">{r.pct}%</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
