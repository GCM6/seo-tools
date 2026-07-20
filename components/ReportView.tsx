import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PriorityMatrix } from '@/components/PriorityMatrix'
import { KeywordTable } from '@/components/KeywordTable'
import { PillarBars } from '@/components/PillarBars'
import { EvidenceLadder } from '@/components/EvidenceLadder'
import { BlurText } from '@/components/fx/BlurText'
import { PillarGroupCard } from '@/components/PillarGroupCard'
import { ReportToc } from '@/components/ReportToc'
import { CitedDomainsCard } from '@/components/CitedDomainsCard'
import { Term } from '@/components/Term'
import {
  getRun,
  getFindings,
  getRecommendations,
  getRunEvidence,
  getReferenceArtifacts,
  getProject,
  getRunDataSourceStatuses,
  getRunProbeResults,
  getRunPrompts,
  getRunKeywordMetrics,
  getRunKeywordGaps,
  getConfirmedCompetitors,
  getKeywords,
  getRetestSnapshots,
  getRunSerpAioResults,
} from '@/lib/repositories'
import { buildReport, buildReportContractInput, type ReportFinding, type ReportRecommendation } from '@/lib/diagnosis/report'
import { rulesVersionDelta } from '@/lib/diagnosis/rule-proposals'
import { RULES_VERSION, type Pillar, type FindingSeverity } from '@/lib/diagnosis/types'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'
import type { EvidenceType } from '@/lib/types'
// GEO 补充段（spec 2026-07-13-geo-branded-unbranded-redesign.md）：报告页只消费聚合结果渲染，
// 聚合逻辑仍是 lib/probes/summary.ts 这唯一数据来源（不改该文件，只读用它导出的纯函数）。
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
// AIO 实测曝光补齐（本轮任务）：与 app/[locale]/runs/[id]/page.tsx 同一条数据链路
// （aggregateAioExposure 唯一聚合函数 + loadDataSourceStatuses 判定 DataForSEO 是否已配置）。
// 注意：不复用 components/AioExposureCard.tsx —— 它是 'use client' 且内部调用
// useTranslations('screen2')，依赖 NextIntlClientProvider；report/page.tsx 在 [locale] 布局下有
// provider，但 app/share/[token]/page.tsx（无登录态分享页）没有任何 provider 包裹，直接复用会在
// 分享页运行时抛「No intl context found」。ReportView 本身及其消费的所有子组件走的是
// i18n-free（CitedDomainsCard 同理）或纯 Server 渲染惯例，AIO 区块同样内联实现、走 report.geo.* keys。
import { aggregateAioExposure } from '@/lib/serp/aio-summary'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import type { CitationPlatform } from '@/lib/probes/citation-platform'

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

