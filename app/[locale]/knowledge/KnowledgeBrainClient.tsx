'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Source = {
  id: string; sourceType: string; name: string; canonicalUrl: string; authorityLevel: string; enabled: boolean;
  lastSuccessAt: string | null
}
type IngestRun = {
  id: string; sourceId: string | null; status: string; fetchedCount: number; changedCount: number; errorCount: number;
  startedAt: string; coverage: unknown
}
type ReviewClaim = {
  claim: { id: string; documentVersionId: string; claimType: string; topic: string; statementZh: string; statementEn: string; confidence: string; officialConflict: boolean; createdAt: string }
  sourceUrl: string; exactQuote: string; sourceName: string; sourceType: string; documentTitle: string; community: string | null
}
type Entry = { id: string; stableKey: string; knowledgeType: string; topic: string; status: string; currentVersionId: string | null }
type Proposal = { id: string; title: string; rationale: string; status: string; knowledgeReleaseVersion: string; evidenceRefs: string[]; diff: unknown }
type SearchResult = { score: number; entry: Entry; version: { id: string; titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; sourceUrls: string[] } }

const zh = {
  title: 'SEO 知识脑', subtitle: '把外部变化转化为可审计、可发布、可回滚的诊断能力。',
  ingest: '来源雷达', claims: '论点审核', library: '正式知识', workflow: '工作流闸门',
  run: '采集', backfill: '回填一年', releaseKnowledge: '发布知识版本', releaseWorkflow: '发布工作流版本',
  approve: '批准', editApprove: '编辑后批准', reject: '驳回', pending: '待审核', source: '来源', quote: '原文证据',
  emptyClaims: '暂无待审核论点。采集完成后，模型蒸馏结果会出现在这里。', emptyProposals: '暂无工作流变更提案。',
  firstGate: '第一道人审', secondGate: '第二道人审', refresh: '刷新',
}
const en = {
  title: 'SEO Knowledge Brain', subtitle: 'Turn external change into auditable, releasable, and reversible diagnostic capability.',
  ingest: 'Source radar', claims: 'Claim review', library: 'Published knowledge', workflow: 'Workflow gate',
  run: 'Ingest', backfill: 'Backfill one year', releaseKnowledge: 'Release knowledge', releaseWorkflow: 'Release workflow',
  approve: 'Approve', editApprove: 'Edit & approve', reject: 'Reject', pending: 'Pending', source: 'Source', quote: 'Exact evidence',
  emptyClaims: 'No claims await review. Distilled results will appear here after ingestion.', emptyProposals: 'No workflow proposals yet.',
  firstGate: 'First human gate', secondGate: 'Second human gate', refresh: 'Refresh',
}

