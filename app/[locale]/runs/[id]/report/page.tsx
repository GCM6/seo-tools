import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { PriorityMatrix } from '@/components/PriorityMatrix'
import { PrintButton } from './PrintButton'
import {
  getRun,
  getProject,
  getFindings,
  getRecommendations,
  getRunEvidence,
  getReferenceArtifacts,
  getRunKeywordMetrics,
  getRunKeywordGaps,
  getConfirmedCompetitors,
  getKeywords,
  getRetestSnapshots,
} from '@/lib/repositories'
import { buildReport, type ReportFinding, type ReportRecommendation } from '@/lib/diagnosis/report'
import type { Pillar, FindingSeverity } from '@/lib/diagnosis/types'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'
import type { EvidenceType } from '@/lib/types'

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// 证据类型 → 支柱：page 据此判定「采集到数据源的支柱」，并入 findings 里出现的支柱后传给 buildReport。
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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('report')

  const run = await getRun(id)
  if (!run) notFound()

  const [
    project,
    findingRows,
    recRows,
    evidence,
    referenceArtifacts,
    keywordMetrics,
    keywordGaps,
    competitors,
    keywords,
    retestSnapshots,
  ] = await Promise.all([
    getProject(run.projectId),
    getFindings(id),
    getRecommendations(id),
    getRunEvidence(id),
    getReferenceArtifacts(),
    getRunKeywordMetrics(id),
    getRunKeywordGaps(id),
    getConfirmedCompetitors(run.projectId),
    getKeywords(run.projectId),
    getRetestSnapshots(id),
  ])

  const domain = project?.domain ?? ''

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

  const toc: [string, string][] = [
    ['sec-summary', t('toc.summary')],
    ['sec-method', t('toc.method')],
    ['sec-pillars', t('toc.pillars')],
    ['sec-keywords', t('toc.keywords')],
    ['sec-competitors', t('toc.competitors')],
    ['sec-priority', t('toc.priority')],
    ['sec-roadmap', t('toc.roadmap')],
    ['sec-retest', t('toc.retest')],
  ]

  return (
    <Shell active={4} locale={locale} runId={id} domain={domain}>
      <div className="sec-h">
        <h2>{t('title')}</h2>
        <span className="meta">{t('counts', { findings: model.counts.findings, recs: model.counts.recommendations, gated: model.counts.gated })}</span>
      </div>

      <div className="report-toolbar no-print">
        <a className="ghost" href={`/api/runs/${id}/report?format=md`} download>
          {t('exportMd')}
        </a>
        <PrintButton label={t('print')} />
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
              <div className="report-health-scores">
                <div className="report-health-overall">
                  <div className="k">{t('summary.overall')}</div>
                  <div className="v">{scoreText(model.execSummary.health.overall)}</div>
                </div>
                {PILLARS.map((p) => {
                  const cell = model.execSummary.health.pillars[p]
                  return (
                    <div key={p} className="report-health-cell">
                      <div className="k">{pillarName(p)}</div>
                      <div className={cell.score === null ? 'v muted' : 'v'}>{scoreText(cell.score)}</div>
                      <div className="report-health-issues">{t('pillars.issueCount', { count: cell.issueCount })}</div>
                    </div>
                  )
                })}
              </div>
              <details className="report-breakdown">
                <summary>{t('summary.breakdownToggle')}</summary>
                <pre>{model.execSummary.health.breakdown}</pre>
              </details>
            </div>

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

          {/* ——— 4. 关键词现状与缺口 ——— */}
          <section id="sec-keywords" className="report-section">
            <h3>{t('toc.keywords')}</h3>
            {keywordMetrics.length || keywordGaps.length ? (
              <>
                <p className="note">{t('keywords.estimateNote')}</p>
                {keywordMetrics.length ? (
                  <div className="report-table-wrap">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>{t('keywords.col.keyword')}</th>
                          <th>{t('keywords.col.clicks')}</th>
                          <th>{t('keywords.col.impressions')}</th>
                          <th>{t('keywords.col.ctr')}</th>
                          <th>{t('keywords.col.position')}</th>
                          <th>{t('keywords.col.source')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keywordMetrics.map((m) => (
                          <tr key={m.id}>
                            <td>{keywordText.get(m.keywordId)?.text ?? m.keywordId}</td>
                            <td>{m.clicks ?? '—'}</td>
                            <td>{m.impressions ?? '—'}</td>
                            <td>{m.ctr ?? '—'}</td>
                            <td>{m.position ?? '—'}</td>
                            <td className="mono">{m.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {keywordGaps.length ? (
                  <div className="report-table-wrap">
                    <h4>{t('keywords.gapsTitle')}</h4>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>{t('keywords.col.keyword')}</th>
                          <th>{t('keywords.col.gapType')}</th>
                          <th>{t('keywords.col.ourPosition')}</th>
                          <th>{t('keywords.col.opportunity')}</th>
                          <th>{t('keywords.col.volume')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keywordGaps.map((gp) => (
                          <tr key={gp.id}>
                            <td>{keywordText.get(gp.keywordId)?.text ?? gp.keywordId}</td>
                            <td>{t(`keywords.gapType.${gp.gapType}`)}</td>
                            <td>{gp.ourPosition ?? '—'}</td>
                            <td>{gp.opportunityScore ?? '—'}</td>
                            <td>{keywordText.get(gp.keywordId)?.volume ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="note">{t('keywords.empty')}</p>
            )}
          </section>

          {/* ——— 5. 竞品对比 ——— */}
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

          {/* ——— 6. 优先级矩阵 ——— */}
          <section id="sec-priority" className="report-section">
            <h3>{t('toc.priority')}</h3>
            <PriorityMatrix matrix={model.priorityMatrix} labels={matrixLabels} />
          </section>

          {/* ——— 7. 行动路线图 ——— */}
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

          {/* ——— 8. 回测计划与闭环结果 ——— */}
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
    </Shell>
  )
}
