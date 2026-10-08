import type { ReactNode } from 'react'

// 五支柱明细里的一个维度（报告「详细章节 · 五支柱明细」）。章节本身已经是可折叠的，
// 这里不再嵌套一层折叠：标题行 = 维度名 · 发现数 · 分数，下面直接列发现。
// i18n-free、无 hook，可用于 Server Component（分享页没有客户端 i18n 上下文也能渲染）。
export function PillarGroupCard({
  pillarName,
  scoreText,
  isScored,
  unscoredLabel,
  noFindingsLabel,
  findingsCount,
  findingsLabel,
  children,
}: {
  pillarName: string
  scoreText: string
  isScored: boolean
  unscoredLabel: string
  noFindingsLabel: string
  findingsCount: number
  findingsLabel: string
  children: ReactNode
}) {
  return (
    <section className="ui-pgroup">
      <div className="ui-pgroup__head">
        <h4 className="ui-pgroup__name">{pillarName}</h4>
        <span className="ui-pgroup__count">{findingsLabel}</span>
        <span className={isScored ? 'ui-pgroup__score' : 'ui-pgroup__score ui-muted'}>{isScored ? scoreText : unscoredLabel}</span>
      </div>
      {findingsCount > 0 ? children : <p className="ui-footnote">{noFindingsLabel}</p>}
    </section>
  )
}
