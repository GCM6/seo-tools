import type { ReactNode } from 'react'

// 全站唯一的提示条（design-system §4 Notice），取代各种 banner / note / 警示块。
// info=中性；warn / error / success 用对应的浅底 + 同色边框 + 图标；不加左侧彩条。i18n-free。
export type NoticeTone = 'info' | 'warn' | 'error' | 'success'

const ICON_PATH: Record<NoticeTone, string> = {
  info: 'M8 7v5M8 4.5v.5',
  warn: 'M8 5v4M8 11.5v.5',
  error: 'M5.5 5.5l5 5M10.5 5.5l-5 5',
  success: 'M4.5 8.2l2.3 2.3 4.7-4.9',
}

export function Notice({
  tone = 'info',
  title,
  action,
  children,
}: {
  tone?: NoticeTone
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={tone === 'info' ? 'ui-notice' : `ui-notice ui-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <svg className="ui-notice__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <path d={ICON_PATH[tone]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="ui-notice__body">
        {title ? <strong className="ui-notice__title">{title}</strong> : null}
        {children ? <span>{children}</span> : null}
        {action}
      </div>
    </div>
  )
}
