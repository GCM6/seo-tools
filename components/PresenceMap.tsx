'use client'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
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
  // 上区无品牌提问测「主动召回」，下区品牌提问测「AI 认知质量」，两区测的是两件事。
  branded: boolean
  answers: PresenceAnswer[]
}

const STATE_ORDER: BrandedAnswerState[] = ['grounded', 'speculative', 'unknown', 'unverified', 'undetermined']

// AI 回答证据索引：上区（无品牌提问）颜色汇总"该提问的任一真实回答是否主动提及品牌"；
// 下区（品牌提问）按回答粒度五态分色——五态本身是逐条回答的判定，不是某个问题的单一状态，
// 所以下区的"格"= 一条真实探针回答（保留"点开看原始回答"的既有交互，只是粒度更细）。
export function PresenceMap({
  prompts,
  unbranded,
}: {
  prompts: PresencePrompt[]
  unbranded: { present: number; total: number; wilsonLow: number }
}) {
  const t = useTranslations('screen2')
  const [selectedUnbrandedIndex, setSelectedUnbrandedIndex] = useState(0)
  const [selectedBrandedIndex, setSelectedBrandedIndex] = useState(0)

  if (prompts.length === 0) return null

  const unbrandedPrompts = prompts.filter((p) => !p.branded)
  const brandedPrompts = prompts.filter((p) => p.branded)
  const brandedAnswers = brandedPrompts.flatMap((p) =>
    p.answers.map((a) => ({ ...a, questionText: p.text, state: classifyBrandedAnswer(a) })),
  )

  const unbrandedAbsentCount = unbrandedPrompts.filter((p) => p.answers.length > 0 && !p.present).length
  const unbrandedUnmeasuredCount = unbrandedPrompts.filter((p) => p.answers.length === 0).length
  const unbrandedTotalAnswers = unbrandedPrompts.reduce((sum, p) => sum + p.answers.length, 0)
  const selectedUnbranded = unbrandedPrompts[selectedUnbrandedIndex]

  const stateCounts: Record<BrandedAnswerState, number> = {
    grounded: 0,
    speculative: 0,
    unknown: 0,
    unverified: 0,
    undetermined: 0,
  }
  for (const a of brandedAnswers) stateCounts[a.state] += 1
  const selectedBranded = brandedAnswers[selectedBrandedIndex]

  const wilsonPct = Math.round(unbranded.wilsonLow * 100)
  // D9：unbranded 0/Y 是小品牌常态，按"机会空间"框架呈现，不当故障态。
  const showOpportunity = unbranded.total > 0 && unbranded.present === 0

  return (
    <div className="card map-wrap">
      {/* ——— 上区：无品牌提问 · 主动召回 ——— */}
      <div className="map-evidence-intro">
        <div>
          <span>{t('mapEvidenceEyebrow')}</span>
          <strong>{t('mapEvidenceTitle')}</strong>
        </div>
        <p>{t('mapEvidenceDetail')}</p>
        <div className="map-evidence-stats" aria-label={t('mapEvidenceStatsLabel')}>
          <span>{t('mapEvidenceAnswers', { count: unbrandedTotalAnswers })}</span>
          <span>{t('mapEvidencePrompts', { present: unbranded.present, total: unbranded.total })}</span>
        </div>
      </div>
      <p className="map-wilson-note">{t('mapWilsonNote', { pct: wilsonPct })}</p>

      {showOpportunity ? (
        <div className="map-opportunity">
          <strong>{t('mapOpportunityTitle')}</strong>
          <p>{t('mapOpportunityBody')}</p>
          <a href="#sov-section">{t('mapOpportunityLink')}</a>
        </div>
      ) : null}

      {unbrandedPrompts.length > 0 && selectedUnbranded ? (
        <>
          <div className="map" id="map" aria-label={t('mapEvidenceGridLabel')}>
            {unbrandedPrompts.map((p, i) => (
              <button
                type="button"
                key={i}
                className={`cell${p.present ? ' on' : ''}${p.answers.length === 0 ? ' no-answer' : ''}${i === selectedUnbrandedIndex ? ' selected' : ''}`}
                aria-label={t('mapEvidenceCell', {
                  number: i + 1,
                  status: p.answers.length === 0 ? t('mapEvidenceUnmeasured') : p.present ? t('mapEvidencePresent') : t('mapEvidenceAbsent'),
                })}
                aria-pressed={i === selectedUnbrandedIndex}
                onClick={() => setSelectedUnbrandedIndex(i)}
              >
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="legend">
            <span>
              <span className="sw" style={{ background: 'var(--measured)' }} />
              {t('legendPresent', { count: unbranded.present })}
            </span>
            <span>
              <span
                className="sw"
                style={{ background: 'var(--ds-surface-2)', border: '1px solid var(--ds-border)' }}
              />
              {t('legendAbsent', { count: unbrandedAbsentCount })}
            </span>
            {unbrandedUnmeasuredCount > 0 ? (
              <span>
                <span className="sw" style={{ background: 'transparent', border: '1px dashed var(--ds-muted)' }} />
                {t('legendUnmeasured', { count: unbrandedUnmeasuredCount })}
              </span>
            ) : null}
            <span style={{ color: 'var(--ds-muted)' }}>{t('legendSelect')}</span>
          </div>

          <section className="map-evidence-detail" aria-live="polite">
            <div className="map-evidence-detail-head">
              <span>{t('mapEvidenceQuestion', { number: selectedUnbrandedIndex + 1 })}</span>
              <b className={selectedUnbranded.answers.length === 0 ? 'unmeasured' : selectedUnbranded.present ? 'hit' : 'miss'}>
                {selectedUnbranded.answers.length === 0
                  ? t('mapEvidenceUnmeasured')
                  : selectedUnbranded.present
                    ? t('mapEvidencePresent')
                    : t('mapEvidenceAbsent')}
              </b>
            </div>
            <p className="map-evidence-question">{selectedUnbranded.text}</p>
            <div className="map-evidence-answers">
              {selectedUnbranded.answers.length === 0 ? (
                <p className="map-evidence-empty">{t('mapEvidenceNoAnswers')}</p>
              ) : (
                selectedUnbranded.answers.map((answer) => (
                  <details key={answer.evidenceId}>
                    <summary>
                      <span>{answer.provider ?? t('mapEvidenceUnknownProvider')}</span>
                      <b className={answer.present ? 'hit' : 'miss'}>
                        {answer.present ? t('mapEvidencePresent') : t('mapEvidenceAbsent')}
                      </b>
                    </summary>
                    <p>{answer.answerText || t('mapEvidenceAnswerUnavailable')}</p>
                  </details>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* ——— 下区：品牌提问 · AI 认知质量 ——— */}
      <div className="map-evidence-intro branded">
        <div>
          <span>{t('mapBrandedEyebrow')}</span>
          <strong>{t('mapBrandedTitle')}</strong>
        </div>
        <p>{t('mapBrandedDetail')}</p>
        <div className="map-evidence-stats branded" aria-label={t('mapBrandedStatsLabel')}>
          <span>{t('mapBrandedAnswers', { count: brandedAnswers.length })}</span>
        </div>
      </div>

      {brandedAnswers.length === 0 ? (
        <p className="map-evidence-empty">{t('mapBrandedEmpty')}</p>
      ) : (
        <>
          <div className="map" aria-label={t('mapBrandedGridLabel')}>
            {brandedAnswers.map((a, i) => (
              <button
                type="button"
                key={a.evidenceId}
                className={`cell state-${a.state}${i === selectedBrandedIndex ? ' selected' : ''}`}
                aria-label={t('mapBrandedCell', { number: i + 1, state: t(`state${capitalize(a.state)}`) })}
                aria-pressed={i === selectedBrandedIndex}
                onClick={() => setSelectedBrandedIndex(i)}
              >
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="legend">
            {STATE_ORDER.map((state) => (
              <span key={state}>
                <span className="sw" style={STATE_SWATCH_STYLE[state]} />
                {t(`legend${capitalize(state)}`, { count: stateCounts[state] })}
              </span>
            ))}
          </div>

          {selectedBranded ? (
            <section className="map-evidence-detail" aria-live="polite">
              <div className="map-evidence-detail-head">
                <span>{t('mapBrandedQuestion', { number: selectedBrandedIndex + 1 })}</span>
                <b className={`state-${selectedBranded.state}`}>{t(`state${capitalize(selectedBranded.state)}`)}</b>
              </div>
              <p className="map-evidence-question">{selectedBranded.questionText}</p>
              <div className="map-evidence-answers">
                <div className="engine-badge-row">
                  <span>{selectedBranded.provider ?? t('mapEvidenceUnknownProvider')}</span>
                  {resolveWebSearchEnabled(selectedBranded.provider, selectedBranded.webSearchEnabled) ? (
                    <span className="engine-badge online">{t('engineOnline')}</span>
                  ) : (
                    <span className="engine-badge memory">{t('engineMemory')}</span>
                  )}
                </div>
                {!resolveWebSearchEnabled(selectedBranded.provider, selectedBranded.webSearchEnabled) ? (
                  <p className="engine-memory-hint">
                    {t('engineMemoryHint')} · {t('mapBrandedNoWebSearch')}
                  </p>
                ) : null}
                <p>{selectedBranded.answerText || t('mapEvidenceAnswerUnavailable')}</p>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

// undetermined 沿用「未采样/无引用能力」的虚线中性处理，其余四态用实心色块（见 globals.css
// 同名 .cell.state-* 规则，两处配色须保持一致）。
const STATE_SWATCH_STYLE: Record<BrandedAnswerState, CSSProperties> = {
  grounded: { background: 'var(--good)' },
  speculative: { background: 'var(--inferred)' },
  unknown: { background: 'var(--ds-info)' },
  unverified: { background: 'var(--gap)' },
  undetermined: { background: 'transparent', border: '1px dashed var(--ds-muted)' },
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
