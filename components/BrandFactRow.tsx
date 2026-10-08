'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Button } from './Button'
import { StatusText, type StatusKind } from './StatusText'

export type FactStatus = 'verified' | 'draft' | 'retired'

export interface BrandFactRowFact {
  id: string
  factType: string
  factText: string
  sourceUrl: string | null
  sourceNote: string | null
  status: FactStatus
}

// 品牌事实状态 → 全站统一的状态文字样式（ux-blueprint §3.6：已核验 / 草稿 / 已停用）。
const STATUS_KIND: Record<FactStatus, StatusKind> = { verified: 'accepted', draft: 'draft', retired: 'rejected' }

// 单条品牌事实的人工操作行（client 叶子）。状态切换与删除都乐观更新，失败时回滚并在行内说明；
// action 由 Server Component 以闭包传入（同 SitePageActions 模式）。只有「已验证」可注入执行提示词
// （§6.2），所以状态用文字明确写出，不只靠颜色。删除是破坏性操作，先在行内确认一次。
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
    unverify: string
    retire: string
    restore: string
    retired: string
    draft: string
    remove: string
    removeConfirm: string
    cancel: string
    sourceLabel: string
    error: string
  }
  onSetStatus: (id: string, status: FactStatus) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
}) {
  const [status, setStatus] = useState<FactStatus>(fact.status)
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<FactStatus, FactStatus>(status, (_current, next) => next)
  const [removed, setRemoved] = useState(false)
  const [optimisticRemoved, setOptimisticRemoved] = useOptimistic<boolean, boolean>(removed, (_current, next) => next)
  const [confirming, setConfirming] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const changeStatus = (next: FactStatus) => {
    setFailed(false)
    startTransition(async () => {
      setOptimisticStatus(next)
      try {
        await onSetStatus(fact.id, next)
        setStatus(next)
      } catch {
        setFailed(true)
      }
    })
  }

  const remove = () => {
    setFailed(false)
    startTransition(async () => {
      setOptimisticRemoved(true)
      try {
        await onRemove(fact.id)
        setRemoved(true)
      } catch {
        setFailed(true)
        setConfirming(false)
      }
    })
  }

  if (optimisticRemoved) return null

  const verified = optimisticStatus === 'verified'
  const retired = optimisticStatus === 'retired'
  const statusLabel = verified ? labels.verified : retired ? labels.retired : labels.draft

  return (
    <li className={retired ? 'ui-fact ui-fact--retired' : 'ui-fact'} aria-busy={pending || undefined}>
      <div className="ui-fact__main">
        <p className="ui-fact__text">{fact.factText}</p>
        <p className="ui-fact__meta">
          <span>{fact.factType}</span>
          {fact.sourceUrl ? (
            <>
              {' · '}
              <a href={fact.sourceUrl} target="_blank" rel="noreferrer">
                {labels.sourceLabel}
              </a>
            </>
          ) : null}
          {fact.sourceNote ? <> · {fact.sourceNote}</> : null}
        </p>
        {failed ? (
          <p className="ui-error" role="status">
            {labels.error}
          </p>
        ) : null}
      </div>
      <StatusText status={STATUS_KIND[optimisticStatus]} label={statusLabel} />
      <span className="ui-row-actions">
        {confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={remove}>
              {labels.removeConfirm}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>
              {labels.cancel}
            </Button>
          </>
        ) : (
          <>
            {retired ? null : (
              <Button size="sm" variant={verified ? 'quiet' : 'secondary'} onClick={() => changeStatus(verified ? 'draft' : 'verified')}>
                {verified ? labels.unverify : labels.verify}
              </Button>
            )}
            <Button size="sm" variant="quiet" onClick={() => changeStatus(retired ? 'draft' : 'retired')}>
              {retired ? labels.restore : labels.retire}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setConfirming(true)}>
              {labels.remove}
            </Button>
          </>
        )}
      </span>
    </li>
  )
}
