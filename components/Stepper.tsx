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
  runId?: string
  locale: string
}) {
  const t = useTranslations('common.steps')

  const items = [
    { n: 1, key: 'new', href: `/${locale}`, enabled: true },
    { n: 2, key: 'diagnose', href: runId ? `/${locale}/runs/${runId}` : '', enabled: Boolean(runId) },
    { n: 3, key: 'recommend', href: runId ? `/${locale}/runs/${runId}/recommendations` : '', enabled: Boolean(runId) },
    { n: 4, key: 'output', href: runId ? `/${locale}/runs/${runId}/output` : '', enabled: Boolean(runId) },
  ] as const

  return (
    <div className="stepper" role="tablist">
      {items.map((it) =>
        it.enabled ? (
          <Link
            key={it.n}
            href={it.href}
            role="tab"
            aria-selected={it.n === active}
            className={`step${it.n === active ? ' active' : ''}${it.n < active ? ' done' : ''}`}
          >
            <span className="n">{it.n}</span>
            {t(it.key)}
          </Link>
        ) : (
          <span key={it.n} role="tab" aria-selected={false} aria-disabled="true" className="step disabled">
            <span className="n">{it.n}</span>
            {t(it.key)}
          </span>
        ),
      )}
    </div>
  )
}
