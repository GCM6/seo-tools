'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'

type ProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

const DONE_BY_STATUS: Partial<Record<RunStatus, number>> = {
  collected: 100,
  diagnosing: 100,
  reviewing: 100,
  output: 100,
}

const STAGES = [
  { key: 'target', pct: 8 },
  { key: 'page', pct: 45 },
  { key: 'schema', pct: 65 },
  { key: 'probe', pct: 90 },
  { key: 'finish', pct: 100 },
] as const

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
  const [status, setStatus] = useState<RunStatus>(initialStatus)
  const [pct, setPct] = useState(DONE_BY_STATUS[initialStatus] ?? (initialStatus === 'collecting' ? 8 : 0))
  const [events, setEvents] = useState<string[]>([])
  const [reason, setReason] = useState(initialFailureReason)

  useEffect(() => {
    if (initialStatus !== 'collecting') return
    const source = new EventSource(`/api/runs/${runId}/events`)

    source.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ProgressMessage
      if (msg.type === 'progress') {
        setPct(msg.pct)
        return
      }
      if (msg.type === 'evidence_created') {
        setEvents((prev) => [t(`evidence.${msg.evidenceType}`), ...prev].slice(0, 3))
        return
      }
      if (msg.type === 'done') {
        setPct(100)
        setStatus('collected')
        source.close()
        router.refresh()
        return
      }
      if (msg.type === 'failed') {
        setStatus('failed')
        setReason(msg.reason)
        source.close()
        router.refresh()
      }
    }

    source.onerror = () => {
      source.close()
    }

    return () => source.close()
  }, [initialStatus, router, runId, t])

  const tone = status === 'failed' ? 'failed' : status === 'collecting' ? 'collecting' : 'ready'
  const title = status === 'failed' ? t('failedTitle') : status === 'collecting' ? t('collectingTitle') : t('readyTitle')
  const detail = useMemo(() => {
    if (status === 'failed') return reason ? t('failedDetail', { reason }) : t('failedDetail', { reason: t('unknown') })
    if (status === 'collecting') return t('collectingDetail')
    return t('readyDetail')
  }, [reason, status, t])
  const displayPct = status === 'collecting' ? t('progressSoftLabel', { pct }) : `${pct}%`

  return (
    <div className={`run-progress ${tone}`}>
      <div className="rp-main">
        <div className="rp-copy">
          <span className="rp-orb" aria-hidden="true" />
          <div>
            <div className="rp-eyebrow">{t('eyebrow')}</div>
            <h2>{title}</h2>
            <p>{detail}</p>
          </div>
        </div>
        <span className="rp-pct">{displayPct}</span>
      </div>
      <div className="rp-track" aria-label={t('progressLabel', { pct })}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="rp-stages" aria-label={t('stageLabel')}>
        {STAGES.map((stage) => (
          <span
            key={stage.key}
            className={pct >= stage.pct ? 'done' : status === 'collecting' ? 'pending' : ''}
          >
            {t(`stages.${stage.key}`)}
          </span>
        ))}
      </div>
      <div className="rp-events">
        {events.length ? events.map((item) => <span key={item}>{item}</span>) : <span>{t(`status.${status}`)}</span>}
      </div>
    </div>
  )
}
