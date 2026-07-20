'use client'

import { useState, useOptimistic, startTransition } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ProvenanceTag } from './ProvenanceTag'

// One issue row. Client leaf: `open` state toggles the evidence drawer.
// Visibility is driven by an inline `display` style (not the .find.open CSS
// rule alone) so the toggle is observable in jsdom, where globals.css isn't
// loaded — the production stylesheet still styles padding/colours via classes.
// Copy (dismiss labels) is passed in as props so this leaf needs no i18n
// provider — the test renders it bare, and FindingList supplies the strings.
export function FindingCard({
  id,
  title,
  provVariant,
  provLabel,
  confidence,
  provHint,
  severity,
  labels,
  children,
}: {
  id: string
  title: string
  provVariant: 'm' | 'i' | 'g' | 'ok'
  provLabel: string
  confidence: string
  // 徽章 title/aria-label 的就近解释文案（已由调用方 t() 翻译），可选以兼容旧测试。
  provHint?: string
  severity: string
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
  // P1-5：confidence 与 provLabel 同源自 confidenceLabel(claimType)（见
  // lib/diagnosis/finding-rows.ts），此前徽章与本字段各渲染一次造成重复展示，
  // 现只保留徽章。字段仍保留在签名里以兼容既有调用方（page.tsx 仍会传入）。
  void confidence
  const [open, setOpen] = useState(false)

  // 人工忽略（误报反馈，喂 §11.2 校准）：忽略必须填原因，乐观置灰折叠，PATCH 成功后提交；
  // 失败时不提交，optimistic 覆盖层在 transition 结束后自动回滚（同 RecCard 模式）。
  const [dismissed, setDismissed] = useState(false)
  const [optimisticDismissed, setOptimisticDismissed] = useOptimistic<boolean, boolean>(
    dismissed,
    (_current, next) => next,
  )
  const [reasoning, setReasoning] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)

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
    // 折叠 + 置灰的忽略态；inline 样式让 jsdom 也可断言（globals.css 未加载）。
    return (
      <div className="find dismissed" style={{ opacity: 0.45 }}>
        <div className="find-head">
          <span className={`sev ${severity}`} />
          <span className="find-title" style={{ textDecoration: 'line-through' }}>
            {title}
          </span>
          <span className="find-conf">{labels.dismissed}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={open ? 'find open' : 'find'}>
      <button
        type="button"
        className="find-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`sev ${severity}`} />
        <span className="find-title">{title}</span>
        {/* P1-5：confidence 纯文本与徽章同源重复，已删除；就近解释改用 title/aria-label */}
        <span title={provHint} aria-label={provHint}>
          <ProvenanceTag variant={provVariant} label={provLabel} />
        </span>
        <span className="chev">▶</span>
      </button>
      <div className="evidence" style={{ display: open ? 'block' : 'none' }}>
        {children}
        <div className="find-dismiss" style={{ marginTop: 8 }}>
          {reasoning ? (
            <div className="dismiss-form">
              <textarea
                className="edit-area"
                value={reason}
                aria-label={labels.dismissReasonLabel}
                placeholder={labels.dismissReasonPlaceholder}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (e.target.value.trim()) setReasonError(false)
                }}
              />
              {reasonError ? <div className="err">{labels.dismissReasonRequired}</div> : null}
              <div style={{ marginTop: 8 }}>
                <button type="button" className="act rej" onClick={confirmDismiss}>
                  {labels.dismissConfirm}
                </button>
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    setReasoning(false)
                    setReasonError(false)
                  }}
                >
                  {labels.dismissCancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="act rej" onClick={() => setReasoning(true)}>
              {labels.dismiss}
            </button>
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
  provVariant: 'm' | 'i' | 'g' | 'ok'
  provLabel: string
  confidence: string
  severity: string
  evidence: ReactNode
}

// Issue list with GEO / SEO tabs. Tabs filter the rows by `side`
// (`technical` groups under GEO, since crawlability is a GEO concern).
export function FindingList({ items }: { items: FindingItem[] }) {
  const t = useTranslations('screen2')
  const tf = useTranslations('findings')
  const [tab, setTab] = useState<'geo' | 'seo'>('geo')

  const shown = items.filter((it) =>
    tab === 'geo' ? it.side === 'geo' || it.side === 'technical' : it.side === 'seo',
  )

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div className="tabs">
          <button
            type="button"
            className={tab === 'geo' ? 'tab active' : 'tab'}
            onClick={() => setTab('geo')}
          >
            {t('tabGeo')}
          </button>
          <button
            type="button"
            className={tab === 'seo' ? 'tab active' : 'tab'}
            onClick={() => setTab('seo')}
          >
            {t('tabSeo')}
          </button>
        </div>
        {/* P1-5：证据等级说明离用户太远——报告开头出现一次不够，这里就近补一行图例 */}
        <p className="note">{tf('legend')}</p>
      </div>
      <div className="card">
        {shown.map((it) => (
          <FindingCard
            key={it.id}
            id={it.id}
            title={it.title}
            provVariant={it.provVariant}
            provLabel={it.provLabel}
            confidence={it.confidence}
            provHint={tf(`provenanceHint.${it.provVariant}`)}
            severity={it.severity}
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
        ))}
      </div>
    </>
  )
}
