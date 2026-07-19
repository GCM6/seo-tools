'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { guessMarketLanguage } from '@/lib/analysis/locale-guess'
import { estimateRun } from '@/lib/analysis/estimate'

// 探测引擎是专有名词（品牌名），不翻译。ChatGPT/Perplexity/Gemini/DeepSeek 默认开，都走开发者
// API 采样（代理指标口径）。Google AI Overviews 默认关：它是 DataForSEO 实测曝光口径（消费者
// 搜索 surface 真实抓取，非探针 provider 代理指标），只有 DataForSEO 凭据已配置（dataforseoConfigured）
// 才可勾选；未配置时仍渲染禁用态（见下方 chips 渲染的 comingSoon 分支）。
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

// 引擎 Logo / Emoji 字典
const ENGINE_ICONS: Record<string, string> = {
  ChatGPT: '🟢',
  Perplexity: '🔵',
  Gemini: '✨',
  DeepSeek: '🐋',
  'Google AI Overviews': '🔍',
}

export interface WizardProject {
  id: string
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
}

interface ProjectSettingsSnapshot {
  gscConnected?: boolean
  gscSiteUrl?: string | null
  defaultModels?: string[]
}

interface ProjectUpsertResponse extends Partial<WizardProject> {
  id: string
  settings?: ProjectSettingsSnapshot | null
  reused?: boolean
}

function enginesFromSavedModels(savedEngines: string[] | null | undefined): Record<string, boolean> {
  if (!savedEngines?.length) return { ...DEFAULT_ENGINES }
  const saved = new Set(savedEngines)
  return Object.fromEntries(ENGINES.map((name) => [name, saved.has(name)])) as Record<string, boolean>
}

