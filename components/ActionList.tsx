'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from './Button'
import { CodeBlock } from './CodeBlock'
import { EmptyState } from './EmptyState'
import { EvidenceBadge } from './EvidenceBadge'
import { Notice } from './Notice'
import { RecRow } from './RecRow'
import { StatusText } from './StatusText'
import { extractAffectedPagesSection } from '@/lib/diagnosis/recommend'
import { labelKeyForGrade, type EvidenceGrade } from '@/lib/evidence'
import { groupByPriority, rankRecs, shortLevel } from '@/lib/runs/recommendations'

// 执行清单（ux-blueprint §3.4；重构自「输出页=报告」，spec: docs/plans/output-action-list 2026-07-19）。
// 只列已接受 / 已编辑的建议，行与建议页同一种（RecRow）；展开区 = 说明与证据 + 执行提示词 + 标记已执行。
// 「已执行 k / N」进度和全部完成提示由本组件按各行的实时状态计算。

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
  /** 所针对问题的严重度、证据等级与链接（同建议页）；缺 finding 时不画。 */
  severity?: string
  grade?: EvidenceGrade
  target?: { title: string; href: string }
}

export interface ActionListRejectedItem {
  id: string
  title: string
  // 项目铁律：不编造否决理由。数据库当前没有专门的否决说明字段（reject 只是纯状态
  // 切换，不落 editedPayload），此处回落展示建议的原始 why 作为留痕上下文；为空时
  // 展示「系统未记录否决理由」，绝不假造一句听起来合理的说明。
  note: string
}

const PROMPT_TYPE_ORDER: Record<string, number> = { technical: 0, content: 1, brief: 2, cms: 3 }
function sortedPrompts(prompts: ActionListPrompt[]): ActionListPrompt[] {
  return [...prompts].sort((a, b) => (PROMPT_TYPE_ORDER[a.promptType] ?? 9) - (PROMPT_TYPE_ORDER[b.promptType] ?? 9))
}

