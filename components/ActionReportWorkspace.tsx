'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { MarkdownPreview } from './MarkdownPreview'
import { Notice } from './Notice'
import { Panel } from './Panel'

function filename(value: string): string {
  return value.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'veris-action-report'
}

// 报告已从「主体」降级为「导出卡」（spec 2026-07-19：行动清单是主体，本卡默认收起，
// 只露标题 + 一句定位描述 + 导出操作；展开后才看到预览/Markdown 双 tab 全文）。
// 改版后用 Panel + 统一按钮；没配置 OpenAI 时把原因直接写在按钮下方，不只藏在悬停提示里。
// 「执行登记」区块已迁到 ActionList 的逐条建议卡上——本组件不再持有 executionRows。
export function ActionReportWorkspace({
  runId,
  initialMarkdown,
  filenameBase,
  aiAvailable,
}: {
  runId: string
  initialMarkdown: string
  filenameBase: string
  aiAvailable: boolean
}) {
  const t = useTranslations('screen4')
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'preview' | 'markdown'>('preview')
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [summaryState, setSummaryState] = useState<'idle' | 'done' | 'error'>('idle')
  const [summaryErrorMessage, setSummaryErrorMessage] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(markdown)
      setCopied(true)
    } catch {
      // The Markdown editor remains selectable if clipboard permissions are denied.
    }
  }

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${filename(filenameBase)}.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
  }

  // 4 种明确错误分型（按 HTTP status / 错误码区分,不再折叠成一句「检查 OpenAI 配置」）：
  // 404 run_not_found / 409 ai_not_configured / 502 ai_summary_failed / 422 信源校验拒绝。
  const errorMessageFor = (status: number, code: string | undefined): string => {
    if (status === 404) return t('actionReport.aiErrorRunNotFound')
    if (status === 409) return t('actionReport.aiUnavailable')
    if (status === 422) return t('actionReport.aiErrorValidationFailed')
    if (code === 'summary_source_validation_failed' || code === 'invalid_summary_output') {
      return t('actionReport.aiErrorValidationFailed')
    }
    return t('actionReport.aiErrorSummaryFailed')
  }

  const generateAiSummary = async () => {
    if (!aiAvailable) return
    // 用户在 Markdown tab 手改过内容后再点 AI 生成：先确认覆盖，不再静默丢弃手改内容。
    if (dirty && !window.confirm(t('actionReport.overwriteConfirm'))) return

    setSummarizing(true)
    setSummaryState('idle')
    try {
      const response = await fetch(`/api/runs/${runId}/action-report`, { method: 'POST' })
      const result = (await response.json().catch(() => null)) as { markdown?: string; error?: string } | null
      if (!response.ok || !result?.markdown) {
        setSummaryErrorMessage(errorMessageFor(response.status, result?.error))
        setSummaryState('error')
        return
      }
      setMarkdown(result.markdown)
      setDirty(false)
      setMode('preview')
      setSummaryState('done')
    } catch {
      setSummaryErrorMessage(t('actionReport.aiErrorSummaryFailed'))
      setSummaryState('error')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <Panel title={t('actionReport.title')}>
      <div className="grid grid-cols-1 gap-3">
        <p className="ui-result__note">{t('actionReport.summary')}</p>

        <div className="ui-inline-actions" role="toolbar" aria-label={t('actionReport.viewLabel')}>
          <Button
            size="sm"
            loading={summarizing}
            onClick={() => void generateAiSummary()}
            disabled={!aiAvailable}
            title={!aiAvailable ? t('actionReport.aiUnavailable') : undefined}
          >
            {summarizing ? t('actionReport.generating') : t('actionReport.aiGenerate')}
          </Button>
          <Button size="sm" onClick={() => void copy()}>
            {copied ? t('delivery.copied') : t('actionReport.copy')}
          </Button>
          <Button size="sm" onClick={download}>
            {t('actionReport.download')}
          </Button>
          <Button size="sm" variant="quiet" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('actionReport.collapse') : t('actionReport.expand')}
          </Button>
        </div>
        {!aiAvailable ? <p className="ui-hint">{t('actionReport.aiUnavailable')}</p> : null}

        {summaryState === 'done' ? <Notice tone="success">{t('actionReport.aiDone')}</Notice> : null}
        {summaryState === 'error' ? <Notice tone="error">{summaryErrorMessage}</Notice> : null}

        {expanded ? (
          <>
            <div className="ui-segmented" role="tablist" aria-label={t('actionReport.viewLabel')}>
              <button type="button" role="tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')}>
                {t('delivery.preview')}
              </button>
              <button type="button" role="tab" aria-selected={mode === 'markdown'} onClick={() => setMode('markdown')}>
                {t('delivery.markdown')}
              </button>
            </div>

            {mode === 'preview' ? (
              <div className="ui-report-preview">
                <MarkdownPreview markdown={markdown} />
              </div>
            ) : (
              <div className="ui-field">
                <label className="sr-only" htmlFor={`action-report-${runId}`}>
                  {t('actionReport.editorLabel')}
                </label>
                <textarea
                  id={`action-report-${runId}`}
                  className="ui-textarea ui-textarea--code"
                  value={markdown}
                  onChange={(event) => {
                    setMarkdown(event.target.value)
                    setDirty(true)
                  }}
                />
                <p className="ui-hint">{t('actionReport.draftHint')}</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Panel>
  )
}
