'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { GscConnectError } from '@/lib/gsc/oauth'
import { useEffect, useState } from 'react'
import { estimateRun } from '@/lib/analysis/estimate'
import { MARKETS, findMarket, guessMarketCode, type MarketCode } from '@/lib/markets'
import { isValidCategory, isValidKeyword } from '@/lib/repositories/validators'
import { PreflightPanel, type PreflightPanelLabels } from './PreflightPanel'
import type { Dimension, PreflightItem } from '@/lib/runs/preflight'

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
  targetKeywords?: string[]
}

// 站点预读（SP-A §3.2）：候选只作为可点选的芯片，品类框不自动填，必须用户确认。
// forDomain：这份预读对应的域名；渲染时只展示与当前输入一致的预读（避免在 effect 里同步清空 state）。
interface SitePreviewState {
  forDomain: string
  loading: boolean
  candidates: string[]
  facts: { title: string | null; h1: string | null; metaDescription: string | null } | null
}
const EMPTY_PREVIEW: SitePreviewState = { forDomain: '', loading: false, candidates: [], facts: null }
// 域名实时格式验证（模块级常量：effect 依赖里无需出现）。
const DOMAIN_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/
const SITE_PREVIEW_DEBOUNCE_MS = 500
const PREFLIGHT_REASONS = [
  'category_invalid', 'market_invalid', 'gsc_not_configured', 'gsc_not_connected', 'gsc_site_missing', 'gsc_token_invalid', 'gsc_unreachable',
  'dfs_no_credentials', 'dfs_auth_failed', 'dfs_unreachable', 'psi_no_key', 'render_not_configured', 'ai_not_configured', 'ai_memory_only',
] as const
const PREFLIGHT_DIMENSIONS: Dimension[] = [
  'eeat', 'content', 'structured_data', 'site_type', 'rich_results', 'rankings', 'keywords', 'technical', 'geo', 'competitors', 'backlinks',
]
const MAX_TARGET_KEYWORDS = 20

