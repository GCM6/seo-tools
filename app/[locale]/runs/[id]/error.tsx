'use client'

import { useEffect } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, ButtonLink } from '@/components/Button'

// Run 分支（/runs/[id] 及其子页）的路由级 error 边界（ux-blueprint §0「错误边界」）。子页目录不单独建
// error.tsx，统一由这一层兜底——App Router 的 error 边界按目录树向上找最近的一个。
// 「这个页面没能加载」+ 一句原因 + [重试]（主按钮）+ 返回入口（次按钮）：子页出错回诊断概览，
// 概览本身出错就回项目列表，避免把人送回同一个出错页。不向用户暴露 error.message（只写 console）。
export default function RunError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('runError')
  const params = useParams<{ locale?: string; id?: string }>()
  const pathname = usePathname()

  useEffect(() => {
    console.error(error)
  }, [error])

  const locale = params?.locale ?? 'zh'
  const overviewHref = params?.id ? `/${locale}/runs/${params.id}` : null
  const onOverview = overviewHref !== null && pathname === overviewHref
  const backHref = overviewHref && !onOverview ? overviewHref : `/${locale}/projects`
  const backLabel = overviewHref && !onOverview ? t('backToOverview') : t('backToProjects')

  return (
    <section className="ui-panel ui-error-page" role="alert">
      <h2 className="ui-error-page__title">{t('title')}</h2>
      <p className="ui-result__note">{t('description')}</p>
      <div className="ui-inline-actions">
        <Button variant="primary" onClick={() => reset()}>
          {t('retry')}
        </Button>
        <ButtonLink href={backHref}>{backLabel}</ButtonLink>
      </div>
    </section>
  )
}
