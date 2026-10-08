import type { ReactNode } from 'react'

// 全站唯一的面板样式（design-system §4 Panel）：surface 底 + 1px line + 2px 圆角，无阴影。
// 不允许面板套面板；面板内分组用表格或 .ui-divider。i18n-free。
export function Panel({
  title,
  titleId,
  actions,
  footer,
  density = 'normal',
  className,
  children,
}: {
  title?: ReactNode
  /** 供外部 aria-labelledby 引用。 */
  titleId?: string
  actions?: ReactNode
  footer?: ReactNode
  /** normal=20px 内边距；dense=12px；flush=0（面板里直接放表格时用）。 */
  density?: 'normal' | 'dense' | 'flush'
  className?: string
  children: ReactNode
}) {
  const cls = ['ui-panel', density === 'normal' ? '' : `ui-panel--${density}`, className ?? ''].filter(Boolean).join(' ')
  return (
    <section className={cls} aria-labelledby={title && titleId ? titleId : undefined}>
      {title || actions ? (
        <div className="ui-panel__head">
          {title ? (
            <h3 className="ui-panel__title" id={titleId}>
              {title}
            </h3>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      <div className="ui-panel__body">{children}</div>
      {footer ? <div className="ui-panel__foot">{footer}</div> : null}
    </section>
  )
}
