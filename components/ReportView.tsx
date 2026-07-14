import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PriorityMatrix } from '@/components/PriorityMatrix'
import { KeywordTable } from '@/components/KeywordTable'
import { PillarBars } from '@/components/PillarBars'
import { EvidenceLadder } from '@/components/EvidenceLadder'
import { BlurText } from '@/components/fx/BlurText'
import {
  getRun,
  getFindings,
  getRecommendations,
  getRunEvidence,
  getReferenceArtifacts,
  getProject,
  getRunProbeResults,
  getRunPrompts,
  getRunKeywordMetrics,
  getRunKeywordGaps,
  getConfirmedCompetitors,
  getKeywords,
  getRetestSnapshots,
} from '@/lib/repositories'
import { buildReport, type ReportFinding, type ReportRecommendation } from '@/lib/diagnosis/report'
import { rulesVersionDelta } from '@/lib/diagnosis/rule-proposals'
import { RULES_VERSION, type Pillar, type FindingSeverity } from '@/lib/diagnosis/types'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'
import type { EvidenceType } from '@/lib/types'
// GEO 补充段（spec 2026-07-13-geo-branded-unbranded-redesign.md）：报告页只消费聚合结果渲染，
// 聚合逻辑仍是 lib/probes/summary.ts 这唯一数据来源（不改该文件，只读用它导出的纯函数）。
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// 证据类型 → 支柱：据此判定「采集到数据源的支柱」，并入 findings 里出现的支柱后传给 buildReport。
const EVIDENCE_PILLAR: Partial<Record<EvidenceType, Pillar>> = {
  psi: 'P1',
  site_audit: 'P1',
  page_fetch: 'P1',
  schema: 'P2',
  render_check: 'P2',
  gsc: 'P3',
  dataforseo_labs: 'P3',
  dataforseo_serp: 'P4',
  ua_probe: 'P5',
  third_party_presence: 'P5',
  dataforseo_backlinks: 'P5',
}

// P1 下的性能/PSI 相关证据类型（明细里标注「实验室数据」）。
const LAB_TYPES = new Set<string>(['psi'])

function pillarsWithData(evidenceTypes: string[], findingPillars: (string | null)[]): Pillar[] {
  const set = new Set<Pillar>()
  for (const t of evidenceTypes) {
    const p = EVIDENCE_PILLAR[t as EvidenceType]
    if (p) set.add(p)
  }
  for (const p of findingPillars) if (p && (PILLARS as string[]).includes(p)) set.add(p as Pillar)
  return PILLARS.filter((p) => set.has(p))
}

// claim_type → provenance tag（变体 + 中文标签）。铁律：实测仅 L3/L4；健康分/约束卡不走这里，恒「推断」。
const CLAIM_TAG: Record<string, { variant: string; key: string }> = {
  measured_hard: { variant: 'm', key: 'measured_hard' },
  measured_sample: { variant: 'm', key: 'measured_sample' },
  inferred: { variant: 'i', key: 'inferred' },
  hypothesis: { variant: 'g', key: 'hypothesis' },
}

const SEV_CLASS: Record<FindingSeverity, string> = { high: 'hi', mid: 'mid', ok: 'ok' }

