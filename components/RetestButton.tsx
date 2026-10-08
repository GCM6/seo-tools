'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type RetestState =
  | { kind: 'idle' }
  | { kind: 'error' }
  | { kind: 'inProgress'; runId: string }
  // SP-A §3.5：项目品类/市场未设置，建 run 闸门拒绝 → 链到向导补充。
  | { kind: 'needsSetup'; projectId: string }

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
  labels: { cta: string; starting: string; error: string; inProgress: string; needsSetup?: string }
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
      if (res.status === 422) {
        const data = (await res.json().catch(() => null)) as { error?: string; projectId?: string } | null
        if ((data?.error === 'category_required' || data?.error === 'market_required') && data.projectId) {
          setState({ kind: 'needsSetup', projectId: data.projectId })
          setPending(false)
          return
        }
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
    <span className="ui-inline-actions">
      <button type="button" className={className ?? 'ui-btn'} onClick={start} disabled={disabled || pending} aria-busy={pending || undefined}>
        {pending ? labels.starting : labels.cta}
      </button>
      {state.kind === 'error' ? <span className="ui-error" role="status">{labels.error}</span> : null}
      {state.kind === 'needsSetup' ? (
        <Link href={`/${locale}/new?projectId=${state.projectId}`} className="ui-error">
          {labels.needsSetup ?? labels.error}
        </Link>
      ) : null}
      {state.kind === 'inProgress' ? (
        <Link href={`/${locale}/runs/${state.runId}`} className="ui-error">
          {labels.inProgress}
        </Link>
      ) : null}
    </span>
  )
}
