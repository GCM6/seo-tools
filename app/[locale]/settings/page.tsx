import { setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { getConfiguredCredentialKeys } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { buildCredentialRows } from '@/lib/settings/credential-rows'
import { SettingsClient } from './SettingsClient'

// 读实时凭据/数据源状态（DB + env）：动态渲染，不在 build 时固化。
export const dynamic = 'force-dynamic'

// 全局设置页（SP-G1b：收窄为 BYOK 凭据 + 全局数据源矩阵，不再绑定单项目）。
// GSC 连接按项目在项目详情页操作。active={1} 仅为 Shell 步进器占位（设置非四步之一）。
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const dbKeys = await getConfiguredCredentialKeys()
  const statuses = await loadDataSourceStatuses()
  const credentialRows = buildCredentialRows(process.env, dbKeys)

  return (
    <Shell active={1} locale={locale}>
      <SettingsClient statuses={statuses} credentialRows={credentialRows} />
    </Shell>
  )
}
