'use client'

import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/Button'
import { CodeBlock } from '@/components/CodeBlock'
import { EmptyState } from '@/components/EmptyState'
import { Facts } from '@/components/Facts'
import { Notice, type NoticeTone } from '@/components/Notice'
import { PageHeader } from '@/components/PageHeader'
import { StatusText, type StatusKind } from '@/components/StatusText'
import { ViewTabs, viewPanelId, viewTabId } from '@/components/ViewTabs'

type Source = {
  id: string; sourceType: string; name: string; canonicalUrl: string; authorityLevel: string; enabled: boolean;
  lastSuccessAt: string | null
}
type IngestRun = {
  id: string; sourceId: string | null; status: string; fetchedCount: number; changedCount: number; errorCount: number;
  startedAt: string; coverage: unknown; errorSummary?: string | null
}
type ReviewClaim = {
  claim: { id: string; documentVersionId: string; claimType: string; topic: string; statementZh: string; statementEn: string; confidence: string; officialConflict: boolean; createdAt: string }
  sourceUrl: string; exactQuote: string; sourceName: string; sourceType: string; documentTitle: string; community: string | null
}
type Entry = { id: string; stableKey: string; knowledgeType: string; topic: string; status: string; currentVersionId: string | null }
type Proposal = { id: string; title: string; rationale: string; status: string; knowledgeReleaseVersion: string; evidenceRefs: string[]; diff: unknown }
type SearchResult = { score: number; entry: Entry; version: { id: string; titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; sourceUrls: string[] } }

type View = 'ingest' | 'claims' | 'library' | 'workflow'
type Editing = { id: string; mode: 'edit' | 'reject' }

const RUN_STATUS: Record<string, StatusKind> = { completed: 'accepted', running: 'draft', partial: 'draft', failed: 'rejected', idle: 'draft' }
const ENTRY_STATUS: Record<string, StatusKind> = { published: 'accepted', draft: 'draft', retired: 'rejected' }
const PROPOSAL_STATUS: Record<string, StatusKind> = { pending_review: 'draft', approved: 'accepted', released: 'applied', rejected: 'rejected' }
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '')

/** 每个来源最近一次采集：runs 按开始时间倒序，只取每个来源第一次出现的那条（不能让旧记录覆盖新记录）。 */
export function latestRunsBySource<T extends { sourceId: string | null }>(runs: T[]): Map<string | null, T> {
  const map = new Map<string | null, T>()
  for (const run of runs) if (!map.has(run.sourceId)) map.set(run.sourceId, run)
  return map
}

