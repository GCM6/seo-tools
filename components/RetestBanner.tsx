'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// 回测到期横幅（spec §5.1-6 / §7.4-5）。客户端叶子：一键发起同协议重跑。
// POST /api/runs/{id}/retest 由回测端点负责建 retest run 并派发采集事件，成功后
// 跳到返回的 retest run 总览页。到期判定在服务端（page.tsx 比较 nextRetestDueAt）。
export function RetestBanner({ runId, locale }: { runId: string; locale: string }) {
  const t = useTranslations('retest')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const start = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/runs/${runId}/retest`, { method: 'POST' })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { retest?: { id?: string } } | null
        const newId = data?.retest?.id
        if (newId) {
          router.push(`/${locale}/runs/${newId}`)
          return
        }
      }
      setError(true)
      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="banner retest-due" role="status">
      <span className="banner-title">{t('dueTitle')}</span>
      <button type="button" className="act acc on" onClick={start} disabled={loading}>
        {loading ? t('starting') : t('dueCta')}
      </button>
      {error ? <span className="err">{t('error')}</span> : null}
    </div>
  )
}