// 回测表 metricName → i18n key 映射（第二波任务，spec 见编排者续派消息）。覆盖
// lib/diagnosis/retest-delta.ts::buildRetestSnapshotRows 与 lib/diagnosis/retest-metrics.ts::
// buildProbeMetricRows/buildAioMetricRows 产出的全部 metricName（已逐一枚举核对，无遗漏）。
// 同 CLAIM_TAG 的写法：TS 侧先判定是否为已知 key，只有已知才调 t()，未知 metricName 直接原样
// 返回——不依赖 next-intl 缺失 key 时的默认兜底行为（那会吐出 "namespace.key" 路径字符串，
// 不是「显示原始 key」）。这样新 metricName 上线但忘记补文案时，UI 兜底显示裸 metricName，
// 不会显示更难懂的 "report.retest.metric.xxx" 或直接崩溃。
const RETEST_METRIC_KEYS: Record<string, string> = {
  'findings.resolved': 'findingsResolved',
  'findings.persistent': 'findingsPersistent',
  'findings.new': 'findingsNew',
  'findings.regressed': 'findingsRegressed',
  'health.overall': 'healthOverall',
  'probe.brand_sov': 'probeBrandSov',
  'probe.brand_presence': 'probeBrandPresence',
  'probe.cited_owned_share': 'probeCitedOwnedShare',
  'aio.present_rate': 'aioPresentRate',
  'aio.owned_cited_rate': 'aioOwnedCitedRate',
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
  // 术语翻译层（P1-3「术语裸奔」修复）：术语解释文案统一放 terms.* 命名空间，
  // 与页面自身的 report.* 文案分开维护，供多处 <Term> 复用同一份解释。
  const tt = await getTranslations('terms')

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
    dataSourceStatuses,
    probeResults,
    promptRows,
    aioResultRows,
    byokStatuses,
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
    getRunDataSourceStatuses(runId),
    getRunProbeResults(runId),
    getRunPrompts(runId),
    getRunSerpAioResults(runId),
    loadDataSourceStatuses(run.projectId),
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
  // ⑤（引用来源归属分类）：归一化域名（去协议、去 www），与 run-probes.ts 探针期同一口径，
  // 供 summary.ts 的 citedDomains 判定 owned/third_party（同 app/[locale]/runs/[id]/page.tsx 写法）。
  // 此前本文件调用 aggregateProbeSummary 缺 domain 参数——citedDomains 会全部退化为 third_party。
  const normalizedProjectDomain = project
    ? (() => {
        try {
          return new URL(project.domain).hostname.replace(/^www\./, '')
        } catch {
          return project.domain
        }
      })()
    : undefined
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
        domain: normalizedProjectDomain,
      })
    : null

  // AIO（Google AI Overviews）实测曝光：分引擎双口径的实测半边（同 run 详情页接线）。
  // dataforseoConfigured=false → 空态①（未配置，说清原因，报告页静态输出不放设置页链接）；
  // aioTotalQueries=0（本轮未落 serp_aio 证据）→ 空态②（已配置但本轮未采集）；
  // 否则渲染 aioSummary（哪怕 aioPresentCount=0 也如实展示，不当故障，即空态③走正常渲染路径）。
  const dataforseoConfigured = byokStatuses.find((s) => s.key === 'dataforseo')?.configured ?? false
  const aioTotalQueries = evidence.filter((e) => e.type === 'serp_aio').length
  const aioSummary =
    aioTotalQueries > 0
      ? aggregateAioExposure({
          totalQueries: aioTotalQueries,
          results: aioResultRows.map((r) => ({
            keyword: r.keyword,
            aioPresent: r.aioPresent,
            targetDomainCited: r.targetDomainCited,
            citedUrls: r.citedUrls,
          })),
          domain: normalizedProjectDomain ?? project?.domain ?? '',
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

  const capturedAt = run.finishedAt ?? run.startedAt ?? ''
  const reportContractInput = buildReportContractInput({
    domain: project?.domain ?? '',
    targetMarket: project?.market,
    language: project?.language,
    capturedAt,
    evidence,
    dataSources: dataSourceStatuses,
    aiValidSamples: probeResults.length,
    confirmedCompetitors: competitors.length,
  })

  const model = buildReport({
    findings,
    recommendations,
    pillarsWithData: pillarsWithData(
      evidence.map((e) => e.type),
      findingRows.map((f) => f.pillar),
    ),
    artifacts,
    ...reportContractInput,
    now: new Date(),
  })

  const dataSources = [...new Set(evidence.map((e) => e.type))]
  // KeywordTable 是 client component，Server→Client 边界只传可序列化的普通结构，不传 Map 实例。
  const keywordText = Object.fromEntries(keywords.map((k) => [k.id, { text: k.text, volume: k.searchVolume, difficulty: k.difficulty }]))

  const pillarName = (p: Pillar) => t(`pillarNames.${p.toLowerCase()}`)
  const scoreText = (s: number | null) => (s === null ? t('summary.unscored') : String(s))
  const claimLabel = (ct: string) => {
    const tag = CLAIM_TAG[ct]
    return tag ? t(`claim.${tag.key}`) : ct
  }
  // 回测表指标名人类可读化；未登记的 metricName（新增遗漏 / 历史脏数据）原样兜底显示原始 key。
  const metricLabel = (name: string) => {
    const key = RETEST_METRIC_KEYS[name]
    return key ? t(`retest.metric.${key}`) : name
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

  // 引用平台徽标文案（CitedDomainsCard 新增 prop，i18n-free 惯例：调用方 t() 解析好再传入）。
  const citedDomainsPlatformLabels: Record<Exclude<CitationPlatform, 'other'>, string> = {
    reddit: t('geo.citedDomainsPlatformReddit'),
    youtube: t('geo.citedDomainsPlatformYoutube'),
    linkedin: t('geo.citedDomainsPlatformLinkedin'),
    quora: t('geo.citedDomainsPlatformQuora'),
    wikipedia: t('geo.citedDomainsPlatformWikipedia'),
    github: t('geo.citedDomainsPlatformGithub'),
  }

  const toc: [string, string][] = [
    ['sec-summary', t('toc.summary')],
    ['sec-priority', t('toc.priority')],
    ['sec-roadmap', t('toc.roadmap')],
    ['sec-pillars', t('toc.pillars')],
    ['sec-geo', t('toc.geo')],
    ['sec-keywords', t('toc.keywords')],
    ['sec-competitors', t('toc.competitors')],
    ['sec-method', t('toc.method')],
    ['sec-retest', t('toc.retest')],
  ]

  // P1-1「报告结论不先行」修复：第一屏「接下来做的 3 件事」直接取优先级矩阵 top3
  // （quick_win 优先，其余象限补足），不改矩阵本身的分类逻辑，只在渲染层截取前 3 条。
  // 优先级矩阵为空（无建议）时，调用方按此数组长度整块不渲染，不硬凑空态。
  const nextSteps: ReportRecommendation[] = [
    ...model.priorityMatrix.quick_win,
    ...model.priorityMatrix.strategic,
    ...model.priorityMatrix.fill_in,
    ...model.priorityMatrix.low,
  ].slice(0, 3)

  return (
    <>
      <div className="sec-h">
        <h2>
          <BlurText>{t('title')}</BlurText>
        </h2>
        <span className="meta">{t('counts', { findings: model.counts.findings, recs: model.counts.recommendations, gated: model.counts.gated })}</span>
      </div>

      <div className="report-layout">
        <ReportToc toc={toc} title={t('title')} />

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

            {/* ——— 「接下来做的 3 件事」：取优先级矩阵 top3（quick_win 优先），
                每项跳到 §优先级矩阵 详情；矩阵为空（无建议）时整块不渲染，不硬凑空态 ——— */}
            {nextSteps.length > 0 ? (
              <div className="card report-roadmap-group" data-testid="next-steps">
                <h4>{t('summary.nextStepsTitle')}</h4>
                <ul>
                  {nextSteps.map((r) => (
                    <li key={r.id}>
                      <div className="report-roadmap-what">{r.what}</div>
                      <div className="report-roadmap-val note">
                        <a href="#sec-priority">{t('summary.nextStepsViewDetail')}</a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

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
                <p className="report-breakdown-explain">{t('summary.breakdownExplainIntro')}</p>
                <p className="report-breakdown-explain">{t('summary.breakdownExplainRelation')}</p>
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

            <EvidenceLadder title={t('summary.evidenceLadderTitle')} levels={ladderLevels} />
          </section>

          {/* ——— 2. 优先级矩阵（原第 7 段，上移到第一屏之后，紧跟「接下来做的 3 件事」）——— */}
          <section id="sec-priority" className="report-section">
            <h3>{t('toc.priority')}</h3>
            <PriorityMatrix matrix={model.priorityMatrix} labels={matrixLabels} />
          </section>

          {/* ——— 3. 行动路线图（原第 8 段，随优先级矩阵一并上移）——— */}
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

          {/* ——— 4. 五支柱明细 ——— */}
          <section id="sec-pillars" className="report-section">
            <h3>{t('toc.pillars')}</h3>
            {model.pillarGroups.map((g) => {
              const bySev: Record<FindingSeverity, ReportFinding[]> = { high: [], mid: [], ok: [] }
              for (const f of g.findings) bySev[f.severity].push(f)
              return (
                <PillarGroupCard
                  key={g.pillar}
                  pillarName={pillarName(g.pillar)}
                  scoreText={scoreText(g.score)}
                  isScored={g.scored}
                  unscoredLabel={t('pillars.unscored')}
                  noFindingsLabel={t('pillars.noFindings')}
                  findingsCount={g.findings.length}
                  findingsLabel={t('pillars.findingsUnit', { count: g.findings.length })}
                >
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
                                    {isLab ? (
                                      <span className="tag i report-lab">
                                        <Term explain={tt('labData')}>{t('labTag')}</Term>
                                      </span>
                                    ) : null}
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
                  ) : null}
                </PillarGroupCard>
              )
            })}
          </section>

          {/* ——— 5. GEO 可见度补充（spec 2026-07-13-geo-branded-unbranded-redesign.md）——— */}
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
                {/* P1-2 修复：mapWilsonNote 的人话解释此前只存在于诊断页 screen2 命名空间，
                    没带进报告——这里补一句等价说明，并把「95% 置信下限」本身做成可 hover 的 Term。 */}
                <p className="note">
                  <Term explain={tt('wilsonLowerBound')}>{t('geo.wilsonLabel')}</Term>：{t('geo.wilsonNote')}
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
                          <th><Term explain={tt('claimGrounded')}>{t('geo.colGrounded')}</Term></th>
                          <th><Term explain={tt('claimSpeculative')}>{t('geo.colSpeculative')}</Term></th>
                          <th>{t('geo.colUnknown')}</th>
                          <th><Term explain={tt('claimUnverified')}>{t('geo.colUnverified')}</Term></th>
                          <th><Term explain={tt('claimUndetermined')}>{t('geo.colUndetermined')}</Term></th>
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
                <p className="note">{t('geo.probeProxyNote')}</p>
              </div>
            ) : (
              <p className="note">{t('geo.empty')}</p>
            )}

            {/* ⑤ 被引用域名 Top 列表（owned/third_party 归属，只认 citedUrls 不含 retrievedUrls，
                口径同 components/CitedDomainsCard.tsx）——只在有正文引用样本时展示。 */}
            {probeSummary && probeSummary.citedDomains.length > 0 ? (
              <div className="card report-method">
                <h4>{t('geo.citedDomainsTitle')}</h4>
                <p className="note">{t('geo.citedDomainsMeta')}</p>
                {/* 社区/UGC 来源占引用比（新增，unbranded 口径）：无样本时说明「未能计算」，
                    不显示 0%——避免「无数据」被误读成「测得 0%」（见 summary.ts ugcCitationShare 注释）。 */}
                <p className="note">
                  <b>{t('geo.ugcCitationShareTitle')}</b>：
                  {probeSummary.ugcCitationShare === null
                    ? t('geo.ugcCitationShareUnavailable')
                    : t('geo.ugcCitationShareValue', { pct: Math.round(probeSummary.ugcCitationShare * 100) })}
                </p>
                <p className="note">{t('geo.ugcCitationShareNote')}</p>
                <CitedDomainsCard
                  rows={probeSummary.citedDomains}
                  ownedLabel={t('geo.citedDomainsOwned')}
                  thirdPartyLabel={t('geo.citedDomainsThirdParty')}
                  platformLabels={citedDomainsPlatformLabels}
                />
              </div>
            ) : null}

            {/* 双口径的实测半边：Google AI Overviews 真实 SERP 采样（唯一允许「实测」字样的区块，
                spec 见 components/AioExposureCard.tsx 的口径注释）。不复用该 client 组件的原因见本文件
                顶部 import 注释——分享页无 NextIntlClientProvider，这里内联走 report.geo.* i18n-free 渲染。
                三种空态：①未配置 DataForSEO；②已配置但本轮未采集；③已采集且如实展示（含 0 命中）。 */}
            <div className="card report-method">
              <h4>{t('geo.aioSectionTitle')}</h4>
              <p className="note">
                <span className="tag m">
                  <span className="dot" />
                  {t('geo.aioMeasuredBadge')}
                </span>{' '}
                {t('geo.aioMeta')}
              </p>
              {!dataforseoConfigured ? (
                <p className="note">{t('geo.aioEmptyNotConfigured')}</p>
              ) : !aioSummary ? (
                <p className="note">{t('geo.aioEmptyNotCollected')}</p>
              ) : (
                <>
                  <div className="stats aio-exposure-stats">
                    <div className="stat">
                      <div className="k">{t('geo.aioPresentLabel')}</div>
                      <div className="v">
                        <b>{aioSummary.aioPresentCount}</b>
                        <small>{t('geo.aioOf', { total: aioSummary.measuredQueries })}</small>
                      </div>
                    </div>
                    <div className="stat">
                      <div className="k">{t('geo.aioOwnedLabel')}</div>
                      <div className="v">
                        <b>{aioSummary.ownedCitedCount}</b>
                        <small>{t('geo.aioOf', { total: aioSummary.aioPresentCount })}</small>
                      </div>
                    </div>
                    <div className="stat">
                      <div className="k">{t('geo.aioMeasuredLabel')}</div>
                      <div className="v">
                        <b>{aioSummary.measuredQueries}</b>
                        <small>{t('geo.aioOf', { total: aioSummary.totalQueries })}</small>
                      </div>
                    </div>
                  </div>

                  <div className="aio-exposure-block">
                    <div className="fb-l">{t('geo.aioDomainsTitle')}</div>
                    {aioSummary.citedDomains.length === 0 ? (
                      <p className="note">{t('geo.aioNoDomains')}</p>
                    ) : (
                      <ul className="aio-exposure-domains">
                        {aioSummary.citedDomains.map((d) => (
                          <li
                            key={d.domain}
                            className={d.origin === 'owned' ? 'aio-exposure-domain owned' : 'aio-exposure-domain'}
                          >
                            <span className="aio-exposure-domain-name">{d.domain}</span>
                            {d.origin === 'owned' ? (
                              <span className="tag ok">
                                <span className="dot" />
                                {t('geo.aioOwnedBadge')}
                              </span>
                            ) : null}
                            <span className="aio-exposure-domain-count">{t('geo.aioDomainCount', { count: d.count })}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ——— 6. 关键词现状与缺口 ——— */}
          <section id="sec-keywords" className="report-section">
            <h3>{t('toc.keywords')}</h3>
            <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
          </section>

          {/* ——— 7. 竞品对比 ——— */}
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

          {/* ——— 8. 方法与范围 ——— */}
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

            {model.reportContract ? (
              <div className="card report-method">
                <h4>{t('contract.scopeTitle')}</h4>
                <p className="note">{t('contract.scopeMeta')}</p>
                <dl>
                  <dt>{t('contract.domain')}</dt>
                  <dd className="mono">{model.reportContract.scope.domain || '—'}</dd>
                  <dt>{t('contract.entryUrl')}</dt>
                  <dd className="mono">{model.reportContract.scope.entryUrl || '—'}</dd>
                  <dt>{t('contract.market')}</dt>
                  <dd>{model.reportContract.scope.targetMarket || '—'}</dd>
                  <dt>{t('contract.language')}</dt>
                  <dd>{model.reportContract.scope.language || '—'}</dd>
                  <dt><Term explain={tt('reportLevel')}>{t('contract.level')}</Term></dt>
                  <dd>
                    <strong>{model.reportContract.level}</strong> · {t(`contract.levelDesc.${model.reportContract.level}`)}
                  </dd>
                  <dt>{t('contract.coverage')}</dt>
                  <dd>
                    {t('contract.discovered')}: {model.reportContract.coverage.totalDiscovered} · {t('contract.checked')}: {model.reportContract.coverage.checkedPages}
                    {model.reportContract.coverage.truncated ? ` · ${t('contract.truncated')}` : ''}
                  </dd>
                  {model.reportContract.coverage.gscTimeWindow ? (
                    <>
                      <dt>{t('contract.gscWindow')}</dt>
                      <dd>{model.reportContract.coverage.gscTimeWindow}</dd>
                    </>
                  ) : null}
                  <dt>{t('contract.aiSamples')}</dt>
                  <dd>{model.reportContract.coverage.aiValidSamples ?? 0}</dd>
                  <dt>{t('contract.competitors')}</dt>
                  <dd>{model.reportContract.coverage.confirmedCompetitors ?? 0}</dd>
                </dl>

                <h4>{t('contract.dataSourcesTitle')}</h4>
                {model.reportContract.dataSources.length ? (
                  <ul>
                    {model.reportContract.dataSources.map((source) => (
                      <li key={source.sourceKey}>
                        {source.sourceKey === 'dataforseo' ? (
                          <Term explain={tt('dataforseo')}>{t(`contract.sourceLabel.${source.sourceKey}`)}</Term>
                        ) : (
                          t(`contract.sourceLabel.${source.sourceKey}`)
                        )}
                        ：{t(`contract.sourceStatus.${source.status}`)}
                        {source.capturedEvidenceCount ? ` · ${source.capturedEvidenceCount}` : ''}
                        {source.failureReason ? ` · ${source.failureReason}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="note">{t('method.noSources')}</p>
                )}

                {model.reportContract.gaps.length ? (
                  <>
                    <h4>{t('contract.gapsTitle')}</h4>
                    <p className="note">{t('contract.gapHint')}</p>
                    <ul>
                      {model.reportContract.gaps.map((sourceKey) => (
                        <li key={sourceKey}>{t(`contract.sourceLabel.${sourceKey}`)}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}

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
                          <td>{metricLabel(s.metricName)}</td>
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
