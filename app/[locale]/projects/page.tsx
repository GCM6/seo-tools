import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ProjectList } from '@/components/ProjectList'
import { PageHeader } from '@/components/PageHeader'
import { listProjectsWithSummary } from '@/lib/repositories'
import { marketLabel } from '@/lib/markets'
import { projectListLabels } from '@/lib/projects/list-labels'

// 项目列表随 DB 实时变化：动态渲染，避免 build 时固化项目集（多项目下新建后不可见）。
export const dynamic = 'force-dynamic'

// 项目列表（ux-blueprint §2.1）：PageHeader（唯一的 h1）→ 搜索 → 表格。取数在服务端，
// 展示交给 i18n-free 的 ProjectList。
export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const [t, tr] = await Promise.all([getTranslations('projects'), getTranslations('retest')])

  // 市场存的是 code（SP-A §3.1）：展示前换成显示名，旧文案/空值显示「未设置」。
  const projects = (await listProjectsWithSummary()).map((p) => ({ ...p, market: marketLabel(p.market, locale) ?? t('marketUnset') }))

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ProjectList
        locale={locale}
        projects={projects}
        labels={projectListLabels(t, tr)}
        statusLabels={t.raw('status') as Record<string, string>}
        runTypeLabels={t.raw('runType') as Record<string, string>}
      />
    </section>
  )
}
