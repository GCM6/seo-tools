'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// 品牌别名维护卡（D7：spec 2026-07-13-geo-branded-unbranded-redesign.md）。
// 与 GscConnectCard 同一套模式：客户端组件 + fetch 打 Route Handler + router.refresh()。
// 别名用于探针 mentions 判定（中文名/简称/旧名），不走 verified 闸门，随时可编辑。
export function BrandAliasesCard({
  projectId,
  initialAliases,
}: {
  projectId: string
  initialAliases: string[]
}) {
  const t = useTranslations('projectDetail')
  const router = useRouter()
  const [aliases, setAliases] = useState<string[]>(initialAliases)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function addAlias() {
    const value = draft.trim()
    if (!value || aliases.includes(value)) {
      setDraft('')
      return
    }
    setAliases([...aliases, value])
    setDraft('')
  }

  function removeAlias(alias: string) {
    setAliases(aliases.filter((a) => a !== alias))
  }

  async function save() {
    setBusy(true)
    const res = await fetch(`/api/projects/${projectId}/brand-aliases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    })
    setBusy(false)
    setMsg(res.ok ? t('brandAliasesSaved') : t('brandAliasesError'))
    if (res.ok) router.refresh()
  }

  return (
    <div className="card brand-aliases-card">
      <div className="gsc-card-h">
        <span className="gsc-card-title">{t('brandAliasesTitle')}</span>
      </div>
      <p className="wizard-hint">{t('brandAliasesHint')}</p>

      <div className="brand-alias-input-row">
        <label className="field">
          <span>{t('brandAliasInputLabel')}</span>
          <input
            className="txt"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAlias()
              }
            }}
          />
        </label>
        <button type="button" className="ghost" onClick={addAlias} disabled={!draft.trim()}>
          {t('brandAliasAdd')}
        </button>
      </div>

      {aliases.length > 0 ? (
        <ul className="brand-alias-list">
          {aliases.map((alias) => (
            <li key={alias} className="brand-alias-chip">
              <span>{alias}</span>
              <button type="button" aria-label={t('brandAliasRemove', { alias })} onClick={() => removeAlias(alias)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">{t('brandAliasesEmpty')}</p>
      )}

      <button type="button" className="run-btn" onClick={save} disabled={busy}>
        {t('saveBrandAliases')}
      </button>
      {msg && (
        <span role="status" className="note gsc-msg">
          {msg}
        </span>
      )}
    </div>
  )
}
