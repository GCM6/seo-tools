'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { extractAffectedPagesSection } from '@/lib/diagnosis/recommend'

// 行动清单 —— 输出页主体（重构自「输出页=报告」，spec: docs/plans/output-action-list 2026-07-19）。
// 每条已纳入执行（accepted|edited）的建议一张卡：属性 chips + 折叠详情 + 执行资产
// （生成/展示提示词）+ 标记已执行，全部 client leaf 状态按卡片独立管理。

export type ActionListPromptType = 'content' | 'technical' | 'brief' | 'cms'

export interface ActionListPrompt {
  id: string
  promptType: string
  promptText: string
}

export interface ActionListItem {
  id: string
  priority: string
  title: string
  status: 'accepted' | 'edited'
  expectedImpact: string
  effort: string
  risk: string
  confidence: string
  why: string
  validationMethod: string
  evidenceRefs: string[]
  // B2（P0-4）：evidenceRefs 的人类可读摘要，按 ref 取值；由调用方用
  // lib/diagnosis/action-report-markdown.ts 的 summarizeEvidenceRefs 预算好传入。可选、
  // 缺省时该 ref 原样展示裸 ID（向后兼容尚未接入摘要数据源的调用方，不是「摘要功能未生效」）。
  evidenceSummaries?: Record<string, string>
  appliedAt: string | null
  appliedNote: string
  // 预载：page.tsx 用 getGeneratedPromptsForRec 按 promptType 取 createdAt 最新一条。
  prompts: ActionListPrompt[]
}

export interface ActionListRejectedItem {
  id: string
  title: string
  // 项目铁律：不编造否决理由。数据库当前没有专门的否决说明字段（reject 只是纯状态
  // 切换，不落 editedPayload），此处回落展示建议的原始 why 作为留痕上下文；为空时
  // 展示「系统未记录否决理由」，绝不假造一句听起来合理的说明。
  note: string
}

type PriorityQuadrant = 'quick_win' | 'strategic' | 'fill_in' | 'low'
const PRIORITIES = new Set<PriorityQuadrant>(['quick_win', 'strategic', 'fill_in', 'low'])
function normalizePriority(priority: string): PriorityQuadrant {
  return PRIORITIES.has(priority as PriorityQuadrant) ? (priority as PriorityQuadrant) : 'fill_in'
}

const PROMPT_TYPE_ORDER: Record<string, number> = { technical: 0, content: 1, brief: 2, cms: 3 }
function sortedPrompts(prompts: ActionListPrompt[]): ActionListPrompt[] {
  return [...prompts].sort((a, b) => (PROMPT_TYPE_ORDER[a.promptType] ?? 9) - (PROMPT_TYPE_ORDER[b.promptType] ?? 9))
}
function promptLabel(t: ReturnType<typeof useTranslations>, promptType: string): string {
  return promptType === 'brief' ? t('actionList.promptLabelBrief') : t('actionList.promptLabelContent')
}

function PromptBlock({ prompt, label }: { prompt: ActionListPrompt; label: string }) {
  const tCommon = useTranslations('common.actions')
  const [copied, setCopied] = useState(false)

  // "短暂"变已复制态：复制成功后自动回落，而不是永久停留在「已复制」。
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt.promptText)
      setCopied(true)
    } catch {
      // 剪贴板权限被拒时文本仍可在 <pre> 里手动选中复制。
    }
  }

  return (
    <details className="action-prompt-block">
      <summary>{label}</summary>
      <pre className="prompt-body">{prompt.promptText}</pre>
      <button type="button" className={copied ? 'copy done' : 'copy'} onClick={() => void copy()} aria-live="polite">
        {copied ? tCommon('copied') : tCommon('copy')}
      </button>
    </details>
  )
}

