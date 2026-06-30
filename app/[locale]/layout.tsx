import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  Space_Grotesk,
  Inter,
  JetBrains_Mono,
  Noto_Sans_SC,
} from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import '../globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

// Noto Sans SC carries CJK coverage; CJK fonts have no latin subset preload,
// so disable preload and ship as a fallback in the font stacks.
const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500', '600'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
  preload: false,
})

const fontVariables = [
  spaceGrotesk.variable,
  inter.variable,
  jetBrainsMono.variable,
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
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
