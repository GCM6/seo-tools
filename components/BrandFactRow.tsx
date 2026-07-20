'use client'

import { useOptimistic, useState, startTransition } from 'react'

export type FactStatus = 'verified' | 'draft' | 'retired'

export interface BrandFactRowFact {
  id: string
  factType: string
  factText: string
  sourceUrl: string | null
  sourceNote: string | null
  status: FactStatus
}

// 单条品牌事实的人工操作行（client 叶子）。状态切换与删除都乐观更新 + 失败回滚，
// action 由 Server Component 以闭包传入（同 SitePageActions 模式）。verified 视觉强调：
// 只有它可被注入执行提示词（§6.2），所以要在 UI 上明显区分。
export function BrandFactRow({
  fact,
  labels,
  onSetStatus,
  onRemove,
}: {
  fact: BrandFactRowFact
  labels: {
    verify: string
    verified: string
    retire: string
    retired: string
    draft: string
    remove: string
    sourceLabel: string
  }
  onSetStatus: (id: string, status: FactStatus) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
}) {
  const [status, setStatus] = useState<FactStatus>(fact.status)
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<FactStatus, FactStatus>(
    status,
    (_current, next) => next,
  )
  const [removed, setRemoved] = useState(false)
  const [optimisticRemoved, setOptimisticRemoved] = useOptimistic<boolean, boolean>(
    removed,
    (_current, next) => next,
  )

  const changeStatus = (next: FactStatus) => {
    startTransition(async () => {
      setOptimisticStatus(next)
      try {
        await onSetStatus(fact.id, next)
        setStatus(next)
      } catch {
        // 失败：保持持久状态，optimistic 覆盖层回滚
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      setOptimisticRemoved(true)
      try {
        await onRemove(fact.id)
        setRemoved(true)
      } catch {
        // 失败回滚
      }
    })
  }

  if (optimisticRemoved) return null

  const verified = optimisticStatus === 'verified'
  const retired = optimisticStatus === 'retired'
  const statusLabel = verified ? labels.verified : retired ? labels.retired : labels.draft

  return (
    <div
      className={`fact-row${verified ? ' verified' : ''}${retired ? ' retired' : ''}`}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderLeft: verified ? '3px solid var(--ds-success)' : '3px solid transparent',
        opacity: retired ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="fact-text" style={{ fontWeight: verified ? 600 : 400 }}>
          {fact.factText}
        </div>
        <div className="fact-meta" style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
          <span>{fact.factType}</span>
          {fact.sourceUrl ? (
            <>
              {' · '}
              <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                {labels.sourceLabel}
              </a>
            </>
          ) : null}
          {fact.sourceNote ? <> · {fact.sourceNote}</> : null}
        </div>
      </div>

      <span
        className={`fact-status ${optimisticStatus}`}
        style={{
          fontSize: 12,
          padding: '2px 8px',
          borderRadius: 4,
          background: verified ? 'var(--ds-success-muted)' : retired ? 'var(--ds-surface-2)' : 'var(--ds-warning-muted)',
          color: verified ? 'var(--ds-success)' : retired ? 'var(--ds-muted)' : 'var(--ds-warning)',
          whiteSpace: 'nowrap',
        }}
      >
        {statusLabel}
      </span>

      <div className="fact-actions" style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`act accept${verified ? ' on' : ''}`}
          aria-pressed={verified}
          onClick={() => changeStatus(verified ? 'draft' : 'verified')}
        >
          {verified ? labels.verified : labels.verify}
        </button>
        <button
          type="button"
          className={`act${retired ? ' on' : ''}`}
          aria-pressed={retired}
          onClick={() => changeStatus(retired ? 'draft' : 'retired')}
        >
          {labels.retire}
        </button>
        <button type="button" className="act rej" onClick={remove}>
          {labels.remove}
        </button>
      </div>
    </div>
  )
}
