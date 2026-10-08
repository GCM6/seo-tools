'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DataSourceStatus } from '@/lib/settings/data-sources'
import { Button } from '@/components/Button'
import { Notice, type NoticeTone } from '@/components/Notice'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { StatusText } from '@/components/StatusText'

/* 每个数据源面板里直接录入的凭据字段（标签走 settings.field.<key>）。 */
interface CredFieldDef {
  key: string
  placeholder?: string
  secret?: boolean
}

const CRED_FIELDS: Record<string, CredFieldDef[]> = {
  googleCse: [
    { key: 'GOOGLE_CSE_API_KEY', placeholder: 'AIzaSy…', secret: true },
    { key: 'GOOGLE_CSE_CX', placeholder: 'a1b2c3d4e5f6…' },
  ],
  dataforseo: [
    { key: 'DATAFORSEO_LOGIN', placeholder: 'user@example.com' },
    { key: 'DATAFORSEO_PASSWORD', secret: true },
  ],
  render: [
    { key: 'CLOUDFLARE_ACCOUNT_ID' },
    { key: 'CLOUDFLARE_API_TOKEN', secret: true },
    { key: 'BROWSERLESS_API_TOKEN', secret: true },
  ],
  aiProbe: [
    { key: 'OPENAI_API_KEY', placeholder: 'sk-…', secret: true },
    { key: 'PERPLEXITY_API_KEY', placeholder: 'pplx-…', secret: true },
    { key: 'GEMINI_API_KEY', placeholder: 'AIzaSy…', secret: true },
    { key: 'DEEPSEEK_API_KEY', placeholder: 'sk-…', secret: true },
  ],
}

/* 配置指南：文案在 settings.sop.<source>.*，这里只放步骤数和外链地址。 */
const SOP: Record<string, { steps: number; links?: { id: string; href: string }[] }> = {
  googleCse: {
    steps: 5,
    links: [
      { id: 'linkCse', href: 'https://programmablesearchengine.google.com/controlpanel/all' },
      { id: 'linkCloud', href: 'https://console.cloud.google.com/apis/credentials' },
    ],
  },
  aiProbe: { steps: 2 },
  dataforseo: { steps: 2, links: [{ id: 'linkAccess', href: 'https://app.dataforseo.com/api-access' }] },
  render: { steps: 2, links: [{ id: 'linkBrowserless', href: 'https://www.browserless.io/' }] },
  psi: { steps: 1 },
  publicCorpora: { steps: 1 },
}

// 步骤文字里的网址变成链接。
function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s)）]+)/g)
  if (parts.length === 1) return text
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

