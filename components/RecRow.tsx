import type { ReactNode } from 'react'
import { SeverityMark, severityLevel } from './SeverityMark'

// 建议行（ux-blueprint §3.3 / §3.4）：建议页与执行清单共用同一种行。
// 一行 = 严重度 · 标题（点击展开）+「针对：问题」· 影响 / 工作量 · 证据徽章 · 右侧状态或操作；
// 展开区用 hidden 属性切换（jsdom 里也能断言可见性）。i18n-free、无 hook：文案和状态都由调用方给。
// 标题用 h4：页面 h1 = 域名，h2 = 区段，h3 = 优先级分组。
export function RecRow({
  id,
  severity,
  severityLabel = '',
  title,
  target,
  meta,
  badge,
  aside,
  open,
  onToggle,
  notice,
  children,
}: {
  id: string
  /** 所针对问题的 findings.severity（high | mid | ok）；没有关联问题时不画严重度。 */
  severity?: string
  severityLabel?: string
  title: ReactNode
  /** 「针对：〈问题标题〉」那一行，含链接。 */
  target?: ReactNode
  meta?: ReactNode
  badge?: ReactNode
  aside?: ReactNode
  open: boolean
  onToggle: () => void
  /** 行内提示（操作失败等），显示在行下方、展开区之上，收起时也可见。 */
  notice?: ReactNode
  children: ReactNode
}) {
  const bodyId = `rec-body-${id}`
  return (
    <article className="ui-rec">
      <div className="ui-rec__row">
        <span className="ui-rec__sev">{severity ? <SeverityMark level={severityLevel(severity)} label={severityLabel} /> : null}</span>
        <div className="ui-rec__main">
          <h4 className="ui-rec__title">
            <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
              <span>{title}</span>
            </button>
          </h4>
          {target ? <p className="ui-rec__target">{target}</p> : null}
        </div>
        <span className="ui-rec__meta">{meta}</span>
        <span className="ui-rec__badge">{badge}</span>
        <div className="ui-rec__aside">{aside}</div>
      </div>
      {notice ? <div className="ui-rec__notice">{notice}</div> : null}
      <div className="ui-rec__body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </article>
  )
}