export function KnowledgeBrainClient({ locale, sources, runs, claims, entries, proposals, releases }: {
  locale: string; sources: Source[]; runs: IngestRun[]; claims: ReviewClaim[]; entries: Entry[]; proposals: Proposal[];
  releases: { knowledge: string; workflow: string; ruleConfig: string }
}) {
  const t = locale === 'zh' ? zh : en
  const router = useRouter()
  const [tab, setTab] = useState<'ingest' | 'claims' | 'library' | 'workflow'>('ingest')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<ReviewClaim | null>(null)
  const [editZh, setEditZh] = useState('')
  const [editEn, setEditEn] = useState('')
  const [reason, setReason] = useState('')
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'deepseek'>('deepseek')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [customSourceType, setCustomSourceType] = useState<'reddit_community' | 'reddit_search'>('reddit_community')
  const [customSourceValue, setCustomSourceValue] = useState('')
  const latestRunBySource = useMemo(() => new Map(runs.map((run) => [run.sourceId, run])), [runs])

  async function action(id: string, fn: () => Promise<Response>) {
    setBusy(id); setMessage(null)
    try {
      const response = await fn()
      const body = await response.json().catch(() => ({})) as { error?: string; version?: string }
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setMessage(body.version ? `✓ ${body.version}` : '✓')
      setEditing(null); setReason(''); router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  function reviewClaim(claim: ReviewClaim, reviewAction: 'approve' | 'edit' | 'reject') {
    return action(claim.claim.id, () => fetch(`/api/knowledge/claims/${claim.claim.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: reviewAction, reason,
        edited: reviewAction === 'edit' ? { statementZh: editZh, statementEn: editEn } : undefined,
      }),
    }))
  }

  async function searchKnowledge(event: React.FormEvent) {
    event.preventDefault()
    if (!searchQuery.trim()) return
    setBusy('search'); setMessage(null)
    try {
      const response = await fetch(`/api/knowledge?q=${encodeURIComponent(searchQuery.trim())}`)
      const body = await response.json() as { results?: SearchResult[]; error?: string }
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setSearchResults(body.results ?? [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally { setBusy(null) }
  }

  function addSource(event: React.FormEvent) {
    event.preventDefault()
    const value = customSourceValue.trim().replace(/^r\//i, '')
    if (!value) return
    const community = customSourceType === 'reddit_community'
    const canonicalUrl = community ? `https://www.reddit.com/r/${encodeURIComponent(value)}/` : `https://www.reddit.com/search/?q=${encodeURIComponent(value)}`
    void action('add-source', () => fetch('/api/knowledge/sources', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: customSourceType,
        name: community ? `r/${value}` : `Reddit search: ${value}`,
        canonicalUrl,
        config: community ? { community: value, cadence: 'daily', backfillDays: 365, includeComments: true } : { query: value, cadence: 'daily', backfillDays: 365, includeComments: true },
      }),
    }))
    setCustomSourceValue('')
  }

  return (
    <div className="kb-page">
      <header className="kb-hero">
        <div>
          <span className="kb-eyebrow">VERIS / KNOWLEDGE OPERATIONS</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="kb-release-stack" aria-label="Release versions">
          <Version label="KNOWLEDGE" value={releases.knowledge} />
          <Version label="WORKFLOW" value={releases.workflow} />
          <Version label="RULE CONFIG" value={releases.ruleConfig} />
        </div>
      </header>

      <div className="kb-pipeline" aria-label="Knowledge pipeline">
        {[
          ['01', t.ingest, sources.length], ['02', t.claims, claims.length], ['03', t.library, entries.filter((e) => e.status === 'published').length],
          ['04', t.workflow, proposals.filter((p) => p.status === 'pending_review').length],
        ].map(([number, label, count], index) => (
          <button key={String(number)} className={`kb-pipe-stage ${tab === ['ingest', 'claims', 'library', 'workflow'][index] ? 'active' : ''}`} onClick={() => setTab(['ingest', 'claims', 'library', 'workflow'][index] as typeof tab)}>
            <span>{number}</span><strong>{label}</strong><em>{count}</em>
          </button>
        ))}
      </div>

      {message ? <div className="kb-message" role="status">{message}</div> : null}

      {tab === 'ingest' ? (
        <section className="kb-panel">
          <div className="kb-panel-head"><div><span>INGESTION MATRIX</span><h2>{t.ingest}</h2></div><div className="kb-source-actions"><label>AI
            <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option></select>
          </label><button className="kb-button" disabled={Boolean(busy)} onClick={() => action('backfill-all', () => fetch('/api/knowledge/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: 'all', backfill: true, provider }) }))}>{locale === 'zh' ? '全源回填一年' : 'Backfill all sources'}</button><button className="kb-button ghost" onClick={() => router.refresh()}>{t.refresh}</button></div></div>
          <form className="kb-add-source" onSubmit={addSource}><select value={customSourceType} onChange={(event) => setCustomSourceType(event.target.value as typeof customSourceType)}><option value="reddit_community">Reddit community</option><option value="reddit_search">Reddit search query</option></select><input value={customSourceValue} onChange={(event) => setCustomSourceValue(event.target.value)} placeholder={customSourceType === 'reddit_community' ? 'TechSEO' : 'international SEO'} /><button disabled={!customSourceValue.trim() || busy === 'add-source'}>{locale === 'zh' ? '添加订阅' : 'Add source'}</button></form>
          <div className="kb-source-grid">
            {sources.map((source) => {
              const run = latestRunBySource.get(source.id)
              return <article className="kb-source" key={source.id}>
                <div className="kb-source-top"><span className={`kb-source-mark ${source.authorityLevel}`}>{source.authorityLevel === 'official' ? 'G' : 'r/'}</span><span className={`kb-status ${run?.status ?? 'idle'}`}>{run?.status ?? 'idle'}</span></div>
                <h3>{source.name}</h3>
                <a href={source.canonicalUrl} target="_blank" rel="noreferrer">{source.canonicalUrl.replace(/^https?:\/\//, '').slice(0, 58)}</a>
                <dl><div><dt>FETCHED</dt><dd>{run?.fetchedCount ?? 0}</dd></div><div><dt>CHANGED</dt><dd>{run?.changedCount ?? 0}</dd></div><div><dt>ERRORS</dt><dd>{run?.errorCount ?? 0}</dd></div></dl>
                <div className="kb-source-actions">
                  <button className="ghost" disabled={busy === source.id} onClick={() => action(source.id, () => fetch(`/api/knowledge/sources/${source.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !source.enabled }) }))}>{source.enabled ? (locale === 'zh' ? '暂停' : 'Pause') : (locale === 'zh' ? '启用' : 'Enable')}</button>
                  <button disabled={busy === source.id || !source.enabled} onClick={() => action(source.id, () => fetch('/api/knowledge/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: source.id, provider }) }))}>{t.run}</button>
                  <button disabled={busy === source.id || !source.enabled} onClick={() => action(source.id, () => fetch('/api/knowledge/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: source.id, backfill: true, provider }) }))}>{t.backfill}</button>
                </div>
              </article>
            })}
          </div>
        </section>
      ) : null}

      {tab === 'claims' ? (
        <section className="kb-panel">
          <div className="kb-panel-head"><div><span>{t.firstGate}</span><h2>{t.claims}</h2></div><button className="kb-button" disabled={Boolean(busy)} onClick={() => action('release-knowledge', () => fetch('/api/knowledge/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))}>{t.releaseKnowledge}</button></div>
          {claims.length === 0 ? <div className="kb-empty">{t.emptyClaims}</div> : <div className="kb-claim-list">{claims.map((item) => (
            <article className="kb-claim" key={item.claim.id}>
              <div className="kb-claim-meta"><span>{item.claim.topic}</span><span>{item.claim.claimType}</span><span className={item.claim.officialConflict ? 'danger' : ''}>{item.claim.confidence}</span></div>
              <h3>{item.claim.statementZh}</h3><p>{item.claim.statementEn}</p>
              <blockquote><small>{t.quote}</small>{item.exactQuote}</blockquote>
              <div className="kb-claim-source"><span>{t.source}: {item.sourceName}{item.community ? ` / r/${item.community}` : ''}</span><a href={item.sourceUrl} target="_blank" rel="noreferrer">↗ {item.documentTitle || item.sourceUrl}</a><a href={`/api/knowledge/source-versions/${item.claim.documentVersionId}`} target="_blank" rel="noreferrer">RAW SNAPSHOT ↗</a></div>
              <div className="kb-review-actions">
                <button disabled={Boolean(busy)} onClick={() => item.claim.officialConflict ? (setEditing(item), setEditZh(item.claim.statementZh), setEditEn(item.claim.statementEn), setReason('')) : reviewClaim(item, 'approve')}>{t.approve}</button>
                <button disabled={Boolean(busy)} onClick={() => { setEditing(item); setEditZh(item.claim.statementZh); setEditEn(item.claim.statementEn); setReason('') }}>{t.editApprove}</button>
                <button className="danger" disabled={Boolean(busy)} onClick={() => { setEditing(item); setEditZh(''); setEditEn(''); setReason('') }}>{t.reject}</button>
              </div>
            </article>
          ))}</div>}
        </section>
      ) : null}

      {tab === 'library' ? <section className="kb-panel"><div className="kb-panel-head"><div><span>RELEASED ATOMS</span><h2>{t.library}</h2></div><form className="kb-search" onSubmit={searchKnowledge}><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={locale === 'zh' ? '搜索已发布知识…' : 'Search published knowledge…'} /><button disabled={busy === 'search'}>{locale === 'zh' ? '检索' : 'Search'}</button></form></div>{searchResults.length ? <div className="kb-search-results">{searchResults.map((result) => <article key={result.version.id}><span>{result.entry.topic} · SCORE {result.score}</span><h3>{locale === 'zh' ? result.version.titleZh : result.version.titleEn}</h3><p>{locale === 'zh' ? result.version.bodyZh : result.version.bodyEn}</p>{result.version.sourceUrls.map((url) => url.startsWith('http') ? <a key={url} href={url} target="_blank" rel="noreferrer">{url} ↗</a> : <small key={url}>{url}</small>)}</article>)}</div> : <div className="kb-library-grid">{entries.map((entry) => <article key={entry.id}><span>{entry.topic}</span><h3>{entry.stableKey}</h3><p>{entry.knowledgeType}</p><code>{entry.currentVersionId}</code><em>{entry.status}</em></article>)}</div>}</section> : null}

      {tab === 'workflow' ? (
        <section className="kb-panel">
          <div className="kb-panel-head"><div><span>{t.secondGate}</span><h2>{t.workflow}</h2></div><button className="kb-button" disabled={Boolean(busy)} onClick={() => action('release-workflow', () => fetch('/api/knowledge/workflows/release', { method: 'POST' }))}>{t.releaseWorkflow}</button></div>
          {proposals.length === 0 ? <div className="kb-empty">{t.emptyProposals}</div> : <div className="kb-proposal-list">{proposals.map((proposal) => <article key={proposal.id}>
            <div><span>{proposal.knowledgeReleaseVersion}</span><em>{proposal.status}</em></div><h3>{proposal.title}</h3><p>{proposal.rationale}</p><pre>{JSON.stringify(proposal.diff, null, 2)}</pre>
            {proposal.status === 'pending_review' ? <div className="kb-review-actions"><button onClick={() => action(proposal.id, () => fetch(`/api/knowledge/workflows/${proposal.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }))}>{t.approve}</button><button className="danger" onClick={() => action(proposal.id, () => fetch(`/api/knowledge/workflows/${proposal.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: '人工驳回工作流变更' }) }))}>{t.reject}</button></div> : null}
          </article>)}</div>}
        </section>
      ) : null}

      {editing ? <div className="kb-modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}><div className="kb-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <span>{editing.claim.id}</span><h2>{t.firstGate}</h2>
        {editZh || editEn ? <><label>中文知识表述<textarea rows={4} value={editZh} onChange={(event) => setEditZh(event.target.value)} /></label><label>English knowledge statement<textarea rows={4} value={editEn} onChange={(event) => setEditEn(event.target.value)} /></label></> : null}
        <label>审核理由<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="必须记录驳回原因；编辑批准时建议说明修改依据" /></label>
        <div className="kb-review-actions"><button className="ghost" onClick={() => setEditing(null)}>取消</button>{editZh || editEn ? <button onClick={() => reviewClaim(editing, 'edit')}>{t.editApprove}</button> : <button className="danger" disabled={!reason.trim()} onClick={() => reviewClaim(editing, 'reject')}>{t.reject}</button>}</div>
      </div></div> : null}
    </div>
  )
}

function Version({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}
