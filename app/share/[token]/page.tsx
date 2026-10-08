import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { ReportView } from '@/components/ReportView'
import { getReportShareByToken } from '@/lib/repositories'
import { isShareExpired } from '@/lib/share/expiry'

// 只读分享链接不进搜索引擎。
export const metadata: Metadata = { robots: { index: false, follow: false } }

// 公开只读分享页（SP-G1e；ux-blueprint §5）：客户看到的那份报告。没有工作台导航、没有操作按钮，
// 固定浅色（app/share/layout.tsx 不挂主题脚本），桌面 860px 纸面、手机满宽。
// 路由在 [locale] 之外（中间件已排除 share），语言由 share 行携带 → setRequestLocale。
// token 无效 / 已过期 → notFound()，由同目录 not-found.tsx 说明「链接已失效」，不泄露报告是否存在。
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await getReportShareByToken(token)
  if (!share || isShareExpired(share.expiresAt, new Date())) notFound()

  setRequestLocale(share.locale)

  // 分享页不在 [locale] 布局下，没有外层 Provider；ReportView 内含 useTranslations 的
  // client 组件（如 KeywordTable），缺 Provider 会整页 500。按 share 行的语言在此注入。
  return (
    <NextIntlClientProvider>
      <main className="ui-share">
        <ReportView runId={share.runId} locale={share.locale} variant="share" />
      </main>
    </NextIntlClientProvider>
  )
}
