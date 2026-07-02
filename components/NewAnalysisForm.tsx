'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

// Probe engines are proper nouns (brand names), not translatable copy.
// ChatGPT / Perplexity / Gemini / DeepSeek are on by default; Google AI
// Overviews off — mirrors the prototype STEP1 chip state (DeepSeek added
// for the zh market; its open API has no web search, evidence records that).
const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'DeepSeek', 'Google AI Overviews'] as const
const DEFAULT_ENGINES: Record<string, boolean> = {
  ChatGPT: true,
  Perplexity: true,
  Gemini: true,
  DeepSeek: true,
  'Google AI Overviews': false,
}

// Screen 1 new-analysis form. Client leaf: chip selection + GSC toggle are
// controlled state; submit creates a real project + run and navigates to it.
export function NewAnalysisForm({ locale }: { locale: string }) {
  const t = useTranslations('screen1')
  const router = useRouter()
  const industryOptions = t.raw('industryOptions') as string[]
  const marketOptions = t.raw('marketOptions') as string[]
  const [engines, setEngines] = useState<Record<string, boolean>>(DEFAULT_ENGINES)
  const [gsc, setGsc] = useState(true)
  const selectedEngines = ENGINES.filter((name) => engines[name])

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // 把后端错误码映射为可行动的用户文案；未知码回退到笼统重试提示。
  async function toErrorMessage(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    switch (body.error) {
      case 'invalid_domain':
      case 'domain_required':
        return t('errorInvalidDomain')
      case 'dispatch_failed':
        return t('errorDispatchFailed')
      default:
        return t('submitError')
    }
  }

  // React 19 Actions：提交态用 useActionState 的 isPending，不手搓 loading 布尔。
  // action 返回错误文案（或 null）作为下一个 state。
  const [error, submitAction, pending] = useActionState<string | null, FormData>(
    async (_prev, form) => {
      const domain = String(form.get('url') ?? '')
      const industry = String(form.get('industry') ?? '')
      const market = String(form.get('market') ?? '')
      const competitors = String(form.get('competitors') ?? '')
      try {
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            domain,
            industry,
            market,
            competitors,
            language: locale,
            gscConnected: gsc,
            defaultModels: selectedEngines,
          }),
        })
        if (!projectRes.ok) return await toErrorMessage(projectRes)
        const project = await projectRes.json()

        const runRes = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, runType: 'baseline' }),
        })
        if (!runRes.ok) return await toErrorMessage(runRes)
        const run = await runRes.json()

        router.push(`/${locale}/runs/${run.id}`)
        return null
      } catch {
        return t('submitError')
      }
    },
    null,
  )

  return (
    <section className="screen show">
      <p className="intro">{t('intro')}</p>

      <form className="analysis-layout" action={submitAction}>
        <div className="card analysis-form">
          <div className="field">
            <label>{t('urlLabel')}</label>
            <input
              name="url"
              className="url-in"
              placeholder={t('urlPlaceholder')}
              aria-label={t('urlLabel')}
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>{t('industryLabel')}</label>
              <select name="industry" className="sel" aria-label={t('industryLabel')}>
                {industryOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('marketLabel')}</label>
              <select name="market" className="sel" aria-label={t('marketLabel')}>
                {marketOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>{t('competitorsLabel')}</label>
            <input name="competitors" className="txt" placeholder={t('competitorsPlaceholder')} />
          </div>

          <div className="field">
            <label>{t('enginesLabel')}</label>
            <div className="chips">
              {ENGINES.map((name) => (
                <label key={name} className={`chip${engines[name] ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={engines[name]}
                    onChange={() => toggleEngine(name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t('dataSourceLabel')}</label>
            <div className="toggle-row">
              <input
                type="checkbox"
                checked={gsc}
                onChange={() => setGsc((v) => !v)}
                aria-label={t('gscTitle')}
                style={{ accentColor: 'var(--measured)', width: 17, height: 17 }}
              />
              <div>
                <div className="t">{t('gscTitle')}</div>
                <div className="d">{t('gscDesc')}</div>
              </div>
            </div>
          </div>

          <button type="submit" className="run-btn" disabled={pending}>
            {pending ? t('starting') : t('run')}
          </button>
          {error && <p className="note" style={{ color: 'var(--ds-error, red)' }}>{error}</p>}
        </div>

        <aside className="card analysis-brief">
          <div className="brief-label">{t('briefLabel')}</div>
          <h2>{t('briefTitle')}</h2>
          <div className="brief-list">
            <div>
              <span>{t('briefEvidence')}</span>
              <b>{gsc ? t('briefGscOn') : t('briefGscOff')}</b>
            </div>
            <div>
              <span>{t('briefEngines')}</span>
              <b>{selectedEngines.length ? selectedEngines.join(' · ') : t('briefNoEngines')}</b>
            </div>
            <div>
              <span>{t('briefFlow')}</span>
              <b>{t('briefFlowValue')}</b>
            </div>
          </div>
          <div className="brief-note">{t('briefNote')}</div>
        </aside>
      </form>

      <div className="note">{t('note')}</div>
    </section>
  )
}
