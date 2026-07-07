import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { listProjectsWithSummary } from '@/lib/repositories'

// 依据实时项目集重定向：必须动态渲染，否则分诊决策会被固化在 build 时。
export const dynamic = 'force-dynamic'

// 首页薄壳（SP-G1b）：有项目 → 项目列表；无项目 → 新建向导。
// 列表与向导各自单一真源在 /projects 与 /new，首页只做分诊重定向。
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const projects = await listProjectsWithSummary()
  redirect(projects.length > 0 ? `/${locale}/projects` : `/${locale}/new`)
}
