import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist, Geist_Mono, Noto_Sans_SC } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import '../globals.css'

// 炼图术 Studio 双字体 (docs/d.md)：Geist Sans 用于 UI，Geist Mono 用于 AI/代码/prompt。
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

// Geist 无中文字形；Noto Sans SC 作 CJK 兜底。CJK 字体没有 latin 子集可预载，
// 故 preload:false，仅作为字体栈末尾的兜底。
const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
  preload: false,
})

const fontVariables = [
  geistSans.variable,
  geistMono.variable,
  notoSansSC.variable,
].join(' ')

export const metadata: Metadata = {
  title: 'Veris',
  description: 'Evidence-based SEO + GEO diagnostic workbench',
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        {/* SiteHeader 内含 client 组件（LocaleSwitch/DataSourceHealth），必须在 Provider 内渲染
            （design spec §1.3）。全站导航/footer 从"每页自包 Shell"改为 layout 统一渲染，
            孤岛问题（如曾漏包 Shell 的 /rules）从机制上消除。 */}
        <NextIntlClientProvider>
          <SiteHeader locale={locale} />
          <main className="shell">{children}</main>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
