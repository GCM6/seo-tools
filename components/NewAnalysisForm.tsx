'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { GscConnectError } from '@/lib/gsc/oauth'
import { useEffect, useId, useRef, useState } from 'react'
import { estimateRun } from '@/lib/analysis/estimate'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { MARKETS, findMarket, guessMarketCode, type MarketCode } from '@/lib/markets'
import { isValidCategory, isValidKeyword } from '@/lib/repositories/validators'
import { displayDomain } from '@/lib/runs/workspace'
import { Button, ButtonLink } from './Button'
import { Notice } from './Notice'
import { StatusText } from './StatusText'
import { PreflightPanel, type PreflightPanelLabels } from './PreflightPanel'
import type { Dimension, PreflightItem } from '@/lib/runs/preflight'

// 探测引擎是专有名词（品牌名），不翻译。ChatGPT/Perplexity/Gemini/DeepSeek 默认开，都走开发者
// API 采样（代理指标口径）。Google AI Overviews 默认关：它是 DataForSEO 实测曝光口径（消费者
// 搜索 surface 真实抓取，非探针 provider 代理指标），只有 DataForSEO 凭据已配置（dataforseoConfigured）
// 才可勾选；未配置时仍渲染禁用态并说明原因。
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
const STEP_TOTAL = 3

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
// 网址是否合法与服务端用同一个函数判断（POST /api/projects 也调 normalizeDomain），提示和真实校验不会打架。
const isDomainOk = (v: string) => normalizeDomain(v) !== null
const SITE_PREVIEW_DEBOUNCE_MS = 500
const PREFLIGHT_REASONS = [
  'category_invalid', 'market_invalid', 'gsc_not_configured', 'gsc_not_connected', 'gsc_site_missing', 'gsc_token_invalid', 'gsc_unreachable',
  'dfs_no_credentials', 'dfs_auth_failed', 'dfs_unreachable', 'psi_no_key', 'render_not_configured', 'ai_not_configured', 'ai_memory_only',
] as const
const PREFLIGHT_DIMENSIONS: Dimension[] = [
  'eeat', 'content', 'structured_data', 'site_type', 'rich_results', 'rankings', 'keywords', 'technical', 'geo', 'competitors', 'backlinks',
]
const MAX_TARGET_KEYWORDS = 20
// 预检数据源 → 设置页面板锚点（SettingsClient 的 id=source-<key>）；GSC 是项目级授权，不在设置页。
const SETTINGS_ANCHOR: Record<string, string> = { ai_probe: 'aiProbe', dataforseo: 'dataforseo', psi: 'psi', render: 'render' }

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

