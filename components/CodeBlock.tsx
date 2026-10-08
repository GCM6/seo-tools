'use client'

import { useEffect, useState } from 'react'
import { Button } from './Button'

// 代码 / 提示词块（design-system §4 CodeBlock）：mono 13px，超长内容在自身容器内横向滚动，
// 右上角「复制」小按钮，复制后显示「已复制」2 秒。i18n-free：文案由调用方传入。
export function CodeBlock({
  code,
  label,
  copyLabel,
  copiedLabel,
  wrap = false,
}: {
  code: string
  /** 代码块上方的小标题，可选。 */
  label?: string
  copyLabel: string
  copiedLabel: string
  /** 提示词这类长段自然语言用 true（自动换行）；HTML / JSON 代码保持 false（横向滚动）。 */
  wrap?: boolean
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code)
      setCopied(true)
    } catch {
      // 剪贴板权限被拒时，代码仍可在块内手动选中复制。
    }
  }

  return (
    <div className="ui-codeblock">
      <div className="ui-codeblock__head">
        {label ? <span className="ui-codeblock__label">{label}</span> : <span />}
        <Button size="sm" variant="quiet" onClick={() => void copy()} aria-live="polite">
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <pre className={wrap ? 'ui-code ui-code--wrap' : 'ui-code'}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
