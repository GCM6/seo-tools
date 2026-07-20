'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

// Run 分支（/runs/[id] 及其子页）的路由级 error 边界（P2-2）。子页目录不单独建
// error.tsx，统一由这一层兜底——App Router 的 error 边界按目录树向上找最近的一个。
// 只给"重试 / 返回诊断总览"两个出口，不向用户暴露 error.message 等技术细节
// （message 只写 console，供排查用）。
export default function RunError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('runError')
  const params = useParams<{ locale?: string; id?: string }>()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="screen show card" style={{ padding: '16px' }} role="alert">
      <h2>{t('title')}</h2>
      <p className="note">{t('description')}</p>
      <div className="flex gap-4" style={{ marginTop: '16px' }}>
        <button type="button" className="act acc on" onClick={() => reset()}>
          {t('retry')}
        </button>
        {params?.locale && params?.id ? (
          <Link
            href={`/${params.locale}/runs/${params.id}`}
            className="text-sm underline underline-offset-2"
          >
            {t('backToOverview')}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