function PromptAssets({ item }: { item: ActionListItem }) {
  const t = useTranslations('screen4')
  const [prompts, setPrompts] = useState(item.prompts)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A4：regenerate=1 复用后端既有幂等覆盖端点（app/api/recommendations/[id]/prompt/route.ts
  // 已支持，未改动）。首次生成与重新生成共用同一函数，仅 query string 与按钮态不同。
  const generate = async (regenerate: boolean) => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/recommendations/${item.id}/prompt${regenerate ? '?regenerate=1' : ''}`, {
        method: 'POST',
      })
      const body = (await res.json().catch(() => null)) as { prompts?: ActionListPrompt[]; error?: string } | null
      if (!res.ok || !body?.prompts?.length) {
        setError(res.status === 404 ? t('actionList.generateErrorNotFound') : t('actionList.generateErrorGeneric'))
        return
      }
      setPrompts(body.prompts)
    } catch {
      setError(t('actionList.generateErrorGeneric'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="action-prompt-section">
      <h4>{t('actionList.assetsHeading')}</h4>
      <p className="action-prompt-hint">{t('actionList.assetsHint')}</p>
      {prompts.length ? (
        <>
          <div className="action-prompt-blocks">
            {sortedPrompts(prompts).map((prompt) => (
              <PromptBlock key={prompt.id} prompt={prompt} label={promptLabel(t, prompt.promptType)} />
            ))}
          </div>
          <div className="action-prompt-regenerate">
            <button type="button" className="act" disabled={generating} onClick={() => void generate(true)}>
              {generating ? t('actionList.regenerating') : t('actionList.regenerate')}
            </button>
            {error ? <p className="action-inline-error">{error}</p> : null}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="act accept" disabled={generating} onClick={() => void generate(false)}>
            {generating ? t('actionList.generating') : t('actionList.generate')}
          </button>
          {error ? <p className="action-inline-error">{error}</p> : null}
        </>
      )}
    </section>
  )
}

function ApplySection({ item }: { item: ActionListItem }) {
  const t = useTranslations('screen4')
  const [appliedAt, setAppliedAt] = useState<string | null>(item.appliedAt)
  const [note, setNote] = useState(item.appliedNote)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/recommendations/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied: true, appliedNote: note }),
      })
      const body = (await res.json().catch(() => null)) as { appliedAt?: string | null; appliedNote?: string | null } | null
      if (!res.ok) {
        // 失败：保留用户已填写的备注与展开态，不静默丢弃。
        setError(t('applied.error'))
        return
      }
      setAppliedAt(body?.appliedAt ?? new Date().toISOString())
      setNote(body?.appliedNote ?? note)
      setEditing(false)
    } catch {
      setError(t('applied.error'))
    } finally {
      setSaving(false)
    }
  }

  // A3 补充：已执行可撤销——PATCH applied:false 清空 appliedAt/appliedNote。撤销不重算
  // 项目的 nextRetestDueAt（回滚需要重算「全局最新一次 applied 时间」，超出此处范围；
  // 复测计划卡的口径说明已向用户交代这一点，不是静默行为）。
  const revoke = async () => {
    setRevoking(true)
    setRevokeError(null)
    try {
      const res = await fetch(`/api/recommendations/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied: false }),
      })
      if (!res.ok) {
        setRevokeError(t('applied.revokeError'))
        return
      }
      setAppliedAt(null)
      setNote('')
    } catch {
      setRevokeError(t('applied.revokeError'))
    } finally {
      setRevoking(false)
    }
  }

  if (appliedAt) {
    return (
      <section className="action-apply-section">
        <span className="applied-done">{t('applied.done', { at: appliedAt.slice(0, 10) })}</span>
        {note ? <p className="action-applied-note">{note}</p> : null}
        <div className="action-apply-revoke">
          <button type="button" className="act" disabled={revoking} onClick={() => void revoke()}>
            {revoking ? t('applied.revoking') : t('applied.revoke')}
          </button>
          {revokeError ? <p className="action-inline-error">{revokeError}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section className="action-apply-section">
      {editing ? (
        <div className="action-apply-form">
          <label htmlFor={`apply-note-${item.id}`}>{t('applied.noteLabel')}</label>
          <textarea
            id={`apply-note-${item.id}`}
            className="edit-area"
            value={note}
            placeholder={t('applied.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
          {error ? <p className="action-inline-error">{error}</p> : null}
          <div className="delivery-applied-actions">
            <button type="button" className="act accept" disabled={saving} onClick={() => void submit()}>
              {t('applied.submit')}
            </button>
            <button type="button" className="act" onClick={() => setEditing(false)}>
              {t('applied.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="act" onClick={() => setEditing(true)}>
          {t('applied.mark')}
        </button>
      )}
    </section>
  )
}

function ActionCard({ item }: { item: ActionListItem }) {
  const t = useTranslations('screen4')
  const tScreen3 = useTranslations('screen3')
  const tCommon = useTranslations('common.actions')
  const priorityKey = normalizePriority(item.priority)
  // B1（P0-4）：why 里可能编码了受影响页面清单（见 lib/diagnosis/recommend.ts
  // appendAffectedPagesSection）；拆成独立字段块展示，「为什么」本身只保留干净文本。
  const { why: cleanWhy, affected } = extractAffectedPagesSection(item.why)
  const hasDetails = Boolean(cleanWhy || item.validationMethod || item.evidenceRefs.length || affected)

  return (
    <article className={`card action-card rec rec--${priorityKey}`}>
      <div className="rec-top">
        <div className="rec-title-block">
          <div className="rec-eyebrow">
            <span className="prio">{tScreen3(`priority.${priorityKey}`)}</span>
            {item.status === 'edited' ? <span className="rec-status rec-status--edited">{tCommon('edited')}</span> : null}
          </div>
          <h3>{item.title}</h3>
        </div>
      </div>

      <div className="rec-body">
        <dl className="rec-metrics rec-metrics--4" aria-label={tScreen3('decisionSummary')}>
          {item.expectedImpact ? (
            <div><dt>{tScreen3('label.impact')}</dt><dd>{item.expectedImpact}</dd></div>
          ) : null}
          {item.effort ? (
            <div><dt>{tScreen3('label.effort')}</dt><dd>{item.effort}</dd></div>
          ) : null}
          {item.risk ? (
            <div><dt>{tScreen3('label.risk')}</dt><dd>{item.risk}</dd></div>
          ) : null}
          {item.confidence ? (
            <div><dt>{tScreen3('label.confidence')}</dt><dd>{item.confidence}</dd></div>
          ) : null}
        </dl>

        {hasDetails ? (
          <details className="rec-details">
            <summary>
              <span>{t('actionList.detailsSummary')}</span>
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="rec-details-grid">
              {cleanWhy ? (
                <div className="field-block full">
                  <div className="fb-l">{tScreen3('label.why')}</div>
                  <p>{cleanWhy}</p>
                </div>
              ) : null}
              {affected ? (
                <div className="field-block full">
                  <div className="fb-l">{tScreen3('label.affectedPages')}</div>
                  <p>{t('actionList.affectedPagesSummary', { total: affected.total, shown: affected.shown })}</p>
                  <ul className="action-evidence-list">
                    {affected.urls.map((url) => (
                      <li key={url} className="ev-ref">{url}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {item.validationMethod ? (
                <div className="field-block full">
                  <div className="fb-l">{tScreen3('label.validation')}</div>
                  <p>{item.validationMethod}</p>
                </div>
              ) : null}
              {item.evidenceRefs.length ? (
                <div className="field-block full">
                  <div className="fb-l">{tScreen3('label.evidence')}</div>
                  <ul className="action-evidence-list">
                    {item.evidenceRefs.map((ref) => (
                      <li key={ref} className="ev-ref">{item.evidenceSummaries?.[ref] ?? ref}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        <PromptAssets item={item} />
        <ApplySection item={item} />
      </div>
    </article>
  )
}

export function ActionList({
  items,
  rejectedItems,
}: {
  items: ActionListItem[]
  rejectedItems: ActionListRejectedItem[]
}) {
  const t = useTranslations('screen4')

  return (
    <section className="action-list" aria-label={t('actionList.heading')}>
      {items.length ? (
        <div className="action-list-cards">
          {items.map((item) => <ActionCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="card action-empty">
          <p>{t('actionList.emptyGated')}</p>
          <p className="action-empty-hint">{t('actionList.emptyGatedHint')}</p>
        </div>
      )}

      {rejectedItems.length ? (
        <details className="action-rejected-accordion">
          <summary>{t('actionList.rejectedAccordionTitle', { count: rejectedItems.length })}</summary>
          <div className="action-rejected-list">
            {rejectedItems.map((row) => (
              <div key={row.id} className="action-rejected-row">
                <strong>{row.title}</strong>
                <p>{row.note || t('actionList.rejectedNoNote')}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
