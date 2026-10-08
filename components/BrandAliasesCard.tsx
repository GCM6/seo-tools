'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { Panel } from './Panel'

// 品牌别名维护卡（D7：spec 2026-07-13-geo-branded-unbranded-redesign.md；ux-blueprint §2.2）。
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const inputId = `brand-alias-${projectId}`

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
    setMsg(res.ok ? { ok: true, text: t('brandAliasesSaved') } : { ok: false, text: t('brandAliasesError') })
    if (res.ok) router.refresh()
  }

  return (
    <Panel title={t('brandAliasesTitle')}>
      <div className="grid grid-cols-1 gap-4">
        <p className="ui-result__note">{t('brandAliasesHint')}</p>

        <div className="ui-field">
          <label className="ui-label" htmlFor={inputId}>
            {t('brandAliasInputLabel')}
          </label>
          <div className="ui-input-row">
            <input
              id={inputId}
              className="ui-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addAlias()
                }
              }}
              placeholder={t('brandAliasPlaceholder')}
            />
            <Button onClick={addAlias} disabled={!draft.trim()}>
              {t('brandAliasAdd')}
            </Button>
          </div>
        </div>

        {aliases.length > 0 ? (
          <ul className="ui-alias-list">
            {aliases.map((alias) => (
              <li key={alias} className="ui-alias">
                <span>{alias}</span>
                <button type="button" className="ui-alias__remove" aria-label={t('brandAliasRemove', { alias })} onClick={() => removeAlias(alias)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-footnote">{t('brandAliasesEmpty')}</p>
        )}

        <div className="ui-inline-actions">
          {/* 次按钮：页头已有本页的主动作（发起回测 / 配置并分析），这里不再放第二个主按钮 */}
          <Button onClick={save} loading={busy}>
            {t('saveBrandAliases')}
          </Button>
          {msg ? (
            <span role="status" className={msg.ok ? 'ui-status ui-status--accepted' : 'ui-alert-line'}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}
