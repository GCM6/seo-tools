'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { guessMarketLanguage } from '@/lib/analysis/locale-guess'
import { estimateRun } from '@/lib/analysis/estimate'

// 探测引擎是专有名词（品牌名），不翻译。ChatGPT/Perplexity/Gemini/DeepSeek 默认开，
// Google AI Overviews 默认关（沿用原型 STEP1）。
const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'DeepSeek', 'Google AI Overviews'] as const
const DEFAULT_ENGINES: Record<string, boolean> = {
  ChatGPT: true,
  Perplexity: true,
  Gemini: true,
  DeepSeek: true,
  'Google AI Overviews': false,
}
// V0 固定 20 prompts × n=5（§8）——预估用。
const PROMPT_COUNT = 20
const PROBE_N = 5

export interface WizardProject {
  id: string
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
}

// Screen 1 新建分析 3 步向导（spec §SP-G2a）。client leaf：跨步共享表单 state 由本组件编排。
// 第 1 步 upsert 单项目 → 第 2 步连数据（GSC 授权全页往返回到本步）→ 第 3 步预估并建 run。
export function NewAnalysisForm({
  locale,
  project = null,
  gscConnected = false,
  aiProbeConfigured = false,
  initialStep = 1,
}: {
  locale: string
  project?: WizardProject | null
  gscConnected?: boolean
  aiProbeConfigured?: boolean
  initialStep?: 1 | 2 | 3
}) {
  const t = useTranslations('screen1')
  const router = useRouter()
  const industryOptions = t.raw('industryOptions') as string[]
  const marketOptions = t.raw('marketOptions') as string[]

  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null)
  const [domain, setDomain] = useState(project?.domain ?? '')
  const [industryIndex, setIndustryIndex] = useState(() => {
    const i = industryOptions.indexOf(project?.industry ?? '')
    return i >= 0 ? i : 0
  })
  const [marketIndex, setMarketIndex] = useState(() => {
    const i = marketOptions.indexOf(project?.market ?? '')
    return i >= 0 ? i : 0
  })
  const [competitors, setCompetitors] = useState((project?.competitors ?? []).join(', '))
  const [engines, setEngines] = useState<Record<string, boolean>>(DEFAULT_ENGINES)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const selectedEngines = ENGINES.filter((name) => engines[name])
  const estimate = estimateRun({
    engineCount: selectedEngines.length,
    promptCount: PROMPT_COUNT,
    n: PROBE_N,
    gsc: gscConnected,
    render: true,
  })

  function onDomainChange(v: string) {
    setDomain(v)
    // 输入域名即智能预填市场（ccTLD 启发）；用户随后仍可手动改。
    if (v.trim()) setMarketIndex(guessMarketLanguage(v).marketIndex)
  }

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // 后端错误码 → 可行动的用户文案；未知码回退笼统重试提示。
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

  const jsonHeaders = { 'content-type': 'application/json' }

  // 复用单项目：无则 POST 建，有则 PATCH 更新。返回 projectId 或 null（失败已置 error）。
  async function upsertProject(): Promise<string | null> {
    const shared = {
      domain,
      industry: industryOptions[industryIndex],
      market: marketOptions[marketIndex],
      language: guessMarketLanguage(domain).language,
      competitors,
    }
    const res = projectId
      ? await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(shared) })
      : await fetch('/api/projects', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ ...shared, gscConnected, defaultModels: selectedEngines }),
        })
    if (!res.ok) {
      setError(await toErrorMessage(res))
      return null
    }
    const p = (await res.json()) as { id: string }
    setProjectId(p.id)
    return p.id
  }

  async function goToConnect() {
    if (!domain.trim()) {
      setError(t('errorInvalidDomain'))
      return
    }
    setError(null)
    setPending(true)
    const id = await upsertProject()
    setPending(false)
    if (id) setStep(2)
  }

  function connectGsc() {
    if (!projectId) return
    // 授权后跳回 /new 向导第 2 步闭环（多项目：带 projectId 以显式续起在建项目；
    // callback 会附 gsc=connected）。
    const returnTo = `/${locale}/new?step=connect&projectId=${encodeURIComponent(projectId)}`
    window.location.href = `/api/gsc/auth?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(returnTo)}`
  }

  async function start() {
    setError(null)
    setPending(true)
    const id = projectId ?? (await upsertProject())
    if (!id) {
      setPending(false)
      return
    }
    // 建 run 前把最终引擎选择同步进 settings（run-probes 据 defaultModels 选 provider）。
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ defaultModels: selectedEngines }),
    })
    const runRes = await fetch('/api/runs', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ projectId: id, runType: 'baseline' }),
    })
    setPending(false)
    if (!runRes.ok) {
      setError(await toErrorMessage(runRes))
      return
    }
    const run = (await runRes.json()) as { id: string }
    router.push(`/${locale}/runs/${run.id}`)
  }

  const steps: [1 | 2 | 3, string][] = [
    [1, t('stepSite')],
    [2, t('stepConnect')],
    [3, t('stepConfirm')],
  ]
  const dataSummary = gscConnected ? t('briefGscOn') : t('briefGscOff')

  return (
    <section className="screen show">
      <p className="intro">{t('intro')}</p>

      <ol className="wizard-steps" aria-label={t('stepConfirm')}>
        {steps.map(([n, label]) => (
          <li key={n} className={`wizard-step${step === n ? ' current' : step > n ? ' done' : ''}`}>
            <span className="ws-n">{n}</span>
            <span className="ws-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="card wizard-body">
        {step === 1 && (
          <div className="wizard-panel">
            <h2 className="wizard-h">{t('stepSite')}</h2>
            <p className="wizard-sub">{t('step1Sub')}</p>

            <div className="field">
              <label htmlFor="wiz-url">{t('urlLabel')}</label>
              <input
                id="wiz-url"
                className="url-in"
                placeholder={t('urlPlaceholder')}
                aria-label={t('urlLabel')}
                value={domain}
                onChange={(e) => onDomainChange(e.target.value)}
              />
            </div>

            <div className="row2">
              <div className="field">
                <label htmlFor="wiz-industry">{t('industryLabel')}</label>
                <select
                  id="wiz-industry"
                  className="sel"
                  aria-label={t('industryLabel')}
                  value={industryOptions[industryIndex]}
                  onChange={(e) => setIndustryIndex(Math.max(0, industryOptions.indexOf(e.target.value)))}
                >
                  {industryOptions.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="wiz-market">{t('marketLabel')}</label>
                <select
                  id="wiz-market"
                  className="sel"
                  aria-label={t('marketLabel')}
                  value={marketOptions[marketIndex]}
                  onChange={(e) => setMarketIndex(Math.max(0, marketOptions.indexOf(e.target.value)))}
                >
                  {marketOptions.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="wiz-competitors">{t('competitorsOptional')}</label>
              <input
                id="wiz-competitors"
                className="txt"
                placeholder={t('competitorsPlaceholder')}
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
              />
              <p className="wizard-hint">{t('competitorsOptionalHint')}</p>
            </div>

            <div className="wizard-nav">
              <button type="button" className="run-btn" onClick={goToConnect} disabled={pending}>
                {pending ? t('starting') : t('next')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <h2 className="wizard-h">{t('stepConnect')}</h2>
            <p className="wizard-sub">{t('step2Sub')}</p>

            <div className={`connect-card${gscConnected ? ' connected' : ''}`}>
              <div className="cc-body">
                <div className="cc-title">{t('gscTitle')}</div>
                <div className="cc-desc">{gscConnected ? t('gscDesc') : t('gscImpact')}</div>
              </div>
              {gscConnected ? (
                <span className="cc-state ok">{t('stateConnected')}</span>
              ) : (
                <button type="button" className="cc-action" onClick={connectGsc}>
                  {t('gscConnectCta')}
                </button>
              )}
            </div>

            <div className={`connect-card${aiProbeConfigured ? ' connected' : ''}`}>
              <div className="cc-body">
                <div className="cc-title">{t('aiProbeTitle')}</div>
                <div className="cc-desc">{aiProbeConfigured ? t('aiProbeDesc') : t('aiProbeImpact')}</div>
              </div>
              {aiProbeConfigured ? (
                <span className="cc-state ok">{t('stateConfigured')}</span>
              ) : (
                <a className="cc-action" href={`/${locale}/settings#source-aiProbe`}>
                  {t('aiProbeCta')}
                </a>
              )}
            </div>

            <div className="field">
              <label>{t('enginesLabel')}</label>
              <div className="chips">
                {ENGINES.map((name) => (
                  <label key={name} className={`chip${engines[name] ? ' on' : ''}`}>
                    <input type="checkbox" checked={engines[name]} onChange={() => toggleEngine(name)} />
                    {name}
                  </label>
                ))}
              </div>
            </div>

            <p className="wizard-hint">{t('skipHint')}</p>

            <div className="wizard-nav">
              <button type="button" className="ghost-btn" onClick={() => setStep(1)}>
                {t('back')}
              </button>
              <button type="button" className="run-btn" onClick={() => setStep(3)}>
                {t('next')}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel">
            <h2 className="wizard-h">{t('stepConfirm')}</h2>
            <p className="wizard-sub">{t('step3Sub')}</p>

            <dl className="scope-grid">
              <div>
                <dt>{t('scopeDomain')}</dt>
                <dd className="mono">{domain || '—'}</dd>
              </div>
              <div>
                <dt>{t('scopeIndustry')}</dt>
                <dd>{industryOptions[industryIndex]}</dd>
              </div>
              <div>
                <dt>{t('scopeMarket')}</dt>
                <dd>{marketOptions[marketIndex]}</dd>
              </div>
              <div>
                <dt>{t('scopeEngines')}</dt>
                <dd>{selectedEngines.length ? selectedEngines.join(' · ') : t('briefNoEngines')}</dd>
              </div>
              <div>
                <dt>{t('scopeData')}</dt>
                <dd>{dataSummary}</dd>
              </div>
            </dl>

            <div className="estimate-box">
              <div className="estimate-title">{t('estimateTitle')}</div>
              <div className="estimate-grid">
                <div>
                  <span>{t('estimateTime')}</span>
                  <b>{t('estimateTimeValue', { low: estimate.timeLowMin, high: estimate.timeHighMin })}</b>
                </div>
                <div>
                  <span>{t('estimateCost')}</span>
                  <b>{t('estimateCostValue', { low: estimate.costLowUsd, high: estimate.costHighUsd })}</b>
                </div>
                <div>
                  <span>{t('estimateProbeCalls')}</span>
                  <b>{t('estimateProbeCallsValue', { calls: estimate.probeCalls })}</b>
                </div>
              </div>
              <p className="estimate-disclaimer">{t('estimateDisclaimer')}</p>
            </div>

            <div className="wizard-nav">
              <button type="button" className="ghost-btn" onClick={() => setStep(2)}>
                {t('back')}
              </button>
              <button type="button" className="run-btn" onClick={start} disabled={pending}>
                {pending ? t('starting') : t('run')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="note" style={{ color: 'var(--ds-error, red)' }}>
            {error}
          </p>
        )}
      </div>

      <div className="note">{t('note')}</div>
    </section>
  )
}