// 新建分析向导（ux-blueprint §4「诊断一个网站」）：三步——你的网站 → 连接数据 → 确认与预估。
// 旧的迷你步骤条改成面板标题上方的「第 n 步，共 3 步」；右侧一栏是预估（非实测）。
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
  // Google AI Overviews 的实测曝光口径依赖 DataForSEO BYOK 凭据；已配置时该引擎才可勾选。
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
  const uid = useId()

  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null)
  const [domain, setDomain] = useState(project?.domain ?? '')
  // 网址格式提示只在离开输入框之后出现，避免边打字边报错。
  const [domainTouched, setDomainTouched] = useState(false)
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

  // 换步骤后把焦点移到新步骤的标题：原来那颗「下一步」已经卸载，焦点不能掉回页面顶部。首次渲染不抢焦点。
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepRendered = useRef(false)
  useEffect(() => {
    if (!stepRendered.current) {
      stepRendered.current = true
      return
    }
    headingRef.current?.focus()
  }, [step])

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

  const showDomainError = domainTouched && domain.trim() !== '' && !isDomainOk(domain.trim())
  const preview = step === 1 && previewState.forDomain === domain.trim() ? previewState : EMPTY_PREVIEW

  const categoryValid = isValidCategory(category)
  const showCategoryError = category.trim() !== '' && !categoryValid
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
    if (step !== 1 || !isDomainOk(target)) return
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
  const preflightDone = Boolean(preflightView?.items)
  const listSep = locale === 'zh' ? '、' : ', '
  const preflightLabels: PreflightPanelLabels = {
    title: tp('title'),
    connectGsc: t('gscConnectCta'),
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
        return `/${locale}/settings${SETTINGS_ANCHOR[item.source] ? `#source-${SETTINGS_ANCHOR[item.source]}` : ''}`
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

  const stepTitle = step === 1 ? t('stepSite') : step === 2 ? t('stepConnect') : t('stepConfirm')
  const stepSub = step === 1 ? t('step1Sub') : step === 2 ? t('step2Sub') : t('step3Sub')
  const gscReady = Boolean(activeGscConnected && activeGscSiteUrl)
  const dataSummary = gscReady ? t('briefGscOn') : t('briefGscOff')
  const marketEntry = findMarket(market)
  const factLines = preview.facts ? [preview.facts.title, preview.facts.h1, preview.facts.metaDescription].filter((v): v is string => Boolean(v)) : []

  return (
    <div className="ui-wizard">
      <section className="ui-panel ui-wizard__main" aria-labelledby={`${uid}-step`}>
        <div className="ui-panel__head">
          <div className="ui-wizard__heading">
            <p className="ui-wizard__count">{t('stepOf', { step, total: STEP_TOTAL })}</p>
            <h2 className="ui-panel__title" id={`${uid}-step`} ref={headingRef} tabIndex={-1}>
              {stepTitle}
            </h2>
          </div>
        </div>

        <div className="ui-panel__body ui-wizard__body">
          <p className="ui-hint">{stepSub}</p>

          {step === 1 ? (
            <>
              {/* GSC 是项目级而非全局凭据：在建项目生成前只说明收益，第 2 步创建项目后才给出授权入口。 */}
              {!gscReady ? <Notice title={t('gscRecommendationTitle')}>{t('gscRecommendationDetail')}</Notice> : null}

              <div className="ui-field">
                <label className="ui-label" htmlFor={`${uid}-url`}>
                  {t('urlLabel')}
                </label>
                <input
                  id={`${uid}-url`}
                  className="ui-input"
                  inputMode="url"
                  autoComplete="url"
                  placeholder={t('urlPlaceholder')}
                  value={domain}
                  aria-invalid={showDomainError || undefined}
                  aria-describedby={showDomainError ? `${uid}-url-error` : undefined}
                  onChange={(e) => onDomainChange(e.target.value)}
                  onBlur={() => setDomainTouched(true)}
                />
                {showDomainError ? (
                  <p className="ui-error" id={`${uid}-url-error`}>
                    {t('urlInvalid')}
                  </p>
                ) : null}
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor={`${uid}-category`}>
                  {t('categoryLabel')}
                </label>
                <input
                  id={`${uid}-category`}
                  className="ui-input"
                  placeholder={t('categoryPlaceholder')}
                  value={category}
                  aria-invalid={showCategoryError || undefined}
                  aria-describedby={`${uid}-category-hint${showCategoryError ? ` ${uid}-category-error` : ''}`}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <p className="ui-hint" id={`${uid}-category-hint`}>
                  {preview.loading ? t('sitePreviewLoading') : t('categoryHint')}
                </p>
                {showCategoryError ? (
                  <p className="ui-error" id={`${uid}-category-error`}>
                    {t('categoryInvalid')}
                  </p>
                ) : null}
                {/* 候选放在说明之后：首页读完才出现，不把输入框和它的说明挤开。 */}
                {preview.candidates.length > 0 ? (
                  <div className="ui-field__extra">
                    <p className="ui-hint" id={`${uid}-candidates`}>
                      {t('categoryCandidates')}
                    </p>
                    <div className="ui-chips" role="group" aria-labelledby={`${uid}-candidates`}>
                      {preview.candidates.map((c) => (
                        <button key={c} type="button" className="ui-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {factLines.length > 0 ? (
                  <details className="ui-disclosure">
                    <summary>{t('siteFactsTitle')}</summary>
                    <ul className="ui-kv__list">
                      {factLines.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              <div className="ui-field ui-field--narrow">
                <label className="ui-label" htmlFor={`${uid}-market`}>
                  {t('marketLabel')}
                </label>
                <select
                  id={`${uid}-market`}
                  className="ui-select"
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

              <div className="ui-field">
                <label className="ui-label" htmlFor={`${uid}-keywords`}>
                  {t('targetKeywordsLabel')}
                </label>
                <textarea
                  id={`${uid}-keywords`}
                  className="ui-textarea"
                  rows={3}
                  placeholder={t('targetKeywordsPlaceholder')}
                  value={targetKeywordsText}
                  aria-invalid={!keywordsValid || undefined}
                  aria-describedby={`${uid}-keywords-hint${keywordsValid ? '' : ` ${uid}-keywords-error`}`}
                  onChange={(e) => setTargetKeywordsText(e.target.value)}
                />
                <p className="ui-hint" id={`${uid}-keywords-hint`}>
                  {t('targetKeywordsHint')}
                </p>
                {!keywordsValid ? (
                  <p className="ui-error" id={`${uid}-keywords-error`}>
                    {t('targetKeywordsInvalid')}
                  </p>
                ) : null}
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor={`${uid}-competitors`}>
                  {t('competitorsOptional')}
                </label>
                <input
                  id={`${uid}-competitors`}
                  className="ui-input"
                  placeholder={t('competitorsPlaceholder')}
                  value={competitors}
                  aria-describedby={`${uid}-competitors-hint`}
                  onChange={(e) => setCompetitors(e.target.value)}
                />
                <p className="ui-hint" id={`${uid}-competitors-hint`}>
                  {t('competitorsOptionalHint')}
                </p>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {projectId ? (
                <PreflightPanel
                  status={preflightView ? (preflightView.items ? 'done' : 'error') : 'loading'}
                  items={preflightView?.items ?? null}
                  labels={preflightLabels}
                  fixHref={preflightFixHref}
                />
              ) : null}

              {/* 预检成功时「运行前检查」表已经覆盖每个数据源的状态和修复入口（连接 GSC / 选择资源 / 去配置），
                  下面两行只在预检加载中或失败时作兜底，避免同一个数据源出现两次（第 5 批用户拍板）。 */}
              {preflightDone ? null : (
                <>
                  <div className="ui-group">
                    <h3 className="ui-subhead" id={`${uid}-sources`}>
                      {t('dataSourceLabel')}
                    </h3>
                    <ul className="ui-sources" aria-labelledby={`${uid}-sources`}>
                      <li className="ui-source">
                        <div className="ui-source__main">
                          <p className="ui-source__name">{t('gscTitle')}</p>
                          <p className="ui-hint">{gscReady ? t('gscDesc') : activeGscConnected ? t('gscPropertyRequired') : t('gscImpact')}</p>
                        </div>
                        {gscReady ? (
                          <StatusText status="accepted" label={t('stateConnected')} />
                        ) : activeGscConnected && projectId ? (
                          <ButtonLink href={`/${locale}/projects/${projectId}#gsc`} size="sm">
                            {t('gscSelectPropertyCta')}
                          </ButtonLink>
                        ) : (
                          <Button size="sm" onClick={connectGsc} disabled={!gscAppConfigured}>
                            {t('gscConnectCta')}
                          </Button>
                        )}
                      </li>
                      <li className="ui-source">
                        <div className="ui-source__main">
                          <p className="ui-source__name">{t('aiProbeTitle')}</p>
                          <p className="ui-hint">{aiProbeConfigured ? t('aiProbeDesc') : t('aiProbeImpact')}</p>
                        </div>
                        {aiProbeConfigured ? (
                          <StatusText status="accepted" label={t('stateConfigured')} />
                        ) : (
                          <ButtonLink href={`/${locale}/settings#source-aiProbe`} size="sm">
                            {t('aiProbeCta')}
                          </ButtonLink>
                        )}
                      </li>
                    </ul>
                  </div>
                  {!activeGscConnected && !gscAppConfigured ? <p className="ui-hint">{t('gscNotConfiguredHint')}</p> : null}
                </>
              )}
              {gscConnectError && !activeGscConnected ? (
                <Notice tone="error">{tg(`error.${gscConnectError}`, { expected: gscRedirectOrigin ?? 'GOOGLE_OAUTH_REDIRECT_URI' })}</Notice>
              ) : null}

              <fieldset className="ui-fieldset">
                <legend className="ui-subhead">{t('enginesLabel')}</legend>
                <p className="ui-hint">{t('enginesHint')}</p>
                <div className="ui-checks">
                  {ENGINES.map((name) => {
                    // Google AI Overviews：DataForSEO 实测曝光口径，不接任何探针 provider（见
                    // lib/probes/run-probes.ts 注释）。未配置 DataForSEO 凭据时禁用并说明原因。
                    const needsDataforseo = name === 'Google AI Overviews' && !dataforseoConfigured
                    return (
                      <label key={name} className="ui-checkline">
                        <input
                          type="checkbox"
                          className="ui-check"
                          checked={engines[name]}
                          aria-label={name}
                          aria-describedby={needsDataforseo ? `${uid}-aio-note` : undefined}
                          disabled={needsDataforseo}
                          onChange={() => toggleEngine(name)}
                        />
                        <span>{name}</span>
                        {needsDataforseo ? (
                          <span className="ui-hint" id={`${uid}-aio-note`}>
                            {t('engineNeedsDataforseo')}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <p className="ui-hint">{t('skipHint')}</p>
            </>
          ) : null}

          {step === 3 ? (
            <dl className="ui-kv">
              <dt>{t('scopeDomain')}</dt>
              <dd className="ui-mono">{domain.trim() ? displayDomain(domain.trim()) : '—'}</dd>
              <dt>{t('scopeIndustry')}</dt>
              <dd>{category.trim() || '—'}</dd>
              <dt>{t('scopeMarket')}</dt>
              <dd>{marketEntry ? (locale === 'zh' ? marketEntry.labelZh : marketEntry.labelEn) : '—'}</dd>
              <dt>{t('scopeEngines')}</dt>
              <dd>{selectedEngines.length ? selectedEngines.join(' · ') : t('briefNoEngines')}</dd>
              <dt>{t('scopeData')}</dt>
              <dd>{dataSummary}</dd>
            </dl>
          ) : null}

          {error ? <Notice tone="error">{error}</Notice> : null}

          <div className="ui-wizard__nav">
            {step > 1 ? <Button onClick={() => setStep(step === 3 ? 2 : 1)}>{t('back')}</Button> : null}
            {step === 1 ? (
              <Button variant="primary" onClick={goToConnect} loading={pending} disabled={!step1Ready}>
                {pending ? t('starting') : t('next')}
              </Button>
            ) : step === 2 ? (
              <Button variant="primary" onClick={() => setStep(3)}>
                {t('next')}
              </Button>
            ) : (
              <Button variant="primary" onClick={start} loading={pending}>
                {pending ? t('starting') : t('run')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <aside className="ui-panel ui-wizard__aside" aria-labelledby={`${uid}-estimate`}>
        <div className="ui-panel__head">
          <h2 className="ui-panel__title" id={`${uid}-estimate`}>
            {t('estimateTitle')}
          </h2>
        </div>
        <div className="ui-panel__body ui-wizard__body">
          <dl className="ui-kv">
            <dt>{t('estimateTime')}</dt>
            <dd>{t('estimateTimeValue', { low: estimate.timeLowMin, high: estimate.timeHighMin })}</dd>
            <dt>{t('estimateCost')}</dt>
            <dd>{t('estimateCostValue', { low: estimate.costLowUsd, high: estimate.costHighUsd })}</dd>
            <dt>{t('estimateProbeCalls')}</dt>
            <dd>{t('estimateProbeCallsValue', { calls: estimate.probeCalls })}</dd>
          </dl>
          <p className="ui-footnote">{t('estimateDisclaimer')}</p>
        </div>
      </aside>

      <p className="ui-footnote ui-wizard__note">{t('note')}</p>
    </div>
  )
}
