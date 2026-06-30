'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// Step-4 execution prompt card. Client leaf: the copy button writes the prompt
// text to the clipboard, then flips its label to the "copied" state. Renders the
// prototype's .prompt-card / .pc-head / .copy / .prompt-body markup.
// React 19: no forwardRef — this is a self-contained interactive leaf.
export function PromptCard({
  title,
  promptText,
}: {
  title: string
  promptText: string
}) {
  const t = useTranslations('common.actions')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(promptText)
    setCopied(true)
  }

  return (
    <div className="card prompt-card">
      <div className="pc-head">
        <span className="for">{title}</span>
        <button
          className={copied ? 'copy done' : 'copy'}
          onClick={copy}
          aria-live="polite"
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <div className="prompt-body">{promptText}</div>
    </div>
  )
}
