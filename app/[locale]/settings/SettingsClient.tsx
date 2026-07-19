'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DataSourceStatus } from '@/lib/settings/data-sources'

/* ── 每个数据源卡片对应的凭据字段定义 ─────────────────────── */
interface CredFieldDef {
  key: string
  label: string
  placeholder?: string
  secret?: boolean // 密码类型
}

// 数据源 → 需要在卡片内直接录入的凭据字段
function getSourceCredFields(key: string): CredFieldDef[] {
  switch (key) {
    case 'googleCse':
      return [
        { key: 'GOOGLE_CSE_API_KEY', label: 'API Key', placeholder: 'AIzaSy...', secret: true },
        { key: 'GOOGLE_CSE_CX', label: '搜索引擎 ID (CX)', placeholder: 'a1b2c3d4e5f6...' },
      ]
    case 'dataforseo':
      return [
        { key: 'DATAFORSEO_LOGIN', label: 'Login (Email)', placeholder: 'user@example.com' },
        { key: 'DATAFORSEO_PASSWORD', label: 'API Password', placeholder: '...', secret: true },
      ]
    case 'render':
      return [
        { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare Account ID', placeholder: '' },
        { key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API Token', placeholder: '', secret: true },
        { key: 'BROWSERLESS_API_TOKEN', label: 'Browserless API Token', placeholder: '', secret: true },
      ]
    case 'aiProbe':
      return [
        { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', placeholder: 'sk-...', secret: true },
        { key: 'PERPLEXITY_API_KEY', label: 'Perplexity API Key', placeholder: 'pplx-...', secret: true },
        { key: 'GEMINI_API_KEY', label: 'Gemini API Key', placeholder: 'AIzaSy...', secret: true },
        { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', placeholder: 'sk-...', secret: true },
      ]
    default:
      return []
  }
}

/* ── SOP 详情 ─────────────────────────────────────────── */
interface SopDetail {
  why: string
  benefit: string
  sopSteps: string[]
  envKeys?: string[]
  quickLinks?: Array<{ label: string; href: string }>
}

function getSourceSopDetails(key: string): SopDetail | null {
  switch (key) {
    case 'googleCse':
      return {
        why: '通过 Google 自定义搜索引擎 (CSE) 提供对传统 Google 网页搜索结果的实时抓取和收录验证。',
        benefit: '验证网站的自然收录状态，实时监控关键词在 Google 搜索结果（SERP）中的真实快照与排名位置。',
        sopSteps: [
          '访问 Google CSE 控制台 (https://cse.google.com/cse/) 创建自定义搜索引擎。',
          '新建 CSE 只能配置指定站点；若账户已有全网搜索引擎，可在设置中继续使用它。',
          '获取搜索引擎 ID（CX）后，在下方填入 CX 字段。',
          '在 Google Cloud 凭据页创建 API Key 后，同样在下方填入 API Key 字段并保存。',
          '如果 Google 不允许该账户新开 Custom Search JSON API，请改用 DataForSEO 获取 SERP 数据，不要在此反复尝试。',
        ],
        quickLinks: [
          { label: '打开 CSE 控制台（已有 API 资格时获取 CX）', href: 'https://programmablesearchengine.google.com/controlpanel/all' },
          { label: '打开 Google Cloud 凭据页（创建 API Key）', href: 'https://console.cloud.google.com/apis/credentials' },
        ],
      }
    case 'aiProbe':
      return {
        why: '监测并实测生成式 AI 答案引擎对你网站的收录、回答和引用可见度。',
        benefit: '实测 ChatGPT / Perplexity / Gemini / DeepSeek 的回答实况，计算你的网站在生成式搜索引擎中的可见度（GEO SoV）及引用排名。',
        sopSteps: [
          '在下方直接粘贴对应服务商的 API Key 并保存。',
          '其优先级高于本地环境变量。如果需要回退到本地环境变量，点击对应项的"清除"按钮即可。',
        ],
      }
    case 'dataforseo':
      return {
        why: '接入第三方专业 SEO 数据服务商 DataForSEO 以获取关键词、竞品及外链数据。',
        benefit: '支持外链指标、关键词检索量、竞品 SoV 及关键词缺口诊断，填补自有流量数据之外的全球市场诊断数据。',
        sopSteps: [
          '注册并登录 DataForSEO 控制台。',
          '将 API Access 中的 Login 与 API password 分别填入下方并保存。',
        ],
        quickLinks: [
          { label: '打开 DataForSEO API Access（复制 Login / Password）', href: 'https://app.dataforseo.com/api-access' },
        ],
      }
    case 'render':
      return {
        why: '浏览器级渲染不绑定目标网站的 CDN：系统优先使用 Cloudflare；没有 Cloudflare 时会切换到 Browserless Chromium，二者都取得 JavaScript 执行后的真实 HTML。',
        benefit: '两种渲染器都会计算初始 HTML 与 JS 渲染后正文的差异，因此 SPA 可抓取性、正文占比和 render_check 证据保持同一套结果合同。',
        sopSteps: [
          '方案 A：填入 Cloudflare Account ID 与 API Token，使用 Cloudflare Browser Rendering。',
          '方案 B：没有 Cloudflare 时，填入 Browserless API Token，系统将调用 Browserless Chromium。',
        ],
        quickLinks: [
          { label: '打开 Browserless 获取 API Token', href: 'https://www.browserless.io/' },
        ],
      }
    case 'psi':
      return {
        why: '评估网页加载性能、响应速度与核心 Web 指标 (LCP, FID, CLS)。',
        benefit: '分析 Google 真实用户体验的核心性能，是 SEO 评级和网站可用性评估的重要加分项。',
        sopSteps: ['系统已开箱即用，无需任何额外凭据。'],
      }
    case 'publicCorpora':
      return {
        why: '在诊断运行时将你网站的内容与全网主流公开语料库、公开数据进行关联度比对。',
        benefit: '分析网站内容与通用大模型预训练语料的重合度和相关性，提升内容在 AI 引擎中的可被检索概率。',
        sopSteps: ['系统已开箱即用，无需配置。'],
      }
    default:
      return null
  }
}

/* ── 主组件 ──────────────────────────────────────────── */
export function SettingsClient({
  statuses,
  dbKeys,
  envKeys,
}: {
  statuses: DataSourceStatus[]
  dbKeys: string[]
  envKeys: string[]
}) {
  const t = useTranslations('settings')
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})

  const toggleExpand = (key: string) => {
    setExpandedSources((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function renderStepText(text: string) {
    const urlRegex = /(https?:\/\/[^\s\)]+)/g
    const parts = text.split(urlRegex)
    if (parts.length === 1) return text

    return parts.map((part, index) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1a0dab] hover:underline font-medium break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  useEffect(() => {
    const m = window.location.hash.match(/^#source-(\w+)$/)
    if (!m) return
    const row = document.getElementById(`source-${m[1]}`)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    row.classList.add('ds-row-highlight')
    const timer = setTimeout(() => row.classList.remove('ds-row-highlight'), 2400)
    return () => clearTimeout(timer)
  }, [])

  function statusText(s: DataSourceStatus): string {
    return s.configured ? t('statusConfigured') : t('statusNotConfigured')
  }

  function getGuideText(s: DataSourceStatus): string {
    switch (s.key) {
      case 'googleCse':
        if (s.configured) return '已成功对接 Google Custom Search Engine 检索 API。'
        return '请在下方填入 CSE API Key 和搜索引擎 ID (CX)。'
      case 'aiProbe':
        if (s.configured) return `已开启探针。当前已配置 ${s.detail} 种 AI 模型凭据，诊断运行将使用这些模型进行回答实测。`
        return '请在下方配置至少一个 AI 引擎的 API Key（推荐 DeepSeek / OpenAI）。'
      case 'dataforseo':
        if (s.configured) return '已成功配置 DataForSEO，支持拉取真实搜索量、竞品 SoV 及关键词诊断。'
        return '请在下方填入 DataForSEO 的 Login 与 Password。'
      case 'render':
        if (s.configured) return `已启用 ${s.detail ?? '浏览器'} 级渲染，可实测初始 HTML 与 JS 渲染后正文的差异。`
        return '请配置 Cloudflare 或 Browserless 任一真实浏览器渲染器。'
      case 'psi':
        return 'Google PageSpeed Insights 诊断服务已就绪，开箱即用，无需额外凭据。'
      case 'publicCorpora':
        return '公开语料搜索已就绪，诊断运行时会自动与主流公开数据源进行匹配度比对。'
      default:
        return ''
    }
  }

  function getSourceIcon(key: string) {
    const sizeClasses = "w-5 h-5 text-current"
    switch (key) {
      case 'googleCse':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )
      case 'aiProbe':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
      case 'dataforseo':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        )
      case 'render':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        )
      case 'psi':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )
      case 'publicCorpora':
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )
      default:
        return (
          <svg className={sizeClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )
    }
  }

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* 头部标题 */}
      <div className="bg-gradient-to-r from-surface-1 to-surface-2/30 border border-border p-6 rounded-2xl shadow-card">
        <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
          <svg className="w-7 h-7 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-body leading-relaxed">{t('subtitle')}</p>
      </div>

      {/* 单栏全宽：数据源卡片（内含凭据表单） */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-base font-semibold text-ink flex items-center gap-1.5">
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
            </svg>
            {t('matrixTitle')}
          </h2>
          <span className="text-xs text-muted font-mono">{statuses.length} Sources</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {statuses.map((s) => {
            const isOk = s.configured
            const credFields = getSourceCredFields(s.key)
            return (
              <div
                key={s.key}
                id={`source-${s.key}`}
                className="group relative bg-surface-1 border border-border/80 rounded-xl p-4 shadow-card hover:shadow-card-hover hover:border-border transition-all duration-300 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isOk ? 'bg-primary-muted text-primary' : 'bg-surface-2 text-muted'} group-hover:scale-110 transition-transform duration-200`}>
                      {getSourceIcon(s.key)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-ink leading-tight">
                        {t(`source.${s.key}`)}
                      </h3>
                      {s.detail && (
                        <span className="inline-block mt-1 text-[11px] font-mono text-muted bg-surface-2 px-1.5 py-0.2 rounded border border-border-subtle">
                          {s.detail}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(48,209,88,0.6)]' : 'bg-ghost'}`} />
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isOk
                        ? 'bg-success/10 text-success border border-success/10'
                        : 'bg-surface-2 text-muted border border-border-subtle'
                      }`}>
                      {statusText(s)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 text-xs text-body leading-relaxed border-t border-border-subtle pt-2.5">
                  {getGuideText(s)}
                </div>

                {/* 内联凭据表单 */}
                {credFields.length > 0 && (
                  <InlineCredentialForm
                    sourceKey={s.key}
                    fields={credFields}
                    dbKeys={dbKeys}
                    envKeys={envKeys}
                    t={t}
                  />
                )}

                {/* SOP 配置指南 */}
                {(() => {
                  const sop = getSourceSopDetails(s.key)
                  if (!sop) return null
                  const isOpen = !!expandedSources[s.key]
                  return (
                    <div className="mt-2.5 border-t border-dashed border-border-subtle pt-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(s.key)
                        }}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer select-none focus:outline-none"
                      >
                        <span>{isOpen ? '收起配置指南 & 收益' : '查看配置指南 & 收益 (SOP)'}</span>
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="mt-2.5 space-y-2.5 text-[11px] leading-relaxed bg-surface-2/40 border border-border-subtle rounded-xl p-3 animate-fade-in">
                          <div>
                            <div className="flex items-center gap-1 text-ink font-semibold mb-0.5">
                              <span className="text-xs">🎯</span> 为什么配置它
                            </div>
                            <p className="text-muted pl-4">{sop.why}</p>
                          </div>

                          <div className="border-t border-border-subtle/50 my-2" />

                          {sop.quickLinks && sop.quickLinks.length > 0 && (
                            <>
                              <div>
                                <div className="flex items-center gap-1 text-ink font-semibold mb-1">
                                  <span className="text-xs">↗</span> 直接去连接
                                </div>
                                <div className="flex flex-wrap gap-1.5 pl-4">
                                  {sop.quickLinks.map((link) => (
                                    <a
                                      key={link.href}
                                      href={link.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary-muted px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/15"
                                    >
                                      {link.label}<span aria-hidden="true">↗</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                              <div className="border-t border-border-subtle/50 my-2" />
                            </>
                          )}

                          <div>
                            <div className="flex items-center gap-1 text-ink font-semibold mb-0.5">
                              <span className="text-xs">🚀</span> 配置后的收益
                            </div>
                            <p className="text-muted pl-4">{sop.benefit}</p>
                          </div>

                          <div className="border-t border-border-subtle/50 my-2" />

                          <div>
                            <div className="flex items-center gap-1 text-ink font-semibold mb-1">
                              <span className="text-xs">📋</span> 配置 SOP 步骤
                            </div>
                            <ol className="list-decimal pl-8 space-y-1 text-muted">
                              {sop.sopSteps.map((step, idx) => (
                                <li key={idx} className="marker:text-primary/70">
                                  {renderStepText(step)}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── 内联凭据表单组件 ─────────────────────────────────── */
function InlineCredentialForm({
  sourceKey,
  fields,
  dbKeys,
  envKeys,
  t,
}: {
  sourceKey: string
  fields: CredFieldDef[]
  dbKeys: string[]
  envKeys: string[]
  t: ReturnType<typeof useTranslations>
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [noteType, setNoteType] = useState<'success' | 'error' | null>(null)

  function fieldSource(key: string): 'db' | 'env' | 'none' {
    if (dbKeys.includes(key)) return 'db'
    if (envKeys.includes(key)) return 'env'
    return 'none'
  }

  function allFieldsEmpty() {
    return fields.every((f) => !(values[f.key] ?? '').trim())
  }

  // 是否所有字段都已配置（DB 或 env，用于判断「测试连接」是否可用）
  const allFieldsConfigured = fields.every((f) => dbKeys.includes(f.key) || envKeys.includes(f.key))
  // 是否有部分已填的新值（「保存并测试」需要先保存）
  const hasPendingValues = fields.some((f) => (values[f.key] ?? '').trim())

  // 批量保存所有填了值的字段
  async function saveAll() {
    setBusy(true)
    setNote(null)
    setNoteType(null)
    try {
      const toSave = fields.filter((f) => (values[f.key] ?? '').trim())
      for (const f of toSave) {
        const res = await fetch('/api/credentials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credentialKey: f.key, value: values[f.key]!.trim() }),
        })
        if (!res.ok) {
          const err = ((await res.json()) as { error?: string }).error ?? ''
          throw new Error(`${f.label}: ${err}`)
        }
      }
      setNote(t('keySaved'))
      setNoteType('success')
      setValues({})
      // 刷新页面让服务端重新计算所有状态（包括顶栏健康度 pill）
      router.refresh()
    } catch (e) {
      setNote(`${t('testFail')}${e instanceof Error ? e.message : ''}`)
      setNoteType('error')
    } finally {
      setBusy(false)
    }
  }

  // 测试连接：验证 DB 中已保存的凭据是否有效
  async function testSource() {
    setBusy(true)
    setNote(null)
    setNoteType(null)
    try {
      // 如果有未保存的新值，先保存
      if (hasPendingValues) {
        const toSave = fields.filter((f) => (values[f.key] ?? '').trim())
        for (const f of toSave) {
          const res = await fetch('/api/credentials', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credentialKey: f.key, value: values[f.key]!.trim() }),
          })
          if (!res.ok) {
            const err = ((await res.json()) as { error?: string }).error ?? ''
            throw new Error(`保存 ${f.label} 失败: ${err}`)
          }
        }
        setValues({})
      }
      // 调用测试 API
      const res = await fetch('/api/credentials/test-source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceKey }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string; detail?: string }
      if (data.ok) {
        setNote(`${t('testOk')} ${data.detail ?? ''}`)
        setNoteType('success')
      } else {
        setNote(`${t('testFail')}${data.error ?? ''}`)
        setNoteType('error')
      }
      // 刷新状态
      router.refresh()
    } catch (e) {
      setNote(`${t('testFail')}${e instanceof Error ? e.message : ''}`)
      setNoteType('error')
    } finally {
      setBusy(false)
    }
  }

  // 批量清除（仅 DB 中已存在的）
  async function clearAll() {
    setBusy(true)
    setNote(null)
    setNoteType(null)
    try {
      const toClear = fields.filter((f) => dbKeys.includes(f.key))
      for (const f of toClear) {
        const res = await fetch('/api/credentials', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credentialKey: f.key }),
        })
        if (!res.ok) throw new Error(f.label)
      }
      setNote(t('keyCleared'))
      setNoteType('success')
      router.refresh()
    } catch {
      setNote('清除失败，请重试')
      setNoteType('error')
    } finally {
      setBusy(false)
    }
  }

  const hasAnyDbKey = fields.some((f) => dbKeys.includes(f.key))

  return (
    <div className="mt-3 border-t border-border-subtle pt-3 space-y-2.5">
      {/* 凭据字段 */}
      {fields.map((f) => {
        const src = fieldSource(f.key)
        const isSecret = f.secret
        const showVal = showSecrets[f.key]
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-ink">{f.label}</label>
              {src !== 'none' && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  src === 'db'
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-mystic/10 text-mystic border border-mystic/20'
                }`}>
                  {t(`credSource.${src}`)}
                </span>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type={isSecret && !showVal ? 'password' : 'text'}
                className="w-full bg-surface-2 border border-border/80 rounded-lg pl-3 pr-9 py-2 font-mono text-xs focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder-ghost/60"
                value={values[f.key] ?? ''}
                placeholder={f.placeholder ?? t('credKeyPlaceholder')}
                onChange={(ev) => setValues((prev) => ({ ...prev, [f.key]: ev.target.value }))}
                disabled={busy}
              />
              {isSecret && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowSecrets((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                  className="absolute right-2.5 p-0.5 text-muted hover:text-ink transition-colors outline-none"
                >
                  {showVal ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* 操作按钮行 */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-ink text-on-ink transition-all hover:bg-ink/90 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
          onClick={saveAll}
          disabled={busy || allFieldsEmpty()}
        >
          {busy ? (
            <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : null}
          {t('saveKey')}
        </button>

        {/* 测试连接 */}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/30 bg-surface-1 text-primary transition-all hover:bg-primary-muted disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
          onClick={testSource}
          disabled={busy || (!allFieldsConfigured && allFieldsEmpty())}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {t('testConn')}
        </button>

        {hasAnyDbKey && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-error/20 bg-error/5 text-error transition-all hover:bg-error/10 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
            onClick={clearAll}
            disabled={busy}
          >
            {t('clearKey')}
          </button>
        )}

        {/* 提示消息 */}
        {note && (
          <div
            role="status"
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md ${noteType === 'success'
                ? 'bg-success/10 text-success'
                : noteType === 'error'
                  ? 'bg-error/10 text-error'
                  : 'bg-surface-2 text-muted'
              } animate-fade-in`}
          >
            {noteType === 'success' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : noteType === 'error' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : null}
            {note}
          </div>
        )}
      </div>
    </div>
  )
}
