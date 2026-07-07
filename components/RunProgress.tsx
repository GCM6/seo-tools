'use client'

import { useEffect, useReducer, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'
import { PHASES, initialStagelineState, reduceProgress, type ProgressMessage } from '@/lib/runs/stageline'
import { CountUp } from '@/components/fx/CountUp'
import { AnimatedList } from '@/components/fx/AnimatedList'
import { BlurText } from '@/components/fx/BlurText'

// 最近若干条证据事件（逐条滑入用），仅前端展示态，独立于 reducer。
const STREAM_MAX = 6

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
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceProgress, initialStagelineState(initialStatus, initialFailureReason))
  const [stream, setStream] = useState<{ key: string; type: string }[]>([])
  const [retrying, setRetrying] = useState(false)
  const [retryErr, setRetryErr] = useState(false)

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

  const tone = state.status === 'failed' ? 'failed' : state.status === 'collecting' ? 'collecting' : 'ready'
  const displayPct = state.status === 'collecting' ? t('progressSoftLabel', { pct: state.pct }) : `${state.pct}%`

  const streamItems = useMemo(
    () => stream.map((e) => ({ key: e.key, node: <span>{t(`evidence.${e.type}`)}</span> })),
    [stream, t],
  )

  return (
    <div className={`run-progress ${tone}`}>
      <div className="rp-main">
        <div className="rp-copy">
          <span className="rp-orb" aria-hidden="true" />
          <div>
            <div className="rp-eyebrow">{t('eyebrow')}</div>
            {state.status === 'collected' ? (
              <h2>
                <BlurText>{t('completedTitle')}</BlurText>
              </h2>
            ) : (
              <h2>{state.status === 'failed' ? t('failedTitle') : t('collectingTitle')}</h2>
            )}
            {state.status === 'failed' ? (
              <p>{t('failedDetail', { reason: state.reason || t('unknown') })}</p>
            ) : state.status === 'collected' ? (
              <p>{t('readyDetail')}</p>
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

      {/* 完成时刻 CTA */}
      {state.status === 'collected' && (
        <button type="button" className="mt-3" onClick={() => router.refresh()}>
          {t('viewResults')}
        </button>
      )}

      {/* 失败态：可重试 */}
      {state.status === 'failed' && (
        <div className="mt-3">
          <button type="button" onClick={retry} disabled={retrying}>
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
