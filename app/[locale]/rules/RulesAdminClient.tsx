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
  const [activeTab, setActiveTab] = useState<'pending' | 'submit' | 'history'>('pending')

  // 手动表单 state
  const [manualTarget, setManualTarget] = useState('')
  const [manualChange, setManualChange] = useState('update_artifact')
  const [manualEvidence, setManualEvidence] = useState('')

  async function patch(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    try {
      await fetch(`/api/rules/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setBusy(false)
      router.refresh()
    } catch {
      setBusy(false)
      setMsg('操作失败，请重试')
    }
  }

  async function release() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/rules/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const data = (await res.json()) as { version: string; released: number; artifactsUpdated: number }
      setMsg(t('releaseDone', { version: data.version, released: data.released, artifacts: data.artifactsUpdated }))
      setBusy(false)
      router.refresh()
    } catch {
      setBusy(false)
      setMsg('发布版本失败')
    }
  }

  async function submitManual() {
    const refs = manualEvidence.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!manualTarget.trim()) return setMsg(t('errorTarget'))
    if (refs.length === 0) return setMsg(t('errorEvidence'))
    
    setBusy(true)
    try {
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
        setActiveTab('pending')
        router.refresh()
      } else {
        const e = (await res.json()) as { error: string }
        setMsg(e.error === 'evidence_required' ? t('errorEvidence') : t('errorTarget'))
      }
    } catch {
      setBusy(false)
      setMsg('提交失败，请重试')
    }
  }

  // 根据变更类型，渲染漂亮的带色 Badge
  function getChangeTypeBadge(type: string) {
    let classes = ""
    switch (type) {
      case 'new_rule':
        classes = "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
        break
      case 'modify_threshold':
        classes = "bg-amber-500/10 text-amber-600 border border-amber-500/20"
        break
      case 'deprecate':
        classes = "bg-rose-500/10 text-rose-600 border border-rose-500/20"
        break
      case 'update_artifact':
      default:
        classes = "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20"
        break
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${classes}`}>
        {t(`changeLabels.${type}`)}
      </span>
    )
  }

  // 格式化日期
  function formatDate(dStr: string) {
    try {
      const d = new Date(dStr)
      return d.toLocaleDateString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return dStr
    }
  }

  return (
    <main className="animate-fade-in space-y-6 pb-16 max-w-4xl mx-auto px-4 md:px-0">
      {/* 头部区域 */}
      <div className="bg-gradient-to-r from-surface-1 to-surface-2/30 border border-border p-6 rounded-2xl shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('title')}
          </h1>
          <p className="text-sm text-body">{t('subtitle')}</p>
        </div>

        {/* 全局打包发版控制区 */}
        {pending.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={release}
              disabled={busy}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-mystic text-on-mystic font-bold rounded-xl shadow-[0_4px_14px_rgba(99,102,241,0.3)] hover:bg-mystic-hover hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              )}
              {t('release')}
            </button>
          </div>
        )}
      </div>

      {/* 消息提示框 */}
      {msg && (
        <div role="status" className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl text-xs leading-relaxed text-amber-800 dark:text-amber-300 animate-slide-up flex items-start gap-2.5">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">{msg}</div>
        </div>
      )}

      {/* TABS 选项卡栏 */}
      <div className="flex border-b border-border/80 gap-6">
        <button
          onClick={() => { setActiveTab('pending'); setMsg(null) }}
          className={`pb-3 font-semibold text-sm transition-all relative outline-none flex items-center gap-1.5 ${
            activeTab === 'pending' ? 'text-primary' : 'text-muted hover:text-ink'
          }`}
        >
          {t('pendingTab')}
          {pending.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold bg-primary text-on-primary rounded-full">
              {pending.length}
            </span>
          )}
          {activeTab === 'pending' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-full animate-fade-in" />}
        </button>

        <button
          onClick={() => { setActiveTab('submit'); setMsg(null) }}
          className={`pb-3 font-semibold text-sm transition-all relative outline-none ${
            activeTab === 'submit' ? 'text-primary' : 'text-muted hover:text-ink'
          }`}
        >
          {t('manualTitle')}
          {activeTab === 'submit' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-full animate-fade-in" />}
        </button>

        <button
          onClick={() => { setActiveTab('history'); setMsg(null) }}
          className={`pb-3 font-semibold text-sm transition-all relative outline-none ${
            activeTab === 'history' ? 'text-primary' : 'text-muted hover:text-ink'
          }`}
        >
          {t('changelogTab')}
          {activeTab === 'history' && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-full animate-fade-in" />}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="mt-4">
        {/* TAB 1: 待审提案 */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            {pending.length === 0 ? (
              <div className="text-center py-16 bg-surface-1 border border-border/80 rounded-2xl shadow-card space-y-3">
                <svg className="w-12 h-12 text-ghost mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <div className="text-sm font-semibold text-ink">{t('empty')}</div>
                <div className="text-xs text-muted max-w-xs mx-auto">所有规则提案已处理完毕。系统当前基于最新规则正常运行。</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pending.map((p) => (
                  <div key={p.id} className="bg-surface-1 border border-border rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* 卡片头部：类型与源 */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        {getChangeTypeBadge(p.changeType)}
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>{t('source')}:</span>
                          <span className="font-semibold text-body bg-surface-2 border border-border-subtle px-2 py-0.5 rounded">
                            {t(`sourceLabels.${p.source}`)}
                          </span>
                          <span className="hidden sm:inline font-mono text-[11px] text-muted">
                            {formatDate(p.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* 目标规则 */}
                      <div>
                        <span className="block text-[11px] font-mono text-muted mb-1 uppercase tracking-wider">{t('target')}</span>
                        <code className="block w-full font-mono text-xs text-ink bg-surface-2 border border-border-subtle p-3 rounded-lg leading-relaxed select-all">
                          {p.target}
                        </code>
                      </div>

                      {/* 证据链 */}
                      <div>
                        <span className="block text-[11px] font-mono text-muted mb-1.5 uppercase tracking-wider">{t('evidence')}</span>
                        <div className="flex flex-wrap gap-2">
                          {p.evidenceRefs.map((ref, idx) => (
                            <a
                              key={idx}
                              href={ref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium bg-surface-2 hover:bg-surface-3 border border-border-subtle rounded-full text-body hover:text-ink transition-colors"
                            >
                              <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              {ref.replace(/^https?:\/\/(www\.)?/, '').substring(0, 32)}...
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 操作区 */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
                      <button
                        onClick={() => patch(p.id, 'reject')}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-bold text-error bg-error/5 border border-error/20 rounded-lg hover:bg-error hover:text-white transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.96]"
                      >
                        {t('reject')}
                      </button>
                      <button
                        onClick={() => patch(p.id, 'approve')}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-bold text-success bg-success/5 border border-success/20 rounded-lg hover:bg-success hover:text-white transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.96]"
                      >
                        {t('approve')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 手动创建提案 */}
        {activeTab === 'submit' && (
          <div className="bg-surface-1 border border-border rounded-2xl p-6 shadow-card space-y-5 animate-slide-up">
            <h2 className="text-base font-semibold text-ink border-b border-border-subtle pb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('manualTitle')}
            </h2>

            <div className="space-y-4">
              {/* Target */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-body">
                  {t('manualTargetLabel')} <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                  placeholder="例如：rule_canonical_canonical_link 或 refart_gsc_docs"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 font-mono text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder-ghost/60"
                  disabled={busy}
                />
              </div>

              {/* Change Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-body">
                  {t('changeType')}
                </label>
                <div className="relative">
                  <select
                    value={manualChange}
                    onChange={(e) => setManualChange(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none cursor-pointer text-ink font-semibold"
                    disabled={busy}
                  >
                    {['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'].map((c) => (
                      <option key={c} value={c}>
                        {t(`changeLabels.${c}`)}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Evidence Textarea */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-body">
                  {t('manualEvidenceLabel')} <span className="text-error">*</span>
                </label>
                <textarea
                  value={manualEvidence}
                  onChange={(e) => setManualEvidence(e.target.value)}
                  placeholder="https://example.com/source-evidence-page-url&#10;https://another-evidence.org/blog-post"
                  rows={4}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder-ghost/60 font-mono"
                  disabled={busy}
                />
                <span className="block text-[11px] text-muted">请输入一手来源 URL 作为支撑证据，多条请换行输入。</span>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-3 border-t border-border-subtle">
              <button
                onClick={submitManual}
                disabled={busy || !manualTarget.trim() || !manualEvidence.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-ink text-on-ink font-bold rounded-xl shadow-card hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy && (
                  <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {t('manualSubmit')}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: 版本变更记录（时间轴） */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-slide-up pl-4 relative border-l border-border/80 ml-2.5">
            {changelog.length === 0 ? (
              <div className="text-center py-16 bg-surface-1 border border-border/80 rounded-2xl shadow-card">
                <span className="text-sm text-muted">暂无已发布的规则版本记录。</span>
              </div>
            ) : (
              changelog.map((e) => (
                <div key={e.version} className="relative space-y-3">
                  {/* 时间轴节点徽标 */}
                  <div className="absolute -left-[27px] top-1 bg-surface-1 p-1 rounded-full border border-border">
                    <span className="block w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  </div>

                  {/* 标题 */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-ink leading-tight font-mono">{e.version}</h3>
                    <span className="text-xs text-muted font-mono bg-surface-1 border border-border-subtle px-2 py-0.5 rounded-md">
                      {e.proposals.length} 变更
                    </span>
                  </div>

                  {/* 提案子变更列表 */}
                  <div className="bg-surface-1 border border-border/80 rounded-2xl p-4 shadow-card">
                    <ul className="divide-y divide-border-subtle text-sm">
                      {e.proposals.map((p, i) => (
                        <li key={i} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getChangeTypeBadge(p.changeType)}
                              <code className="text-xs font-mono text-ink bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
                                {p.target}
                              </code>
                            </div>
                          </div>

                          {/* 关联证据 */}
                          {p.evidenceRefs && p.evidenceRefs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 justify-end md:max-w-xs">
                              {p.evidenceRefs.map((ref, idx) => (
                                <a
                                  key={idx}
                                  href={ref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-muted hover:text-primary transition-colors flex items-center gap-1 bg-surface-2 px-2 py-0.5 rounded border border-border-subtle font-mono"
                                >
                                  <svg className="w-2.5 h-2.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                  {ref.replace(/^https?:\/\/(www\.)?/, '').substring(0, 16)}...
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  )
}

