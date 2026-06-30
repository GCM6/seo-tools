'use client'

import { useOptimistic, useState, startTransition } from 'react'
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

  // Confirmed status (commits after the PATCH settles) + optimistic overlay.
  const [status, setStatus] = useState<RecStatus>(initialStatus)
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<RecStatus, RecStatus>(
    status,
    (_current, next) => next,
  )

  const [draft, setDraft] = useState(editDraft)

  // Optimistically reflect the new status, fire the PATCH, then commit ONLY when
  // the server accepted it. On a non-ok response or a thrown error we leave the
  // confirmed `status` untouched, so `useOptimistic` reverts the overlay back to
  // it once the transition settles — i.e. the card rolls back to the prior state.
  const patch = (next: RecStatus) => {
    startTransition(async () => {
      setOptimisticStatus(next)
      try {
        const res = await fetch(`/api/recommendations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        })
        if (res.ok) setStatus(next)
      } catch {
        // Network error — keep the persisted status; optimistic state rolls back.
      }
    })
  }

  const accepted = optimisticStatus === 'accepted'
  const rejected = optimisticStatus === 'rejected'
  // `editing` is derived from the (optimistic) status so accept/reject/edit stay
  // mutually exclusive: rejecting or accepting clears the edit textarea, and a
  // failed PATCH rolls the textarea back together with the status.
  const editing = optimisticStatus === 'edited'

  const onAccept = () => patch(accepted ? 'draft' : 'accepted')
  const onReject = () => patch('rejected')
  const onEdit = () => patch(editing ? 'draft' : 'edited')

  return (
    <div className={`card rec${editing ? ' editing' : ''}`}>
      <div className="rec-top">
        <span className={`prio${priority.toUpperCase() === 'P1' ? '' : ' p2'}`}>{priority}</span>
        <h3>{title}</h3>
        <div className="rec-actions">
          <button
            type="button"
            className={`act acc${accepted ? ' on' : ''}`}
            aria-pressed={accepted}
            onClick={onAccept}
          >
            {accepted ? t('common.actions.accepted') : t('common.actions.accept')}
          </button>
          <button
            type="button"
            className={`act${editing ? ' acc on' : ''}`}
            aria-pressed={editing}
            onClick={onEdit}
          >
            {editing ? t('common.actions.editing') : t('common.actions.edit')}
          </button>
          <button
            type="button"
            className={`act rej${rejected ? ' on' : ''}`}
            aria-pressed={rejected}
            onClick={onReject}
          >
            {t('common.actions.reject')}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="edit-note">
          <ProvenanceTag variant="i" label={t('common.actions.editing')} />
        </div>
      ) : null}

      <div className="rec-body">
        {editing ? (
          <div className="field-block full">
            <div className="fb-l">{t('screen3.label.why')}</div>
            <textarea
              className="edit-area"
              value={draft}
              aria-label={t('screen3.label.why')}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        ) : (
          <>
            {fields.why ? (
              <div className="field-block">
                <div className="fb-l">{t('screen3.label.why')}</div>
                <p>{fields.why}</p>
              </div>
            ) : null}
            {fields.evidence ? (
              <div className="field-block">
                <div className="fb-l">{t('screen3.label.evidence')}</div>
                <div className="ev-ref">{fields.evidence}</div>
              </div>
            ) : null}
            {fields.impact ? (
              <div className="field-block">
                <div className="fb-l">{t('screen3.label.impact')}</div>
                <p>{fields.impact}</p>
              </div>
            ) : null}
            {fields.effort ? (
              <div className="field-block">
                <div className="fb-l">{t('screen3.label.effort')}</div>
                <p>{fields.effort}</p>
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
            {fields.confidence ? (
              <div className="field-block">
                <div className="fb-l">{t('screen3.label.confidence')}</div>
                <p>
                  <ProvenanceTag variant={confidenceVariant} label={fields.confidence} />
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
