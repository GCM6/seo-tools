import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { ButtonLink } from './Button'
import { Facts } from './Facts'
import { Lifecycle } from './Lifecycle'
import { LocalTime } from './LocalTime'
import { RetestButton } from './RetestButton'
import { WorkspaceTabs, type WorkspaceView } from './WorkspaceTabs'
import { countRunEvidence, getFindings, getProject, getRecommendations, getRun } from '@/lib/repositories'
import { marketLabel } from '@/lib/markets'
import { displayDomain, isRunFinished, lifecycleSteps, nextAction, runShortId, type RecCounts } from '@/lib/runs/workspace'
import type { RunStatus } from '@/lib/types'

// 诊断工作区外壳（ux-blueprint §3，取代旧 Shell + Stepper + SectionNav）：
// 面包屑 / h1 域名 / 事实栏 / 进度 / 主动作，下面是视图导航，所有 /runs/[id]/** 共用。
// Server Component：自己取 run、项目与计数，页面只需传 runId、locale 和当前视图。
export async function RunWorkspace({
  runId,
  locale,
  current,
  children,
}: {
  runId: string
  locale: string
  current: WorkspaceView
  children: ReactNode
}) {
  const [t, tr, tp, run, recs, findings, evidenceCount] = await Promise.all([
    getTranslations('workspace'),
    getTranslations('retest'),
    getTranslations('projects'),
    getRun(runId),
    getRecommendations(runId),
    getFindings(runId),
    countRunEvidence(runId),
  ])
  if (!run) notFound()
  const project = await getProject(run.projectId)

  const counts: RecCounts = {
    total: recs.length,
    draft: recs.filter((r) => r.status === 'draft').length,
    decided: recs.filter((r) => r.status === 'accepted' || r.status === 'edited').length,
    applied: recs.filter((r) => (r.status === 'accepted' || r.status === 'edited') && r.appliedAt).length,
  }
  const status = run.status as RunStatus
  const action = nextAction(status, counts)
  const finished = isRunFinished(status)
  const domain = project ? displayDomain(project.domain) : runId
  const base = `/${locale}/runs/${runId}`
  const issueCount = findings.filter((f) => f.status !== 'dismissed').length
  const timeIso = run.finishedAt ?? run.startedAt ?? null

  return (
    <div className="ui-ws">
      <header className="ui-ws-head">
        <nav className="ui-crumbs" aria-label="breadcrumb">
          <Link href={`/${locale}/projects`}>{t('crumbProjects')}</Link>
          <span aria-hidden="true">/</span>
          {project ? <Link href={`/${locale}/projects/${project.id}`}>{domain}</Link> : <span>{domain}</span>}
          <span aria-hidden="true">/</span>
          <span>{t(run.runType === 'retest' ? 'runType.retest' : 'runType.baseline')}</span>
        </nav>

        <div className="ui-ws-head__row">
          <div className="ui-ws-head__main">
            <h1 className="ui-ws-head__title">{domain}</h1>
            <Facts
              items={[
                { label: t('facts.market'), value: (project && marketLabel(project.market, locale)) ?? project?.market ?? '—' },
                {
                  label: run.finishedAt ? t('facts.finishedAt') : t('facts.startedAt'),
                  value: timeIso ? <LocalTime iso={timeIso} /> : t('facts.timeUnknown'),
                },
                { label: t('facts.protocol'), value: run.protocolVersion, mono: true },
                { label: t('facts.rules'), value: run.rulesVersion, mono: true },
                { label: t('facts.evidence'), value: t('facts.evidenceCount', { n: evidenceCount }) },
                { label: t('facts.runId'), value: runShortId(runId), mono: true },
              ]}
            />
          </div>
          <div className="ui-ws-head__actions">
            {action?.kind === 'review' ? (
              <ButtonLink href={`${base}/recommendations`} variant="primary">
                {action.pending > 0 ? t('action.review', { n: action.pending }) : t('action.reviewNone')}
              </ButtonLink>
            ) : action?.kind === 'execute' ? (
              <ButtonLink href={`${base}/output`} variant="primary">
                {t('action.execute')}
              </ButtonLink>
            ) : null}
            {finished ? (
              <ButtonLink href={`${base}/report`}>{t('action.share')}</ButtonLink>
            ) : null}
            {finished ? (
              <RetestButton
                locale={locale}
                baselineRunId={runId}
                className="ui-btn ui-btn--quiet"
                labels={{
                  cta: tp('actionRetest'),
                  starting: tr('starting'),
                  error: tr('error'),
                  inProgress: tr('inProgress'),
                  needsSetup: tr('needsSetup'),
                }}
              />
            ) : null}
          </div>
        </div>

        <Lifecycle
          steps={lifecycleSteps(status, counts)}
          ariaLabel={t('life.label')}
          failedLabel={t('life.failed')}
          labels={{
            collect: t('life.collect'),
            diagnose: t('life.diagnose'),
            review: t('life.review'),
            execute: t('life.execute'),
            retest: t('life.retest'),
          }}
        />
      </header>

      <WorkspaceTabs
        current={current}
        ariaLabel={t('tabs.label')}
        asideLabel={t('tabs.rawData')}
        main={[
          { view: 'overview', href: base, label: t('tabs.overview') },
          { view: 'issues', href: `${base}/issues`, label: t('tabs.issues'), count: issueCount ? String(issueCount) : undefined },
          { view: 'recs', href: `${base}/recommendations`, label: t('tabs.recs'), count: counts.total ? String(counts.total) : undefined },
          { view: 'exec', href: `${base}/output`, label: t('tabs.exec'), count: counts.decided ? `${counts.applied}/${counts.decided}` : undefined },
          { view: 'report', href: `${base}/report`, label: t('tabs.report') },
        ]}
        aside={[
          { view: 'site', href: `${base}/site`, label: t('tabs.site') },
          { view: 'keywords', href: `${base}/keywords`, label: t('tabs.keywords') },
          { view: 'competitors', href: `${base}/competitors`, label: t('tabs.competitors') },
          { view: 'facts', href: `${base}/facts`, label: t('tabs.facts') },
        ]}
      />

      <div className="ui-ws-body">{children}</div>
    </div>
  )
}
