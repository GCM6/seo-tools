// 五个维度的健康分条（ux-blueprint §5 ③ 关键数据）。i18n-free 纯展示：调用方 t() 后传入已翻译
// label 与分数；不加 'use client'，报告页 / 分享页（Server Component）都能直接用。
// 改版去掉了数字滚动动画（design-system Never 清单）：分数直接显示终值。
// null 分数（未采集到证据的维度）显示 unscoredLabel，不显示 0——0 分和「没测」是两回事。
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

export function PillarBars({
  overall,
  overallLabel,
  unscoredLabel,
  ariaLabel,
  pillars,
  max = 100,
}: {
  /** 不传 overallLabel 时不显示总分行（报告里总分放在结果表里）。 */
  overall?: number | null
  overallLabel?: string
  unscoredLabel: string
  ariaLabel: string
  pillars: { key: string; label: string; score: number | null }[]
  max?: number
}) {
  return (
    <div className="ui-pillars">
      {overallLabel ? (
        <p className="ui-pillars__overall">
          <span>{overallLabel}</span>
          <b className={overall === null || overall === undefined ? 'ui-muted' : undefined}>
            {overall === null || overall === undefined ? unscoredLabel : formatScore(overall)}
          </b>
        </p>
      ) : null}
      <ul className="ui-pillars__rows" aria-label={ariaLabel}>
        {pillars.map((p) => {
          const scored = p.score !== null
          const pct = scored ? Math.max(0, Math.min(100, (p.score! / max) * 100)) : 0
          return (
            <li key={p.key} className={scored ? 'ui-pillar' : 'ui-pillar ui-pillar--na'}>
              <span className="ui-pillar__label">{p.label}</span>
              <span className="ui-bar">{scored ? <i style={{ width: `${pct}%` }} /> : null}</span>
              <span className="ui-pillar__val">{scored ? formatScore(p.score!) : unscoredLabel}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
