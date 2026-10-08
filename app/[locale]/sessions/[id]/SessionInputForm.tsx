'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MARKETS } from '@/lib/markets'
import { isValidCategory } from '@/lib/repositories/validators'
import { Button } from '@/components/Button'
import { Notice } from '@/components/Notice'

// 会话缺字段时的补充表单（SP-A §3.5 建 run 闸门）：品类只收英文描述，市场用下拉保证 code 合规。
export function SessionInputForm({ sessionId, locale, missingFields }: { sessionId: string; locale: string; missingFields: string[] }) {
  const t = useTranslations('sessions')
  const router = useRouter()
  const uid = useId()
  const isZh = locale === 'zh'
  // 市场默认取第一个（全球英文）：建 run 闸门要求市场 code（SP-A §3.5），下拉保证值恒合规。
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    if (missingFields.includes('market')) initial.market = MARKETS[0].code
    return initial
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  // industry 由建 run 闸门要求：只接受英文品类描述（SP-A §3.2）。
  const industryInvalid = missingFields.includes('industry') && (values.industry ?? '').trim() !== '' && !isValidCategory(values.industry ?? '')
  const industryMissing = missingFields.includes('industry') && !isValidCategory(values.industry ?? '')
  const fieldLabel = (field: string) => (t.has(`field.${field}`) ? t(`field.${field}`) : field)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/analysis-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
      const result = (await response.json().catch(() => ({}))) as { runId?: string; error?: string }
      if (!response.ok) {
        setError(result.error === 'invalid_domain' ? t('errorInvalidDomain') : t('errorGeneric'))
        return
      }
      if (result.runId) router.push(`/${locale}/runs/${result.runId}`)
      else router.refresh()
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setPending(false)
    }
  }

  const set = (field: string, value: string) => setValues((current) => ({ ...current, [field]: value }))

  return (
    <form className="ui-group" onSubmit={submit}>
      {missingFields.map((field) => (
        <div key={field} className="ui-field ui-field--narrow">
          <label className="ui-label" htmlFor={`${uid}-${field}`}>
            {fieldLabel(field)}
          </label>
          {field === 'market' ? (
            <select id={`${uid}-${field}`} className="ui-select" value={values.market ?? MARKETS[0].code} onChange={(event) => set('market', event.target.value)}>
              {MARKETS.map((m) => (
                <option key={m.code} value={m.code}>
                  {isZh ? m.labelZh : m.labelEn}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${uid}-${field}`}
              className="ui-input"
              required
              value={values[field] ?? ''}
              aria-invalid={(field === 'industry' && industryInvalid) || undefined}
              aria-describedby={field === 'industry' && industryInvalid ? `${uid}-industry-error` : undefined}
              onChange={(event) => set(field, event.target.value)}
            />
          )}
          {field === 'industry' && industryInvalid ? (
            <p className="ui-error" id={`${uid}-industry-error`}>
              {t('industryInvalid')}
            </p>
          ) : null}
        </div>
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="ui-inline-actions">
        <Button type="submit" variant="primary" loading={pending} disabled={industryMissing}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  )
}
