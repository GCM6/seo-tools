'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// 项目级 GSC 连接卡（SP-G1b）：连接/重连按钮 + 已连接后站点 URL 表单。
// GSC 令牌数据层本就 per-project；授权走既有 /api/gsc/auth，returnTo 回到本项目详情页闭环。
export function GscConnectCard({
  projectId,
  projectDomain,
  locale,
  gscConnected,
  gscSiteUrl,
}: {
  projectId: string
  projectDomain: string
  locale: string
  gscConnected: boolean
  gscSiteUrl: string | null
}) {
  const t = useTranslations('projectDetail')
  const router = useRouter()
  const [siteUrl, setSiteUrl] = useState(gscSiteUrl ?? `sc-domain:${projectDomain}`)
  const [sites, setSites] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // 已连接则自动发现该项目 GSC 授权下的站点资源（sites.list），供下拉选择替代手打。
  // 失败/空 → 保持仅手输，不打断。
  useEffect(() => {
    if (!gscConnected) return
    let live = true
    fetch(`/api/gsc/sites?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites?: string[] }) => {
        if (live && Array.isArray(d.sites)) setSites(d.sites)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [gscConnected, projectId])

  function connectGsc() {
    const returnTo = `/${locale}/projects/${projectId}`
    window.location.href = `/api/gsc/auth?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(returnTo)}`
  }

  async function saveSiteUrl() {
    setBusy(true)
    const res = await fetch('/api/gsc/site', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, siteUrl: siteUrl.trim() }),
    })
    setBusy(false)
    setMsg(res.ok ? t('siteSaved') : t('siteError'))
    if (res.ok) router.refresh()
  }

  return (
    <div className="card gsc-card">
      <div className="gsc-card-h">
        <span className="gsc-card-title">{t('gscTitle')}</span>
        <span className={gscConnected ? 'gsc-state ok' : 'gsc-state'}>
          {gscConnected ? t('gscConnected') : t('gscNotConnected')}
        </span>
      </div>

      <button type="button" className="ghost" onClick={connectGsc} disabled={busy}>
        {gscConnected ? t('reconnectGsc') : t('connectGsc')}
      </button>

      {gscConnected && (
        <div className="gsc-site">
          {sites.length > 0 && (
            <label className="field">
              <span>{t('siteUrlPick')}</span>
              <select
                className="sel"
                aria-label={t('siteUrlPick')}
                value={sites.includes(siteUrl) ? siteUrl : ''}
                onChange={(e) => e.target.value && setSiteUrl(e.target.value)}
              >
                <option value="">{t('siteUrlPickPlaceholder')}</option>
                {sites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t('siteUrlLabel')}</span>
            <input className="txt mono" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </label>
          <p className="wizard-hint">{t('siteUrlHint')}</p>
          <button type="button" className="run-btn" onClick={saveSiteUrl} disabled={busy || !siteUrl.trim()}>
            {t('saveSiteUrl')}
          </button>
          {msg && (
            <span role="status" className="note gsc-msg">
              {msg}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
