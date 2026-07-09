import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ProjectList } from '@/components/ProjectList'
import { listProjectsWithSummary } from '@/lib/repositories'

// 项目列表随 DB 实时变化：动态渲染，避免 build 时固化项目集（多项目下新建后不可见）。
export const dynamic = 'force-dynamic'

// 项目列表页（SP-G1b）：多项目管理入口。Server Component——取数在服务端，
// 展示交给 i18n-free 的 ProjectList。不在向导流内，不再包 Shell（无 Stepper，design spec §1.2）。
export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('projects')
  // retest 三态（starting/error/inProgress）复用 retest 命名空间，避免文案重复（spec §4/i18n）。
  const tr = await getTranslations('retest')

  const projects = await listProjectsWithSummary()

  return (
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
          colAction: t('colAction'),
          empty: t('empty'),
          noRun: t('noRun'),
          retestNone: t('retestNone'),
          findingsUnit: (count: number) => t('findingsUnit', { count }),
          actionRunning: t('actionRunning'),
          actionRetest: t('actionRetest'),
          actionReconfigure: t('actionReconfigure'),
          actionConfigure: t('actionConfigure'),
          retestStarting: tr('starting'),
          retestError: tr('error'),
          retestInProgress: tr('inProgress'),
        }}
        statusLabels={t.raw('status') as Record<string, string>}
        runTypeLabels={t.raw('runType') as Record<string, string>}
      />
    </section>
  )
}
