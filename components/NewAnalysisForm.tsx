'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, startTransition } from 'react'

// Probe engines are proper nouns (brand names), not translatable copy.
// ChatGPT / Perplexity / Gemini are on by default; Google AI Overviews off —
// mirrors the prototype STEP1 chip state.
const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'Google AI Overviews'] as const
const DEFAULT_ENGINES: Record<string, boolean> = {
  ChatGPT: true,
  Perplexity: true,
  Gemini: true,
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const domain = String(form.get('url') ?? '')
    const industry = String(form.get('industry') ?? '')
    const market = String(form.get('market') ?? '')

    setError(null)
    setPending(true)
    startTransition(async () => {
      try {
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ domain, industry, market }),
        })
        if (!projectRes.ok) throw new Error('project_create_failed')
        const project = await projectRes.json()

        const runRes = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, runType: 'baseline' }),
        })
        if (!runRes.ok) throw new Error('run_create_failed')
        const run = await runRes.json()

        router.push(`/${locale}/runs/${run.id}`)
      } catch {
        setError(t('submitError'))
        setPending(false)
      }
    })
  }

  return (
    <section className="screen show">
      <p className="intro">{t('intro')}</p>

      <form className="card" style={{ padding: '22px' }} onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('urlLabel')}</label>
          <input
            name="url"
            className="url-in"
            defaultValue="https://teamflow.cn"
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
          <input className="txt" placeholder={t('competitorsPlaceholder')} />
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
      </form>

      <div className="note">{t('note')}</div>
    </section>
  )
}