// 知识库（ux-blueprint §6）：页头 + 版本事实栏 + 视图标签（来源 / 论点审核 / 正式知识 / 工作流闸门，各带计数）。
// 来源是表格，状态用状态文字，失败行内写原因；论点的编辑 / 驳回在该条下方就地展开，不再弹窗。
export function KnowledgeBrainClient({ locale, sources, runs, claims, entries, proposals, releases }: {
  locale: string; sources: Source[]; runs: IngestRun[]; claims: ReviewClaim[]; entries: Entry[]; proposals: Proposal[];
  releases: { knowledge: string; workflow: string; ruleConfig: string }
}) {
  const t = useTranslations('knowledge')
  const tc = useTranslations('common')
  const router = useRouter()
  const uid = useId()
  const isZh = locale === 'zh'
  const [view, setView] = useState<View>('ingest')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editZh, setEditZh] = useState('')
  const [editEn, setEditEn] = useState('')
  const [reason, setReason] = useState('')
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'deepseek'>('deepseek')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [customSourceType, setCustomSourceType] = useState<'reddit_community' | 'reddit_search'>('reddit_community')
  const [customSourceValue, setCustomSourceValue] = useState('')
  const latestRunBySource = useMemo(() => latestRunsBySource(runs), [runs])
  const label = (group: string, key: string) => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key)

  async function action(id: string, fn: () => Promise<Response>) {
    setBusy(id)
    setNotice(null)
    try {
      const response = await fn()
      const body = (await response.json().catch(() => ({}))) as { error?: string; version?: string }
      if (!response.ok) {
        setNotice({ tone: 'error', text: t('errorAction', { code: body.error || `HTTP ${response.status}` }) })
        return
      }
      setNotice({ tone: 'success', text: body.version ? t('released', { version: body.version }) : t('done') })
      setEditing(null)
      setReason('')
      router.refresh()
    } catch (error) {
      setNotice({ tone: 'error', text: t('errorAction', { code: error instanceof Error ? error.message : String(error) }) })
    } finally {
      setBusy(null)
    }
  }

  const post = (url: string, body?: unknown, method = 'POST') =>
    fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

  function reviewClaim(claim: ReviewClaim, reviewAction: 'approve' | 'edit' | 'reject') {
    return action(claim.claim.id, () =>
      post(
        `/api/knowledge/claims/${claim.claim.id}`,
        { action: reviewAction, reason, edited: reviewAction === 'edit' ? { statementZh: editZh, statementEn: editEn } : undefined },
        'PATCH',
      ),
    )
  }

  function openEditor(item: ReviewClaim, mode: Editing['mode']) {
    setEditing({ id: item.claim.id, mode })
    setEditZh(mode === 'edit' ? item.claim.statementZh : '')
    setEditEn(mode === 'edit' ? item.claim.statementEn : '')
    setReason('')
  }

  async function searchKnowledge(event: React.FormEvent) {
    event.preventDefault()
    if (!searchQuery.trim()) return
    setBusy('search')
    setNotice(null)
    try {
      const response = await fetch(`/api/knowledge?q=${encodeURIComponent(searchQuery.trim())}`)
      const body = (await response.json().catch(() => ({}))) as { results?: SearchResult[]; error?: string }
      if (!response.ok) {
        setNotice({ tone: 'error', text: t('errorAction', { code: body.error || `HTTP ${response.status}` }) })
        return
      }
      setSearchResults(body.results ?? [])
    } catch (error) {
      setNotice({ tone: 'error', text: t('errorAction', { code: error instanceof Error ? error.message : String(error) }) })
    } finally {
      setBusy(null)
    }
  }

  function addSource(event: React.FormEvent) {
    event.preventDefault()
    const value = customSourceValue.trim().replace(/^r\//i, '')
    if (!value) return
    const community = customSourceType === 'reddit_community'
    const canonicalUrl = community ? `https://www.reddit.com/r/${encodeURIComponent(value)}/` : `https://www.reddit.com/search/?q=${encodeURIComponent(value)}`
    void action('add-source', () =>
      post('/api/knowledge/sources', {
        sourceType: customSourceType,
        name: community ? `r/${value}` : `Reddit search: ${value}`,
        canonicalUrl,
        config: community ? { community: value, cadence: 'daily', backfillDays: 365, includeComments: true } : { query: value, cadence: 'daily', backfillDays: 365, includeComments: true },
      }),
    )
    setCustomSourceValue('')
  }

  const publishedCount = entries.filter((e) => e.status === 'published').length
  const pendingProposals = proposals.filter((p) => p.status === 'pending_review').length
  const tabs = [
    { id: 'ingest', label: t('tab.ingest'), count: sources.length },
    { id: 'claims', label: t('tab.claims'), count: claims.length },
    { id: 'library', label: t('tab.library'), count: publishedCount },
    { id: 'workflow', label: t('tab.workflow'), count: pendingProposals },
  ]

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="ui-page-body">
        <Facts
          items={[
            { label: t('fact.knowledge'), value: releases.knowledge, mono: true },
            { label: t('fact.workflow'), value: releases.workflow, mono: true },
            { label: t('fact.ruleConfig'), value: releases.ruleConfig, mono: true },
          ]}
        />

        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <div className="ui-view">
          <ViewTabs
            idBase={uid}
            label={t('tabsLabel')}
            tabs={tabs}
            value={view}
            onChange={(next) => {
              setView(next as View)
              setNotice(null)
            }}
          />

          <div role="tabpanel" id={viewPanelId(uid, view)} aria-labelledby={viewTabId(uid, view)} className="ui-view">
            {view === 'ingest' ? (
              <>
                <div className="ui-viewbar">
                  <form className="ui-viewbar__form" onSubmit={addSource}>
                    <label className="sr-only" htmlFor={`${uid}-src-type`}>
                      {t('addSourceType')}
                    </label>
                    <select
                      id={`${uid}-src-type`}
                      className="ui-select"
                      value={customSourceType}
                      onChange={(event) => setCustomSourceType(event.target.value as typeof customSourceType)}
                    >
                      <option value="reddit_community">{t('sourceType.reddit_community')}</option>
                      <option value="reddit_search">{t('sourceType.reddit_search')}</option>
                    </select>
                    <label className="sr-only" htmlFor={`${uid}-src-value`}>
                      {t('addSourceValue')}
                    </label>
                    <input
                      id={`${uid}-src-value`}
                      className="ui-input"
                      value={customSourceValue}
                      onChange={(event) => setCustomSourceValue(event.target.value)}
                      placeholder={customSourceType === 'reddit_community' ? 'TechSEO' : 'international SEO'}
                    />
                    <Button type="submit" disabled={!customSourceValue.trim() || busy !== null} loading={busy === 'add-source'}>
                      {t('addSource')}
                    </Button>
                  </form>
                  <div className="ui-viewbar__actions">
                    <label className="ui-inline-field">
                      <span className="ui-hint">{t('model')}</span>
                      <select className="ui-select" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
                        <option value="deepseek">DeepSeek</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                      </select>
                    </label>
                    <Button
                      disabled={busy !== null}
                      loading={busy === 'backfill-all'}
                      onClick={() => action('backfill-all', () => post('/api/knowledge/ingest', { sourceId: 'all', backfill: true, provider }))}
                    >
                      {t('backfillAll')}
                    </Button>
                    <Button variant="quiet" onClick={() => router.refresh()}>
                      {t('refresh')}
                    </Button>
                  </div>
                </div>

                <div className="ui-panel ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t('col.source')}</th>
                        <th>{t('col.authority')}</th>
                        <th>{t('col.status')}</th>
                        <th className="ui-num">{t('col.fetched')}</th>
                        <th className="ui-num">{t('col.changed')}</th>
                        <th className="ui-num">{t('col.errors')}</th>
                        <th>
                          <span className="sr-only">{t('col.action')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((source) => {
                        const run = latestRunBySource.get(source.id)
                        const status = run?.status ?? 'idle'
                        const reasons = status === 'failed' && run?.errorSummary ? run.errorSummary.split('\n').filter(Boolean) : []
                        return (
                          <tr key={source.id}>
                            <td>
                              <span className="ui-stack-xs">
                                <span className="ui-kb-source">
                                  {source.name}
                                  {!source.enabled ? <span className="ui-tag">{t('paused')}</span> : null}
                                </span>
                                <a className="ui-cell-url ui-footnote" href={source.canonicalUrl} target="_blank" rel="noreferrer" title={source.canonicalUrl}>
                                  {shortUrl(source.canonicalUrl)}
                                </a>
                              </span>
                            </td>
                            <td className="ui-nowrap">{label('authority', source.authorityLevel)}</td>
                            <td>
                              <span className="ui-stack-xs">
                                <StatusText status={RUN_STATUS[status] ?? 'draft'} label={label('runStatus', status)} />
                                {reasons.map((code) => (
                                  <span key={code} className="ui-error">
                                    {label('errorReason', code)}
                                  </span>
                                ))}
                              </span>
                            </td>
                            <td className="ui-num">{run?.fetchedCount ?? 0}</td>
                            <td className="ui-num">{run?.changedCount ?? 0}</td>
                            <td className="ui-num">{run?.errorCount ?? 0}</td>
                            <td>
                              <span className="ui-row-actions">
                                <Button
                                  size="sm"
                                  disabled={busy !== null || !source.enabled}
                                  loading={busy === `${source.id}:ingest`}
                                  onClick={() => action(`${source.id}:ingest`, () => post('/api/knowledge/ingest', { sourceId: source.id, provider }))}
                                >
                                  {t('ingest')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="quiet"
                                  disabled={busy !== null || !source.enabled}
                                  loading={busy === `${source.id}:backfill`}
                                  onClick={() => action(`${source.id}:backfill`, () => post('/api/knowledge/ingest', { sourceId: source.id, backfill: true, provider }))}
                                >
                                  {t('backfill')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="quiet"
                                  disabled={busy !== null}
                                  loading={busy === `${source.id}:toggle`}
                                  onClick={() => action(`${source.id}:toggle`, () => post(`/api/knowledge/sources/${source.id}`, { enabled: !source.enabled }, 'PATCH'))}
                                >
                                  {source.enabled ? t('pause') : t('enable')}
                                </Button>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {view === 'claims' ? (
              <>
                <div className="ui-viewbar">
                  <p className="ui-hint">{t('gate1')}</p>
                  <Button disabled={busy !== null} loading={busy === 'release-knowledge'} onClick={() => action('release-knowledge', () => post('/api/knowledge/release', {}))}>
                    {t('releaseKnowledge')}
                  </Button>
                </div>
                {claims.length === 0 ? (
                  <div className="ui-panel">
                    <EmptyState title={t('claimsEmpty')} description={t('claimsEmptyHint')} />
                  </div>
                ) : (
                  <ul className="ui-panel ui-kb-list">
                    {claims.map((item) => {
                      const open = editing?.id === item.claim.id ? editing : null
                      return (
                        <li key={item.claim.id} className="ui-kb-item">
                          <p className="ui-kb-item__meta">
                            <span>{item.claim.topic}</span>
                            <span>{label('claimType', item.claim.claimType)}</span>
                            <span>{label('confidence', item.claim.confidence)}</span>
                          </p>
                          <p className="ui-kb-item__title">{item.claim.statementZh}</p>
                          <p className="ui-hint">{item.claim.statementEn}</p>
                          {item.claim.officialConflict ? <p className="ui-error">{t('officialConflict')}</p> : null}
                          <blockquote className="ui-kb-quote">
                            <span className="ui-footnote">{t('quote')}</span>
                            {item.exactQuote}
                          </blockquote>
                          <p className="ui-kb-item__source">
                            <span>
                              {t('sourceLabel')}：{item.sourceName}
                              {item.community ? ` / r/${item.community}` : ''}
                            </span>
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                              {item.documentTitle || shortUrl(item.sourceUrl)}
                            </a>
                            <a href={`/api/knowledge/source-versions/${item.claim.documentVersionId}`} target="_blank" rel="noreferrer">
                              {t('rawSnapshot')}
                            </a>
                          </p>

                          {open ? (
                            <form
                              className="ui-kb-editor"
                              aria-label={open.mode === 'edit' ? t('dialogEdit') : t('dialogReject')}
                              onSubmit={(event) => {
                                event.preventDefault()
                                void reviewClaim(item, open.mode === 'edit' ? 'edit' : 'reject')
                              }}
                            >
                              {open.mode === 'edit' ? (
                                <>
                                  <div className="ui-field">
                                    <label className="ui-label" htmlFor={`${uid}-zh-${item.claim.id}`}>
                                      {t('editZh')}
                                    </label>
                                    <textarea id={`${uid}-zh-${item.claim.id}`} className="ui-textarea" rows={3} value={editZh} onChange={(event) => setEditZh(event.target.value)} />
                                  </div>
                                  <div className="ui-field">
                                    <label className="ui-label" htmlFor={`${uid}-en-${item.claim.id}`}>
                                      {t('editEn')}
                                    </label>
                                    <textarea id={`${uid}-en-${item.claim.id}`} className="ui-textarea" rows={3} value={editEn} onChange={(event) => setEditEn(event.target.value)} />
                                  </div>
                                </>
                              ) : null}
                              <div className="ui-field">
                                <label className="ui-label" htmlFor={`${uid}-reason-${item.claim.id}`}>
                                  {t('reason')}
                                </label>
                                <textarea
                                  id={`${uid}-reason-${item.claim.id}`}
                                  className="ui-textarea"
                                  rows={2}
                                  value={reason}
                                  placeholder={t('reasonPlaceholder')}
                                  onChange={(event) => setReason(event.target.value)}
                                />
                              </div>
                              <div className="ui-inline-actions">
                                <Button variant="quiet" onClick={() => setEditing(null)}>
                                  {t('cancel')}
                                </Button>
                                {open.mode === 'edit' ? (
                                  <Button type="submit" variant="primary" loading={busy === item.claim.id} disabled={busy !== null || !editZh.trim()}>
                                    {t('editApprove')}
                                  </Button>
                                ) : (
                                  <Button type="submit" variant="danger" loading={busy === item.claim.id} disabled={busy !== null || !reason.trim()}>
                                    {t('reject')}
                                  </Button>
                                )}
                              </div>
                            </form>
                          ) : (
                            <div className="ui-inline-actions">
                              <Button size="sm" disabled={busy !== null} onClick={() => openEditor(item, 'reject')}>
                                {t('reject')}
                              </Button>
                              <Button size="sm" disabled={busy !== null} onClick={() => openEditor(item, 'edit')}>
                                {t('editApprove')}
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={busy !== null}
                                loading={busy === item.claim.id}
                                // 与官方说法冲突的论点不能直接批准：先打开编辑区，改完再批。
                                onClick={() => (item.claim.officialConflict ? openEditor(item, 'edit') : void reviewClaim(item, 'approve'))}
                              >
                                {t('approve')}
                              </Button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            ) : null}

            {view === 'library' ? (
              <>
                <form className="ui-viewbar__form" onSubmit={searchKnowledge} role="search">
                  <label className="sr-only" htmlFor={`${uid}-search`}>
                    {t('searchLabel')}
                  </label>
                  <input
                    id={`${uid}-search`}
                    type="search"
                    className="ui-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('searchPlaceholder')}
                  />
                  <Button type="submit" disabled={!searchQuery.trim() || busy !== null} loading={busy === 'search'}>
                    {t('search')}
                  </Button>
                  {searchResults !== null ? (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setSearchResults(null)
                        setSearchQuery('')
                      }}
                    >
                      {t('clearSearch')}
                    </Button>
                  ) : null}
                </form>

                {searchResults !== null ? (
                  searchResults.length === 0 ? (
                    <div className="ui-panel">
                      <EmptyState title={t('searchEmpty')} />
                    </div>
                  ) : (
                    <ul className="ui-panel ui-kb-list">
                      {searchResults.map((result) => (
                        <li key={result.version.id} className="ui-kb-item">
                          <p className="ui-kb-item__meta">
                            <span>{result.entry.topic}</span>
                            <span>{t('score', { score: result.score })}</span>
                          </p>
                          <p className="ui-kb-item__title">{isZh ? result.version.titleZh : result.version.titleEn}</p>
                          <p className="ui-hint">{isZh ? result.version.bodyZh : result.version.bodyEn}</p>
                          {result.version.sourceUrls.length ? (
                            <ul className="ui-kv__list">
                              {result.version.sourceUrls.map((url) => (
                                <li key={url}>
                                  {url.startsWith('http') ? (
                                    <a className="ui-cell-url" href={url} target="_blank" rel="noreferrer" title={url}>
                                      {shortUrl(url)}
                                    </a>
                                  ) : (
                                    <span className="ui-mono ui-cell-url" title={url}>
                                      {url}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <div className="ui-panel ui-table-wrap">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          <th>{t('libCol.key')}</th>
                          <th>{t('libCol.topic')}</th>
                          <th>{t('libCol.type')}</th>
                          <th>{t('libCol.version')}</th>
                          <th>{t('libCol.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="ui-mono">{entry.stableKey}</td>
                            <td>{entry.topic}</td>
                            <td>{label('claimType', entry.knowledgeType)}</td>
                            <td className="ui-mono ui-cell-muted">{entry.currentVersionId ?? '—'}</td>
                            <td>
                              <StatusText status={ENTRY_STATUS[entry.status] ?? 'draft'} label={label('entryStatus', entry.status)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}

            {view === 'workflow' ? (
              <>
                <div className="ui-viewbar">
                  <p className="ui-hint">{t('gate2')}</p>
                  <Button disabled={busy !== null} loading={busy === 'release-workflow'} onClick={() => action('release-workflow', () => post('/api/knowledge/workflows/release'))}>
                    {t('releaseWorkflow')}
                  </Button>
                </div>
                {proposals.length === 0 ? (
                  <div className="ui-panel">
                    <EmptyState title={t('proposalsEmpty')} />
                  </div>
                ) : (
                  <ul className="ui-panel ui-kb-list">
                    {proposals.map((proposal) => (
                      <li key={proposal.id} className="ui-kb-item">
                        <p className="ui-kb-item__meta">
                          <span className="ui-mono">{proposal.knowledgeReleaseVersion}</span>
                          <StatusText status={PROPOSAL_STATUS[proposal.status] ?? 'draft'} label={label('proposalStatus', proposal.status)} />
                        </p>
                        <p className="ui-kb-item__title">{proposal.title}</p>
                        <p className="ui-hint">{proposal.rationale}</p>
                        <details className="ui-disclosure">
                          <summary>{t('proposalDiff')}</summary>
                          <CodeBlock code={JSON.stringify(proposal.diff, null, 2)} copyLabel={tc('actions.copyCode')} copiedLabel={tc('actions.copied')} />
                        </details>
                        {proposal.status === 'pending_review' ? (
                          <div className="ui-inline-actions">
                            <Button
                              size="sm"
                              disabled={busy !== null}
                              loading={busy === `${proposal.id}:reject`}
                              onClick={() =>
                                action(`${proposal.id}:reject`, () => post(`/api/knowledge/workflows/${proposal.id}`, { action: 'reject', reason: t('rejectReasonDefault') }, 'PATCH'))
                              }
                            >
                              {t('reject')}
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy !== null}
                              loading={busy === `${proposal.id}:approve`}
                              onClick={() => action(`${proposal.id}:approve`, () => post(`/api/knowledge/workflows/${proposal.id}`, { action: 'approve' }, 'PATCH'))}
                            >
                              {t('approve')}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
