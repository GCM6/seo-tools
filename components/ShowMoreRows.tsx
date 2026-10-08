'use client'

import { useState, type ReactNode } from 'react'

// 长表格默认只显示前 limit 行，其余用「显示全部 N 条」展开（design-system §4 ShowMore；Never 清单：长列表不全部展开）。
// 表头和每一行由调用方（可以是服务端组件）渲染好传进来，这里只管显示多少行。i18n-free。
export function ShowMoreRows({
  head,
  rows,
  limit = 10,
  labels,
}: {
  head: ReactNode
  rows: ReactNode[]
  limit?: number
  labels: { showAll: string; showLess: string }
}) {
  const [open, setOpen] = useState(false)
  const visible = open ? rows : rows.slice(0, limit)
  return (
    <div className="ui-group">
      <div className="ui-panel ui-table-wrap">
        <table className="ui-table">
          {head}
          <tbody>{visible}</tbody>
        </table>
      </div>
      {rows.length > limit ? (
        <div>
          <button type="button" className="ui-btn ui-btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? labels.showLess : labels.showAll}
          </button>
        </div>
      ) : null}
    </div>
  )
}
