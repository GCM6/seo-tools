'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { DEMO_RUN_ID } from '@/lib/fixtures'

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
// controlled state. All user-facing copy comes from the `screen1` catalog;
// the "start diagnosis" action links to the demo run.
export function NewAnalysisForm({ locale }: { locale: string }) {
  const t = useTranslations('screen1')
  const [engines, setEngines] = useState<Record<string, boolean>>(DEFAULT_ENGINES)
  const [gsc, setGsc] = useState(true)

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <section className="screen">
      <p className="intro">{t('intro')}</p>

      <div className="card" style={{ padding: '22px' }}>
        <div className="field">
          <label>{t('urlLabel')}</label>
          <input
            className="url-in"
            defaultValue="https://teamflow.cn"
            aria-label={t('urlLabel')}
          />
        </div>

        <div className="row2">
          <div className="field">
            <label>{t('industryLabel')}</label>
            <select className="sel" aria-label={t('industryLabel')}>
              <option>B2B SaaS</option>
              <option>E-commerce</option>
              <option>Local services</option>
              <option>Other…</option>
            </select>
          </div>
          <div className="field">
            <label>{t('marketLabel')}</label>
            <select className="sel" aria-label={t('marketLabel')}>
              <option>zh · CN</option>
              <option>en · Global</option>
              <option>SEA</option>
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

        <Link
          className="run-btn"
          href={`/${locale}/runs/${DEMO_RUN_ID}`}
          style={{ display: 'inline-block' }}
        >
          {t('run')}
        </Link>
      </div>

      <div className="note">{t('note')}</div>
    </section>
  )
}
