'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DataSourceStatus } from '@/lib/settings/data-sources'

export function SettingsClient({
  projectId,
  projectDomain,
  statuses,
  gscConnected,
  gscSiteUrl,
  justConnected,
}: {
  projectId: string
  projectDomain: string
  statuses: DataSourceStatus[]
  gscConnected: boolean
  gscSiteUrl: string | null
  justConnected: boolean
}) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [siteUrl, setSiteUrl] = useState(gscSiteUrl ?? `sc-domain:${projectDomain}`)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(justConnected ? t('connectedFlash') : null)

  function connectGsc() {
    window.location.href = `/api/gsc/auth?projectId=${encodeURIComponent(projectId)}`
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

  function statusText(s: DataSourceStatus): string {
    if (s.key === 'gsc') return s.connected ? t('statusConnected') : s.configured ? t('statusNotConnected') : t('statusAppMissing')
    return s.configured ? t('statusConfigured') : t('statusNotConfigured')
  }

  return (
    <section className="screen show" style={{ maxWidth: 760 }}>
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>
      {msg && <p role="status" className="mt-2 text-sm" style={{ color: '#b45309' }}>{msg}</p>}

      <h2 className="mt-6 text-sm font-medium">{t('matrixTitle')}</h2>
      <div className="report-table-wrap mt-2">
        <table className="report-table">
          <thead>
            <tr><th>{t('col.source')}</th><th>{t('col.status')}</th><th>{t('col.detail')}</th></tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <tr key={s.key}>
                <td>{t(`source.${s.key}`)}</td>
                <td>{statusText(s)}</td>
                <td className="mono">{s.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-medium">{t('gscTitle')}</h2>
      <button type="button" onClick={connectGsc} disabled={busy}>
        {gscConnected ? t('reconnectGsc') : t('connectGsc')}
      </button>
      {gscConnected && (
        <div className="mt-3">
          <label className="block text-sm">
            {t('siteUrlLabel')}
            <input className="mono ml-2" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </label>
          <p className="mt-1 text-xs text-neutral-500">{t('siteUrlHint')}</p>
          <button type="button" className="mt-2" onClick={saveSiteUrl} disabled={busy || !siteUrl.trim()}>
            {t('saveSiteUrl')}
          </button>
        </div>
      )}
    </section>
  )
}
