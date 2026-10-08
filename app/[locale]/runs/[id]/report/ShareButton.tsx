'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'

// 生成只读分享链接：点按调 API 建 / 复用分享，展示绝对 URL + 复制。
// 唯一需要浏览器 API（origin / clipboard）的叶子，故为 client 组件；文案由 props 传入。
// 生成失败时在按钮旁写明，不再静默无反应。
export function ShareButton({
  runId,
  locale,
  label,
  copyLabel,
  copiedLabel,
  readyLabel,
  errorLabel,
}: {
  runId: string
  locale: string
  label: string
  copyLabel: string
  copiedLabel: string
  readyLabel: string
  errorLabel: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function generate() {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/runs/${runId}/share?locale=${encodeURIComponent(locale)}`, { method: 'POST' })
      if (!res.ok) {
        setFailed(true)
        return
      }
      const body = (await res.json()) as { url: string }
      setUrl(`${window.location.origin}${body.url}`)
      setCopied(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // 剪贴板被拒时链接仍在输入框里，可手动全选复制。
    }
  }

  if (!url) {
    return (
      <span className="ui-inline-actions">
        <Button size="sm" loading={busy} onClick={() => void generate()}>
          {label}
        </Button>
        {failed ? (
          <span className="ui-error" role="status">
            {errorLabel}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <span className="ui-share-link">
      <span className="ui-share-link__ready">{readyLabel}</span>
      <input
        className="ui-input ui-mono"
        readOnly
        value={url}
        aria-label={readyLabel}
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button size="sm" onClick={() => void copy()}>
        {copied ? copiedLabel : copyLabel}
      </Button>
    </span>
  )
}
