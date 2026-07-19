'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

export type DeliveryKind = 'content' | 'technical'

interface DeliveryCardProps {
  recId: string
  title: string
  kind: DeliveryKind
  initialMarkdown: string
  handoffText: string
  initialAppliedAt?: string | null
  initialAppliedNote?: string
}

type ViewMode = 'preview' | 'markdown'

function safeFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'veris-delivery'
}

// A deliberately small Markdown previewer. Delivery drafts are plain text from
// our own server-side assembler, so rendering only the structural Markdown we
// produce keeps the preview safe without adding an HTML parsing dependency.
function MarkdownPreview({ markdown }: { markdown: string }) {
  const nodes: ReactNode[] = []
  const lines = markdown.split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      nodes.push(<pre key={`code-${index}`} className="delivery-code">{code.join('\n')}</pre>)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4'
      nodes.push(<Tag key={`heading-${index}`}>{heading[2]}</Tag>)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={`quote-${index}`}>{line.slice(2)}</blockquote>)
      index += 1
      continue
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ''))
        index += 1
      }
      nodes.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''))
        index += 1
      }
      nodes.push(
        <ol key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}
        </ol>,
      )
      continue
    }

    nodes.push(<p key={`paragraph-${index}`}>{line}</p>)
    index += 1
  }

  return <div className="delivery-preview">{nodes}</div>
}

// The delivery draft is intentionally local until the user copies or downloads
// it. Persisting a publication-ready document is a separate CMS/content-domain
// concern; the only lifecycle event this screen records is the human-confirmed
// "applied" action, which triggers the existing retest schedule.
export function DeliveryCard({
  recId,
  title,
  kind,
  initialMarkdown,
  handoffText,
  initialAppliedAt = null,
  initialAppliedNote = '',
}: DeliveryCardProps) {
  const t = useTranslations('screen4')
  const [mode, setMode] = useState<ViewMode>('preview')
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [copied, setCopied] = useState<'document' | 'handoff' | null>(null)
  const [appliedAt, setAppliedAt] = useState<string | null>(initialAppliedAt)
  const [note, setNote] = useState(initialAppliedNote)
  const [editingApplied, setEditingApplied] = useState(false)
  const [savingApplied, setSavingApplied] = useState(false)

  const copy = async (value: string, target: 'document' | 'handoff') => {
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(target)
    } catch {
      // Clipboard access can be blocked by the browser; leave the affordance
      // available so the user can select the Markdown manually.
    }
  }

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${safeFilename(title)}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  const submitApplied = async () => {
    setSavingApplied(true)
    try {
      const res = await fetch(`/api/recommendations/${recId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied: true, appliedNote: note }),
      })
      if (res.ok) {
        const updated = (await res.json().catch(() => null)) as { appliedAt?: string | null } | null
        setAppliedAt(updated?.appliedAt ?? new Date().toISOString())
        setEditingApplied(false)
      }
    } catch {
      // Do not show an executed state when the API write failed.
    } finally {
      setSavingApplied(false)
    }
  }

  const kindLabel = t(`delivery.kind.${kind}`)

  return (
    <article className="card delivery-card">
      <header className="delivery-head">
        <div>
          <span className="delivery-eyebrow">{t('delivery.eyebrow')} · {kindLabel}</span>
          <h3>{title}</h3>
        </div>
        {appliedAt ? (
          <span className="applied-done">{t('applied.done', { at: appliedAt.slice(0, 10) })}</span>
        ) : (
          <button type="button" className="act" onClick={() => setEditingApplied((value) => !value)}>
            {t('applied.mark')}
          </button>
        )}
      </header>

      <div className="delivery-toolbar" role="tablist" aria-label={t('delivery.viewLabel')}>
        <button
          type="button"
          className={mode === 'preview' ? 'delivery-tab active' : 'delivery-tab'}
          onClick={() => setMode('preview')}
          aria-selected={mode === 'preview'}
          role="tab"
        >
          {t('delivery.preview')}
        </button>
        <button
          type="button"
          className={mode === 'markdown' ? 'delivery-tab active' : 'delivery-tab'}
          onClick={() => setMode('markdown')}
          aria-selected={mode === 'markdown'}
          role="tab"
        >
          {t('delivery.markdown')}
        </button>
        <span className="delivery-toolbar-spacer" />
        <button type="button" className="delivery-action" onClick={() => void copy(markdown, 'document')}>
          {copied === 'document' ? t('delivery.copied') : t('delivery.copy')}
        </button>
        <button type="button" className="delivery-action" onClick={download}>
          {t('delivery.download')}
        </button>
      </div>

      {mode === 'preview' ? (
        <MarkdownPreview markdown={markdown} />
      ) : (
        <div className="delivery-editor-wrap">
          <label className="sr-only" htmlFor={`delivery-${recId}`}>{t('delivery.markdownEditor')}</label>
          <textarea
            id={`delivery-${recId}`}
            className="delivery-editor"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
          <p className="delivery-draft-hint">{t('delivery.draftHint')}</p>
        </div>
      )}

      <details className="delivery-handoff">
        <summary>{t('delivery.handoffTitle')}</summary>
        <div className="delivery-handoff-actions">
          <button type="button" className="delivery-action" onClick={() => void copy(handoffText, 'handoff')}>
            {copied === 'handoff' ? t('delivery.handoffCopied') : t('delivery.copyHandoff')}
          </button>
        </div>
        <pre>{handoffText}</pre>
      </details>

      {editingApplied && !appliedAt ? (
        <div className="delivery-applied-form">
          <label htmlFor={`applied-note-${recId}`}>{t('applied.noteLabel')}</label>
          <textarea
            id={`applied-note-${recId}`}
            className="edit-area"
            value={note}
            placeholder={t('applied.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="delivery-applied-actions">
            <button type="button" className="act accept" onClick={submitApplied} disabled={savingApplied}>
              {t('applied.submit')}
            </button>
            <button type="button" className="act" onClick={() => setEditingApplied(false)}>
              {t('applied.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
