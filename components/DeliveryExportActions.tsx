'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface DeliveryDocument {
  title: string
  markdown: string
}

function bundle(documents: DeliveryDocument[]): string {
  return documents.map((document) => document.markdown.trim()).filter(Boolean).join('\n\n---\n\n')
}

export function DeliveryExportActions({ documents, filenameBase }: { documents: DeliveryDocument[]; filenameBase: string }) {
  const t = useTranslations('screen4')
  const [copied, setCopied] = useState(false)

  const allMarkdown = bundle(documents)

  const copyAll = async () => {
    try {
      await navigator.clipboard?.writeText(allMarkdown)
      setCopied(true)
    } catch {
      // Manual selection remains available on every individual delivery card.
    }
  }

  const downloadAll = () => {
    const blob = new Blob([allMarkdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${filenameBase || 'veris-deliveries'}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  if (!documents.length) return null

  return (
    <div className="delivery-export-actions">
      <button type="button" className="delivery-action" onClick={() => void copyAll()}>
        {copied ? t('delivery.copiedAll') : t('delivery.copyAll')}
      </button>
      <button type="button" className="delivery-action primary" onClick={downloadAll}>
        {t('delivery.downloadAll')}
      </button>
    </div>
  )
}
