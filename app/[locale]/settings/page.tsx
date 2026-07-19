import { setRequestLocale } from 'next-intl/server'
import { getConfiguredCredentialKeys } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { CREDENTIAL_KEYS } from '@/lib/credentials/keys'
import { SettingsClient } from './SettingsClient'

// 读实时凭据/数据源状态（DB + env）：动态渲染，不在 build 时固化。
export const dynamic = 'force-dynamic'

// 全局设置页：每个数据源卡片内联凭据表单，不再使用独立的 BYOK 区域。
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [dbKeys, statuses] = await Promise.all([
    getConfiguredCredentialKeys(),
    loadDataSourceStatuses(),
  ])
  // env 中已有值的凭据键（不传值，仅标记「已配置·环境变量」用）
  const envKeys = CREDENTIAL_KEYS.map((c) => c.key).filter((k) => !!process.env[k])

  return (
    <SettingsClient
      statuses={statuses.filter((status) => status.key !== 'gsc')}
      dbKeys={dbKeys}
      envKeys={envKeys}
    />
  )
}
