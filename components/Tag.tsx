import type { ReactNode } from 'react'

// 中性短标签：平台、类型、归属（自有 / 第三方）、缺口类型等「不是证据等级、也不是严重度」的信息
// （design-system §3.1 末段）。accent 只用于需要突出的那一类（如「自有域名」）。i18n-free。
export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent'; children: ReactNode }) {
  return <span className={tone === 'accent' ? 'ui-tag ui-tag--accent' : 'ui-tag'}>{children}</span>
}
