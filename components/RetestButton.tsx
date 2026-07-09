'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type RetestState = { kind: 'idle' } | { kind: 'error' } | { kind: 'inProgress'; runId: string }

// 「发起回测」按钮（客户端叶子，参照 RetestBanner 的 POST→跳转模式）。
// 额外处理同项目并发保护 409（spec §2.3）：显示进行中提示并链到该 run。
// i18n-free：文案全部经 labels props 传入，可用于 ProjectList / 项目详情页头 / RunHistory 三处。
export function RetestButton({
  locale,
  baselineRunId,
  labels,
  className,
  disabled,
}: {
  locale: string
  baselineRunId: string
  labels: { cta: string; starting: string; error: string; inProgress: string }
  className?: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<RetestState>({ kind: 'idle' })

  const start = async () => {
    setPending(true)
    setState({ kind: 'idle' })
    try {
      const res = await fetch(`/api/runs/${baselineRunId}/retest`, { method: 'POST' })
      if (res.status === 201) {
        const data = (await res.json().catch(() => null)) as { retest?: { id?: string } } | null
        const newId = data?.retest?.id
        if (newId) {
          router.push(`/${locale}/runs/${newId}`)
          return
        }
        setState({ kind: 'error' })
        setPending(false)
        return
      }
      if (res.status === 409) {
        const data = (await res.json().catch(() => null)) as { runId?: string } | null
        setState({ kind: 'inProgress', runId: data?.runId ?? baselineRunId })
        setPending(false)
        return
      }
      setState({ kind: 'error' })
      setPending(false)
    } catch {
      setState({ kind: 'error' })
      setPending(false)
    }
  }

  return (
    <span className="retest-btn-wrap">
      <button type="button" className={className ?? 'run-btn'} onClick={start} disabled={disabled || pending}>
        {pending ? labels.starting : labels.cta}
      </button>
      {state.kind === 'error' ? <span className="err">{labels.error}</span> : null}
      {state.kind === 'inProgress' ? (
        <Link href={`/${locale}/runs/${state.runId}`} className="err">
          {labels.inProgress}
        </Link>
      ) : null}
    </span>
  )
}
