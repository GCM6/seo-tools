'use client'

import { useState } from 'react'
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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

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
