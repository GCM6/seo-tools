'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { EvidenceBadge } from './EvidenceBadge'
import { MarkdownPreview } from './MarkdownPreview'
import { Tag } from './Tag'
import { classifyBrandedAnswer, resolveWebSearchEnabled, type BrandedAnswerState } from './probeEngineCapability'

export interface PresenceAnswer {
  provider?: string
  answerText?: string
  evidenceId: string
  present: boolean
  // D3 五态判定所需字段。lib/probes/summary.ts 的 perPrompt.answers 目前只透传
  // {provider, answerText, evidenceId, present}（详见该文件注释），不带逐条 citedUrls/
  // hedged/unknownAdmission/webSearchEnabled——按任务边界不可修改 summary.ts，故这些字段由
  // 调用方（run 页）按 evidenceId 从原始 ai_probe_results 行 + evidence.request 里补齐后传入。
  // 缺省时 classifyBrandedAnswer 按"未联网引擎、无引用、无 hedge、无承认"兜底判 undetermined，
  // 不会误判成更强的结论。
  citedUrls?: string[]
  hedged?: boolean
  unknownAdmission?: boolean
  webSearchEnabled?: boolean
}

export interface PresencePrompt {
  text: string
  present: boolean
  // D1：该问题文本本身是否含品牌名/别名（透传自 prompts.branded），据此拆两区展示——
  // 左区无品牌提问测「主动召回」，右区品牌提问测「AI 认知质量」，两区测的是两件事。
  branded: boolean
  answers: PresenceAnswer[]
}

const STATE_ORDER: BrandedAnswerState[] = ['grounded', 'speculative', 'unknown', 'unverified', 'undetermined']

// 回答质量的颜色（design-system §3.5）：有依据=达标色、疑似臆测=警告色、承认不知道=中性灰、
// 断言无依据=严重色、未判定=斜纹。只用于图例、堆叠条和格子，不做大圆圈。
const STATE_SWATCH: Record<BrandedAnswerState, string> = {
  grounded: 'ui-sw ui-sw--ok',
  speculative: 'ui-sw ui-sw--mid',
  unknown: 'ui-sw ui-sw--neutral',
  unverified: 'ui-sw ui-sw--high',
  undetermined: 'ui-sw ui-sw--dashed',
}
const STATE_BAR: Record<BrandedAnswerState, string> = {
  grounded: 'ui-sw--ok',
  speculative: 'ui-sw--mid',
  unknown: 'ui-sw--neutral',
  unverified: 'ui-sw--high',
  undetermined: 'ui-hatch',
}

