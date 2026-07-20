import { getTranslations } from 'next-intl/server'
import { RetestButton } from './RetestButton'

// 复测计划卡（A3，替换 output 页原纯文字「回测预告」）。到期日期口径固定为
// 「最新一次标记已执行 +28 天」（app/api/recommendations/[id]/route.ts 的
// RETEST_WINDOW_DAYS，计算逻辑本次未改动）；每次新的「标记已执行」都会把日期顺延，
// 撤销执行不回退该日期——这两点都通过 policyNote 向用户交代，不是静默行为。
//
// 手动调整到期日期：项目更新接口（app/api/projects/[id]/route.ts）尚未开放
// nextRetestDueAt 字段，扩展它超出本次改动允许修改的文件范围，因此这里降级为
// 只读展示 + 偏离说明（manualNote），不提供可编辑的日期输入。
//
// async Server Component（同 components/Shell.tsx 的写法）：翻译在服务端解析，
// 只把交互叶子（RetestButton）留给客户端。
export async function RetestPlanCard({
  runId,
  locale,
  dueAt,
  appliedDone,
  appliedTotal,
  retestReady,
}: {
  runId: string
  locale: string
  dueAt: string | null
  appliedDone: number
  appliedTotal: number
  retestReady: boolean
}) {
  const t = await getTranslations('screen4.output')
  const tRetest = await getTranslations('retest')

  return (
    <div className="card output-retest-card retest-plan-card">
      <h3>{t('retestTitle')}</h3>
      <p className="output-retest-progress">{t('retestProgress', { done: appliedDone, total: appliedTotal })}</p>
      <p>{retestReady ? t('retestReady') : t('retestPending')}</p>

      <div className="retest-plan-due">
        <span className="retest-plan-due-label">{t('retestPlanDueLabel')}</span>
        {dueAt ? (
          <strong className="retest-plan-due-value">{dueAt.slice(0, 10)}</strong>
        ) : (
          <span className="retest-plan-due-empty">{t('retestPlanNoDue')}</span>
        )}
      </div>
      <p className="retest-plan-policy-note">{t('retestPlanPolicyNote')}</p>

      <RetestButton
        locale={locale}
        baselineRunId={runId}
        className="act accept"
        labels={{
          cta: tRetest('dueCta'),
          starting: tRetest('starting'),
          error: tRetest('error'),
          inProgress: tRetest('inProgress'),
        }}
      />

      <p className="retest-plan-manual-note">{t('retestPlanManualNote')}</p>
    </div>
  )
}
