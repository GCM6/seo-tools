import Link from 'next/link'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getAnalysisSession, getKnowledgeVersionsByIds, getSessionArtifacts, getSessionSteps } from '@/lib/knowledge/repository'
import { SessionInputForm } from './SessionInputForm'

export default async function AnalysisSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getAnalysisSession(id)
  if (!session) notFound()
  const steps = await getSessionSteps(id)
  const artifacts = await getSessionArtifacts(id)
  const knowledgeRefs = [...new Set(steps.flatMap((step) => step.knowledgeVersionRefs))]
  const knowledgeVersions = await getKnowledgeVersionsByIds(knowledgeRefs)
  const isZh = locale === 'zh'
  return <div className="session-page">
    <header><span>ANALYSIS SESSION / {session.id.slice(-8)}</span><h1>{session.goal}</h1><p>{session.domain || (isZh ? '无域名场景' : 'Domain-free scenario')}</p></header>
    <div className="session-snapshots">
      <div><span>SCENARIO</span><strong>{session.scenario}</strong></div><div><span>STATUS</span><strong>{session.status}</strong></div>
      <div><span>KNOWLEDGE</span><strong>{session.knowledgeReleaseVersion}</strong></div><div><span>WORKFLOW</span><strong>{session.workflowVersion}</strong></div>
      <div><span>RULES</span><strong>{session.rulesVersion}</strong></div><div><span>RULE CONFIG</span><strong>{session.ruleConfigVersion}</strong></div>
    </div>
    {session.status === 'waiting_input' ? <aside className="session-question"><strong>{isZh ? '需要补充信息' : 'More context required'}</strong><p>{isZh ? `请补充：${session.missingFields.join('、')}` : `Please provide: ${session.missingFields.join(', ')}`}</p><SessionInputForm sessionId={id} locale={locale} missingFields={session.missingFields} /></aside> : null}
    <section className="session-route"><div className="session-route-head"><div><span>EXECUTION ROUTE</span><h2>{isZh ? '诊断工作流' : 'Diagnostic workflow'}</h2></div><Link href={`/${locale}/knowledge`}>{isZh ? '查看知识脑 ↗' : 'Open knowledge brain ↗'}</Link></div>
      <ol>{steps.map((step) => <li key={step.id} className={step.status}><span>{String(step.sequence).padStart(2, '0')}</span><div><h3>{step.stepId}</h3><p>{step.routeReason} · {step.requiredSources.length ? step.requiredSources.join(' / ') : (isZh ? '无需外部数据' : 'No external source required')}</p></div><div><strong>{step.status}</strong><small>{step.knowledgeVersionRefs.length} KNOWLEDGE REFS</small></div></li>)}</ol>
    </section>
    {knowledgeVersions.length ? <section className="session-knowledge"><div><span>RETRIEVED KNOWLEDGE</span><h2>{isZh ? '本次路线调用的正式知识' : 'Published knowledge used by this route'}</h2></div><div className="session-knowledge-grid">{knowledgeVersions.map((version) => <article key={version.id}><code>{version.id}</code><h3>{isZh ? version.titleZh : version.titleEn}</h3><p>{isZh ? version.bodyZh : version.bodyEn}</p>{version.sourceUrls.slice(0, 3).map((url) => url.startsWith('http') ? <a key={url} href={url} target="_blank" rel="noreferrer">{url} ↗</a> : <small key={url}>{url}</small>)}</article>)}</div></section> : null}
    {artifacts.length ? <section className="session-knowledge"><div><span>STEP ARTIFACTS</span><h2>{isZh ? '每一步的可审计产物' : 'Auditable output from every step'}</h2></div><div className="session-artifacts">{artifacts.map((artifact) => <details key={artifact.id}><summary>{artifact.artifactType} · {artifact.id.slice(-8)}</summary><pre>{JSON.stringify(artifact.payload, null, 2)}</pre>{artifact.evidenceRefs.map((ref) => ref.startsWith('http') ? <a key={ref} href={ref} target="_blank" rel="noreferrer">{ref} ↗</a> : <small key={ref}>{ref}</small>)}</details>)}</div></section> : null}
  </div>
}
