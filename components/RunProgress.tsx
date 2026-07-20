'use client'

import { useEffect, useReducer, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'
import { PHASES, initialStagelineState, reduceProgress, type ProgressMessage } from '@/lib/runs/stageline'
import { CountUp } from '@/components/fx/CountUp'
import { AnimatedList } from '@/components/fx/AnimatedList'
import { BlurText } from '@/components/fx/BlurText'
import { RUN_CANCELLED_REASON } from '@/lib/runs/status'

// 最近若干条证据事件（逐条滑入用），仅前端展示态，独立于 reducer。
const STREAM_MAX = 6

export function RunProgress({
  runId,
  initialStatus,
  initialFailureReason = '',
  reviewGate,
}: {
  runId: string
  initialStatus: RunStatus
  initialFailureReason?: string
  reviewGate?: { pendingCount: number; totalCount: number; href: string }
}) {
  const t = useTranslations('screen2.run')
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceProgress, initialStagelineState(initialStatus, initialFailureReason))
  const [stream, setStream] = useState<{ key: string; type: string }[]>([])
  const [retrying, setRetrying] = useState(false)
  const [retryErr, setRetryErr] = useState(false)
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
    const res = await fetch(`/api/runs/${runId}/retry`, { method: 'POST' })
    setRetrying(false)
    if (res.ok) router.refresh()
    else setRetryErr(true)
  }

  async function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return
    setCancelling(true)
    setCancelErr(false)
    const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' })
    setCancelling(false)
    if (res.ok) router.refresh()
    else setCancelErr(true)
  }

  const tone = state.status === 'failed' ? 'failed' : state.status === 'collecting' ? 'collecting' : 'ready'
  const displayPct = state.status === 'collecting' ? t('progressSoftLabel', { pct: state.pct }) : `${state.pct}%`

  const streamItems = useMemo(
    () => stream.map((e) => ({ key: e.key, node: <span>{t(`evidence.${e.type}`)}</span> })),
    [stream, t],
  )
  const canCancel =
    (initialStatus === 'collecting' || initialStatus === 'diagnosing') && state.status !== 'failed'
  const cancelledByUser = state.reason === RUN_CANCELLED_REASON

  return (
    <div className={`run-progress ${tone}`}>
      <div className="rp-main">
        <div className="rp-copy">
          <span className="rp-orb" aria-hidden="true" />
          <div>
            <div className="rp-eyebrow">{t('eyebrow')}</div>
            {state.status === 'collected' ? (
              <h2>
                <BlurText>
                  {reviewGate
                    ? reviewGate.totalCount === 0
                      ? t('reviewGate.emptyTitle')
                      : reviewGate.pendingCount > 0
                        ? t('reviewGate.pendingTitle', { count: reviewGate.pendingCount })
                        : t('reviewGate.readyTitle')
                    : t('completedTitle')}
                </BlurText>
              </h2>
            ) : (
              <h2>
                {state.status === 'failed'
                  ? cancelledByUser
                    ? t('cancelledTitle')
                    : t('failedTitle')
                  : t('collectingTitle')}
              </h2>
            )}
            {state.status === 'failed' ? (
              <p>
                {cancelledByUser
                  ? t('cancelledDetail')
                  : t('failedDetail', { reason: state.reason || t('unknown') })}
              </p>
            ) : state.status === 'collected' ? (
              <>
                <p>
                  {reviewGate
                    ? reviewGate.totalCount === 0
                      ? t('reviewGate.emptyDetail')
                      : reviewGate.pendingCount > 0
                        ? t('reviewGate.pendingDetail', { total: reviewGate.totalCount })
                        : t('reviewGate.readyDetail')
                    : t('readyDetail')}
                </p>
                {reviewGate ? (
                  <Link href={reviewGate.href} className="rp-gate-action">
                    <span className="rp-gate-action-kicker">{t('reviewGate.nextStep')}</span>
                    <span className="rp-gate-action-copy">
                      <strong>
                        {reviewGate.pendingCount > 0
                          ? t('reviewGate.reviewAction', { count: reviewGate.pendingCount })
                          : reviewGate.totalCount === 0
                            ? t('reviewGate.reviewEmptyAction')
                            : t('reviewGate.outputAction')}
                      </strong>
                      <small>
                        {reviewGate.pendingCount > 0
                          ? t('reviewGate.reviewActionDetail')
                          : reviewGate.totalCount === 0
                            ? t('reviewGate.reviewEmptyActionDetail')
                            : t('reviewGate.outputActionDetail')}
                      </small>
                    </span>
                    <span className="rp-gate-action-arrow" aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </>
            ) : (
              <p>{t('collectingDetail')}</p>
            )}
          </div>
        </div>
        <span className="rp-pct">{displayPct}</span>
      </div>

      <div className="rp-track" aria-label={t('progressLabel', { pct: state.pct })}>
        <i style={{ width: `${state.pct}%` }} className={state.status === 'collecting' ? 'fx-shimmer' : undefined} />
      </div>

      {/* 阶段故事线：真相位驱动，当前相位大字 + 计数 */}
      <div className="stageline" aria-label={t('stageLabel')}>
        {PHASES.map((phase) => {
          const done = state.completed.includes(phase)
          const current = state.currentPhase === phase && state.status === 'collecting'
          const cls = current ? 'current' : done ? 'done' : ''
          return (
            <div key={phase} className={`stageline-row ${cls}`.trim()}>
              <span aria-hidden="true">{done ? '✓' : current ? '▸' : '·'}</span>
              <span>{t(`phase.${phase}`)}</span>
              {current && state.phaseProgress && (
                <span className="sl-count">
                  <CountUp value={state.phaseProgress.checked} /> / {state.phaseProgress.total}
                </span>
              )}
              {current && phase === 'diagnose' && state.findings > 0 && (
                <span className="sl-count">{t('findingsCount', { n: state.findings })}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* 证据流：逐条滑入 */}
      {streamItems.length > 0 && (
        <div className="rp-events" aria-label={t('streamLabel')}>
          <AnimatedList items={streamItems} />
        </div>
      )}

      {canCancel && (
        <div className="mt-3">
          <button type="button" className="run-cancel" onClick={cancel} disabled={cancelling}>
            {cancelling ? t('cancelling') : t('cancel')}
          </button>
          {cancelErr && (
            <span role="status" className="ml-2 text-xs">
              {t('cancelFailed')}
            </span>
          )}
        </div>
      )}

      {/* 完成时刻 CTA：reviewGate 存在时，导航已由上方的 rp-gate-action 链接承担，
          这里不再重复渲染只会 router.refresh() 的死按钮（P0-1）。 */}
      {state.status === 'collected' && !reviewGate && (
        <button type="button" className="rp-action" onClick={() => router.refresh()}>
          {t('viewResults')}
        </button>
      )}

      {/* 失败态：可重试 */}
      {state.status === 'failed' && (
        <div className="mt-3">
          <button type="button" className="rp-action-retry" onClick={retry} disabled={retrying}>
            {retrying ? t('retrying') : t('retry')}
          </button>
          {retryErr && (
            <span role="status" className="ml-2 text-xs">
              {t('retryFailed')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
