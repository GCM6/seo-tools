'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

// Client leaf: the 4-step workflow nav with the active step highlighted.
// Labels come from the `common.steps` message catalog (no hardcoded copy).
export function Stepper({
  active,
  runId,
  locale,
}: {
  active: 1 | 2 | 3 | 4
  runId: string
  locale: string
}) {
  const t = useTranslations('common.steps')

  const items = [
    { n: 1, key: 'new', href: `/${locale}` },
    { n: 2, key: 'diagnose', href: `/${locale}/runs/${runId}` },
    { n: 3, key: 'recommend', href: `/${locale}/runs/${runId}/recommendations` },
    { n: 4, key: 'output', href: `/${locale}/runs/${runId}/output` },
  ] as const

  return (
    <div className="stepper" role="tablist">
      {items.map((it) => (
        <Link
          key={it.n}
          href={it.href}
          role="tab"
          aria-selected={it.n === active}
          className={`step${it.n === active ? ' active' : ''}`}
        >
          <span className="n">{it.n}</span>
          {t(it.key)}
        </Link>
      ))}
    </div>
  )
}
