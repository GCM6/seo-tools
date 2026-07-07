'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DataSourceStatus } from '@/lib/settings/data-sources'
import type { CredentialRow } from '@/lib/settings/credential-rows'

export function SettingsClient({
  projectId,
  projectDomain,
  statuses,
  credentialRows,
  gscConnected,
  gscSiteUrl,
  justConnected,
}: {
  projectId: string
  projectDomain: string
  statuses: DataSourceStatus[]
  credentialRows: CredentialRow[]
  gscConnected: boolean
  gscSiteUrl: string | null
  justConnected: boolean
}) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [siteUrl, setSiteUrl] = useState(gscSiteUrl ?? `sc-domain:${projectDomain}`)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(justConnected ? t('connectedFlash') : null)

  // 从顶栏健康度抽屉 / 空态 CTA 的「去连接」带 #source-<key> 锚点进来时，
  // 滚动到对应行并短暂高亮，指明「就是这一行」。用直接 DOM 类切换而非 React state——
  // 避免在 effect 内同步 setState 触发级联渲染，高亮由 CSS 动画自淡出。（spec §SP-G2b-8）
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
              <tr key={s.key} id={`source-${s.key}`}>
                <td>{t(`source.${s.key}`)}</td>
                <td>{statusText(s)}</td>
                <td className="mono">{s.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-medium">{t('apiKeysTitle')}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t('apiKeysHint')}</p>
      <div className="report-table-wrap mt-2">
        <table className="report-table">
          <thead>
            <tr>
              <th>{t('credKeyCol')}</th>
              <th>{t('provider.label')}</th>
              <th>{t('col.status')}</th>
              <th>{t('credActionCol')}</th>
            </tr>
          </thead>
          <tbody>
            {credentialRows.map((row) => (
              <CredentialRowItem key={row.key} row={row} t={t} />
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

// 单行凭据录入：密码框 + 可测则测连接 + 保存（DB 加密入库）+ DB 来源可清除。
// 明文值只存本地 state，随请求发往自有后端，不回显、不下发既有值。
function CredentialRowItem({ row, t }: { row: CredentialRow; t: ReturnType<typeof useTranslations> }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function test() {
    setBusy(true)
    setNote(null)
    const res = await fetch('/api/credentials/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key, value }),
    })
    const data = (await res.json()) as { ok: boolean; error?: string }
    setBusy(false)
    setNote(data.ok ? t('testOk') : `${t('testFail')}${data.error ?? ''}`)
  }
  async function save() {
    setBusy(true)
    setNote(null)
    const res = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key, value }),
    })
    setBusy(false)
    if (res.ok) {
      setNote(t('keySaved'))
      setValue('')
      router.refresh()
    } else {
      setNote(`${t('testFail')}${((await res.json()) as { error?: string }).error ?? ''}`)
    }
  }
  async function clear() {
    setBusy(true)
    setNote(null)
    const res = await fetch('/api/credentials', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key }),
    })
    setBusy(false)
    if (res.ok) {
      setNote(t('keyCleared'))
      router.refresh()
    }
  }

  return (
    <tr>
      <td className="mono">{row.key}</td>
      <td>{t(`provider.${row.provider}`)}</td>
      <td>{t(`credSource.${row.source}`)}</td>
      <td>
        <input
          type="password"
          className="mono"
          value={value}
          placeholder={t('credKeyPlaceholder')}
          onChange={(e) => setValue(e.target.value)}
        />
        {row.testable && (
          <button type="button" className="ml-2" onClick={test} disabled={busy || !value.trim()}>
            {t('testConn')}
          </button>
        )}
        <button type="button" className="ml-2" onClick={save} disabled={busy || !value.trim()}>
          {t('saveKey')}
        </button>
        {row.source === 'db' && (
          <button type="button" className="ml-2" onClick={clear} disabled={busy}>
            {t('clearKey')}
          </button>
        )}
        {note && (
          <span role="status" className="ml-2 text-xs">
            {note}
          </span>
        )}
      </td>
    </tr>
  )
}
