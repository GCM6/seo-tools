'use client'

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { CodeBlock } from './CodeBlock'
import { EvidenceBadge } from './EvidenceBadge'
import { Notice } from './Notice'
import { RecRow } from './RecRow'
import { labelKeyForGrade, type EvidenceGrade } from '@/lib/evidence'
import { composeRecommendation, shortLevel, splitRecommendation } from '@/lib/runs/recommendations'

// 人在环内的单条建议（ux-blueprint §3.3）：行内直接「接受 / 否决」，展开区看理由、风险、验证、证据、
// 修复示例，并在展开区内联编辑（标题 + 修订说明 → 保存并接受）。
// 只有 accepted / edited 才能进入提示词生成（项目铁律 #4），所以接受与否决是同一个互斥状态字段。
export type RecStatus = 'draft' | 'accepted' | 'edited' | 'rejected'

export interface RecCardFields {
  why?: string
  /** 证据引用的人类可读摘要（调用方用 summarizeEvidenceRefs 预算），缺摘要时是原始 ID。 */
  evidence?: string[]
  impact?: string
  effort?: string
  risk?: string
  validationMethod?: string
  confidence?: string
  editedNote?: string
  /** why 里拆出来的受影响页面清单（extractAffectedPagesSection），单独成一项展示。 */
  affected?: { total: number; shown: number; urls: string[] } | null
}

export interface RecCardProps {
  id: string
  /** recommendations.what；人工改过标题时由调用方传 editedPayload.what。可能带静态修复示例。 */
  title: string
  fields: RecCardFields
  initialStatus: RecStatus
  // 证据徽章的等级 = 该建议所针对 finding 的 claim_type（design-system §3.1）。
  // 不传时不画徽章、不猜等级——以前默认画成「推断」，会把「高（实测）」错标成推断。
  confidenceGrade?: EvidenceGrade
  /** 所针对问题的严重度（findings.severity）。 */
  severity?: string
  /** 「针对：〈问题标题〉」，链接到问题页对应条目；标题相同的建议靠它区分。 */
  target?: { title: string; href: string }
  /** 已有的人工修订说明，作为编辑表单的初始值。 */
  editNote?: string
  /** 服务端确认后回调，供列表更新筛选计数。 */
  onStatusChange?: (id: string, status: RecStatus) => void
}

