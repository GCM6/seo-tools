import type { LifeStep, LifeStepKey } from '@/lib/runs/workspace'

// 诊断进度（design-system §4 Lifecycle）：一行步骤，只显示状态、不可点击（不再兼做导航）。
// 已完成 ✓ + ink-2；当前 8px 强调色圆点 + 600 字重；未开始 ink-3；失败用 sev-high。i18n-free。
export function Lifecycle({
  steps,
  labels,
  failedLabel,
  ariaLabel,
}: {
  steps: LifeStep[]
  labels: Record<LifeStepKey, string>
  failedLabel: string
  ariaLabel: string
}) {
  return (
    <ol className="ui-life" aria-label={ariaLabel}>
      {steps.map((s) => (
        <li
          key={s.key}
          className={s.state === 'done' ? 'ui-life__done' : s.state === 'current' ? 'ui-life__cur' : s.state === 'failed' ? 'ui-life__fail' : undefined}
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          {s.state === 'done' ? <span className="ui-life__mark" aria-hidden="true">✓</span> : null}
          {s.state === 'current' ? <span className="ui-life__dot" aria-hidden="true" /> : null}
          <span>{labels[s.key]}</span>
          {s.count ? <span className="ui-num">{s.count}</span> : null}
          {s.state === 'failed' ? <span>· {failedLabel}</span> : null}
        </li>
      ))}
    </ol>
  )
}
