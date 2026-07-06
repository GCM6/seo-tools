import { setRequestLocale } from 'next-intl/server'
import { getRuleChangeProposals, getReleasedProposals } from '@/lib/repositories'
import { groupChangelog, type ChangelogInput } from '@/lib/diagnosis/rule-proposals'
import { RulesAdminClient } from './RulesAdminClient'

// 规则库管理页（spec §11 Phase F 第四道人工闸门）。Server Component（Next 16：await params）。
// 拉待审提案 + 已发布 changelog，交给客户端组件做审批/建/发版交互。
export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [pending, released] = await Promise.all([
    getRuleChangeProposals('pending'),
    getReleasedProposals(),
  ])
  const changelog = groupChangelog(released as unknown as ChangelogInput[])

  return <RulesAdminClient locale={locale} pending={pending} changelog={changelog} />
}