export function RecCard({
  id,
  title,
  fields,
  initialStatus,
  confidenceGrade,
  severity,
  target,
  editNote = '',
  onStatusChange,
}: RecCardProps) {
  const t = useTranslations()
  const router = useRouter()

  // 已确认的状态（PATCH 成功后才提交）+ 乐观覆盖层：失败时覆盖层在 transition 结束后自动回到已确认状态。
  const [status, setStatus] = useState<RecStatus>(initialStatus)
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<RecStatus, RecStatus>(status, (_current, next) => next)
  const [currentTitle, setCurrentTitle] = useState(title)
  const [currentNote, setCurrentNote] = useState(fields.editedNote ?? '')
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'accept' | 'reject' | 'edit' | null>(null)
  const [error, setError] = useState(false)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const { action, fixSnippet } = splitRecommendation(currentTitle)
  const [draftTitle, setDraftTitle] = useState(action)
  const [draftNote, setDraftNote] = useState(editNote)
  const [titleInvalid, setTitleInvalid] = useState(false)

  const patch = (next: RecStatus, kind: 'accept' | 'reject' | 'edit', editedPayload?: Record<string, string>) => {
    setError(false)
    setPendingAction(kind)
    startTransition(async () => {
      setOptimisticStatus(next)
      try {
        const res = await fetch(`/api/recommendations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next, editedPayload }),
        })
        if (!res.ok) {
          setError(true)
          return
        }
        setStatus(next)
        onStatusChange?.(id, next)
        if (next === 'edited' && editedPayload) {
          if (editedPayload.what) setCurrentTitle(editedPayload.what)
          setCurrentNote(editedPayload.note ?? '')
          setEditing(false)
        }
        // 接口在 status 不是 edited 时会清空 editedPayload，本地展示同步清掉。
        if (next !== 'edited') setCurrentNote('')
        // 最后一条建议确认后服务端会把 run 推进到执行阶段；刷新抬头的进度与计数。
        router.refresh()
      } catch {
        setError(true)
      } finally {
        setPendingAction(null)
      }
    })
  }

  const accepted = optimisticStatus === 'accepted' || optimisticStatus === 'edited'
  const rejected = optimisticStatus === 'rejected'
  const isEdited = optimisticStatus === 'edited'

  const onAccept = () => patch(accepted ? 'draft' : 'accepted', 'accept')
  const onReject = () => patch(rejected ? 'draft' : 'rejected', 'reject')
  const onSaveEdit = () => {
    const nextAction = draftTitle.trim()
    if (!nextAction) {
      setTitleInvalid(true)
      return
    }
    // 接口会用这次的 editedPayload 整体替换上一次的，所以 what 每次都带上（没改就是原标题），
    // 否则只改说明会把之前改过的标题冲掉。修复示例原样接回，下游提示词不丢示例。
    patch('edited', 'edit', { what: composeRecommendation(nextAction, fixSnippet), note: draftNote.trim() })
  }
  const onCancelEdit = () => {
    setDraftTitle(action)
    setDraftNote(currentNote || editNote)
    setTitleInvalid(false)
    setEditing(false)
  }

  const impact = shortLevel(fields.impact)
  const effort = shortLevel(fields.effort)
  const meta = [impact ? `${t('screen3.label.impact')} ${impact}` : '', effort ? `${t('screen3.label.effort')} ${effort}` : '']
    .filter(Boolean)
    .join(' · ')
  const titleId = `rec-edit-title-${id}`
  const noteId = `rec-edit-note-${id}`

  return (
    <RecRow
      id={id}
      severity={severity}
      severityLabel={severity ? t(`workspace.sev.${severity === 'high' || severity === 'hi' ? 'high' : severity === 'mid' ? 'mid' : 'ok'}`) : undefined}
      title={action}
      target={
        target ? (
          <>
            {t('screen3.target')}
            <Link href={target.href}>{target.title}</Link>
          </>
        ) : undefined
      }
      meta={meta}
      badge={
        confidenceGrade ? (
          <EvidenceBadge grade={confidenceGrade} label={t(labelKeyForGrade(confidenceGrade))} hint={t(`findings.provenanceHint.${confidenceGrade}`)} />
        ) : null
      }
      aside={
        <div className="ui-decide" role="group" aria-label={t('screen3.decisionSummary')} aria-busy={isPending || undefined}>
          <button
            type="button"
            className="ui-decide__btn ui-decide__btn--accept"
            aria-pressed={accepted}
            title={accepted ? t(isEdited ? 'screen3.action.undoEdited' : 'screen3.action.undoAccept') : undefined}
            onClick={onAccept}
          >
            {pendingAction === 'accept' ? <span className="ui-spin" aria-hidden="true" /> : null}
            {accepted ? t('common.actions.accepted') : t('common.actions.accept')}
          </button>
          <button
            type="button"
            className="ui-decide__btn ui-decide__btn--reject"
            aria-pressed={rejected}
            title={rejected ? t('screen3.action.restore') : undefined}
            onClick={onReject}
          >
            {pendingAction === 'reject' ? <span className="ui-spin" aria-hidden="true" /> : null}
            {rejected ? t('screen3.status.rejected') : t('common.actions.reject')}
          </button>
        </div>
      }
      open={open}
      onToggle={() => setOpen((v) => !v)}
      notice={error ? <Notice tone="error">{t('screen3.action.error')}</Notice> : null}
    >
      <dl className="ui-kv">
        <dt>{t('screen3.label.why')}</dt>
        <dd>{fields.why || t('screen3.noRationale')}</dd>
        {fields.affected ? (
          <>
            <dt>{t('screen3.label.affectedPages')}</dt>
            <dd>
              <p>{t('screen4.actionList.affectedPagesSummary', { total: fields.affected.total, shown: fields.affected.shown })}</p>
              <ul className="ui-kv__list ui-mono">
                {fields.affected.urls.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        {fields.impact ? (
          <>
            <dt>{t('screen3.label.impact')}</dt>
            <dd>{fields.impact}</dd>
          </>
        ) : null}
        {fields.risk ? (
          <>
            <dt>{t('screen3.label.risk')}</dt>
            <dd>{fields.risk}</dd>
          </>
        ) : null}
        {fields.validationMethod ? (
          <>
            <dt>{t('screen3.label.validation')}</dt>
            <dd>{fields.validationMethod}</dd>
          </>
        ) : null}
        {fields.confidence ? (
          <>
            <dt>{t('screen3.label.confidence')}</dt>
            <dd>{fields.confidence}</dd>
          </>
        ) : null}
        {fields.evidence?.length ? (
          <>
            <dt>{t('screen3.label.evidence')}</dt>
            <dd>
              <ul className="ui-kv__list">
                {fields.evidence.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        {isEdited && currentNote ? (
          <>
            <dt>{t('screen3.label.editedNote')}</dt>
            <dd>{currentNote}</dd>
          </>
        ) : null}
      </dl>

      {fixSnippet ? (
        <CodeBlock label={t('screen3.staticFix')} code={fixSnippet} copyLabel={t('common.actions.copyCode')} copiedLabel={t('common.actions.copied')} />
      ) : null}

      {editing ? (
        <div className="ui-rec__edit">
          <div className="ui-field">
            <label className="ui-label" htmlFor={titleId}>
              {t('screen3.edit.title')}
            </label>
            <input
              id={titleId}
              className="ui-input"
              value={draftTitle}
              aria-invalid={titleInvalid || undefined}
              onChange={(e) => {
                setDraftTitle(e.target.value)
                if (e.target.value.trim()) setTitleInvalid(false)
              }}
            />
            {titleInvalid ? <div className="ui-error">{t('screen3.edit.titleRequired')}</div> : null}
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor={noteId}>
              {t('screen3.edit.note')}
            </label>
            <textarea id={noteId} className="ui-textarea" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
            <div className="ui-hint">{t('screen3.edit.noteHint')}</div>
          </div>
          <div className="ui-inline-actions">
            <Button variant="primary" size="sm" loading={pendingAction === 'edit'} onClick={onSaveEdit}>
              {t('screen3.edit.save')}
            </Button>
            <Button variant="quiet" size="sm" onClick={onCancelEdit}>
              {t('common.actions.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="ui-inline-actions">
          <Button size="sm" onClick={() => setEditing(true)}>
            {t('common.actions.edit')}
          </Button>
          <span className="ui-footnote">{t('screen3.edit.lead')}</span>
        </div>
      )}
    </RecRow>
  )
}
