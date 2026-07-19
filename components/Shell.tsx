import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Stepper } from './Stepper'
import { getRecommendations, getRun } from '@/lib/repositories'
import type { RunStatus } from '@/lib/types'

// 向导上下文条：仅剩「分析目标」域名徽章 + 4 步 Stepper（design spec §1.1，2026-07-08）。
// 品牌/项目/规则库/设置/CTA/LocaleSwitch 已上移到 SiteHeader（全站 layout
// 统一渲染）；本组件不再输出外层 .shell div —— 限宽容器由 app/[locale]/layout.tsx 的
// <main className="shell"> 提供。仅向导流页面使用：/new、/runs/[id] 及其子页。
export async function Shell({
  runId,
  domain,
  children,
}: {
  runId?: string
  domain?: string
  children: ReactNode
}) {
  const t = await getTranslations('common')
  // 进度只由 run 状态机决定；不再由各个路由静态指定，避免越级页面显示为已完成。
  const [run, recommendations] = runId
    ? await Promise.all([getRun(runId), getRecommendations(runId)])
    : [undefined, []] as const
  const pendingRecommendationCount = recommendations.filter((recommendation) => recommendation.status === 'draft').length
  // 兼容本次规则落地前已确认完建议的历史 run：不误导用户仍停在第 3 步。
  const progressStatus =
    run?.status === 'reviewing' && recommendations.length > 0 && pendingRecommendationCount === 0
      ? 'output'
      : run?.status as RunStatus | undefined

  return (
    <>
      {domain ? (
        <div className="target">
          <span>{t('targetLabel')}</span>
          <span className="dom mono">{domain}</span>
        </div>
      ) : null}

      <Stepper status={progressStatus} pendingRecommendationCount={pendingRecommendationCount} />

      {children}
    </>
  )
}
