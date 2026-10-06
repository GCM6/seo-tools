import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ReportView } from '@/components/ReportView'
import { getReportShareByToken } from '@/lib/repositories'
import { isShareExpired } from '@/lib/share/expiry'

// 只读分享链接不进搜索引擎。
export const metadata: Metadata = { robots: { index: false, follow: false } }

// 公开只读分享页（SP-G1e）：无 Shell 导航、无操作按钮、带「由 Veris 生成」页脚。
// 路由在 [locale] 之外（中间件已排除 share），语言由 share 行携带 → setRequestLocale。
// token 无效 / 已过期 → 404，不泄露报告存在与否。
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await getReportShareByToken(token)
  if (!share || isShareExpired(share.expiresAt, new Date())) notFound()

  setRequestLocale(share.locale)
  const t = await getTranslations('report')

  // 分享页不在 [locale] 布局下，没有外层 Provider；ReportView 内含 useTranslations 的
  // client 组件（如 KeywordTable），缺 Provider 会整页 500。按 share 行的语言在此注入。
  return (
    <NextIntlClientProvider>
      <main className="share-page">
        <div className="share-body">
          <ReportView runId={share.runId} />
        </div>
        <footer className="share-footer">{t('generatedBy')}</footer>
      </main>
    </NextIntlClientProvider>
  )
}