// 报告主体（9 段 + 目录，第 4 段 GEO 可见度补充见 spec 2026-07-13-geo-branded-unbranded-redesign.md）。
// 报告页与只读分享页共用同一套渲染（spec §SP-G1e-1 / G2d）。
// 语言由调用方 setRequestLocale 决定；本组件无任何 /[locale] 内部导航链接，可用于无 locale 的分享路由。
// run 缺失即 notFound()——路由级 404。
export async function ReportView({ runId }: { runId: string }) {
  const t = await getTranslations('report')

  const run = await getRun(runId)
  if (!run) notFound()

  // 跨版本回测横幅：run 记录的规则版本 ≠ 当前 RULES_VERSION 时提示（V0 同版本 / 旧数据 null → null，不渲染）。
  const versionDelta = rulesVersionDelta(run.rulesVersion, RULES_VERSION)

  const [
    findingRows,
    recRows,
    evidence,
    referenceArtifacts,
    keywordMetrics,
    keywordGaps,
    competitors,
    keywords,
    retestSnapshots,
    project,
    probeResults,
    promptRows,
  ] = await Promise.all([
    getFindings(runId),
    getRecommendations(runId),
    getRunEvidence(runId),
    getReferenceArtifacts(),
    getRunKeywordMetrics(runId),
    getRunKeywordGaps(runId),
    getConfirmedCompetitors(run.projectId),
    getKeywords(run.projectId),
    getRetestSnapshots(runId),
    getProject(run.projectId),
    getRunProbeResults(runId),
    getRunPrompts(runId),
  ])

  // GEO 可见度补充（同 app/[locale]/runs/[id]/page.tsx 的接线方式）：ai_probe_results 已带
  // citedUrls/hedged/unknownAdmission，web_search_enabled 只落在 evidence_artifacts.request，
  // 需按 evidenceId 反查同一批 evidence 补齐，否则 aggregateProbeSummary 全兜底成 unbranded/无引用。
  const webSearchByEvidence = new Map(
    evidence.map((e) => [e.id, (e.request as { web_search_enabled?: boolean } | null)?.web_search_enabled]),
  )
  const answerByEvidence = new Map(
    evidence.map((e) => [e.id, (e.payload as { answerText?: string } | null)?.answerText]),
  )
  const probeSummary = project
    ? aggregateProbeSummary({
        prompts: promptRows,
        results: probeResults.map((r) => ({
          promptId: r.promptId,
          brandPresent: r.brandPresent,
          competitorsMentioned: r.competitorsMentioned,
          evidenceId: r.evidenceId,
          provider: r.provider,
          sentiment: r.sentiment,
          answerText: answerByEvidence.get(r.evidenceId),
          citedUrls: r.citedUrls,
          hedged: r.hedged,
          unknownAdmission: r.unknownAdmission,
          webSearchEnabled: webSearchByEvidence.get(r.evidenceId),
        })),
        brand: brandFromDomain(project.domain),
        competitors: project.competitors ?? [],
      })
    : null

  const findings: ReportFinding[] = findingRows.map((f) => ({
    id: f.id,
    side: f.side,
    pillar: f.pillar,
    title: f.title,
    description: f.description,
    severity: f.severity as FindingSeverity,
    claimType: f.claimType,
    confidence: f.confidence,
    evidenceRefs: f.evidenceRefs,
    status: f.status,
  }))

  const recommendations: ReportRecommendation[] = recRows.map((r) => ({
    id: r.id,
    findingId: r.findingId,
    what: r.what,
    why: r.why,
    expectedImpact: r.expectedImpact,
    effort: r.effort,
    priority: r.priority,
    confidence: r.confidence,
    status: r.status,
    outcome: r.outcome,
    validationMethod: r.validationMethod,
  }))

  const artifacts: ReferenceArtifactRow[] = referenceArtifacts.map((a) => ({
    artifactKey: a.artifactKey,
    sourceUrl: a.sourceUrl,
    lastVerifiedAt: a.lastVerifiedAt,
    refreshCadenceDays: a.refreshCadenceDays,
  }))

  const model = buildReport({
    findings,
    recommendations,
    pillarsWithData: pillarsWithData(
      evidence.map((e) => e.type),
      findingRows.map((f) => f.pillar),
    ),
    artifacts,
    now: new Date(),
  })

  const capturedAt = run.finishedAt ?? run.startedAt ?? ''
  const dataSources = [...new Set(evidence.map((e) => e.type))]
  const keywordText = new Map(keywords.map((k) => [k.id, { text: k.text, volume: k.searchVolume, difficulty: k.difficulty }]))

  const pillarName = (p: Pillar) => t(`pillarNames.${p.toLowerCase()}`)
  const scoreText = (s: number | null) => (s === null ? t('summary.unscored') : String(s))
  const claimLabel = (ct: string) => {
    const tag = CLAIM_TAG[ct]
    return tag ? t(`claim.${tag.key}`) : ct
  }

  const matrixLabels = {
    quadrants: {
      quick_win: t('priority.quadrants.quick_win'),
      strategic: t('priority.quadrants.strategic'),
      fill_in: t('priority.quadrants.fill_in'),
      low: t('priority.quadrants.low'),
    },
    quickWinsTitle: t('priority.quickWinsTitle'),
    axisImpact: t('priority.axisImpact'),
    axisEffort: t('priority.axisEffort'),
    high: t('priority.high'),
    low: t('priority.low'),
    count: (n: number) => t('priority.count', { count: n }),
    empty: t('priority.empty'),
  }

  // 证据等级 L0–L4 阶梯（plan-ux §5.1）；tone 复用 .tag 语义色：L0/L1→g、L2→i、L3/L4→m。
  const LADDER_TONE = { l0: 'g', l1: 'g', l2: 'i', l3: 'm', l4: 'm' } as const
  const ladderLevels = (['l0', 'l1', 'l2', 'l3', 'l4'] as const).map((code) => ({
    code: code.toUpperCase(),
    name: t(`evidenceLadder.${code}.name`),
    desc: t(`evidenceLadder.${code}.desc`),
    tone: LADDER_TONE[code],
  }))

  const toc: [string, string][] = [
    ['sec-summary', t('toc.summary')],
    ['sec-method', t('toc.method')],
    ['sec-pillars', t('toc.pillars')],
    ['sec-geo', t('toc.geo')],
    ['sec-keywords', t('toc.keywords')],
    ['sec-competitors', t('toc.competitors')],
    ['sec-priority', t('toc.priority')],
    ['sec-roadmap', t('toc.roadmap')],
    ['sec-retest', t('toc.retest')],
  ]

  return (
    <>
      <div className="sec-h">
        <h2>
          <BlurText>{t('title')}</BlurText>
        </h2>
        <span className="meta">{t('counts', { findings: model.counts.findings, recs: model.counts.recommendations, gated: model.counts.gated })}</span>
      </div>

      <div className="report-layout">
        <nav className="report-toc no-print" aria-label={t('title')}>
          <ol>
            {toc.map(([anchor, label]) => (
              <li key={anchor}>
                <a href={`#${anchor}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="report-body">
          {/* ——— 跨版本回测横幅（规则库升级提示，V0 暂不触发） ——— */}
          {versionDelta && (
            <div role="alert" style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: 12, marginBottom: 16 }}>
              {t('rulesUpgradedBanner', { from: versionDelta.from, to: versionDelta.to })}
            </div>
          )}

          {/* ——— 1. 执行摘要 ——— */}
          <section id="sec-summary" className="report-section">
            <h3>{t('toc.summary')}</h3>

            <div className="card report-constraint">
              <div className="report-constraint-h">
                <span className="report-constraint-title">{t('summary.constraintTitle')}</span>
                <span className="tag i">
                  <span className="dot" />
                  {t('claim.inferred')}
                </span>
              </div>
              <p>{t(`constraint.${model.execSummary.constraint.kind}`)}</p>
              {model.execSummary.constraint.focusPillars.length ? (
                <p className="report-focus">
                  {t('summary.focusPillars')}
                  {model.execSummary.constraint.focusPillars.map((p) => pillarName(p)).join(' · ')}
                </p>
              ) : null}
            </div>

            <div className="card report-health">
              <div className="report-health-h">
                <span>{t('summary.healthTitle')}</span>
                <span className="tag i">
                  <span className="dot" />
                  {t('claim.inferred')}
                </span>
              </div>
              <PillarBars
                overall={model.execSummary.health.overall}
                overallLabel={t('summary.overall')}
                unscoredLabel={t('summary.unscored')}
                ariaLabel={t('summary.pillarBarsAria')}
                pillars={PILLARS.map((p) => ({
                  key: p,
                  label: pillarName(p),
                  score: model.execSummary.health.pillars[p].score,
                }))}
              />
              <details className="report-breakdown">
                <summary>{t('summary.breakdownToggle')}</summary>
                <pre>{model.execSummary.health.breakdown}</pre>
              </details>
            </div>

            <EvidenceLadder title={t('summary.evidenceLadderTitle')} levels={ladderLevels} />

            <h4>{t('summary.topFindings')}</h4>
            {model.execSummary.topFindings.length ? (
              <ul className="report-top">
                {model.execSummary.topFindings.map((f) => (
                  <li key={f.id}>
                    <span className={`sev ${SEV_CLASS[f.severity]}`} />
                    <span className="report-top-title">{f.title}</span>
                    <span className={`tag ${CLAIM_TAG[f.claimType]?.variant ?? 'i'}`}>
                      <span className="dot" />
                      {claimLabel(f.claimType)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">{t('summary.noFindings')}</p>
            )}
          </section>

          {/* ——— 2. 方法与范围 ——— */}
          <section id="sec-method" className="report-section">
            <h3>{t('toc.method')}</h3>
            <div className="card report-method">
              <dl>
                <dt>{t('method.capturedAt')}</dt>
                <dd>{capturedAt || '—'}</dd>
                <dt>{t('method.protocol')}</dt>
                <dd className="mono">{run.protocolVersion}</dd>
                <dt>{t('method.dataSources')}</dt>
                <dd>
                  {dataSources.length ? (
                    <span className="report-sources">
                      {dataSources.map((s) => (
                        <span key={s} className="report-source-chip">{t(`method.sourceLabels.${s}`)}</span>
                      ))}
                    </span>
                  ) : (
                    t('method.noSources')
                  )}
                </dd>
              </dl>
            </div>

            {model.freshness.stale.length ? (
              <div className="card report-stale">
                <div className="report-stale-h">{t('method.staleTitle')}</div>
                <p>{t('method.staleIntro', { date: model.freshness.oldestVerifiedAt ?? t('method.staleNever') })}</p>
                <ul>
                  {model.freshness.stale.map((s) => (
                    <li key={s.artifactKey}>
                      {s.label} · <a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.sourceUrl}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="note">{t('method.fresh')}</p>
            )}
          </section>

          {/* ——— 3. 五支柱明细 ——— */}
          <section id="sec-pillars" className="report-section">
            <h3>{t('toc.pillars')}</h3>
            {model.pillarGroups.map((g) => {
              const bySev: Record<FindingSeverity, ReportFinding[]> = { high: [], mid: [], ok: [] }
              for (const f of g.findings) bySev[f.severity].push(f)
              return (
                <div key={g.pillar} className="card report-pillar">
                  <div className="report-pillar-h">
                    <span className="report-pillar-name">{pillarName(g.pillar)}</span>
                    <span className={g.scored ? 'report-pillar-score' : 'report-pillar-score muted'}>
                      {g.scored ? scoreText(g.score) : t('pillars.unscored')}
                    </span>
                  </div>
                  {g.findings.length ? (
                    (['high', 'mid', 'ok'] as FindingSeverity[]).map((sev) =>
                      bySev[sev].length ? (
                        <div key={sev} className="report-sev-group">
                          <div className="report-sev-label">
                            <span className={`sev ${SEV_CLASS[sev]}`} />
                            {t(`severity.${sev}`)}
                          </div>
                          <ul>
                            {bySev[sev].map((f) => {
                              const isLab = g.pillar === 'P1' && f.evidenceRefs.some((r) => LAB_TYPES.has(r.split('_')[0]))
                              return (
                                <li key={f.id}>
                                  <div className="report-finding-title">
                                    {f.title}
                                    <span className={`tag ${CLAIM_TAG[f.claimType]?.variant ?? 'i'}`}>
                                      <span className="dot" />
                                      {claimLabel(f.claimType)}
                                    </span>
                                    {isLab ? <span className="tag i report-lab">{t('labTag')}</span> : null}
                                  </div>
                                  {f.description ? <div className="report-finding-desc">{f.description}</div> : null}
                                  {f.evidenceRefs.length ? (
                                    <div className="report-evidence mono">{t('pillars.evidence')}: {f.evidenceRefs.join(' · ')}</div>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : null,
                    )
                  ) : (
                    <p className="note">{t('pillars.noFindings')}</p>
                  )}
                </div>
              )
            })}
          </section>

          {/* ——— 4. GEO 可见度补充（spec 2026-07-13-geo-branded-unbranded-redesign.md）——— */}
          <section id="sec-geo" className="report-section">
            <h3>{t('toc.geo')}</h3>
            <p className="note">{t('geo.meta')}</p>
            {probeSummary ? (
              <div className="card report-method">
                <p>
                  {t('geo.unbrandedHeadline', {
                    present: probeSummary.unbranded.present,
                    total: probeSummary.unbranded.total,
                    wilsonPct: Math.round(probeSummary.unbranded.wilsonLow * 100),
                  })}
                </p>
                <p>
                  {t('geo.brandedHeadline', {
                    brandedTotal: probeSummary.branded.perEngine.reduce(
                      (sum, e) => sum + e.grounded + e.speculative + e.unknown + e.unverified + e.undetermined,
                      0,
                    ),
                    grounded: probeSummary.branded.perEngine.reduce((sum, e) => sum + e.grounded, 0),
                    speculative: probeSummary.branded.perEngine.reduce((sum, e) => sum + e.speculative, 0),
                  })}
                </p>
                <p>{t('geo.citationRate', { pct: Math.round(probeSummary.citationRate * 100) })}</p>

                {probeSummary.branded.perEngine.length > 0 ? (
                  <div className="report-table-wrap">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>{t('geo.colEngine')}</th>
                          <th>{t('geo.colType')}</th>
                          <th>{t('geo.colGrounded')}</th>
                          <th>{t('geo.colSpeculative')}</th>
                          <th>{t('geo.colUnknown')}</th>
                          <th>{t('geo.colUnverified')}</th>
                          <th>{t('geo.colUndetermined')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {probeSummary.branded.perEngine.map((e) => (
                          <tr key={e.provider}>
                            <td className="mono">{e.provider}</td>
                            <td>{e.webSearchEnabled ? t('geo.engineOnline') : t('geo.engineMemory')}</td>
                            <td>{e.grounded}</td>
                            <td>{e.speculative}</td>
                            <td>{e.unknown}</td>
                            <td>{e.unverified}</td>
                            <td>{e.undetermined}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="note">{t('geo.empty')}</p>
            )}
          </section>

          {/* ——— 5. 关键词现状与缺口 ——— */}
          <section id="sec-keywords" className="report-section">
            <h3>{t('toc.keywords')}</h3>
            <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
          </section>

          {/* ——— 6. 竞品对比 ——— */}
          <section id="sec-competitors" className="report-section">
            <h3>{t('toc.competitors')}</h3>
            {competitors.length ? (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>{t('competitors.col.domain')}</th>
                      <th>{t('competitors.col.overlap')}</th>
                      <th>{t('competitors.col.shared')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c) => (
                      <tr key={c.id}>
                        <td className="mono">{c.domain}</td>
                        <td>{c.overlapScore ?? '—'}</td>
                        <td>{c.sharedKeywordsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="note">{t('competitors.empty')}</p>
            )}
          </section>

          {/* ——— 7. 优先级矩阵 ——— */}
          <section id="sec-priority" className="report-section">
            <h3>{t('toc.priority')}</h3>
            <PriorityMatrix matrix={model.priorityMatrix} labels={matrixLabels} />
          </section>

          {/* ——— 8. 行动路线图 ——— */}
          <section id="sec-roadmap" className="report-section">
            <h3>{t('toc.roadmap')}</h3>
            {model.roadmap.length ? (
              (['quick', 'mid', 'long'] as const).map((h) => {
                const items = model.roadmap.filter((i) => i.horizon === h)
                if (!items.length) return null
                return (
                  <div key={h} className="card report-roadmap-group">
                    <h4>{t(`roadmap.${h}`)}</h4>
                    <ul>
                      {items.map((i) => (
                        <li key={i.recommendation.id}>
                          <div className="report-roadmap-what">{i.recommendation.what}</div>
                          {i.recommendation.validationMethod ? (
                            <div className="report-roadmap-val note">
                              {t('roadmap.validation')}: {i.recommendation.validationMethod}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })
            ) : (
              <p className="note">{t('roadmap.empty')}</p>
            )}
          </section>

          {/* ——— 9. 回测计划与闭环结果 ——— */}
          <section id="sec-retest" className="report-section">
            <h3>{t('toc.retest')}</h3>
            <div className="card report-protocol-lock">{t('retest.protocolLock')}</div>
            {retestSnapshots.length ? (
              <>
                <div className="report-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>{t('retest.col.metric')}</th>
                        <th>{t('retest.col.baseline')}</th>
                        <th>{t('retest.col.retest')}</th>
                        <th>{t('retest.col.delta')}</th>
                        <th>{t('retest.col.interpretation')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retestSnapshots.map((s) => (
                        <tr key={s.id}>
                          <td className="mono">{s.metricName}</td>
                          <td>{s.baselineValue || '—'}</td>
                          <td>{s.retestValue || '—'}</td>
                          <td>{s.delta || '—'}</td>
                          <td>{s.interpretation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note">
                  <span className="tag i"><span className="dot" />{t('claim.inferred')}</span> {t('retest.compound')}
                </p>
              </>
            ) : (
              <p className="note">{t('retest.empty')}</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
