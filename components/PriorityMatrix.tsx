import type { PriorityMatrix as PriorityMatrixModel, Quadrant } from '@/lib/diagnosis/report'
import { splitRecommendation } from '@/lib/runs/recommendations'

// 优先级矩阵可视化（spec §7.2 板块6）——Impact × Effort 四象限 + 速赢清单。
// 纯 Server Component：无交互、无 state。文案全部由 props 传入（labels），组件内不碰 i18n，
// 便于在 report 页统一供词与单元测试。象限布局：
//   速赢(quick_win) 左上 · 战略(strategic) 右上 · 填充(fill_in) 左下 · 低优先(low) 右下。

export interface PriorityMatrixLabels {
  quadrants: Record<Quadrant, string>
  quickWinsTitle: string
  axisImpact: string
  axisEffort: string
  high: string
  low: string
  count: (n: number) => string
  empty: string
  /** 「针对：」前缀，配合 targets 使用。 */
  target?: string
}

// 象限顺序对应 2×2 网格自然阅读序（先上排后下排）。
const GRID_ORDER: Quadrant[] = ['quick_win', 'strategic', 'fill_in', 'low']

export function PriorityMatrix({
  matrix,
  labels,
  targets,
}: {
  matrix: PriorityMatrixModel
  labels: PriorityMatrixLabels
  /** 建议 id → 所针对问题的标题；标题相同的建议靠它区分。 */
  targets?: Record<string, string>
}) {
  const quickWins = matrix.quick_win
  // 建议标题里可能拼着静态修复示例（HTML / JSON-LD），矩阵只显示动作句，示例在「先做这 3 件事」和路线图里用代码块展示。
  const action = (what: string) => splitRecommendation(what).action

  return (
    <div className="ui-matrix">
      <div className="ui-matrix__grid" role="table" aria-label={labels.quickWinsTitle}>
        {GRID_ORDER.map((q) => {
          const items = matrix[q]
          return (
            <div key={q} className="ui-matrix__cell" role="cell">
              <div className="ui-matrix__head">
                <span className="ui-matrix__name">{labels.quadrants[q]}</span>
                <span className="ui-matrix__count">{labels.count(items.length)}</span>
              </div>
              {items.length ? (
                <ul className="ui-matrix__list">
                  {items.map((r) => (
                    <li key={r.id}>
                      {action(r.what)}
                      {targets?.[r.id] && labels.target ? (
                        <span className="ui-matrix__target">
                          {labels.target}
                          {targets[r.id]}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ui-footnote">{labels.empty}</p>
              )}
            </div>
          )
        })}
      </div>

      {quickWins.length ? (
        <div className="ui-matrix__wins">
          <h4 className="ui-doc__h4">{labels.quickWinsTitle}</h4>
          <ol className="ui-doc__steps">
            {quickWins.map((r) => (
              <li key={r.id}>
                <span className="ui-doc__step-what">{action(r.what)}</span>
                {r.expectedImpact ? <span className="ui-footnote">{r.expectedImpact}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
