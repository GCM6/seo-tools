import type { ReactNode } from 'react'

// 术语翻译层（P1-3「术语裸奔」修复，spec docs/plans/2026-07-19-ux-audit-optimization-plan.md C2）：
// 给专业术语加虚线下划线，鼠标悬停（title）与屏幕阅读器（aria-describedby）都能读到同一段人话解释。
// i18n-free 纯展示：调用方 t()/getTranslations 解析好 explain 文案再传入，本组件不含任何 hook、
// 不需要 'use client'，可直接用于 Server Component（同 components/ProvenanceTag.tsx 惯例）。
//
// 用 explain 文本生成稳定的 DOM id，不用 React 19 的 useId —— Server Component 不支持有状态 hook。
// 术语场景下同一段解释文案本就该唯一，碰撞概率可忽略；万一撞了，aria-describedby 读到的仍是
// 同义解释文本，不影响可用性。
function descId(explain: string): string {
  let hash = 0
  for (let i = 0; i < explain.length; i++) {
    hash = (hash * 31 + explain.charCodeAt(i)) | 0
  }
  return `term-desc-${Math.abs(hash)}`
}

export function Term({ children, explain }: { children: ReactNode; explain: string }) {
  const id = descId(explain)
  return (
    <>
      <abbr className="term" title={explain} aria-describedby={id}>
        {children}
      </abbr>
      <span id={id} className="sr-only">
        {explain}
      </span>
    </>
  )
}
