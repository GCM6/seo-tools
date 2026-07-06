import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { LocaleSwitch } from './LocaleSwitch'
import { Stepper } from './Stepper'

// App chrome: top bar (brand + tagline + target domain + locale switch) above
// the workflow Stepper, then the screen content. Server Component — the only
// client leaves are <Stepper> and <LocaleSwitch>.
export async function Shell({
  active,
  locale,
  runId,
  domain,
  children,
}: {
  active: 1 | 2 | 3 | 4
  locale: string
  runId?: string
  domain?: string
  children: ReactNode
}) {
  const t = await getTranslations('common')

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <span className="logo">
            Ver<b>i</b>s
          </span>
          <span className="sub">{t('tagline')}</span>
        </div>
        <div className="target">
          {domain ? (
            <>
              <span>{t('targetLabel')}</span>
              <span className="dom mono">{domain}</span>
            </>
          ) : null}
          <LocaleSwitch />
        </div>
      </div>

      <Stepper active={active} runId={runId} locale={locale} />

      {children}
    </div>
  )
}
