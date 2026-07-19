'use client'

import { useOptimistic, useState, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ProvenanceTag } from './ProvenanceTag'

// Human-in-the-loop status machine for a single recommendation.
// Only `accepted` / `edited` advance to prompt generation (project 铁律 #4),
// so accept and reject are a single mutually-exclusive status field.
export type RecStatus = 'draft' | 'accepted' | 'edited' | 'rejected'

export interface RecCardFields {
  why?: string
  evidence?: string
  impact?: string
  effort?: string
  risk?: string
  validationMethod?: string
  confidence?: string
  editedNote?: string
}

export interface RecCardProps {
  id: string
  priority: string
  title: string
  fields: RecCardFields
  initialStatus: RecStatus
  // Provenance variant for the confidence tag (m=measured / i=inferred …).
  confidenceVariant?: 'm' | 'i' | 'g' | 'ok'
  // Seed text for the editable draft (content angle / brand facts).
  editDraft?: string
}

type RecommendationPriority = 'quick_win' | 'strategic' | 'fill_in' | 'low'

const PRIORITIES = new Set<RecommendationPriority>(['quick_win', 'strategic', 'fill_in', 'low'])
const STATIC_FIX_MARKER = '\n\n参考修复示例（静态模板，非生成内容）：\n'

function normalizePriority(priority: string): RecommendationPriority {
  return PRIORITIES.has(priority as RecommendationPriority) ? priority as RecommendationPriority : 'fill_in'
}

function splitRecommendation(title: string) {
  const markerIndex = title.indexOf(STATIC_FIX_MARKER)
  if (markerIndex === -1) return { action: title, fixSnippet: '' }
  return {
    action: title.slice(0, markerIndex),
    fixSnippet: title.slice(markerIndex + STATIC_FIX_MARKER.length),
  }
}

