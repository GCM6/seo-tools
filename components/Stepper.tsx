'use client'

import { useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'

// Client leaf: run 状态驱动的只读工作流进度，不承担页面导航。
// 诊断的详情子页仍在页面内通过专用链接进入，避免未完成阶段被步骤条越级访问。
export function getWorkflowStep(status?: RunStatus): 1 | 2 | 3 | 4 {
  if (!status) return 1
  if (status === 'reviewing') return 3
  if (status === 'output') return 4
  return 2
}

export function Stepper({
  status,
  pendingRecommendationCount,
}: {
  status?: RunStatus
  pendingRecommendationCount?: number
}) {
  const t = useTranslations('common.steps')
  const active = getWorkflowStep(status)
  const failed = status === 'failed'

  const items = [
    { n: 1, key: 'new' },
    { n: 2, key: 'diagnose' },
    { n: 3, key: 'recommend' },
    { n: 4, key: 'output' },
  ] as const

  return (
    <div className="stepper" role="list" aria-label={t('progressLabel')}>
      {items.map((it) => {
        const isActive = it.n === active
        const isDone = it.n < active
        const isFailed = isActive && failed
        const stateLabel = isFailed
          ? t('interrupted')
          : isActive
            ? status === 'reviewing' && typeof pendingRecommendationCount === 'number' && pendingRecommendationCount > 0
              ? t('reviewPending', { count: pendingRecommendationCount })
              : t('inProgress')
            : isDone
              ? t('completed')
              : ''

        return (
          <div
            key={it.n}
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
            className={`step${isActive ? ' active' : ''}${isDone ? ' done' : ''}${!isActive && !isDone ? ' disabled' : ''}${isFailed ? ' failed' : ''}`}
          >
            <span className="n" aria-hidden="true">{isDone ? '✓' : it.n}</span>
            <span className="step-copy">
              <span>{t(it.key)}</span>
              {stateLabel ? <small className="step-status">{stateLabel}</small> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
