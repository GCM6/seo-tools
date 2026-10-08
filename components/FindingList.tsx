'use client'

import { useState, useOptimistic, startTransition } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { EvidenceBadge } from './EvidenceBadge'
import { SeverityMark, severityLevel } from './SeverityMark'
import { rankIssues } from './IssueSummary'
import type { EvidenceGrade } from '@/lib/evidence'

// 一条问题（ux-blueprint §3.2）：行内显示严重度、标题、维度、证据等级，点开看说明、原始证据和「忽略」操作。
// Client 叶子：open 状态切换详情（用 hidden 属性，jsdom 里也能断言可见性）。文案由调用方传入，
// 单测可以不挂 i18n provider。
export function FindingCard({
  id,
  title,
  grade,
  provLabel,
  confidence,
  provHint,
  severity,
  severityLabel = '',
  description,
  pillarLabel,
  labels,
  children,
}: {
  id: string
  title: string
  grade: EvidenceGrade
  provLabel: string
  confidence: string
  // 徽章悬停的就近解释文案（已由调用方 t() 翻译），可选以兼容旧测试。
  provHint?: string
  severity: string
  severityLabel?: string
  description?: string
  pillarLabel?: string
  labels: {
    dismiss: string
    dismissed: string
    dismissReasonLabel?: string
    dismissReasonPlaceholder?: string
    dismissReasonRequired?: string
    dismissConfirm?: string
    dismissCancel?: string
  }
  children: ReactNode
}) {
  // P1-5：confidence 与徽章同源（confidenceLabel(claimType)），只保留徽章，不再重复渲染纯文本。
  void confidence
  const [open, setOpen] = useState(false)

  // 人工忽略（误报反馈，喂 §11.2 校准）：忽略必须填原因，乐观置灰折叠，PATCH 成功后提交；
  // 失败时不提交，optimistic 覆盖层在 transition 结束后自动回滚（同 RecCard 模式）。
  const [dismissed, setDismissed] = useState(false)
  const [optimisticDismissed, setOptimisticDismissed] = useOptimistic<boolean, boolean>(dismissed, (_current, next) => next)
  const [reasoning, setReasoning] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const reasonId = `dismiss-reason-${id}`

  const confirmDismiss = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError(true)
      return
    }
    startTransition(async () => {
      setOptimisticDismissed(true)
      try {
        const res = await fetch(`/api/findings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // 必填 dismiss_reason 落库（spec §6，喂 §11.2 误报校准）。
          body: JSON.stringify({ status: 'dismissed', dismissReason: trimmed }),
        })
        if (res.ok) {
          setDismissed(true)
          setOpen(false)
        }
      } catch {
        // 网络错误：保持持久状态，optimistic 覆盖层回滚
      }
    })
  }

  if (optimisticDismissed) {
    return (
      <div className="ui-issue ui-issue--dismissed">
        <SeverityMark level={severityLevel(severity)} label={severityLabel} />
        <span className="ui-issue__title">{title}</span>
        <span className="ui-issue__meta">{labels.dismissed}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="ui-issue">
        <div className="ui-row-toggle">
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <SeverityMark level={severityLevel(severity)} label={severityLabel} />
            <span>
              <span className="ui-issue__title">{title}</span>
              {description ? <span className="ui-issue__desc block">{description}</span> : null}
            </span>
          </button>
        </div>
        <span className="ui-issue__meta">{pillarLabel ?? ''}</span>
        <EvidenceBadge grade={grade} label={provLabel} hint={provHint} />
      </div>
      <div className="ui-issue__body" hidden={!open}>
        {children}
        <div>
          {reasoning ? (
            <div className="ui-field">
              <label className="ui-label" htmlFor={reasonId}>
                {labels.dismissReasonLabel}
              </label>
              <textarea
                id={reasonId}
                className="ui-textarea"
                value={reason}
                placeholder={labels.dismissReasonPlaceholder}
                aria-invalid={reasonError || undefined}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (e.target.value.trim()) setReasonError(false)
                }}
              />
              {reasonError ? <div className="ui-error">{labels.dismissReasonRequired}</div> : null}
              <div className="ui-inline-actions">
                <Button variant="danger" size="sm" onClick={confirmDismiss}>
                  {labels.dismissConfirm}
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setReasoning(false)
                    setReasonError(false)
                  }}
                >
                  {labels.dismissCancel}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" size="sm" onClick={() => setReasoning(true)}>
              {labels.dismiss}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export interface FindingItem {
  id: string
  side: 'seo' | 'geo' | 'technical'
  title: string
  description?: string
  pillar?: string
  grade: EvidenceGrade
  provLabel: string
  confidence: string
  severity: string
  evidence: ReactNode
}

type SevFilter = 'all' | 'high' | 'mid' | 'ok'
type SideFilter = 'all' | 'geo' | 'seo' | 'technical'
const SEV_FILTERS: SevFilter[] = ['all', 'high', 'mid', 'ok']
const SIDE_FILTERS: SideFilter[] = ['all', 'geo', 'seo', 'technical']

function sevKey(severity: string): 'high' | 'mid' | 'ok' {
  return severity === 'high' || severity === 'hi' ? 'high' : severity === 'mid' ? 'mid' : 'ok'
}

// 问题清单（ux-blueprint §3.2）：严重度、维度两组筛选芯片 + 按严重度、证据强度排序的问题行。
export function FindingList({ items }: { items: FindingItem[] }) {
  const ti = useTranslations('issues')
  const tw = useTranslations('workspace')
  const tf = useTranslations('findings')
  const [sev, setSev] = useState<SevFilter>('all')
  const [side, setSide] = useState<SideFilter>('all')

  const ranked = rankIssues(items.map((it) => ({ ...it, severity: sevKey(it.severity) })))
  const sevCount = (f: SevFilter) => ranked.filter((it) => (side === 'all' || it.side === side) && (f === 'all' || it.severity === f)).length
  const sideCount = (f: SideFilter) => ranked.filter((it) => (sev === 'all' || it.severity === sev) && (f === 'all' || it.side === f)).length
  const shown = ranked.filter((it) => (sev === 'all' || it.severity === sev) && (side === 'all' || it.side === side))

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* 标签与它的芯片组包在同一个 flex 单元里，窄屏换行时不会被拆开 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-footnote">{ti('sevLabel')}</span>
          <div className="ui-chips" role="group" aria-label={ti('filterSeverity')}>
            {SEV_FILTERS.map((f) => (
              <button key={f} type="button" className="ui-chip" aria-pressed={sev === f} onClick={() => setSev(f)}>
                {f === 'all' ? ti('all') : tw(`sev.${f}`)}
                <span className="ui-chip__count">{sevCount(f)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-footnote">{ti('sideLabel')}</span>
          <div className="ui-chips" role="group" aria-label={ti('filterSide')}>
            {SIDE_FILTERS.filter((f) => f === 'all' || items.some((it) => it.side === f)).map((f) => (
              <button key={f} type="button" className="ui-chip" aria-pressed={side === f} onClick={() => setSide(f)}>
                {f === 'all' ? ti('all') : ti(`side.${f}`)}
                <span className="ui-chip__count">{sideCount(f)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="ui-footnote">{tf('legend')}</p>

      {shown.length === 0 ? (
        <div className="ui-panel ui-empty">
          <p className="ui-empty__title">{items.length === 0 ? ti('empty') : ti('emptyFiltered')}</p>
          {items.length > 0 ? (
            <div className="ui-empty__action">
              <Button
                size="sm"
                onClick={() => {
                  setSev('all')
                  setSide('all')
                }}
              >
                {ti('clearFilters')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="ui-panel ui-issues">
          {shown.map((it) => (
            <li key={it.id} id={it.id}>
              <FindingCard
                id={it.id}
                title={it.title}
                description={it.description}
                pillarLabel={it.pillar ? tw(`pillarShort.${it.pillar}`) : undefined}
                grade={it.grade}
                provLabel={it.provLabel}
                confidence={it.confidence}
                provHint={tf(`provenanceHint.${it.grade}`)}
                severity={it.severity}
                severityLabel={tw(`sev.${it.severity}`)}
                labels={{
                  dismiss: tf('dismiss'),
                  dismissed: tf('dismissed'),
                  dismissReasonLabel: tf('dismissReasonLabel'),
                  dismissReasonPlaceholder: tf('dismissReasonPlaceholder'),
                  dismissReasonRequired: tf('dismissReasonRequired'),
                  dismissConfirm: tf('dismissConfirm'),
                  dismissCancel: tf('dismissCancel'),
                }}
              >
                {it.evidence}
              </FindingCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
