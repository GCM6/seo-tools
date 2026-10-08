import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { fontVariables } from '../fonts'
import '../globals.css'

// 内部工具，全站不进搜索引擎；唯一公开面 /share 自带独立 noindex（见 app/share/[token]/page.tsx），此处不影响它。
export const metadata: Metadata = {
  title: 'Veris',
  description: 'Evidence-based SEO + GEO diagnostic workbench',
  robots: { index: false, follow: false },
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
    // 主题脚本在 hydration 前给 <html> 加 dark 类，属性必然与服务端不同，故抑制该节点的 hydration 警告（design-system §7）。
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* 原生 <script>（非 next/script）：beforeInteractive 内联脚本在动态段根布局会被
            客户端重复渲染并触发 React "script tag" 警告；服务端布局的原生标签只随 SSR 输出。 */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var savedTheme = localStorage.getItem('theme');
                  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body>
        {/* SiteHeader 内含 client 组件（LocaleSwitch/ThemeToggle），必须在 Provider 内渲染
            （design spec §1.3）。全站导航/footer 从"每页自包 Shell"改为 layout 统一渲染，
            孤岛问题（如曾漏包 Shell 的 /rules）从机制上消除。 */}
        <NextIntlClientProvider>
          <SiteHeader locale={locale} />
          <main className="shell">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
