'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ChangelogEntry } from '@/lib/diagnosis/rule-proposals'

interface Proposal {
  id: string
  source: string
  changeType: string
  target: string
  evidenceRefs: string[]
  createdAt: string
}

export function RulesAdminClient({
  pending,
  changelog,
}: {
  locale: string
  pending: Proposal[]
  changelog: ChangelogEntry[]
}) {
  const t = useTranslations('rulesAdmin')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState('')
  const [manualChange, setManualChange] = useState('update_artifact')
  const [manualEvidence, setManualEvidence] = useState('')

  async function patch(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    // API 路由在 app/api 下，无 locale 前缀。
    await fetch(`/api/rules/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusy(false)
    router.refresh()
  }

  async function release() {
    setBusy(true)
    const res = await fetch('/api/rules/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const data = (await res.json()) as { version: string; released: number; artifactsUpdated: number }
    setMsg(t('releaseDone', { version: data.version, released: data.released, artifacts: data.artifactsUpdated }))
    setBusy(false)
    router.refresh()
  }

  async function submitManual() {
    const refs = manualEvidence.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!manualTarget.trim()) return setMsg(t('errorTarget'))
    if (refs.length === 0) return setMsg(t('errorEvidence'))
    setBusy(true)
    const res = await fetch('/api/rules/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changeType: manualChange, target: manualTarget.trim(), evidenceRefs: refs }),
    })
    setBusy(false)
    if (res.ok) {
      setManualTarget('')
      setManualEvidence('')
      setMsg(null)
      router.refresh()
    } else {
      const e = (await res.json()) as { error: string }
      setMsg(e.error === 'evidence_required' ? t('errorEvidence') : t('errorTarget'))
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {msg && (
        <p role="status" style={{ color: '#b45309' }}>
          {msg}
        </p>
      )}

      <section>
        <h2>{t('pendingTab')}</h2>
        <button onClick={release} disabled={busy}>
          {t('release')}
        </button>
        <p style={{ fontSize: 12, color: '#6b7280' }}>{t('releaseHint')}</p>
        {pending.length === 0 ? (
          <p>{t('empty')}</p>
        ) : (
          <ul>
            {pending.map((p) => (
              <li key={p.id} style={{ marginBottom: 12 }}>
                <strong>{t(`changeLabels.${p.changeType}`)}</strong> · {p.target}{' '}
                <em>({t(`sourceLabels.${p.source}`)})</em>
                <div style={{ fontSize: 12 }}>
                  {t('evidence')}: {p.evidenceRefs.join(', ')}
                </div>
                <button onClick={() => patch(p.id, 'approve')} disabled={busy}>
                  {t('approve')}
                </button>
                <button onClick={() => patch(p.id, 'reject')} disabled={busy}>
                  {t('reject')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t('manualTitle')}</h2>
        <label>
          {t('manualTargetLabel')}
          <input value={manualTarget} onChange={(e) => setManualTarget(e.target.value)} />
        </label>
        <select value={manualChange} onChange={(e) => setManualChange(e.target.value)}>
          {['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'].map((c) => (
            <option key={c} value={c}>
              {t(`changeLabels.${c}`)}
            </option>
          ))}
        </select>
        <label>
          {t('manualEvidenceLabel')}
          <textarea value={manualEvidence} onChange={(e) => setManualEvidence(e.target.value)} rows={3} />
        </label>
        <button onClick={submitManual} disabled={busy}>
          {t('manualSubmit')}
        </button>
      </section>

      <section>
        <h2>{t('changelogTab')}</h2>
        {changelog.map((e) => (
          <div key={e.version}>
            <h3>{e.version}</h3>
            <ul>
              {e.proposals.map((p, i) => (
                <li key={i}>
                  {t(`changeLabels.${p.changeType}`)} · {p.target} — {p.evidenceRefs.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
