import { setRequestLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { Notice } from '@/components/Notice'
import { EmptyState } from '@/components/EmptyState'
import { ButtonLink } from '@/components/Button'
import { SeverityMark, type SeverityLevel } from '@/components/SeverityMark'
import { ProjectList } from '@/components/ProjectList'
import { listProjectsWithSummary } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { summarizeDataSourceHealth } from '@/lib/settings/data-source-health'
import { marketLabel } from '@/lib/markets'
import { buildTodos, type TodoKind } from '@/lib/projects/todos'
import { projectListLabels } from '@/lib/projects/list-labels'
import { displayDomain } from '@/lib/runs/workspace'

export const dynamic = 'force-dynamic'

// 待处理条目的紧急程度：失败的诊断最急；待确认建议与到期复查次之；还没诊断过的项目只是提示。
const TODO_LEVEL: Record<TodoKind, SeverityLevel> = { failed: 'high', review: 'mid', retest: 'mid', unstarted: 'low' }
const TODO_SEV_KEY: Record<SeverityLevel, string> = { high: 'high', mid: 'mid', low: 'ok', pass: 'ok' }
const MAX_TODOS = 5

// 首页 = 工作台（ux-blueprint §1）：打开就知道今天要处理什么。待处理 → 项目 → 数据源一行状态。
// 不再是营销式欢迎横幅；新建分析的主按钮在顶栏里，页面内不再重复放第二个主按钮。
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, tp, tr, tw, tSettings, rawProjects, dataHealth] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('projects'),
    getTranslations('retest'),
    getTranslations('workspace'),
    getTranslations('settings'),
    listProjectsWithSummary(),
    loadDataSourceStatuses().then(summarizeDataSourceHealth),
  ])
  const projects = rawProjects.map((p) => ({ ...p, market: marketLabel(p.market, locale) ?? tp('marketUnset') }))
  const todos = buildTodos(projects, locale, new Date())
  const sourceNames: Record<string, string> = {
    googleCse: tSettings('source.googleCse'),
    aiProbe: tSettings('source.aiProbe'),
    dataforseo: tSettings('source.dataforseo'),
    render: tSettings('source.render'),
  }
  const missingSources = dataHealth.items.filter((i) => !i.up).map((i) => sourceNames[i.key] ?? i.key)

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {projects.length === 0 ? (
        <div className="ui-panel">
          <EmptyState
            title={tp('empty')}
            description={tp('emptyHint')}
            action={
              <ButtonLink href={`/${locale}/new`} variant="primary">
                {tp('newAnalysis')}
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {/* 待处理：对象 + 数量 + 动作 */}
          <section className="ui-section" aria-labelledby="home-todos">
            <SectionHeader
              id="home-todos"
              title={t('todosTitle')}
              note={todos.length > MAX_TODOS ? t('todosMore', { shown: MAX_TODOS, total: todos.length }) : undefined}
            />
            {todos.length ? (
              <ul className="ui-panel ui-todos">
                {todos.slice(0, MAX_TODOS).map((todo) => {
                  const level = TODO_LEVEL[todo.kind]
                  return (
                    <li key={todo.key} className="ui-todo">
                      <SeverityMark level={level} label={tw(`sev.${TODO_SEV_KEY[level]}`)} />
                      <span className="ui-todo__what">
                        <span className="ui-mono">{displayDomain(todo.domain)}</span>
                        <span>{t(`todo.${todo.kind}`, { count: todo.count ?? 0 })}</span>
                      </span>
                      <Link href={todo.href} className="ui-todo__go">
                        {t(`todoAction.${todo.kind}`)}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="ui-result__note">{t('todosEmpty')}</p>
            )}
          </section>

          {/* 项目（前 10 个） */}
          <section className="ui-section" aria-labelledby="home-projects">
            <SectionHeader
              id="home-projects"
              title={t('projectsTitle')}
              action={<Link href={`/${locale}/projects`}>{t('viewAllProjects')}</Link>}
            />
            <ProjectList
              locale={locale}
              projects={projects}
              labels={projectListLabels(tp, tr)}
              statusLabels={tp.raw('status') as Record<string, string>}
              runTypeLabels={tp.raw('runType') as Record<string, string>}
              variant="compact"
            />
          </section>

          {/* 数据源：全部接入时不显示 */}
          {missingSources.length ? (
            <Notice action={<Link href={`/${locale}/settings`}>{t('sourcesAction')}</Link>}>
              {t('sourcesLine', { up: dataHealth.up, total: dataHealth.total, missing: missingSources.join('、') })}
            </Notice>
          ) : null}
        </div>
      )}
    </section>
  )
}
