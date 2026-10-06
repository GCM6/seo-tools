'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARKETS } from '@/lib/markets'
import { isValidCategory } from '@/lib/repositories/validators'

export function SessionInputForm({ sessionId, locale, missingFields }: { sessionId: string; locale: string; missingFields: string[] }) {
  const router = useRouter()
  const isZh = locale === 'zh'
  // 市场默认取第一个（全球英文）：建 run 闸门要求市场 code（SP-A §3.5），下拉保证值恒合规。
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    if (missingFields.includes('market')) initial.market = MARKETS[0].code
    return initial
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const labels: Record<string, string> = {
    domain: isZh ? '域名' : 'Domain',
    product: isZh ? '产品或行业' : 'Product or industry',
    industry: isZh ? '产品/服务品类（英文）' : 'Product / service category (English)',
    market: isZh ? '目标市场' : 'Target market',
  }
  // industry 由建 run 闸门要求：只接受英文品类描述（SP-A §3.2）。
  const industryInvalid = missingFields.includes('industry') && (values.industry ?? '').trim() !== '' && !isValidCategory(values.industry ?? '')
  const industryMissing = missingFields.includes('industry') && !isValidCategory(values.industry ?? '')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true); setError('')
    try {
      const response = await fetch(`/api/analysis-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
      const result = await response.json() as { runId?: string; error?: string }
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      if (result.runId) router.push(`/${locale}/runs/${result.runId}`)
      else router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  const set = (field: string, value: string) => setValues((current) => ({ ...current, [field]: value }))

  return <form className="session-input-form" onSubmit={submit}>
    {missingFields.map((field) => field === 'market'
      ? <label key={field}>{labels.market}
          <select value={values.market ?? MARKETS[0].code} onChange={(event) => set('market', event.target.value)}>
            {MARKETS.map((m) => <option key={m.code} value={m.code}>{isZh ? m.labelZh : m.labelEn}</option>)}
          </select>
        </label>
      : <label key={field}>{labels[field] ?? field}
          <input required value={values[field] ?? ''} aria-invalid={field === 'industry' && industryInvalid} onChange={(event) => set(field, event.target.value)} />
        </label>)}
    {industryInvalid ? <p className="goal-error">{isZh ? '请用英文描述你的产品或服务品类（3–80 个字符），例如 document metadata removal tool。' : 'Describe your product or service category in English (3–80 characters), e.g. document metadata removal tool.'}</p> : null}
    <button disabled={pending || industryMissing}>{pending ? (isZh ? '继续处理中…' : 'Continuing…') : (isZh ? '补充并继续 →' : 'Continue →')}</button>
    {error ? <p className="goal-error">{error}</p> : null}
  </form>
}