function PromptAssets({ item }: { item: ActionListItem }) {
  const t = useTranslations('screen4')
  const tCommon = useTranslations('common.actions')
  const [prompts, setPrompts] = useState(item.prompts)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A4：regenerate=1 复用后端既有幂等覆盖端点（app/api/recommendations/[id]/prompt/route.ts）。
  // 首次生成与重新生成共用同一函数，仅 query string 与按钮文案不同。
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
    <div className="ui-rec__block">
      <p className="ui-label">{t('actionList.assetsHeading')}</p>
      <p className="ui-hint">{t('actionList.assetsHint')}</p>
      {sortedPrompts(prompts).map((prompt) => (
        <CodeBlock
          key={prompt.id}
          wrap
          label={prompt.promptType === 'brief' ? t('actionList.promptLabelBrief') : t('actionList.promptLabelContent')}
          code={prompt.promptText}
          copyLabel={tCommon('copy')}
          copiedLabel={tCommon('copied')}
        />
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="ui-inline-actions">
        {prompts.length ? (
          <Button size="sm" loading={generating} onClick={() => void generate(true)}>
            {generating ? t('actionList.regenerating') : t('actionList.regenerate')}
          </Button>
        ) : (
          <Button size="sm" loading={generating} onClick={() => void generate(false)}>
            {generating ? t('actionList.generating') : t('actionList.generate')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ApplySection({
  item,
  appliedAt,
  onApplied,
}: {
  item: ActionListItem
  appliedAt: string | null
  onApplied: (appliedAt: string | null) => void
}) {
  const t = useTranslations('screen4')
  const [note, setNote] = useState(item.appliedNote)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const noteId = `apply-note-${item.id}`

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
      setNote(body?.appliedNote ?? note)
      setEditing(false)
      onApplied(body?.appliedAt ?? new Date().toISOString())
    } catch {
      setError(t('applied.error'))
    } finally {
      setSaving(false)
    }
  }

  // A3 补充：已执行可撤销——PATCH applied:false 清空 appliedAt/appliedNote，并同步撤销问题上的执行；
  // 项目的 nextRetestDueAt 由问题表重算（spec 2026-10-09 §5.4-2，回测计划卡的口径说明已向用户交代）。
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
      setNote('')
      onApplied(null)
    } catch {
      setRevokeError(t('applied.revokeError'))
    } finally {
      setRevoking(false)
    }
  }

  if (appliedAt) {
    return (
      <div className="ui-rec__block">
        <p className="ui-rec__applied">{t('applied.done', { at: appliedAt.slice(0, 10) })}</p>
        {note ? <p className="ui-rec__applied-note">{note}</p> : null}
        {revokeError ? <Notice tone="error">{revokeError}</Notice> : null}
        <div className="ui-inline-actions">
          <Button variant="quiet" size="sm" loading={revoking} onClick={() => void revoke()}>
            {revoking ? t('applied.revoking') : t('applied.revoke')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="ui-rec__block">
      {editing ? (
        <>
          <div className="ui-field">
            <label className="ui-label" htmlFor={noteId}>
              {t('applied.noteLabel')}
            </label>
            <textarea
              id={noteId}
              className="ui-textarea"
              value={note}
              placeholder={t('applied.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="ui-inline-actions">
            <Button variant="primary" size="sm" loading={saving} onClick={() => void submit()}>
              {t('applied.submit')}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setEditing(false)}>
              {t('applied.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div className="ui-inline-actions">
          <Button size="sm" onClick={() => setEditing(true)}>
            {t('applied.mark')}
          </Button>
        </div>
      )}
    </div>
  )
}

function ActionCard({
  item,
  appliedAt,
  onApplied,
}: {
  item: ActionListItem
  appliedAt: string | null
  onApplied: (appliedAt: string | null) => void
}) {
  const t = useTranslations('screen4')
  const tScreen3 = useTranslations('screen3')
  const tWs = useTranslations('workspace')
  const tRoot = useTranslations()
  const [open, setOpen] = useState(false)
  // B1（P0-4）：why 里可能编码了受影响页面清单（见 lib/diagnosis/recommend.ts
  // appendAffectedPagesSection）；拆成独立一项展示，「为什么」本身只保留干净文本。
  const { why: cleanWhy, affected } = extractAffectedPagesSection(item.why)
  const impact = shortLevel(item.expectedImpact)
  const effort = shortLevel(item.effort)
  const meta = [impact ? `${tScreen3('label.impact')} ${impact}` : '', effort ? `${tScreen3('label.effort')} ${effort}` : '']
    .filter(Boolean)
    .join(' · ')
  const sev = item.severity === 'high' || item.severity === 'hi' ? 'high' : item.severity === 'mid' ? 'mid' : 'ok'

  return (
    <RecRow
      id={item.id}
      severity={item.severity}
      severityLabel={item.severity ? tWs(`sev.${sev}`) : undefined}
      title={item.title}
      target={
        item.target ? (
          <>
            {tScreen3('target')}
            <Link href={item.target.href}>{item.target.title}</Link>
          </>
        ) : undefined
      }
      meta={meta}
      badge={item.grade ? <EvidenceBadge grade={item.grade} label={tRoot(labelKeyForGrade(item.grade))} /> : null}
      aside={
        <span className="ui-rec__state">
          {item.status === 'edited' ? <span className="ui-rec__edited">{tScreen3('status.edited')}</span> : null}
          {appliedAt ? (
            <StatusText status="applied" label={t('checklist.statusApplied')} />
          ) : (
            <span className="ui-rec__todo">{t('checklist.statusTodo')}</span>
          )}
        </span>
      }
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <dl className="ui-kv">
        {cleanWhy ? (
          <>
            <dt>{tScreen3('label.why')}</dt>
            <dd>{cleanWhy}</dd>
          </>
        ) : null}
        {affected ? (
          <>
            <dt>{tScreen3('label.affectedPages')}</dt>
            <dd>
              <p>{t('actionList.affectedPagesSummary', { total: affected.total, shown: affected.shown })}</p>
              <ul className="ui-kv__list ui-mono">
                {affected.urls.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        {item.expectedImpact ? (
          <>
            <dt>{tScreen3('label.impact')}</dt>
            <dd>{item.expectedImpact}</dd>
          </>
        ) : null}
        {item.risk ? (
          <>
            <dt>{tScreen3('label.risk')}</dt>
            <dd>{item.risk}</dd>
          </>
        ) : null}
        {item.validationMethod ? (
          <>
            <dt>{tScreen3('label.validation')}</dt>
            <dd>{item.validationMethod}</dd>
          </>
        ) : null}
        {item.confidence ? (
          <>
            <dt>{tScreen3('label.confidence')}</dt>
            <dd>{item.confidence}</dd>
          </>
        ) : null}
        {item.evidenceRefs.length ? (
          <>
            <dt>{tScreen3('label.evidence')}</dt>
            <dd>
              <ul className="ui-kv__list">
                {item.evidenceRefs.map((ref) => (
                  <li key={ref}>{item.evidenceSummaries?.[ref] ?? ref}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>

      <PromptAssets item={item} />
      <ApplySection item={item} appliedAt={appliedAt} onApplied={onApplied} />
    </RecRow>
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
  const tScreen3 = useTranslations('screen3')
  const [appliedById, setAppliedById] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(items.map((it) => [it.id, it.appliedAt])),
  )
  const total = items.length
  const done = items.filter((it) => appliedById[it.id]).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const groups = groupByPriority(rankRecs(items))

  return (
    <section className="grid grid-cols-1 gap-4" aria-label={t('actionList.heading')}>
      {total ? (
        <div className="ui-progress-line">
          <p className="ui-progress-line__label">{t('checklist.progress', { done, total })}</p>
          <div
            className="ui-bar ui-bar--own"
            role="progressbar"
            aria-label={t('output.progressAria')}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {total > 0 && done === total ? (
        <Notice tone="success" title={t('checklist.allDoneTitle')}>
          {t('checklist.allDone')}
        </Notice>
      ) : null}

      {total ? (
        groups.map((g) => (
          <section key={g.priority} className="ui-recgroup" aria-labelledby={`actgroup-${g.priority}`}>
            <h3 className="ui-recgroup__title" id={`actgroup-${g.priority}`}>
              {tScreen3(`priority.${g.priority}`)}
              <span className="ui-recgroup__count">{g.items.length}</span>
            </h3>
            <ul className="ui-panel ui-recs">
              {g.items.map((item) => (
                <li key={item.id} id={item.id}>
                  <ActionCard
                    item={item}
                    appliedAt={appliedById[item.id] ?? null}
                    onApplied={(at) => setAppliedById((prev) => ({ ...prev, [item.id]: at }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState title={t('actionList.emptyGated')} description={t('actionList.emptyGatedHint')} />
      )}

      {rejectedItems.length ? (
        <details className="ui-disclosure">
          <summary>{t('actionList.rejectedAccordionTitle', { count: rejectedItems.length })}</summary>
          <ul className="ui-rejected">
            {rejectedItems.map((row) => (
              <li key={row.id}>
                <strong>{row.title}</strong>
                <p>{row.note || t('actionList.rejectedNoNote')}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
