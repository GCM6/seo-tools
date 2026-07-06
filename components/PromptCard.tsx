'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// Step-4 execution prompt card. Client leaf: the copy button writes the prompt
// text to the clipboard, then flips its label to the "copied" state. Renders the
// prototype's .prompt-card / .pc-head / .copy / .prompt-body markup.
// React 19: no forwardRef — this is a self-contained interactive leaf.
//
// 标记「已执行」（spec §5.1-6）：仅当传入 recId（即该建议已过人工闸门、进入输出屏）时展示。
// 点开可选说明输入框，提交 PATCH {applied:true, appliedNote}；成功后乐观显示「已执行 ✓ · 日期」。
// outcome 不在这里写——那是回测 delta 的职责（铁律：不可手填 effective）。
export function PromptCard({
  title,
  promptText,
  recId,
  initialAppliedAt = null,
  initialAppliedNote = '',
}: {
  title: string
  promptText: string
  recId?: string
  initialAppliedAt?: string | null
  initialAppliedNote?: string
}) {
  const t = useTranslations('common.actions')
  const ta = useTranslations('screen4')
  const [copied, setCopied] = useState(false)
  const [appliedAt, setAppliedAt] = useState<string | null>(initialAppliedAt)
  const [note, setNote] = useState(initialAppliedNote)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(promptText)
    setCopied(true)
  }

  const submitApplied = async () => {
    if (!recId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recommendations/${recId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied: true, appliedNote: note }),
      })
      if (res.ok) {
        const updated = (await res.json().catch(() => null)) as { appliedAt?: string | null } | null
        setAppliedAt(updated?.appliedAt ?? new Date().toISOString())
        setEditing(false)
      }
    } catch {
      // 网络错误：保持未执行态，不乐观标记。
    } finally {
      setSaving(false)
    }
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
        {recId ? (
          appliedAt ? (
            <span className="applied-done">{ta('applied.done', { at: appliedAt.slice(0, 10) })}</span>
          ) : (
            <button type="button" className="act" onClick={() => setEditing((v) => !v)}>
              {ta('applied.mark')}
            </button>
          )
        ) : null}
      </div>

      {recId && editing && !appliedAt ? (
        <div className="applied-form" style={{ marginTop: 8 }}>
          <textarea
            className="edit-area"
            value={note}
            aria-label={ta('applied.noteLabel')}
            placeholder={ta('applied.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="act acc on"
              onClick={submitApplied}
              disabled={saving}
            >
              {ta('applied.submit')}
            </button>
            <button type="button" className="act" onClick={() => setEditing(false)}>
              {ta('applied.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="prompt-body">{promptText}</div>
    </div>
  )
}