/* ── 主组件：页头 +「共享服务」，每个数据源一块面板（ux-blueprint §6） ── */
export function SettingsClient({
  statuses,
  dbKeys,
  envKeys,
}: {
  statuses: DataSourceStatus[]
  dbKeys: string[]
  envKeys: string[]
}) {
  const t = useTranslations('settings')
  const [focused, setFocused] = useState<string | null>(null)

  // 从别的页面带 #source-<key> 跳进来时（如新建分析的「去配置」），滚到对应面板并短暂标出。
  useEffect(() => {
    const m = window.location.hash.match(/^#source-(\w+)$/)
    if (!m) return
    document.getElementById(`source-${m[1]}`)?.scrollIntoView({ block: 'center' })
    const show = setTimeout(() => setFocused(m[1]), 0)
    const hide = setTimeout(() => setFocused(null), 2400)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

  function stateOf(s: DataSourceStatus): { kind: 'draft' | 'accepted'; label: string } {
    const fields = CRED_FIELDS[s.key] ?? []
    if (!s.configured) return { kind: 'draft', label: t('state.off') }
    if (fields.length === 0) return { kind: 'accepted', label: t('state.builtin') }
    const fromDb = fields.some((f) => dbKeys.includes(f.key))
    return { kind: 'accepted', label: fromDb ? t('state.on') : t('state.env') }
  }

  function guideOf(s: DataSourceStatus): string {
    switch (s.key) {
      case 'googleCse':
        return s.configured ? t('guide.googleCseOn') : t('guide.googleCseOff')
      case 'aiProbe':
        return s.configured ? t('guide.aiProbeOn', { count: Number.parseInt(s.detail ?? '0', 10) || 0 }) : t('guide.aiProbeOff')
      case 'dataforseo':
        return s.configured ? t('guide.dataforseoOn') : t('guide.dataforseoOff')
      case 'render':
        return s.configured ? t('guide.renderOn', { renderer: s.detail ?? 'Chromium' }) : t('guide.renderOff')
      case 'psi':
        return t('guide.psi')
      case 'publicCorpora':
        return t('guide.publicCorpora')
      default:
        return ''
    }
  }

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <section className="ui-section" aria-labelledby="settings-shared">
        <SectionHeader id="settings-shared" title={t('matrixTitle')} note={t('sourcesCount', { count: statuses.length })} />
        <div className="ui-settings">
          {statuses.map((s) => {
            const state = stateOf(s)
            const fields = CRED_FIELDS[s.key] ?? []
            const sop = SOP[s.key]
            return (
              <section
                key={s.key}
                id={`source-${s.key}`}
                className={`ui-panel ui-setting${focused === s.key ? ' ui-setting--focus' : ''}`}
                aria-labelledby={`source-${s.key}-title`}
              >
                <div className="ui-panel__head">
                  <h3 className="ui-panel__title" id={`source-${s.key}-title`}>
                    {t(`source.${s.key}`)}
                  </h3>
                  <StatusText status={state.kind} label={state.label} />
                </div>
                <div className="ui-panel__body ui-setting__body">
                  <p className="ui-hint">{guideOf(s)}</p>
                  {fields.length > 0 ? <CredentialForm sourceKey={s.key} fields={fields} dbKeys={dbKeys} envKeys={envKeys} /> : null}
                  {sop ? (
                    <details className="ui-disclosure ui-setting__guide">
                      <summary>{t('guideTitle')}</summary>
                      <dl className="ui-setting__sop">
                        <dt>{t('sopWhy')}</dt>
                        <dd>{t(`sop.${s.key}.why`)}</dd>
                        <dt>{t('sopBenefit')}</dt>
                        <dd>{t(`sop.${s.key}.benefit`)}</dd>
                        <dt>{t('sopSteps')}</dt>
                        <dd>
                          <ol>
                            {Array.from({ length: sop.steps }, (_, i) => (
                              <li key={i}>{linkify(t(`sop.${s.key}.s${i + 1}`))}</li>
                            ))}
                          </ol>
                        </dd>
                        {sop.links?.length ? (
                          <>
                            <dt>{t('sopLinks')}</dt>
                            <dd>
                              <ul className="ui-kv__list">
                                {sop.links.map((link) => (
                                  <li key={link.id}>
                                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                                      {t(`sop.${s.key}.${link.id}`)}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </details>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </section>
  )
}

/* ── 面板内的凭据表单：保存 / 测试连接 / 清除（清除要再确认一次） ── */
function CredentialForm({
  sourceKey,
  fields,
  dbKeys,
  envKeys,
}: {
  sourceKey: string
  fields: CredFieldDef[]
  dbKeys: string[]
  envKeys: string[]
}) {
  const t = useTranslations('settings')
  const router = useRouter()
  const uid = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)

  const fieldLabel = (key: string) => (t.has(`field.${key}`) ? t(`field.${key}`) : key)
  const fieldSource = (key: string): 'db' | 'env' | 'none' => (dbKeys.includes(key) ? 'db' : envKeys.includes(key) ? 'env' : 'none')
  const pending = fields.filter((f) => (values[f.key] ?? '').trim())
  // 所有字段都已有值（DB 或环境变量）时，不填新值也能直接测试连接。
  const allConfigured = fields.every((f) => dbKeys.includes(f.key) || envKeys.includes(f.key))
  const hasDbKey = fields.some((f) => dbKeys.includes(f.key))

  // 逐个保存填了新值的字段；任一失败就停下并说明是哪个字段。
  async function savePending(): Promise<boolean> {
    for (const f of pending) {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentialKey: f.key, value: values[f.key]!.trim() }),
      })
      if (!res.ok) {
        const reason = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`
        setNotice({ tone: 'error', text: t('errorSave', { field: fieldLabel(f.key), reason }) })
        return false
      }
    }
    setValues({})
    return true
  }

  async function save() {
    setBusy('save')
    setNotice(null)
    try {
      if (await savePending()) {
        setNotice({ tone: 'success', text: t('keySaved') })
        router.refresh()
      }
    } catch (e) {
      setNotice({ tone: 'error', text: t('errorTest', { reason: e instanceof Error ? e.message : String(e) }) })
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    setBusy('test')
    setNotice(null)
    try {
      if (pending.length > 0 && !(await savePending())) return
      const res = await fetch('/api/credentials/test-source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceKey }),
      })
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string; detail?: string }
      setNotice(
        data.ok
          ? { tone: 'success', text: [t('testOk'), data.detail].filter(Boolean).join(' · ') }
          : { tone: 'error', text: t('errorTest', { reason: data.error ?? `HTTP ${res.status}` }) },
      )
      router.refresh()
    } catch (e) {
      setNotice({ tone: 'error', text: t('errorTest', { reason: e instanceof Error ? e.message : String(e) }) })
    } finally {
      setBusy(null)
    }
  }

  async function clear() {
    setBusy('clear')
    setNotice(null)
    try {
      for (const f of fields.filter((field) => dbKeys.includes(field.key))) {
        const res = await fetch('/api/credentials', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credentialKey: f.key }),
        })
        if (!res.ok) throw new Error(f.key)
      }
      setNotice({ tone: 'success', text: t('keyCleared') })
      router.refresh()
    } catch {
      setNotice({ tone: 'error', text: t('errorClear') })
    } finally {
      setBusy(null)
      setConfirmClear(false)
    }
  }

  return (
    <form
      className="ui-setting__form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {fields.map((f) => {
        const src = fieldSource(f.key)
        const id = `${uid}-${f.key}`
        const label = fieldLabel(f.key)
        return (
          <div key={f.key} className="ui-field">
            <div className="ui-setting__label">
              <label className="ui-label" htmlFor={id}>
                {label}
              </label>
              {src !== 'none' ? <span className="ui-tag">{t(`credSource.${src}`)}</span> : null}
            </div>
            <div className="ui-input-row">
              <input
                id={id}
                className="ui-input ui-mono"
                type={f.secret && !shown[f.key] ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                value={values[f.key] ?? ''}
                placeholder={f.placeholder ?? t('credKeyPlaceholder')}
                disabled={busy !== null}
                onChange={(ev) => setValues((prev) => ({ ...prev, [f.key]: ev.target.value }))}
              />
              {f.secret ? (
                <Button
                  variant="quiet"
                  size="sm"
                  aria-label={shown[f.key] ? t('hideField', { field: label }) : t('showField', { field: label })}
                  aria-pressed={Boolean(shown[f.key])}
                  onClick={() => setShown((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                >
                  {shown[f.key] ? t('hide') : t('show')}
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="ui-inline-actions">
        <Button type="submit" loading={busy === 'save'} disabled={busy !== null || pending.length === 0}>
          {t('saveKey')}
        </Button>
        <Button variant="quiet" loading={busy === 'test'} disabled={busy !== null || (!allConfigured && pending.length === 0)} onClick={() => void test()}>
          {t('testConn')}
        </Button>
        {hasDbKey ? (
          confirmClear ? (
            <>
              <Button variant="danger" size="sm" loading={busy === 'clear'} disabled={busy !== null} onClick={() => void clear()}>
                {t('clearConfirm')}
              </Button>
              <Button variant="quiet" size="sm" disabled={busy !== null} onClick={() => setConfirmClear(false)}>
                {t('clearCancel')}
              </Button>
              <span className="ui-hint">{t('clearHint')}</span>
            </>
          ) : (
            <Button variant="quiet" disabled={busy !== null} onClick={() => setConfirmClear(true)}>
              {t('clearKey')}
            </Button>
          )
        ) : null}
      </div>
    </form>
  )
}
