import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { getPrimaryProject, getProjectSettings, getConfiguredCredentialKeys } from '@/lib/repositories'
import { isGscConfigured } from '@/lib/gsc/oauth'
import { buildDataSourceStatuses } from '@/lib/settings/data-sources'
import { buildCredentialRows } from '@/lib/settings/credential-rows'
import { SettingsClient } from './SettingsClient'

// 全局单项目设置页。active={1} 仅为 Shell 步进器占位（设置非四步之一，高亮为装饰）。
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ gsc?: string }>
}) {
  const { locale } = await params
  const { gsc } = await searchParams
  setRequestLocale(locale)
  const t = await getTranslations('settings')
  const project = await getPrimaryProject()
  if (!project) {
    return (
      <Shell active={1} locale={locale}>
        <section className="screen show">
          <h1 className="text-lg font-semibold">{t('title')}</h1>
          <p className="mt-4 text-sm text-neutral-500">{t('noProject')}</p>
        </section>
      </Shell>
    )
  }
  const settings = await getProjectSettings(project.id)
  const dbKeys = await getConfiguredCredentialKeys()
  const statuses = buildDataSourceStatuses(process.env, {
    gscAppConfigured: isGscConfigured(),
    gscConnected: settings?.gscConnected ?? false,
    gscSiteUrl: settings?.gscSiteUrl ?? null,
  }, dbKeys)
  const credentialRows = buildCredentialRows(process.env, dbKeys)
  return (
    <Shell active={1} locale={locale} domain={project.domain}>
      <SettingsClient
        projectId={project.id}
        projectDomain={project.domain}
        statuses={statuses}
        credentialRows={credentialRows}
        gscConnected={settings?.gscConnected ?? false}
        gscSiteUrl={settings?.gscSiteUrl ?? null}
        justConnected={gsc === 'connected'}
      />
    </Shell>
  )
}
