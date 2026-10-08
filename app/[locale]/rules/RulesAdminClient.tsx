'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ChangelogEntry } from '@/lib/diagnosis/rule-proposals'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { LocalTime } from '@/components/LocalTime'
import { Notice, type NoticeTone } from '@/components/Notice'
import { PageHeader } from '@/components/PageHeader'
import { ViewTabs, viewPanelId, viewTabId } from '@/components/ViewTabs'

interface Proposal {
  id: string
  source: string
  changeType: string
  target: string
  evidenceRefs: string[]
  createdAt: string
}

type View = 'pending' | 'submit' | 'history'
const CHANGE_TYPES = ['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'] as const

// 证据网址只去掉协议和 www，完整地址放在 title 里；过长时由 .ui-cell-url 截断，不再一律加「...」。
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '')

function EvidenceLinks({ refs }: { refs: string[] }) {
  return (
    <ul className="ui-kv__list">
      {refs.map((ref) => (
        <li key={ref}>
          <a className="ui-cell-url" href={ref} target="_blank" rel="noopener noreferrer" title={ref}>
            {shortUrl(ref)}
          </a>
        </li>
      ))}
    </ul>
  )
}

// 规则库管理（spec §11 Phase F 第四道人工闸门；ux-blueprint §6）：页头 + 视图标签（待审提案 / 手动建提案 /
// 版本记录）+ 表格。「批准」「发版」用主按钮，「驳回」用次按钮；所有接口失败都给出可读提示，不再静默刷新。
export function RulesAdminClient({
  pending,
  approvedCount,
  changelog,
}: {
  locale: string
  pending: Proposal[]
  approvedCount: number
  changelog: ChangelogEntry[]
}) {
  const t = useTranslations('rulesAdmin')
  const router = useRouter()
  const uid = useId()
  // 正在进行的操作：'release' | 'submit' | `${id}:approve` | `${id}:reject`；进行中时其它按钮一律禁用。
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const [view, setView] = useState<View>('pending')

  const [manualTarget, setManualTarget] = useState('')
  const [manualChange, setManualChange] = useState<string>('update_artifact')
  const [manualEvidence, setManualEvidence] = useState('')

  function switchView(next: string) {
    setView(next as View)
    setNotice(null)
  }

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(`${id}:${action}`)
    setNotice(null)
    try {
      const res = await fetch(`/api/rules/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.refresh()
    } catch {
      setNotice({ tone: 'error', text: t('errorAction') })
    } finally {
      setBusy(null)
    }
  }

  async function release() {
    setBusy('release')
    setNotice(null)
    try {
      const res = await fetch('/api/rules/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const data = (await res.json()) as { version?: string; released?: number; artifactsUpdated?: number; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.version || typeof data.released !== 'number' || typeof data.artifactsUpdated !== 'number') {
        throw new Error('release_response_invalid')
      }
      setNotice({ tone: 'success', text: t('releaseDone', { version: data.version, released: data.released, artifacts: data.artifactsUpdated }) })
      router.refresh()
    } catch {
      setNotice({ tone: 'error', text: t('errorRelease') })
    } finally {
      setBusy(null)
    }
  }

  async function submitManual() {
    const refs = manualEvidence.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!manualTarget.trim()) return setNotice({ tone: 'error', text: t('errorTarget') })
    if (refs.length === 0) return setNotice({ tone: 'error', text: t('errorEvidence') })

    setBusy('submit')
    setNotice(null)
    try {
      const res = await fetch('/api/rules/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changeType: manualChange, target: manualTarget.trim(), evidenceRefs: refs }),
      })
      if (res.ok) {
        setManualTarget('')
        setManualEvidence('')
        setView('pending')
        setNotice({ tone: 'success', text: t('manualSubmitted') })
        router.refresh()
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        setNotice({
          tone: 'error',
          text: e.error === 'evidence_required' ? t('errorEvidence') : e.error === 'target_required' ? t('errorTarget') : t('errorSubmit'),
        })
      }
    } catch {
      setNotice({ tone: 'error', text: t('errorSubmit') })
    } finally {
      setBusy(null)
    }
  }

  const tabs = [
    { id: 'pending', label: t('pendingTab'), count: pending.length },
    { id: 'submit', label: t('manualTitle') },
    { id: 'history', label: t('changelogTab'), count: changelog.length },
  ]

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="ui-page-body">
        {approvedCount > 0 ? (
          <Notice
            title={t('releasePending', { count: approvedCount })}
            action={
              <div className="ui-notice__action">
                <Button variant="primary" size="sm" onClick={release} loading={busy === 'release'} disabled={busy !== null}>
                  {t('release')}
                </Button>
              </div>
            }
          >
            {t('releaseHint')}
          </Notice>
        ) : null}

        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <div className="ui-view">
          <ViewTabs idBase={uid} label={t('tabsLabel')} tabs={tabs} value={view} onChange={switchView} />

          <div role="tabpanel" id={viewPanelId(uid, view)} aria-labelledby={viewTabId(uid, view)}>
            {view === 'pending' ? (
              pending.length === 0 ? (
                <div className="ui-panel">
                  <EmptyState title={t('empty')} description={t('emptyHint')} />
                </div>
              ) : (
                <div className="ui-panel ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t('changeType')}</th>
                        <th>{t('target')}</th>
                        <th>{t('source')}</th>
                        <th>{t('evidence')}</th>
                        <th>{t('createdAt')}</th>
                        <th>
                          <span className="sr-only">{t('colAction')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((p) => (
                        <tr key={p.id}>
                          <td className="ui-nowrap">
                            <span className="ui-tag">{t(`changeLabels.${p.changeType}`)}</span>
                          </td>
                          <td>
                            <code className="ui-code">{p.target}</code>
                          </td>
                          <td className="ui-nowrap">{t(`sourceLabels.${p.source}`)}</td>
                          <td>
                            <EvidenceLinks refs={p.evidenceRefs} />
                          </td>
                          <td className="ui-nowrap ui-cell-muted">
                            <LocalTime iso={p.createdAt} />
                          </td>
                          <td>
                            <span className="ui-row-actions">
                              <Button size="sm" onClick={() => decide(p.id, 'reject')} loading={busy === `${p.id}:reject`} disabled={busy !== null}>
                                {t('reject')}
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => decide(p.id, 'approve')}
                                loading={busy === `${p.id}:approve`}
                                disabled={busy !== null}
                              >
                                {t('approve')}
                              </Button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {view === 'submit' ? (
              <form
                className="ui-panel ui-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitManual()
                }}
              >
                <div className="ui-field ui-form__wide">
                  <label className="ui-label" htmlFor={`${uid}-target`}>
                    {t('manualTargetLabel')}
                  </label>
                  <input
                    id={`${uid}-target`}
                    className="ui-input ui-mono"
                    value={manualTarget}
                    placeholder={t('manualTargetPlaceholder')}
                    aria-required="true"
                    disabled={busy !== null}
                    onChange={(e) => setManualTarget(e.target.value)}
                  />
                </div>
                <div className="ui-field">
                  <label className="ui-label" htmlFor={`${uid}-change`}>
                    {t('changeType')}
                  </label>
                  <select
                    id={`${uid}-change`}
                    className="ui-select"
                    value={manualChange}
                    disabled={busy !== null}
                    onChange={(e) => setManualChange(e.target.value)}
                  >
                    {CHANGE_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {t(`changeLabels.${c}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ui-field ui-form__wide">
                  <label className="ui-label" htmlFor={`${uid}-evidence`}>
                    {t('manualEvidenceLabel')}
                  </label>
                  <textarea
                    id={`${uid}-evidence`}
                    className="ui-textarea ui-mono"
                    rows={4}
                    value={manualEvidence}
                    placeholder={t('manualEvidencePlaceholder')}
                    aria-required="true"
                    aria-describedby={`${uid}-evidence-hint`}
                    disabled={busy !== null}
                    onChange={(e) => setManualEvidence(e.target.value)}
                  />
                  <p className="ui-hint" id={`${uid}-evidence-hint`}>
                    {t('manualEvidenceHint')}
                  </p>
                </div>
                <div className="ui-form__actions">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy === 'submit'}
                    disabled={busy !== null || !manualTarget.trim() || !manualEvidence.trim()}
                  >
                    {t('manualSubmit')}
                  </Button>
                </div>
              </form>
            ) : null}

            {view === 'history' ? (
              changelog.length === 0 ? (
                <div className="ui-panel">
                  <EmptyState title={t('changelogEmpty')} />
                </div>
              ) : (
                <div className="ui-stack ui-stack--md">
                  {changelog.map((e) => (
                    <section key={e.version} className="ui-subsec" aria-labelledby={`${uid}-v-${e.version}`}>
                      <h2 className="ui-subsec__title" id={`${uid}-v-${e.version}`}>
                        <span className="ui-mono">{e.version}</span>
                        <span className="ui-subsec__count">{t('changelogCount', { count: e.proposals.length })}</span>
                      </h2>
                      <div className="ui-panel ui-table-wrap">
                        <table className="ui-table">
                          <thead>
                            <tr>
                              <th>{t('changeType')}</th>
                              <th>{t('target')}</th>
                              <th>{t('evidence')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.proposals.map((p) => (
                              <tr key={`${p.changeType}:${p.target}:${p.evidenceRefs.join('|')}`}>
                                <td className="ui-nowrap">
                                  <span className="ui-tag">{t(`changeLabels.${p.changeType}`)}</span>
                                </td>
                                <td>
                                  <code className="ui-code">{p.target}</code>
                                </td>
                                <td>{p.evidenceRefs.length > 0 ? <EvidenceLinks refs={p.evidenceRefs} /> : <span className="ui-muted">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
