'use client'

import { useState } from 'react'
import { Tag } from './Tag'

// 「域名 + 次数」列表（AI 回答引用域名、Google AI 概览引用域名共用，design-system §4 Table / ShowMore）。
// 超过 limit 行默认折叠（Never 清单：长列表不全部展开）。行是 <li>，自有域名行带 owned 类与强调标签。
// i18n-free：文案（含「显示全部 N 个」）由调用方 t() 后传入。
export interface DomainRow {
  domain: string
  count: number
  own: boolean
  /** 额外的中性标签，例如平台名「Reddit」、归属「第三方」 */
  tags?: string[]
}

export function DomainCountTable({
  rows,
  limit = 10,
  labels,
}: {
  rows: DomainRow[]
  limit?: number
  labels: { domain: string; count: string; own: string; showAll: string; showLess: string }
}) {
  const [open, setOpen] = useState(false)
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1
  const visible = open ? rows : rows.slice(0, limit)

  return (
    <div className="ui-dlist-wrap">
      <div className="ui-dlist__head" aria-hidden="true">
        <span>{labels.domain}</span>
        <span className="ui-num">{labels.count}</span>
        <span />
      </div>
      <ul className="ui-dlist">
        {visible.map((r) => (
          <li key={r.domain} className={r.own ? 'owned' : undefined}>
            <span className="ui-dlist__name">
              <span className="ui-mono">{r.domain}</span>
              {r.own ? <Tag tone="accent">{labels.own}</Tag> : null}
              {r.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </span>
            <b className="ui-num">{r.count}</b>
            <span className={r.own ? 'ui-bar ui-bar--own' : 'ui-bar'} aria-hidden="true">
              <i style={{ width: `${((r.count / max) * 100).toFixed(1)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {rows.length > limit ? (
        <button type="button" className="ui-btn ui-btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? labels.showLess : labels.showAll}
        </button>
      ) : null}
    </div>
  )
}
