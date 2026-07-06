import type { PriorityMatrix as PriorityMatrixModel, Quadrant } from '@/lib/diagnosis/report'

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
}

// 象限顺序对应 2×2 网格自然阅读序（先上排后下排）。
const GRID_ORDER: Quadrant[] = ['quick_win', 'strategic', 'fill_in', 'low']

export function PriorityMatrix({
  matrix,
  labels,
}: {
  matrix: PriorityMatrixModel
  labels: PriorityMatrixLabels
}) {
  const quickWins = matrix.quick_win

  return (
    <div className="pmatrix">
      <div className="pmatrix-grid" role="table" aria-label={labels.quickWinsTitle}>
        {GRID_ORDER.map((q) => {
          const items = matrix[q]
          return (
            <div key={q} className={`pmatrix-cell pmatrix-${q}`} role="cell">
              <div className="pmatrix-cell-h">
                <span className="pmatrix-cell-name">{labels.quadrants[q]}</span>
                <span className="pmatrix-cell-count">{labels.count(items.length)}</span>
              </div>
              {items.length ? (
                <ul className="pmatrix-list">
                  {items.map((r) => (
                    <li key={r.id}>{r.what}</li>
                  ))}
                </ul>
              ) : (
                <p className="pmatrix-empty">{labels.empty}</p>
              )}
            </div>
          )
        })}
      </div>

      {quickWins.length ? (
        <div className="pmatrix-quickwins card">
          <h4>{labels.quickWinsTitle}</h4>
          <ol>
            {quickWins.map((r) => (
              <li key={r.id}>
                <span className="pmatrix-qw-what">{r.what}</span>
                {r.expectedImpact ? <span className="pmatrix-qw-impact">{r.expectedImpact}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
