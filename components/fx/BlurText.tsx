'use client'

import type { ReactNode } from 'react'

// 标题一次性 blur+fade 进场；reduced-motion 下 CSS 关闭动画直接清晰。
export function BlurText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`fx-blur-in ${className ?? ''}`.trim()}>{children}</span>
}