const keywordLines = (text: string) => text.split('\n').map((k) => k.trim()).filter(Boolean)

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
  gscConnectError = null,
  gscRedirectOrigin = null,
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
  // GSC 授权往返失败时由页面从 ?gsc_error= 白名单解析后传入；回调 origin 来自服务端 env。
  gscConnectError?: GscConnectError | null
  gscRedirectOrigin?: string | null
}) {
  const t = useTranslations('screen1')
  const tg = useTranslations('gscConnect')
  const tp = useTranslations('preflight')
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null)
  const [domain, setDomain] = useState(project?.domain ?? '')
  // 品类：旧下拉值等不合规的历史数据不回显（迫使用户确认一次真实品类）。
  const [category, setCategory] = useState(() => (project?.industry && isValidCategory(project.industry) ? project.industry : ''))
  const [market, setMarket] = useState<MarketCode>(() => findMarket(project?.market ?? '')?.code ?? guessMarketCode(project?.domain ?? ''))
  const [marketTouched, setMarketTouched] = useState(Boolean(project && findMarket(project.market)))
  const [targetKeywordsText, setTargetKeywordsText] = useState((project?.targetKeywords ?? []).join('\n'))
  const [previewState, setPreview] = useState<SitePreviewState>(EMPTY_PREVIEW)
  const [competitors, setCompetitors] = useState((project?.competitors ?? []).join(', '))
  const [engines, setEngines] = useState<Record<string, boolean>>(() => enginesFromSavedModels(savedEngines))
  const [activeGscConnected, setActiveGscConnected] = useState(gscConnected)
  const [activeGscSiteUrl, setActiveGscSiteUrl] = useState<string | null>(gscSiteUrl)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // 运行前预检（SP-A §4.5）：进入第 2 步时对当前项目请求一次；按项目 id 标记，换项目后旧结果不显示。
  const [preflight, setPreflight] = useState<{ forProject: string; items: PreflightItem[] | null } | null>(null)

  useEffect(() => {
    if (step !== 2 || !projectId) return
    const controller = new AbortController()
    fetch(`/api/projects/${projectId}/preflight`, { method: 'POST', signal: controller.signal })
      .then(async (res) => {
        const body = res.ok ? ((await res.json()) as { items?: unknown }) : null
        setPreflight({ forProject: projectId, items: Array.isArray(body?.items) ? (body.items as PreflightItem[]) : null })
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreflight({ forProject: projectId, items: null })
      })
    return () => controller.abort()
  }, [step, projectId])

  const selectedEngines = ENGINES.filter((name) => engines[name])
  const estimate = estimateRun({
    engineCount: selectedEngines.length,
    promptCount: PROMPT_COUNT,
    n: PROBE_N,
    gsc: Boolean(activeGscConnected && activeGscSiteUrl),
    render: true,
  })

  const isDomainValid = domain.trim() !== '' && DOMAIN_REGEX.test(domain.trim())
  const preview = step === 1 && previewState.forDomain === domain.trim() ? previewState : EMPTY_PREVIEW

  const categoryValid = isValidCategory(category)
  const targetKeywords = keywordLines(targetKeywordsText)
  const keywordsValid = targetKeywords.length <= MAX_TARGET_KEYWORDS && targetKeywords.every(isValidKeyword)
  const step1Ready = categoryValid && keywordsValid

  function onDomainChange(v: string) {
    setDomain(v)
    // 用户手动选过市场就不再被域名推断覆盖。
    if (v.trim() && !marketTouched) setMarket(guessMarketCode(v.trim()))
  }

  // 域名停止输入后读取首页，给出品类候选（失败只是没有候选，不阻断手填）。
  useEffect(() => {
    const target = domain.trim()
    if (step !== 1 || !DOMAIN_REGEX.test(target)) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setPreview({ ...EMPTY_PREVIEW, forDomain: target, loading: true })
      try {
        const res = await fetch('/api/site-preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ domain: target }),
          signal: controller.signal,
        })
        const body = (await res.json().catch(() => ({}))) as Partial<SitePreviewState> & { candidates?: unknown }
        if (controller.signal.aborted) return
        setPreview({
          forDomain: target,
          loading: false,
          candidates: Array.isArray(body.candidates) ? body.candidates.filter((c): c is string => typeof c === 'string') : [],
          facts: body.facts ?? null,
        })
      } catch {
        if (!controller.signal.aborted) setPreview({ ...EMPTY_PREVIEW, forDomain: target })
      }
    }, SITE_PREVIEW_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [domain, step])

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  async function toErrorMessage(res: Response): Promise<{ code: string | undefined; message: string }> {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    switch (body.error) {
      case 'invalid_domain':
      case 'domain_required':
        return { code: body.error, message: t('errorInvalidDomain') }
      case 'dispatch_failed':
        return { code: body.error, message: t('errorDispatchFailed') }
      // SP-A §3.5 建 run 闸门：品类/市场无效 → 回到第 1 步补充。
      case 'category_required':
      case 'invalid_category':
        return { code: body.error, message: t('errorCategoryRequired') }
      case 'market_required':
      case 'invalid_market':
        return { code: body.error, message: t('errorMarketRequired') }
      case 'invalid_keywords':
        return { code: body.error, message: t('targetKeywordsInvalid') }
      default:
        return { code: body.error, message: t('submitError') }
    }
  }

  const preflightView = preflight && preflight.forProject === projectId ? preflight : null
  const listSep = locale === 'zh' ? '、' : ', '
  const preflightLabels: PreflightPanelLabels = {
    title: tp('title'),
    loading: tp('loading'),
    failed: tp('failed'),
    allReady: tp('allReady'),
    unavailableSummary: (dims) => tp('unavailableSummary', { dims: dims.join(listSep) }),
    degradedSummary: (dims) => tp('degradedSummary', { dims: dims.join(listSep) }),
    balance: (balance) => tp('balance', { balance: balance.toFixed(2) }),
    states: { ready: tp('state.ready'), degraded: tp('state.degraded'), unavailable: tp('state.unavailable') },
    sources: Object.fromEntries(['project', 'gsc', 'dataforseo', 'psi', 'render', 'ai_probe'].map((k) => [k, tp(`source.${k}`)])),
    reasons: Object.fromEntries(PREFLIGHT_REASONS.map((k) => [k, tp(`reason.${k}`)])),
    fixes: { reauth_gsc: tp('fix.reauth_gsc'), select_gsc_site: tp('fix.select_gsc_site'), configure_key: tp('fix.configure_key'), edit_project: tp('fix.edit_project') },
    dimensions: Object.fromEntries(PREFLIGHT_DIMENSIONS.map((d) => [d, tp(`dimension.${d}`)])) as Record<Dimension, string>,
  }
  // 修复入口按 locale / 当前项目拼好；改项目信息回第 1 步处理，不给链接。
  function preflightFixHref(item: PreflightItem): string | null {
    if (!item.fix || !projectId) return null
    switch (item.fix.action) {
      case 'reauth_gsc':
        return gscAppConfigured
          ? `/api/gsc/auth?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(`/${locale}/new?step=connect&projectId=${projectId}`)}`
          : null
      case 'select_gsc_site':
        return `/${locale}/projects/${projectId}#gsc`
      case 'configure_key':
        return `/${locale}/settings`
      default:
        return null
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
    if (typeof response.industry === 'string' && isValidCategory(response.industry)) setCategory(response.industry)
    const savedMarket = findMarket(response.market ?? '')
    if (savedMarket) {
      setMarket(savedMarket.code)
      setMarketTouched(true)
    }
    if (Array.isArray(response.competitors)) setCompetitors(response.competitors.join(', '))
    if (Array.isArray(response.targetKeywords)) setTargetKeywordsText(response.targetKeywords.join('\n'))
  }

  async function upsertProject(): Promise<string | null> {
    const shared = {
      domain,
      industry: category.trim(),
      market,
      competitors,
      targetKeywords,
    }
    const res = projectId
      ? await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(shared) })
      : await fetch('/api/projects', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ ...shared, gscConnected: activeGscConnected, defaultModels: selectedEngines }),
        })
    if (!res.ok) {
      setError((await toErrorMessage(res)).message)
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
    if (!step1Ready) return
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
      const { code, message } = await toErrorMessage(runRes)
      setError(message)
      if (code === 'category_required' || code === 'market_required') setStep(1)
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

              <div className="field">
                <label htmlFor="wiz-category">{t('categoryLabel')}</label>
                {preview.candidates.length > 0 && (
                  <div className="chips" role="group" aria-label={t('categoryCandidates')}>
                    {preview.candidates.map((c) => (
                      <button key={c} type="button" className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  id="wiz-category"
                  className="txt"
                  placeholder={t('categoryPlaceholder')}
                  value={category}
                  aria-invalid={category.trim() !== '' && !categoryValid}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <p className="wizard-hint">{preview.loading ? t('sitePreviewLoading') : t('categoryHint')}</p>
                {category.trim() !== '' && !categoryValid && (
                  <p role="alert" className="wizard-hint" style={{ color: 'var(--gap)' }}>{t('categoryInvalid')}</p>
                )}
                {preview.facts && (preview.facts.title || preview.facts.h1 || preview.facts.metaDescription) && (
                  <details className="wizard-hint">
                    <summary>{t('siteFactsTitle')}</summary>
                    <ul>
                      {[preview.facts.title, preview.facts.h1, preview.facts.metaDescription].filter(Boolean).map((v) => (
                        <li key={v as string}>{v}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="field">
                <label htmlFor="wiz-market">{t('marketLabel')}</label>
                <select
                  id="wiz-market"
                  className="sel"
                  value={market}
                  onChange={(e) => {
                    setMarket(e.target.value as MarketCode)
                    setMarketTouched(true)
                  }}
                >
                  {MARKETS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {locale === 'zh' ? m.labelZh : m.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="wiz-target-keywords">{t('targetKeywordsLabel')}</label>
                <textarea
                  id="wiz-target-keywords"
                  className="txt"
                  rows={3}
                  placeholder={t('targetKeywordsPlaceholder')}
                  value={targetKeywordsText}
                  aria-invalid={!keywordsValid}
                  onChange={(e) => setTargetKeywordsText(e.target.value)}
                />
                <p className="wizard-hint">{t('targetKeywordsHint')}</p>
                {!keywordsValid && (
                  <p role="alert" className="wizard-hint" style={{ color: 'var(--gap)' }}>{t('targetKeywordsInvalid')}</p>
                )}
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
                <button type="button" className="run-btn" onClick={goToConnect} disabled={pending || !step1Ready}>
                  {pending ? t('starting') : t('next')}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-panel">
              <h2 className="wizard-h">{t('stepConnect')}</h2>
              <p className="wizard-sub">{t('step2Sub')}</p>

              {projectId && (
                <PreflightPanel
                  status={preflightView ? (preflightView.items ? 'done' : 'error') : 'loading'}
                  items={preflightView?.items ?? null}
                  labels={preflightLabels}
                  fixHref={preflightFixHref}
                />
              )}

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
              {gscConnectError && !activeGscConnected && (
                <p role="alert" className="note" style={{ color: 'var(--ds-error, red)' }}>
                  {tg(`error.${gscConnectError}`, { expected: gscRedirectOrigin ?? 'GOOGLE_OAUTH_REDIRECT_URI' })}
                </p>
              )}

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
                  <dd>{category.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>{t('scopeMarket')}</dt>
                  <dd>{(() => { const m = findMarket(market); return m ? (locale === 'zh' ? m.labelZh : m.labelEn) : '—' })()}</dd>
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
