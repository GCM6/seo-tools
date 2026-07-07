'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DataSourceStatus } from '@/lib/settings/data-sources'
import type { CredentialRow } from '@/lib/settings/credential-rows'

// 全局设置页（SP-G1b：收窄为 BYOK 凭据 + 全局数据源矩阵）。
// GSC 连接已按项目移到项目详情页（GscConnectCard），此处矩阵仅展示 GSC app 级就绪。
export function SettingsClient({
  statuses,
  credentialRows,
}: {
  statuses: DataSourceStatus[]
  credentialRows: CredentialRow[]
}) {
  const t = useTranslations('settings')

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

  function statusText(s: DataSourceStatus): string {
    if (s.key === 'gsc') return s.connected ? t('statusConnected') : s.configured ? t('statusNotConnected') : t('statusAppMissing')
    return s.configured ? t('statusConfigured') : t('statusNotConfigured')
  }

  return (
    <section className="screen show" style={{ maxWidth: 760 }}>
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>

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