export function RecCard({
  id,
  priority,
  title,
  fields,
  initialStatus,
  confidenceVariant = 'i',
  editDraft = '',
}: RecCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const priorityKey = normalizePriority(priority)
  const { action, fixSnippet } = splitRecommendation(title)

  // Confirmed status (commits after the PATCH settles) + optimistic overlay.
  const [status, setStatus] = useState<RecStatus>(initialStatus)
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<RecStatus, RecStatus>(
    status,
    (_current, next) => next,
  )

  const [draft, setDraft] = useState(editDraft)
  const [editingDraft, setEditingDraft] = useState(false)

  // Optimistically reflect the new status, fire the PATCH, then commit ONLY when
  // the server accepted it. On a non-ok response or a thrown error we leave the
  // confirmed `status` untouched, so `useOptimistic` reverts the overlay back to
  // it once the transition settles — i.e. the card rolls back to the prior state.
  const patch = (next: RecStatus, editedPayload?: unknown) => {
    startTransition(async () => {
      setOptimisticStatus(next)
      try {
        const res = await fetch(`/api/recommendations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next, editedPayload }),
        })
        if (res.ok) {
          setStatus(next)
          setEditingDraft(false)
          // 最后一条建议完成确认时，服务端会推进 run 到输出阶段；刷新只读步骤进度。
          router.refresh()
        }
      } catch {
        // Network error — keep the persisted status; optimistic state rolls back.
      }
    })
  }

  const accepted = optimisticStatus === 'accepted'
  const rejected = optimisticStatus === 'rejected'
  const isEdited = optimisticStatus === 'edited'
  const statusKey = optimisticStatus === 'draft' ? 'draft' : optimisticStatus
  const hasDetails = Boolean(fixSnippet || fields.evidence || fields.risk || fields.validationMethod)

  const onAccept = () => patch(accepted ? 'draft' : 'accepted')
  const onReject = () => patch(rejected ? 'draft' : 'rejected')
  const onEdit = () => setEditingDraft(true)
  const onSaveEdit = () => patch('edited', { note: draft })
  const onCancelEdit = () => {
    setDraft(editDraft)
    setEditingDraft(false)
  }

  return (
    <article className={`card rec rec--${priorityKey}${editingDraft ? ' editing' : ''}`} data-status={optimisticStatus}>
      <div className="rec-top">
        <div className="rec-title-block">
          <div className="rec-eyebrow">
            <span className="prio">{t(`screen3.priority.${priorityKey}`)}</span>
            <span className={`rec-status rec-status--${statusKey}`}>{t(`screen3.status.${statusKey}`)}</span>
          </div>
          <h3>{action}</h3>
        </div>
        <div className="rec-actions">
          {editingDraft ? (
            <>
              <button type="button" className="act acc on" onClick={onSaveEdit}>
                {t('common.actions.saveEdit')}
              </button>
              <button type="button" className="act" onClick={onCancelEdit}>
                {t('common.actions.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`act accept${accepted ? ' on' : ''}`}
                aria-pressed={accepted}
                title={accepted ? t('screen3.action.undoAccept') : undefined}
                onClick={onAccept}
              >
                {accepted ? t('common.actions.accepted') : t('common.actions.accept')}
              </button>
              <button
                type="button"
                className={`act edit${isEdited ? ' on' : ''}`}
                aria-pressed={isEdited}
                onClick={onEdit}
              >
                {optimisticStatus === 'edited' ? t('common.actions.edited') : t('common.actions.edit')}
              </button>
              <button
                type="button"
                className={`act rej${rejected ? ' on' : ''}`}
                aria-pressed={rejected}
                title={rejected ? t('screen3.action.restore') : undefined}
                onClick={onReject}
              >
                {rejected ? t('screen3.status.rejected') : t('common.actions.reject')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rec-body">
        {editingDraft ? (
          <div className="field-block full">
            <div className="fb-l">{t('screen3.label.editedNote')}</div>
            <textarea
              className="edit-area"
              value={draft}
              aria-label={t('screen3.label.editedNote')}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="rec-decision-grid">
              <div className="rec-rationale">
                <div className="fb-l">{t('screen3.label.why')}</div>
                {fields.why ? <p>{fields.why}</p> : <p className="rec-empty">{t('screen3.noRationale')}</p>}
              </div>
              <dl className="rec-metrics" aria-label={t('screen3.decisionSummary')}>
                {fields.impact ? (
                  <div>
                    <dt>{t('screen3.label.impact')}</dt>
                    <dd>{fields.impact}</dd>
                  </div>
                ) : null}
                {fields.effort ? (
                  <div>
                    <dt>{t('screen3.label.effort')}</dt>
                    <dd>{fields.effort}</dd>
                  </div>
                ) : null}
                {fields.confidence ? (
                  <div>
                    <dt>{t('screen3.label.confidence')}</dt>
                    <dd><ProvenanceTag variant={confidenceVariant} label={fields.confidence} /></dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {isEdited && fields.editedNote ? (
              <div className="field-block full edited-block">
                <div className="fb-l">{t('screen3.label.editedNote')}</div>
                <p>{fields.editedNote}</p>
              </div>
            ) : null}

            {hasDetails ? (
              <details className="rec-details">
                <summary>
                  <span>{t('screen3.details')}</span>
                  <span aria-hidden="true" className="flex items-center justify-center">
                    <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </span>
                </summary>
                <div className="rec-details-grid">
                  {fields.evidence ? (
                    <div className="field-block">
                      <div className="fb-l">{t('screen3.label.evidence')}</div>
                      <code className="ev-ref">{fields.evidence}</code>
                    </div>
                  ) : null}
                  {fields.risk ? (
                    <div className="field-block">
                      <div className="fb-l">{t('screen3.label.risk')}</div>
                      <p>{fields.risk}</p>
                    </div>
                  ) : null}
                  {fields.validationMethod ? (
                    <div className="field-block">
                      <div className="fb-l">{t('screen3.label.validation')}</div>
                      <p>{fields.validationMethod}</p>
                    </div>
                  ) : null}
                  {fixSnippet ? (
                    <div className="field-block rec-fix-snippet">
                      <div className="fb-l">{t('screen3.staticFix')}</div>
                      <pre><code>{fixSnippet}</code></pre>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}
