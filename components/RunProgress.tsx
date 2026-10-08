'use client'

import { useEffect, useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'
import { PHASES, initialStagelineState, reduceProgress, type ProgressMessage } from '@/lib/runs/stageline'
import { RUN_CANCELLED_REASON } from '@/lib/runs/status'
import { Button } from './Button'
import { Notice } from './Notice'

// 最近若干条证据事件，仅前端展示态，独立于 reducer。
const STREAM_MAX = 6

// 诊断进度面板（ux-blueprint §3.1 运行中状态）：采集中 / 诊断中 / 失败时显示在概览主体。
// 诊断完成后的「下一步」由工作区抬头的主动作承担，这里不再重复放导航按钮。
// 不用模糊入场、数字滚动、列表飞入、流光（design-system §1.2）。取消诊断用行内两步确认，不用 window.confirm。
export function RunProgress({
  runId,
  initialStatus,
  initialFailureReason = '',
}: {
  runId: string
  initialStatus: RunStatus
  initialFailureReason?: string
}) {
  const t = useTranslations('screen2.run')
  const locale = useLocale()
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceProgress, initialStagelineState(initialStatus, initialFailureReason))
  const [stream, setStream] = useState<{ key: string; type: string }[]>([])
  const [retrying, setRetrying] = useState(false)
  const [retryErr, setRetryErr] = useState(false)
  // SP-A §3.5：重试被建 run 闸门拒绝（项目品类/市场未设置）→ 链到向导补充。
  const [retrySetupProjectId, setRetrySetupProjectId] = useState<string | null>(null)
  const [retryRetestProjectId, setRetryRetestProjectId] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelErr, setCancelErr] = useState(false)

  useEffect(() => {
    if (initialStatus !== 'collecting' && initialStatus !== 'diagnosing') return
    const source = new EventSource(`/api/runs/${runId}/events`)
    let seq = 0
    source.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ProgressMessage
      dispatch(msg)
      if (msg.type === 'evidence_created') {
        seq += 1
        setStream((prev) => [{ key: `${seq}`, type: msg.evidenceType }, ...prev].slice(0, STREAM_MAX))
      }
      if (msg.type === 'done' || msg.type === 'failed') {
        source.close()
        router.refresh()
      }
    }
    source.onerror = () => source.close()
    return () => source.close()
  }, [initialStatus, router, runId])

  async function retry() {
    setRetrying(true)
    setRetryErr(false)
    setRetrySetupProjectId(null)
    setRetryRetestProjectId(null)
    const res = await fetch(`/api/runs/${runId}/retry`, { method: 'POST' })
    setRetrying(false)
    if (res.ok) return router.refresh()
    const body = (await res.json().catch(() => ({}))) as { error?: string; projectId?: string }
    if (res.status === 422 && (body.error === 'category_required' || body.error === 'market_required') && body.projectId) {
      setRetrySetupProjectId(body.projectId)
      return
    }
    if (res.status === 409 && body.error === 'retest_retry_unsupported' && body.projectId) {
      setRetryRetestProjectId(body.projectId)
      return
    }
    setRetryErr(true)
  }

  async function cancel() {
    setCancelling(true)
    setCancelErr(false)
    const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' })
    setCancelling(false)
    setConfirmingCancel(false)
    if (res.ok) router.refresh()
    else setCancelErr(true)
  }

  const canCancel = (initialStatus === 'collecting' || initialStatus === 'diagnosing') && state.status !== 'failed'
  const cancelledByUser = state.reason === RUN_CANCELLED_REASON
  const pctLabel = state.status === 'collecting' ? t('progressSoftLabel', { pct: state.pct }) : `${state.pct}%`
  const title =
    state.status === 'failed'
      ? cancelledByUser
        ? t('cancelledTitle')
        : t('failedTitle')
      : state.status === 'collected'
        ? t('completedTitle')
        : t('collectingTitle')
  const detail =
    state.status === 'failed'
      ? cancelledByUser
        ? t('cancelledDetail')
        : t('failedDetail', { reason: state.reason || t('unknown') })
      : state.status === 'collected'
        ? t('readyDetail')
        : t('collectingDetail')

  return (
    <section className="ui-panel" aria-label={t('eyebrow')}>
      <div className="ui-panel__head">
        <h2 className="ui-panel__title">{title}</h2>
        <span className="ui-num ui-muted">{pctLabel}</span>
      </div>
      <div className="ui-panel__body grid grid-cols-1 gap-4">
        {state.status === 'failed' ? <Notice tone="error">{detail}</Notice> : <p className="ui-result__note">{detail}</p>}

        <div className="ui-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.pct} aria-label={t('progressLabel', { pct: state.pct })}>
          <i style={{ width: `${state.pct}%` }} />
        </div>

        <ol className="ui-phases" aria-label={t('stageLabel')}>
          {PHASES.map((phase) => {
            const done = state.completed.includes(phase)
            const current = state.currentPhase === phase && state.status === 'collecting'
            return (
              <li key={phase} className={current ? 'is-current' : done ? 'is-done' : undefined}>
                <span className={done ? 'ui-phases__mark ui-phases__mark--done' : 'ui-phases__mark'} aria-hidden="true">
                  {done ? '✓' : current ? '▸' : '·'}
                </span>
                <span>{t(`phase.${phase}`)}</span>
                {current && state.phaseProgress ? (
                  <span className="ui-num ui-muted">
                    {state.phaseProgress.checked} / {state.phaseProgress.total}
                  </span>
                ) : null}
                {current && phase === 'diagnose' && state.findings > 0 ? (
                  <span className="ui-muted">{t('findingsCount', { n: state.findings })}</span>
                ) : null}
              </li>
            )
          })}
        </ol>

        {stream.length > 0 ? (
          <ul className="ui-events" aria-label={t('streamLabel')}>
            {stream.map((e) => (
              <li key={e.key}>{t(`evidence.${e.type}`)}</li>
            ))}
          </ul>
        ) : null}

        {canCancel ? (
          <div className="ui-inline-actions">
            {confirmingCancel ? (
              <>
                <span>{t('cancelConfirm')}</span>
                <Button variant="danger" size="sm" onClick={cancel} loading={cancelling}>
                  {cancelling ? t('cancelling') : t('cancel')}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setConfirmingCancel(false)} disabled={cancelling}>
                  {t('keepRunning')}
                </Button>
              </>
            ) : (
              <Button variant="quiet" size="sm" onClick={() => setConfirmingCancel(true)}>
                {t('cancel')}
              </Button>
            )}
            {cancelErr ? <span role="status" className="ui-error">{t('cancelFailed')}</span> : null}
          </div>
        ) : null}

        {/* 采集完成但页面还停在旧状态时，刷新拿最新结果 */}
        {state.status === 'collected' ? (
          <div className="ui-inline-actions">
            <Button variant="primary" onClick={() => router.refresh()}>
              {t('viewResults')}
            </Button>
          </div>
        ) : null}

        {state.status === 'failed' ? (
          <div className="ui-inline-actions">
            <Button variant="primary" onClick={retry} loading={retrying}>
              {retrying ? t('retrying') : t('retry')}
            </Button>
            {retryErr ? <span role="status" className="ui-error">{t('retryFailed')}</span> : null}
            {retrySetupProjectId ? <Link href={`/${locale}/new?projectId=${retrySetupProjectId}`}>{t('retryNeedsSetup')}</Link> : null}
            {retryRetestProjectId ? <Link href={`/${locale}/projects/${retryRetestProjectId}`}>{t('retryRetestUnsupported')}</Link> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
