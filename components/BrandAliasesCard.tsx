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
    <div className="card p-6 bg-surface-1 border border-border-subtle rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-border-subtle">
        <span className="font-semibold text-base text-ink">{t('brandAliasesTitle')}</span>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-4">{t('brandAliasesHint')}</p>

      <div className="flex items-end gap-3 mb-5">
        <label className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">{t('brandAliasInputLabel')}</span>
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface-1 text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all duration-150"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAlias()
              }
            }}
            placeholder="例如: brand, trademark"
          />
        </label>
        <button
          type="button"
          className="px-4 py-2 border border-border hover:border-body hover:bg-surface-2 text-ink font-medium rounded-lg text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shrink-0"
          onClick={addAlias}
          disabled={!draft.trim()}
        >
          {t('brandAliasAdd')}
        </button>
      </div>

      {aliases.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-6">
          {aliases.map((alias) => (
            <span
              key={alias}
              className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-lg text-xs font-medium bg-surface-2 text-ink border border-border transition-all duration-150 hover:border-border-strong group"
            >
              <span>{alias}</span>
              <button
                type="button"
                className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-error hover:bg-error-muted transition-all duration-100"
                aria-label={t('brandAliasRemove', { alias })}
                onClick={() => removeAlias(alias)}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 px-4 mb-6 rounded-xl border border-dashed border-border bg-surface-2/30 text-center">
          <svg className="w-8 h-8 text-muted/60 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <p className="text-xs text-muted leading-relaxed font-sans">{t('brandAliasesEmpty')}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-hover font-medium rounded-lg text-sm transition-all duration-150 inline-flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50"
          onClick={save}
          disabled={busy}
        >
          {busy ? (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          )}
          {t('saveBrandAliases')}
        </button>
        {msg && (
          <span role="status" className="text-xs font-medium text-primary">
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}
