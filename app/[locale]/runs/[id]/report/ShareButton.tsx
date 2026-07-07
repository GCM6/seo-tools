'use client'

import { useState } from 'react'

// 生成只读分享链接：点按调 API 建/复用分享，展示绝对 URL + 复制。
// 唯一需要浏览器 API（origin / clipboard）的叶子，故为 client 组件；文案由 props 传入。
export function ShareButton({
  runId,
  locale,
  label,
  copyLabel,
  copiedLabel,
  readyLabel,
}: {
  runId: string
  locale: string
  label: string
  copyLabel: string
  copiedLabel: string
  readyLabel: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setBusy(true)
    const res = await fetch(`/api/runs/${runId}/share?locale=${encodeURIComponent(locale)}`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) return
    const body = (await res.json()) as { url: string }
    setUrl(`${window.location.origin}${body.url}`)
    setCopied(false)
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  if (!url) {
    return (
      <button type="button" className="ghost" onClick={generate} disabled={busy}>
        {label}
      </button>
    )
  }

  return (
    <span className="share-result">
      <span className="share-ready">{readyLabel}</span>
      <input className="share-url mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="ghost" onClick={copy}>
        {copied ? copiedLabel : copyLabel}
      </button>
    </span>
  )
}
