'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { Panel } from './Panel'
import { StatusText } from './StatusText'
import type { GscConnectError } from '@/lib/gsc/oauth'

// 项目级 GSC 连接卡（SP-G1b；ux-blueprint §2.2）：连接/重连按钮 + 已连接后已授权 property 选择。
// 四种状态各只说一句话：未连接 / 正在读取资源 / 已连接（选择或已保存资源）/ 授权失效。
// GSC 令牌数据层本就 per-project；授权走既有 /api/gsc/auth，returnTo 回到本项目详情页闭环。
// reauth：refresh_token 已失效（invalid_grant），只能重新授权。
type SiteLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'reauth'

export function GscConnectCard({
  projectId,
  locale,
  gscConnected,
  gscSiteUrl,
  gscAppConfigured = true,
  connectionReturnTo,
  connectError = null,
  redirectOrigin = null,
}: {
  projectId: string
  locale: string
  gscConnected: boolean
  gscSiteUrl: string | null
  gscAppConfigured?: boolean
  connectionReturnTo?: string
  // 授权往返失败时由页面从 ?gsc_error= 白名单解析后传入；redirectOrigin 来自服务端 env。
  connectError?: GscConnectError | null
  redirectOrigin?: string | null
}) {
  const t = useTranslations('projectDetail')
  const tg = useTranslations('gscConnect')
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
        if (r.status === 409 && (await r.clone().json().catch(() => ({}))).error === 'gsc_reauth_required') {
          return { reauth: true }
        }
        if (!r.ok) throw new Error('gsc_sites_failed')
        return r.json()
      })
      .then((d: { sites?: string[]; reauth?: boolean }) => {
        if (!live) return
        if (d.reauth) {
          setSiteLoadState('reauth')
          return
        }
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
    <Panel
      title={t('gscTitle')}
      actions={
        gscConnected ? (
          <Button size="sm" variant="quiet" onClick={connectGsc} disabled={busy || !gscAppConfigured}>
            {t('reconnectGsc')}
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3">
        {/* 状态只说一句：未连接 / 已连接 / 授权已失效（读取资源时发现令牌失效，不能再显示「已连接」） */}
        <p className="ui-gsc__status">
          {!gscConnected ? (
            <StatusText status="draft" label={badgeText} />
          ) : siteLoadState === 'reauth' ? (
            <StatusText status="rejected" label={t('gscReauthStatus')} />
          ) : (
            <StatusText status="accepted" label={badgeText} />
          )}
        </p>

        {/* 文案都以「GSC 未连接」为前提；已连接时（如取消了一次重连）旧令牌仍有效，不提示。 */}
        {connectError && !gscConnected ? (
          <p role="alert" className="ui-alert-line">
            {tg(`error.${connectError}`, { expected: redirectOrigin ?? 'GOOGLE_OAUTH_REDIRECT_URI' })}
          </p>
        ) : null}

        {!gscAppConfigured ? (
          <div className="ui-alert-line">
            <b>{t('gscPlatformNotReadyTitle')}</b>
            <span className="ui-mono"> {t('gscNotConfiguredHint')}</span>
          </div>
        ) : null}

        {!gscConnected ? (
          <>
            {statusDesc ? <p className="ui-result__note">{statusDesc}</p> : null}
            <div>
              <Button variant="primary" size="sm" onClick={connectGsc} disabled={busy || !gscAppConfigured}>
                {t('connectGsc')}
              </Button>
            </div>
          </>
        ) : null}

        {gscConnected && gscAppConfigured ? (
          siteLoadState === 'loading' ? (
            <p className="ui-result__note">{t('siteSelectionLoading')}</p>
          ) : siteLoadState === 'reauth' ? (
            <p role="alert" className="ui-alert-line">
              {tg('reauth')}
            </p>
          ) : siteLoadState === 'empty' ? (
            <p className="ui-result__note">{t('siteSelectionEmpty')}</p>
          ) : siteLoadState === 'error' ? (
            <p className="ui-alert-line">{t('siteSelectionError')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <label className="ui-label" htmlFor={`gsc-site-${projectId}`}>
                {t('siteUrlPick')}
              </label>
              <select
                id={`gsc-site-${projectId}`}
                className="ui-select"
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
              <p className="ui-hint">{t('siteSelectionHint')}</p>
              <div className="ui-inline-actions">
                {siteUrl && siteUrl !== savedSiteUrl ? (
                  <Button variant="primary" size="sm" onClick={saveSiteUrl} loading={busy}>
                    {t('saveSiteUrl')}
                  </Button>
                ) : savedSiteUrl ? (
                  <span role="status" className="ui-status ui-status--accepted">
                    {msg ?? t('siteSaved')}
                  </span>
                ) : null}
                {msg && siteUrl !== savedSiteUrl ? (
                  <span role="status" className="ui-alert-line">
                    {msg}
                  </span>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </div>
    </Panel>
  )
}
