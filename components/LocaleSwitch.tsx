'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'

// Client leaf: swaps the locale segment in the current pathname and navigates.
export function LocaleSwitch() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const next = locale === 'zh' ? 'en' : 'zh'

  const swap = () => {
    // Replace only the leading /{locale} segment so deeper paths are preserved.
    const nextPath = pathname.replace(
      new RegExp(`^/${locale}(?=/|$)`),
      `/${next}`,
    )
    router.push(nextPath)
  }

  return (
    <button className="ghost" onClick={swap} aria-label={`Switch to ${next.toUpperCase()}`}>
      {next.toUpperCase()}
    </button>
  )
}
