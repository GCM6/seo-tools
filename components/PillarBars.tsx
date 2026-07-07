import { CountUp } from '@/components/fx/CountUp'

// 首屏诊断概要卡的五支柱可视化（SP-G2d）。
// i18n-free 纯展示：调用方 t() 后传入已翻译 label 与分数。
// 内部组合 CountUp（'use client' 叶子；SSR 落终值、挂载后才补间 → 无水合错配），
// 组件本身不加 'use client'，可直接用于 Server Component（报告页 / 分享页共用）。
// null 分数（V0 常见未评分支柱）显示 unscoredLabel 而非 0，比雷达图更诚实。
export function PillarBars({
  overall,
  overallLabel,
  unscoredLabel,
  ariaLabel,
  pillars,
  max = 100,
}: {
  overall: number | null
  overallLabel: string
  unscoredLabel: string
  ariaLabel: string
  pillars: { key: string; label: string; score: number | null }[]
  max?: number
}) {
  return (
    <div className="pbars">
      <div className="pbars-overall">
        <div className="k">{overallLabel}</div>
        <div className={overall === null ? 'v muted' : 'v'}>
          {overall === null ? unscoredLabel : <CountUp value={overall} />}
        </div>
      </div>

      <div className="pbars-rows" role="img" aria-label={ariaLabel}>
        {pillars.map((p) => {
          const scored = p.score !== null
          const pct = scored ? Math.max(0, Math.min(100, (p.score! / max) * 100)) : 0
          return (
            <div key={p.key} className="pbar-row">
              <div className="pbar-label">{p.label}</div>
              <div className={scored ? 'pbar-track' : 'pbar-track empty'}>
                {scored ? <div className="pbar-fill" style={{ width: `${pct}%` }} /> : null}
              </div>
              <div className={scored ? 'pbar-score' : 'pbar-score muted'}>
                {scored ? <CountUp value={p.score!} /> : unscoredLabel}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
