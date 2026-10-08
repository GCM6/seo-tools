import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getAnalysisSession, getKnowledgeVersionsByIds, getSessionArtifacts, getSessionSteps } from '@/lib/knowledge/repository'
import { WORKFLOW_V1 } from '@/lib/knowledge/workflow'
import { displayDomain } from '@/lib/runs/workspace'
import { CodeBlock } from '@/components/CodeBlock'
import { Facts } from '@/components/Facts'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { ShowMoreRows } from '@/components/ShowMoreRows'
import { StatusText, type StatusKind } from '@/components/StatusText'
import { SessionInputForm } from './SessionInputForm'

// 节点标题与用途来自工作流定义：各版本发版时只追加知识引用（releaseWorkflow），标题不变，按 WORKFLOW_V1 取即可。
const NODES = new Map(WORKFLOW_V1.nodes.map((node) => [node.id, node]))

// 步骤状态 → 状态文字形状：已完成 ✓、等待 / 进行中 空心圆、失败 / 跳过 灰字。
const STEP_STATUS: Record<string, StatusKind> = {
  completed: 'accepted',
  pending: 'draft',
  running: 'draft',
  waiting_input: 'draft',
  skipped: 'rejected',
  failed: 'rejected',
}

// 分析会话（ux-blueprint §6）：h1 = 问题原文，事实栏写场景 / 状态 / 各版本；执行路线是真实顺序，用有序列表；
// 调用的知识用表格；每一步的原始产物折叠放在最后。
export default async function AnalysisSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getAnalysisSession(id)
  if (!session) notFound()
  const [steps, artifacts, t, tc] = await Promise.all([
    getSessionSteps(id),
    getSessionArtifacts(id),
    getTranslations('sessions'),
    getTranslations('common'),
  ])
  const knowledgeRefs = [...new Set(steps.flatMap((step) => step.knowledgeVersionRefs))]
  const knowledgeVersions = await getKnowledgeVersionsByIds(knowledgeRefs)
  const isZh = locale === 'zh'
  const label = (group: string, key: string | null | undefined) => (key && t.has(`${group}.${key}`) ? t(`${group}.${key}`) : (key ?? '—'))
  const sep = isZh ? '、' : ', '

  return (
    <section className="ui-page">
      <PageHeader
        crumbs={[{ label: t('crumb') }]}
        title={session.goal}
        description={session.domain ? displayDomain(session.domain) : t('noDomain')}
      />

      <div className="ui-page-body">
        <Facts
          items={[
            { label: t('fact.scenario'), value: label('scenario', session.scenario) },
            { label: t('fact.status'), value: label('status', session.status) },
            { label: t('fact.knowledge'), value: session.knowledgeReleaseVersion, mono: true },
            { label: t('fact.workflow'), value: session.workflowVersion, mono: true },
            { label: t('fact.rules'), value: session.rulesVersion ?? '—', mono: true },
            { label: t('fact.ruleConfig'), value: session.ruleConfigVersion ?? '—', mono: true },
          ]}
        />

        {session.status === 'waiting_input' ? (
          <section className="ui-panel" aria-labelledby="session-input">
            <div className="ui-panel__head">
              <h2 className="ui-panel__title" id="session-input">
                {t('needInput')}
              </h2>
            </div>
            <div className="ui-panel__body ui-group">
              <p className="ui-hint">{t('needInputFields', { fields: session.missingFields.map((f) => label('field', f)).join(sep) })}</p>
              <SessionInputForm sessionId={id} locale={locale} missingFields={session.missingFields} />
            </div>
          </section>
        ) : null}

        <section className="ui-section" aria-labelledby="session-route">
          <SectionHeader
            id="session-route"
            title={t('routeTitle')}
            action={<Link href={`/${locale}/knowledge`}>{t('openKnowledge')}</Link>}
          />
          <ol className="ui-panel ui-route">
            {steps.map((step) => {
              const node = NODES.get(step.stepId)
              const sources = step.requiredSources.length ? step.requiredSources.map((s) => label('source', s)).join(' · ') : t('noSources')
              return (
                <li key={step.id} className="ui-route__step">
                  <span className="ui-route__n ui-num">{String(step.sequence + 1).padStart(2, '0')}</span>
                  <div className="ui-route__main">
                    <p className="ui-route__title">
                      <span className="ui-mono ui-route__id">{step.stepId}</span>
                      {node ? node.title : null}
                    </p>
                    {node ? <p className="ui-hint">{node.purpose}</p> : null}
                    <p className="ui-route__meta">
                      {label('reason', step.routeReason)} · {sources}
                    </p>
                  </div>
                  <div className="ui-route__state">
                    <StatusText status={STEP_STATUS[step.status] ?? 'draft'} label={label('stepStatus', step.status)} />
                    <span className="ui-footnote">{t('knowledgeRefs', { count: step.knowledgeVersionRefs.length })}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        {knowledgeVersions.length ? (
          <section className="ui-section" aria-labelledby="session-knowledge">
            <SectionHeader id="session-knowledge" title={t('knowledgeTitle')} note={String(knowledgeVersions.length)} />
            <ShowMoreRows
              labels={{ showAll: t('showAll', { count: knowledgeVersions.length }), showLess: t('showLess') }}
              head={
                <thead>
                  <tr>
                    <th>{t('colKnowledge')}</th>
                    <th>{t('colVersion')}</th>
                    <th>{t('colSources')}</th>
                  </tr>
                </thead>
              }
              rows={knowledgeVersions.map((version) => (
                <tr key={version.id}>
                  <td>
                    <div className="ui-route__knowledge">
                      <strong>{isZh ? version.titleZh : version.titleEn}</strong>
                      <span className="ui-hint">{isZh ? version.bodyZh : version.bodyEn}</span>
                    </div>
                  </td>
                  <td className="ui-mono ui-nowrap">{version.id}</td>
                  <td>
                    <ul className="ui-kv__list">
                      {version.sourceUrls.slice(0, 3).map((url) => (
                        <li key={url}>
                          {url.startsWith('http') ? (
                            <a className="ui-cell-url" href={url} target="_blank" rel="noreferrer" title={url}>
                              {url.replace(/^https?:\/\/(www\.)?/, '')}
                            </a>
                          ) : (
                            <span className="ui-mono ui-cell-url" title={url}>
                              {url}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            />
          </section>
        ) : null}

        {artifacts.length ? (
          <section className="ui-section" aria-labelledby="session-artifacts">
            <SectionHeader id="session-artifacts" title={t('artifactsTitle')} note={t('artifactsNote')} />
            <ul className="ui-panel ui-plainlist">
              {artifacts.map((artifact) => (
                <li key={artifact.id}>
                  <details className="ui-disclosure ui-route__artifact">
                    <summary>
                      <span className="ui-mono">{artifact.artifactType}</span>
                      <span className="ui-footnote ui-mono">{artifact.id.slice(-8)}</span>
                    </summary>
                    <CodeBlock code={JSON.stringify(artifact.payload, null, 2)} copyLabel={tc('actions.copyCode')} copiedLabel={tc('actions.copied')} />
                    {artifact.evidenceRefs.length ? (
                      <ul className="ui-kv__list">
                        {artifact.evidenceRefs.map((ref) => (
                          <li key={ref}>
                            {ref.startsWith('http') ? (
                              <a className="ui-cell-url" href={ref} target="_blank" rel="noreferrer" title={ref}>
                                {ref}
                              </a>
                            ) : (
                              <span className="ui-mono">{ref}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  )
}
