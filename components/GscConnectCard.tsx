'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// 项目级 GSC 连接卡（SP-G1b）：连接/重连按钮 + 已连接后已授权 property 选择。
// GSC 令牌数据层本就 per-project；授权走既有 /api/gsc/auth，returnTo 回到本项目详情页闭环。
type SiteLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export function GscConnectCard({
  projectId,
  locale,
  gscConnected,
  gscSiteUrl,
  gscAppConfigured = true,
  connectionReturnTo,
}: {
  projectId: string
  locale: string
  gscConnected: boolean
  gscSiteUrl: string | null
  gscAppConfigured?: boolean
  connectionReturnTo?: string
}) {
  const t = useTranslations('projectDetail')
  const router = useRouter()
  const [siteUrl, setSiteUrl] = useState(gscSiteUrl ?? '')
  const [savedSiteUrl, setSavedSiteUrl] = useState(gscSiteUrl ?? '')
  const [sites, setSites] = useState<string[]>([])
  const [siteLoadState, setSiteLoadState] = useState<SiteLoadState>(gscConnected ? 'loading' : 'idle')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // 已连接则自动发现该项目 GSC 授权下的站点资源（sites.list）。站点必须来自这个
  // 受授权列表，不能手输任意 URL；服务端也会在保存前复核同一份列表。
  useEffect(() => {
    if (!gscConnected || !gscAppConfigured) {
      return
    }
    let live = true
    fetch(`/api/gsc/sites?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('gsc_sites_failed')
        return r.json()
      })
      .then((d: { sites?: string[] }) => {
        if (!live) return
        const nextSites = Array.isArray(d.sites) ? [...new Set(d.sites.filter(Boolean))] : []
        setSites(nextSites)
        setSiteLoadState(nextSites.length ? 'ready' : 'empty')
      })
      .catch(() => {
        if (live) setSiteLoadState('error')
      })
    return () => {
      live = false
    }
  }, [gscAppConfigured, gscConnected, projectId])

  function connectGsc() {
    if (!gscAppConfigured) return
    const returnTo = connectionReturnTo ?? `/${locale}/projects/${projectId}`
    window.location.href = `/api/gsc/auth?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(returnTo)}`
  }

  async function saveSiteUrl() {
    const selectedSiteUrl = siteUrl.trim()
    setBusy(true)
    const res = await fetch('/api/gsc/site', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, siteUrl: selectedSiteUrl }),
    })
    setBusy(false)
    setMsg(res.ok ? t('siteSaved') : t('siteError'))
    if (res.ok) {
      setSavedSiteUrl(selectedSiteUrl)
      router.refresh()
    }
  }

  const statusRaw = gscConnected ? t('gscConnected') : t('gscNotConnected')
  const hasDivider = statusRaw.includes('——')
  const badgeText = hasDivider ? statusRaw.split('——')[0] : statusRaw
  const statusDesc = hasDivider ? statusRaw.split('——')[1] : null

  return (
    <div className="card p-6 bg-surface-1 border border-border-subtle rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base text-ink">{t('gscTitle')}</span>
          {gscConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {badgeText}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {badgeText}
            </span>
          )}
        </div>
        {gscConnected && (
          <button
            type="button"
            className="px-2.5 py-1 text-xs text-body hover:text-ink hover:bg-surface-2 border border-border rounded-md transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            onClick={connectGsc}
            disabled={busy || !gscAppConfigured}
          >
            {t('reconnectGsc')}
          </button>
        )}
      </div>

      {!gscConnected && (
        <div className="flex flex-col gap-4">
          {statusDesc && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-800 dark:text-amber-400 text-xs leading-relaxed">
              <svg className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{statusDesc}</span>
            </div>
          )}
          <div>
            <button
              type="button"
              className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-hover font-medium rounded-lg text-sm transition-all duration-150 inline-flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50"
              onClick={connectGsc}
              disabled={busy || !gscAppConfigured}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {t('connectGsc')}
            </button>
          </div>
        </div>
      )}

      {!gscAppConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-800 dark:text-red-400 text-sm leading-relaxed">
          <svg className="w-5 h-5 mt-0.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-semibold block mb-0.5 text-red-800 dark:text-red-300">{t('gscPlatformNotReadyTitle')}</span>
            <span className="text-xs text-red-700/90 dark:text-red-400/90 leading-relaxed font-mono break-all">{t('gscNotConfiguredHint')}</span>
          </div>
        </div>
      )}

      {gscConnected && gscAppConfigured && (
        <div className="flex flex-col gap-4 mt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">{t('siteUrlPick')}</span>
            {siteLoadState === 'loading' ? (
              <p className="text-xs text-muted">{t('siteSelectionLoading')}</p>
            ) : siteLoadState === 'empty' ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{t('siteSelectionEmpty')}</p>
            ) : siteLoadState === 'error' ? (
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{t('siteSelectionError')}</p>
            ) : (
              <select
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-1 text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all duration-150"
                aria-label={t('siteUrlPick')}
                value={sites.includes(siteUrl) ? siteUrl : ''}
                onChange={(e) => {
                  setSiteUrl(e.target.value)
                  setMsg(null)
                }}
              >
                <option value="">{t('siteUrlPickPlaceholder')}</option>
                {sites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
          {siteLoadState === 'ready' && <p className="text-xs text-muted leading-relaxed font-sans">{t('siteSelectionHint')}</p>}
          <div className="flex items-center gap-3">
            {siteUrl && siteUrl !== savedSiteUrl ? (
              <button
                type="button"
                className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-hover font-medium rounded-lg text-sm transition-all duration-150 inline-flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50"
                onClick={saveSiteUrl}
                disabled={busy || siteLoadState !== 'ready'}
              >
                {t('saveSiteUrl')}
              </button>
            ) : savedSiteUrl ? (
              <span role="status" className="text-xs font-medium text-primary">
                {msg ?? t('siteSaved')}
              </span>
            ) : null}
            {msg && siteUrl !== savedSiteUrl && (
              <span role="status" className="text-xs font-medium text-primary">
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
