'use client'

import type { ReactNode } from 'react'

// 逐条滑入列表：新挂载的 <li> 播放 fx-slide-in（reduced-motion 下 CSS 关闭动画）。
export function AnimatedList({ items, className }: { items: { key: string; node: ReactNode }[]; className?: string }) {
  return (
    <ul className={`fx-list ${className ?? ''}`.trim()}>
      {items.map((it) => (
        <li key={it.key} className="fx-slide-in">
          {it.node}
        </li>
      ))}
    </ul>
  )
}
