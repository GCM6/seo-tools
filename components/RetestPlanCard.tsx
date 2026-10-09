import { getTranslations } from 'next-intl/server'
import { Panel } from './Panel'
import { RetestButton } from './RetestButton'

// 回测计划卡（A3，替换 output 页原纯文字「回测预告」；改版后用 Panel + 键值表，ux-blueprint §3.4 底部两块之一）。到期日期口径为
// 「『已执行，待复查』的问题里最早一次执行 +28 天」，由问题表重算（spec 2026-10-09 §5.4-2）：
// 标记已执行、撤销执行、体检复查后都会重新计算，不再每次执行顺延——口径通过 policyNote 向用户交代，不是静默行为。
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
    <Panel title={t('retestTitle')}>
      <div className="grid grid-cols-1 gap-3">
        <dl className="ui-kv">
          <dt>{t('retestProgressLabel')}</dt>
          <dd>{t('retestProgress', { done: appliedDone, total: appliedTotal })}</dd>
          <dt>{t('retestDueLabel')}</dt>
          <dd>{dueAt ? <strong>{dueAt.slice(0, 10)}</strong> : t('retestPlanNoDue')}</dd>
        </dl>
        <p>{retestReady ? t('retestReady') : t('retestPending')}</p>
        <RetestButton
          locale={locale}
          baselineRunId={runId}
          className="ui-btn ui-btn--sm"
          labels={{
            cta: tRetest('dueCta'),
            starting: tRetest('starting'),
            error: tRetest('error'),
            inProgress: tRetest('inProgress'),
            needsSetup: tRetest('needsSetup'),
          }}
        />
        <p className="ui-footnote">{t('retestPlanPolicyNote')}</p>
        <p className="ui-footnote">{t('retestPlanManualNote')}</p>
      </div>
    </Panel>
  )
}
