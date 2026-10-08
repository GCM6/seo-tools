'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { Notice } from './Notice'

// 「从一个问题开始」（ux-blueprint §4）：一句话目标 + 可选域名 → POST /api/analysis-sessions，
// 有 run 就进诊断工作区，否则进分析会话页。错误码映射成可读文案，不把原始码露给用户。
const ERROR_KEYS: Record<string, string> = {
  invalid_domain: 'errorInvalidDomain',
  workflow_not_published: 'errorWorkflow',
  dispatch_failed: 'errorDispatchFailed',
}

export function GoalAnalysisLauncher({ locale }: { locale: string }) {
  const t = useTranslations('goalLauncher')
  const router = useRouter()
  const id = useId()
  const [goal, setGoal] = useState('')
  const [domain, setDomain] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!goal.trim()) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/analysis-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), domain: domain.trim() || undefined }),
      })
      const body = (await response.json().catch(() => ({}))) as { id?: string; runId?: string; error?: string }
      if (!response.ok || !body.id) {
        setError(t(ERROR_KEYS[body.error ?? ''] ?? 'errorGeneric'))
        return
      }
      router.push(body.runId ? `/${locale}/runs/${body.runId}` : `/${locale}/sessions/${body.id}`)
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="ui-panel ui-goal">
      <form
        className="ui-panel__body"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="ui-hint">{t('intro')}</p>
        <div className="ui-field">
          <label className="ui-label" htmlFor={`${id}-goal`}>
            {t('goalLabel')}
          </label>
          <textarea
            id={`${id}-goal`}
            className="ui-textarea"
            rows={4}
            value={goal}
            placeholder={t('goalPlaceholder')}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>
        <div className="ui-field ui-field--narrow">
          <label className="ui-label" htmlFor={`${id}-domain`}>
            {t('domainLabel')}
          </label>
          <input
            id={`${id}-domain`}
            className="ui-input"
            value={domain}
            placeholder="example.com"
            aria-describedby={`${id}-domain-hint`}
            onChange={(e) => setDomain(e.target.value)}
          />
          <p className="ui-hint" id={`${id}-domain-hint`}>
            {t('domainHint')}
          </p>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="ui-inline-actions">
          <Button type="submit" variant="primary" loading={pending} disabled={!goal.trim()}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </section>
  )
}