export function NewAnalysisForm({
  locale,
  project = null,
  gscConnected = false,
  gscSiteUrl = null,
  gscAppConfigured = true,
  aiProbeConfigured = false,
  dataforseoConfigured = false,
  initialStep = 1,
  savedEngines = null,
}: {
  locale: string
  project?: WizardProject | null
  gscConnected?: boolean
  gscSiteUrl?: string | null
  gscAppConfigured?: boolean
  aiProbeConfigured?: boolean
  // Google AI Overviews 的实测曝光口径依赖 DataForSEO BYOK 凭据；已配置时该 chip 才可勾选
  // （见下方 chips 渲染的 comingSoon 分支——判断条件从"恒真"改为"未配置时才禁用"）。
  dataforseoConfigured?: boolean
  initialStep?: 1 | 2 | 3
  savedEngines?: string[] | null
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
  const [engines, setEngines] = useState<Record<string, boolean>>(() => enginesFromSavedModels(savedEngines))
  const [activeGscConnected, setActiveGscConnected] = useState(gscConnected)
  const [activeGscSiteUrl, setActiveGscSiteUrl] = useState<string | null>(gscSiteUrl)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const selectedEngines = ENGINES.filter((name) => engines[name])
  const estimate = estimateRun({
    engineCount: selectedEngines.length,
    promptCount: PROMPT_COUNT,
    n: PROBE_N,
    gsc: Boolean(activeGscConnected && activeGscSiteUrl),
    render: true,
  })

  // 域名实时格式验证
  const DOMAIN_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/
  const isDomainValid = domain.trim() !== '' && DOMAIN_REGEX.test(domain.trim())

  function onDomainChange(v: string) {
    setDomain(v)
    if (v.trim()) setMarketIndex(guessMarketLanguage(v).marketIndex)
  }

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

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

  function syncExistingProject(response: ProjectUpsertResponse) {
    // 复用同域名项目时，恢复已有项目的状态，而不是用本次草稿的空值覆盖 UI。
    // GSC/OAuth 资源、默认引擎和项目字段都随该项目长期保存。
    if (!response.reused) return
    const settings = response.settings
    setActiveGscConnected(settings?.gscConnected === true)
    setActiveGscSiteUrl(settings?.gscSiteUrl ?? null)
    setEngines(enginesFromSavedModels(settings?.defaultModels))
    if (response.domain) setDomain(response.domain)
    if (typeof response.industry === 'string') {
      const index = industryOptions.indexOf(response.industry)
      if (index >= 0) setIndustryIndex(index)
    }
    if (typeof response.market === 'string') {
      const index = marketOptions.indexOf(response.market)
      if (index >= 0) setMarketIndex(index)
    }
    if (Array.isArray(response.competitors)) setCompetitors(response.competitors.join(', '))
  }

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
          body: JSON.stringify({ ...shared, gscConnected: activeGscConnected, defaultModels: selectedEngines }),
        })
    if (!res.ok) {
      setError(await toErrorMessage(res))
      return null
    }
    const p = (await res.json()) as ProjectUpsertResponse
    setProjectId(p.id)
    syncExistingProject(p)
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
    if (!gscAppConfigured) return
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
  const gscReady = Boolean(activeGscConnected && activeGscSiteUrl)
  const dataSummary = gscReady ? t('briefGscOn') : t('briefGscOff')

  return (
    <section className="screen show">
      <p className="intro">{t('intro')}</p>

      {/* GSC 是项目级而非全局凭据：在建项目尚未生成前只说明收益；第 2 步创建项目后才给出授权入口。 */}
      {!gscReady && (
        <aside
          className="mb-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary-muted/45 px-4 py-3 text-sm"
          aria-label={t('gscRecommendationTitle')}
        >
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true">
            +
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{t('gscRecommendationTitle')}</p>
            <p className="mt-0.5 leading-relaxed text-body">{t('gscRecommendationDetail')}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-primary/20 bg-surface-1 px-2 py-0.5 text-xs font-medium text-primary">
            {t('gscRecommendationScope')}
          </span>
        </aside>
      )}

      <ol className="wizard-steps" aria-label={t('stepConfirm')}>
        {steps.map(([n, label]) => (
          <li key={n} className={`wizard-step${step === n ? ' current' : step > n ? ' done' : ''}`}>
            <span className="ws-n">{n}</span>
            <span className="ws-label">{label}</span>
          </li>
        ))}
      </ol>

      {/* 两栏响应式向导布局 */}
      <div className="new-analysis-layout" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'start' }}>

        {/* 左侧：表单配置框 */}
        <div className="card wizard-body flex-1 animate-fade-in" key={step} style={{ flex: '1 1 500px', padding: '24px' }}>
          {step === 1 && (
            <div className="wizard-panel">
              <h2 className="wizard-h">{t('stepSite')}</h2>
              <p className="wizard-sub">{t('step1Sub')}</p>

              <div className="field">
                <label htmlFor="wiz-url">{t('urlLabel')}</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    id="wiz-url"
                    className="url-in"
                    placeholder={t('urlPlaceholder')}
                    aria-label={t('urlLabel')}
                    value={domain}
                    onChange={(e) => onDomainChange(e.target.value)}
                    style={{ paddingRight: '90px' }}
                  />
                  {domain.trim() && (
                    <span
                      style={{
                        position: 'absolute',
                        right: '16px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: isDomainValid ? 'var(--good)' : 'var(--gap)'
                      }}
                    >
                      {isDomainValid ? '✓ 格式正确' : '✗ 格式无效'}
                    </span>
                  )}
                </div>
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

              <div className={`connect-card${gscReady ? ' connected' : ''}`}>
                <div className="cc-body">
                  <div className="cc-title">{t('gscTitle')}</div>
                  <div className="cc-desc">{gscReady ? t('gscDesc') : activeGscConnected ? t('gscPropertyRequired') : t('gscImpact')}</div>
                </div>
                {gscReady ? (
                  <span className="cc-state ok">{t('stateConnected')}</span>
                ) : activeGscConnected && projectId ? (
                  <a className="cc-action" href={`/${locale}/projects/${projectId}#gsc`}>
                    {t('gscSelectPropertyCta')}
                  </a>
                ) : (
                  <button type="button" className="cc-action" onClick={connectGsc} disabled={!gscAppConfigured}>
                    {t('gscConnectCta')}
                  </button>
                )}
              </div>
              {!activeGscConnected && !gscAppConfigured && <p className="wizard-hint">{t('gscNotConfiguredHint')}</p>}

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
                  {ENGINES.map((name) => {
                    // Google AI Overviews：DataForSEO 实测曝光口径，不接任何探针 provider（见
                    // lib/probes/run-probes.ts:8-9 注释）。未配置 DataForSEO 凭据时禁用态展示，
                    // 已配置后与其余引擎一样可勾选（沿用 aiProbeConfigured 的配置检测模式）。
                    const comingSoon = name === 'Google AI Overviews' && !dataforseoConfigured
                    return (
                      <label
                        key={name}
                        className={`chip${engines[name] ? ' on' : ''}${comingSoon ? ' disabled' : ''}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: comingSoon ? 'not-allowed' : 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={engines[name]}
                          aria-label={name}
                          disabled={comingSoon}
                          onChange={() => toggleEngine(name)}
                        />
                        <span>
                          {ENGINE_ICONS[name]} {name}
                          {comingSoon ? <em className="chip-note"> · {t('engineNeedsDataforseo')}</em> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <p className="wizard-hint">{t('skipHint')}</p>

              <div className="wizard-nav">
                <button type="button" className="ghost" onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px' }}>
                  {t('back')}
                </button>
                <button type="button" className="run-btn" onClick={() => setStep(3)} style={{ marginTop: 0 }}>
                  {t('next')}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-panel">
              <h2 className="wizard-h">{t('stepConfirm')}</h2>
              <p className="wizard-sub">{t('step3Sub')}</p>

              <dl className="scope-grid" style={{ marginBottom: '24px' }}>
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

              <div className="wizard-nav">
                <button type="button" className="ghost" onClick={() => setStep(2)} style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px' }}>
                  {t('back')}
                </button>
                <button type="button" className="run-btn" onClick={start} disabled={pending} style={{ marginTop: 0 }}>
                  {pending ? t('starting') : t('run')}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="note" style={{ color: 'var(--ds-error, red)', marginTop: '16px' }}>
              {error}
            </p>
          )}
        </div>

        {/* 右侧：实时预估控制侧栏 */}
        <div className="card wizard-sidebar p-5" style={{ flex: '0 0 320px', width: '320px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ds-ink)', margin: '0 0 4px 0', borderBottom: '1px solid var(--ds-border-subtle)', paddingBottom: '8px' }}>
            {locale === 'zh' ? '诊断预算与配置预估' : 'Budget & Config Estimate'}
          </h3>

          <div className="estimate-box" style={{ margin: 0, padding: 0, border: 0, background: 'transparent' }}>
            <div className="estimate-title" style={{ fontSize: '12px', color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
              {t('estimateTitle')}
            </div>

            <div className="estimate-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', borderBottom: '1px dashed var(--ds-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--ds-body)' }}>{t('estimateTime')}</span>
                <b style={{ fontSize: '13px', color: 'var(--ds-ink)', fontWeight: 600 }}>
                  {t('estimateTimeValue', { low: estimate.timeLowMin, high: estimate.timeHighMin })}
                </b>
              </div>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', borderBottom: '1px dashed var(--ds-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--ds-body)' }}>{t('estimateCost')}</span>
                <b style={{ fontSize: '13px', color: 'var(--ds-ink)', fontWeight: 600 }}>
                  {t('estimateCostValue', { low: estimate.costLowUsd, high: estimate.costHighUsd })}
                </b>
              </div>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', borderBottom: '1px dashed var(--ds-border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--ds-body)' }}>{t('estimateProbeCalls')}</span>
                <b style={{ fontSize: '13px', color: 'var(--ds-ink)', fontWeight: 600 }}>
                  {t('estimateProbeCallsValue', { calls: estimate.probeCalls })}
                </b>
              </div>
            </div>

            <p className="estimate-disclaimer" style={{ fontSize: '11px', color: 'var(--ds-muted)', lineHeight: 1.5, margin: 0 }}>
              {/* 这里在 zh.json 中翻译成了 “预估（非实测）”，为确保单元测试顺利匹配，我们将该字样在 sidebar 中展示 */}
              {t('estimateDisclaimer')}
            </p>
          </div>
        </div>

      </div>

      <div className="note" style={{ marginTop: '24px' }}>{t('note')}</div>
    </section>
  )
}