// AI 回答证据索引：左区（无品牌提问）按提问汇总「任一真实回答是否主动提及品牌」；
// 右区（品牌提问）按回答粒度五态分色——五态是逐条回答的判定，所以右区一格 = 一条真实探针回答。
// 两区都可以点格子核对原始回答（AI 原文按 Markdown 渲染，不显示 ** 原文）。
export function PresenceMap({
  prompts,
  unbranded,
}: {
  prompts: PresencePrompt[]
  unbranded: { present: number; total: number; wilsonLow: number }
}) {
  const t = useTranslations('screen2')
  const tc = useTranslations('common')
  const [selectedUnbrandedIndex, setSelectedUnbrandedIndex] = useState(0)
  const [selectedBrandedIndex, setSelectedBrandedIndex] = useState(0)

  if (prompts.length === 0) return null

  const unbrandedPrompts = prompts.filter((p) => !p.branded)
  const brandedPrompts = prompts.filter((p) => p.branded)
  const brandedAnswers = brandedPrompts.flatMap((p) =>
    p.answers.map((a) => ({ ...a, questionText: p.text, state: classifyBrandedAnswer(a) })),
  )
  // P1-7：右区口径分母是"回答"，不是"提问"——同一提问×多引擎会展开成多格，
  // 标题旁需明确标注格子数与去重后的引擎数，避免跟左区（一格=一问）当同类打分卡横向比较。
  const brandedEngineCount = new Set(brandedAnswers.map((a) => a.provider ?? '__unknown__')).size

  const unbrandedAbsentCount = unbrandedPrompts.filter((p) => p.answers.length > 0 && !p.present).length
  const unbrandedUnmeasuredCount = unbrandedPrompts.filter((p) => p.answers.length === 0).length
  const selectedUnbranded = unbrandedPrompts[selectedUnbrandedIndex]

  const stateCounts: Record<BrandedAnswerState, number> = { grounded: 0, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 }
  for (const a of brandedAnswers) stateCounts[a.state] += 1
  const selectedBranded = brandedAnswers[selectedBrandedIndex]

  const wilsonPct = Math.round(unbranded.wilsonLow * 100)
  // D9：unbranded 0/Y 是小品牌常态，按"机会空间"框架呈现，不当故障态。
  const showOpportunity = unbranded.total > 0 && unbranded.present === 0
  const hasUnbrandedMeasurement = unbranded.total > 0
  const outcomeHeadlineKey = !hasUnbrandedMeasurement
    ? 'mapOutcomeHeadlineUnmeasured'
    : showOpportunity
      ? 'mapOutcomeHeadlineMissing'
      : 'mapOutcomeHeadlinePresent'
  const outcomeSummaryKey = !hasUnbrandedMeasurement
    ? 'mapOutcomeSummaryUnmeasured'
    : showOpportunity
      ? 'mapOutcomeSummaryMissing'
      : 'mapOutcomeSummaryPresent'

  return (
    <div className="ui-split">
      {/* ——— 左区：先给结论，再留可逐题核对的证据 ——— */}
      <section className="ui-panel">
        <div className="ui-panel__body grid grid-cols-1 gap-3">
          <div className="ui-detail__head">
            <span>{t('mapOutcomeEyebrow')}</span>
            {hasUnbrandedMeasurement ? (
              <EvidenceBadge grade="sample" label={tc('tag.sampled')} suffix={`n=${unbranded.total}`} />
            ) : null}
          </div>
          <h3 className="ui-panel__title">{t(outcomeHeadlineKey)}</h3>
          <div
            className="ui-big"
            role="group"
            aria-label={t('mapOutcomeMetricValue', { present: unbranded.present, total: unbranded.total })}
          >
            {unbranded.present}
            <small> / {unbranded.total} · {t('mapOutcomeMetric')}</small>
          </div>
          <p className="ui-result__note">{t(outcomeSummaryKey)}</p>
          {hasUnbrandedMeasurement ? <p className="ui-footnote">{t('mapOutcomeCaliber', { n: unbranded.total })}</p> : null}
          <a className="ui-result__note" href="#sov-section">
            {t('mapOutcomeAction')}
          </a>
          <details className="ui-disclosure">
            <summary>{t('mapMethodSummary')}</summary>
            <div className="ui-result__note mt-2 grid grid-cols-1 gap-1">
              <p>{t('mapEvidenceDetail')}</p>
              <p>{t('mapWilsonNote', { pct: wilsonPct })}</p>
            </div>
          </details>

          {unbrandedPrompts.length > 0 && selectedUnbranded ? (
            <>
              <div className="ui-detail__head">
                <strong className="ui-label">{t('mapEvidenceGridTitle')}</strong>
                <span>
                  {t('mapEvidenceGridHint')} · {t('mapEvidenceGridCount', { total: unbranded.total })}
                </span>
              </div>
              <p className="ui-footnote">{t('mapEvidencePrompts', { present: unbranded.present, total: unbranded.total })}</p>
              <div className="ui-qgrid" role="group" aria-label={t('mapEvidenceGridLabel')}>
                {unbrandedPrompts.map((p, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`ui-q${p.present ? ' ui-q--hit' : ''}${p.answers.length === 0 ? ' ui-q--none' : ''}`}
                    aria-label={t('mapEvidenceCell', {
                      number: i + 1,
                      status: p.answers.length === 0 ? t('mapEvidenceUnmeasured') : p.present ? t('mapEvidencePresent') : t('mapEvidenceAbsent'),
                    })}
                    aria-pressed={i === selectedUnbrandedIndex}
                    onClick={() => setSelectedUnbrandedIndex(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <ul className="ui-legend">
                <li>
                  <i className="ui-sw ui-sw--ok" />
                  {t('legendPresent', { count: unbranded.present })}
                </li>
                <li>
                  <i className="ui-sw ui-sw--empty" />
                  {t('legendAbsent', { count: unbrandedAbsentCount })}
                </li>
                {unbrandedUnmeasuredCount > 0 ? (
                  <li>
                    <i className="ui-sw ui-sw--dashed" />
                    {t('legendUnmeasured', { count: unbrandedUnmeasuredCount })}
                  </li>
                ) : null}
              </ul>

              <section className="ui-detail" aria-live="polite">
                <div className="ui-detail__head">
                  <span>{t('mapEvidenceQuestion', { number: selectedUnbrandedIndex + 1 })}</span>
                  <b>
                    {selectedUnbranded.answers.length === 0
                      ? t('mapEvidenceUnmeasured')
                      : selectedUnbranded.present
                        ? t('mapEvidencePresent')
                        : t('mapEvidenceAbsent')}
                  </b>
                </div>
                <p className="ui-detail__q">{selectedUnbranded.text}</p>
                {selectedUnbranded.answers.length === 0 ? (
                  <p>{t('mapEvidenceNoAnswers')}</p>
                ) : (
                  selectedUnbranded.answers.map((answer) => (
                    <details key={answer.evidenceId} className="ui-disclosure ui-detail__answer">
                      <summary>
                        <span>{answer.provider ?? t('mapEvidenceUnknownProvider')}</span>
                        <span className="ui-muted">{answer.present ? t('mapEvidencePresent') : t('mapEvidenceAbsent')}</span>
                      </summary>
                      {answer.answerText ? <MarkdownPreview markdown={answer.answerText} /> : <p>{t('mapEvidenceAnswerUnavailable')}</p>}
                    </details>
                  ))
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>

      {/* ——— 右区：品牌提问 · AI 认知质量 ——— */}
      <section className="ui-panel">
        <div className="ui-panel__body grid grid-cols-1 gap-3">
          <div className="ui-detail__head">
            <span>{t('mapBrandedEyebrow')}</span>
            <span>{t('mapBrandedGridCount', { count: brandedAnswers.length, engines: brandedEngineCount })}</span>
          </div>
          <h3 className="ui-panel__title">{t('mapBrandedTitle')}</h3>
          <p className="ui-result__note">{t('mapBrandedDetail')}</p>
          <p className="ui-footnote" aria-label={t('mapBrandedStatsLabel')}>
            {t('mapBrandedAnswers', { count: brandedAnswers.length })}
          </p>

          {brandedAnswers.length === 0 ? (
            <p className="ui-result__note">{t('mapBrandedEmpty')}</p>
          ) : (
            <>
              <div
                className="ui-stackbar"
                role="img"
                aria-label={STATE_ORDER.map((s) => t(`legend${capitalize(s)}`, { count: stateCounts[s] })).join('，')}
              >
                {STATE_ORDER.filter((s) => stateCounts[s] > 0).map((s) => (
                  <span key={s} className={STATE_BAR[s]} style={{ flex: stateCounts[s] }} />
                ))}
              </div>
              <ul className="ui-legend">
                {STATE_ORDER.map((state) => (
                  <li key={state}>
                    <i className={STATE_SWATCH[state]} />
                    {t(`legend${capitalize(state)}`, { count: stateCounts[state] })}
                  </li>
                ))}
              </ul>
              <div className="ui-qgrid" role="group" aria-label={t('mapBrandedGridLabel')}>
                {brandedAnswers.map((a, i) => (
                  <button
                    type="button"
                    key={a.evidenceId}
                    className={`ui-q ui-q--${a.state}`}
                    aria-label={t('mapBrandedCell', { number: i + 1, state: t(`state${capitalize(a.state)}`) })}
                    aria-pressed={i === selectedBrandedIndex}
                    onClick={() => setSelectedBrandedIndex(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              {selectedBranded ? (
                <section className="ui-detail" aria-live="polite">
                  <div className="ui-detail__head">
                    <span>{t('mapBrandedQuestion', { number: selectedBrandedIndex + 1 })}</span>
                    <b>{t(`state${capitalize(selectedBranded.state)}`)}</b>
                  </div>
                  <p className="ui-detail__q">{selectedBranded.questionText}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{selectedBranded.provider ?? t('mapEvidenceUnknownProvider')}</span>
                    <Tag>
                      {resolveWebSearchEnabled(selectedBranded.provider, selectedBranded.webSearchEnabled)
                        ? t('engineOnline')
                        : t('engineMemory')}
                    </Tag>
                  </div>
                  {!resolveWebSearchEnabled(selectedBranded.provider, selectedBranded.webSearchEnabled) ? (
                    <p className="ui-footnote">
                      {t('engineMemoryHint')} · {t('mapBrandedNoWebSearch')}
                    </p>
                  ) : null}
                  <div className="ui-detail__answer">
                    {selectedBranded.answerText ? (
                      <MarkdownPreview markdown={selectedBranded.answerText} />
                    ) : (
                      <p>{t('mapEvidenceAnswerUnavailable')}</p>
                    )}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
