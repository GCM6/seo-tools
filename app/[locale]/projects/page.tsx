import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { ProjectList } from '@/components/ProjectList'
import { listProjectsWithSummary } from '@/lib/repositories'

// 项目列表随 DB 实时变化：动态渲染，避免 build 时固化项目集（多项目下新建后不可见）。
export const dynamic = 'force-dynamic'

// 项目列表页（SP-G1b）：多项目管理入口。Server Component——取数在服务端，
// 展示交给 i18n-free 的 ProjectList。active={1} 仅为 Shell 步进器占位（列表非四步之一）。
export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('projects')

  const projects = await listProjectsWithSummary()

  return (
    <Shell active={1} locale={locale}>
      <section className="screen show">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>
        <ProjectList
          locale={locale}
          projects={projects}
          labels={{
            newAnalysis: t('newAnalysis'),
            colDomain: t('colDomain'),
            colLatest: t('colLatest'),
            colFindings: t('colFindings'),
            colRetest: t('colRetest'),
            empty: t('empty'),
            noRun: t('noRun'),
            retestNone: t('retestNone'),
            findingsUnit: (count: number) => t('findingsUnit', { count }),
          }}
          statusLabels={t.raw('status') as Record<string, string>}
          runTypeLabels={t.raw('runType') as Record<string, string>}
        />
      </section>
    </Shell>
  )
}
