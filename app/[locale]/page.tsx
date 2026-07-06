import { setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { NewAnalysisForm } from '@/components/NewAnalysisForm'

// Screen 1 — new analysis. Server Component: await params (Next 16),
// pin the request locale for static rendering, then hand the interactive
// form (chips / toggle state) to a client leaf.
export default async function NewAnalysisPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Shell active={1} locale={locale}>
      <NewAnalysisForm locale={locale} />
    </Shell>
  )
}
