import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PriorityMatrix } from '@/components/PriorityMatrix'
import { KeywordTable } from '@/components/KeywordTable'
import { PillarBars } from '@/components/PillarBars'
import { EvidenceLadder } from '@/components/EvidenceLadder'
import { PillarGroupCard } from '@/components/PillarGroupCard'
import { CitedDomainsCard } from '@/components/CitedDomainsCard'
import { Term } from '@/components/Term'
import { EvidenceBadge } from '@/components/EvidenceBadge'
import { Tag } from '@/components/Tag'
import { Notice } from '@/components/Notice'
import { Facts } from '@/components/Facts'
import { LocalTime } from '@/components/LocalTime'
import { CodeBlock } from '@/components/CodeBlock'
import { DomainCountTable } from '@/components/DomainCountTable'
import { ResultTable } from '@/components/ResultTable'
import { statCardRows, resultTableHead } from '@/components/KeyResults'
import { SeverityMark, severityLevel } from '@/components/SeverityMark'
import { ReportDocBehavior } from '@/components/ReportDocBehavior'
import { labelKeyForGrade, type EvidenceGrade } from '@/lib/evidence'
import { deriveStatCards } from '@/lib/diagnostics'
import { dataSourceStatus } from '@/lib/config/data-sources'
import { marketLabel } from '@/lib/markets'
import { displayDomain, runShortId } from '@/lib/runs/workspace'
import { shortLevel, splitRecommendation } from '@/lib/runs/recommendations'
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
import { pillarsWithData } from '@/lib/diagnosis/pillars-with-data'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'
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
import { getAnalysisSessionArtifacts, getAnalysisSessionSnapshot, getKnowledgeSourceUrls } from '@/lib/knowledge/read'
import {
  isIntentPageFitArtifactPayload,
  type IntentPageFitAction,
  type IntentPageFitArtifactPayload,
  type IntentPageFitIssueCode,
  type PageRole,
  type SearchIntentKind,
} from '@/lib/diagnosis/intent-page-fit'

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// P1 下的性能/PSI 相关证据类型（明细里标注「实验室数据」）。
const LAB_TYPES = new Set<string>(['psi'])

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

// claim_type → 证据徽章等级（design-system §3.1）。标签统一用 common.tag.*（实测 / 抽样实测 / 推断 / 疑似），
// 与工作台其它页面同一套叫法；健康分、约束判断不走这里，恒为「推断」。
const CLAIM_GRADE: Record<string, EvidenceGrade> = {
  measured_hard: 'hard',
  measured_sample: 'sample',
  inferred: 'inferred',
  hypothesis: 'hypothesis',
}
const LADDER: EvidenceGrade[] = ['hard', 'sample', 'inferred', 'hypothesis']
const IPF_ARTIFACT_TYPE = 'intent_page_fit_map'
type ReportTranslator = (key: string, vars?: Record<string, string | number | Date>) => string

function demandLabel(row: IntentPageFitArtifactPayload['rows'][number], t: ReportTranslator) {
  if (row.impressions !== null) return t('keywords.intentMap.demandImpressions', { count: row.impressions })
  if (row.searchVolume !== null) return t('keywords.intentMap.demandSearchVolume', { count: row.searchVolume })
  return '—'
}

// 报告文档（ux-blueprint §5，原型「分享报告」A）：工作台报告页与只读分享页共用同一份。
// 抬头（事实栏）→ ① 结论 → ② 先做这 3 件事 → ③ 关键数据 → ④ 证据等级怎么读 → ⑤ 下一次复查
// → 详细章节（8 章，默认折叠，打印时展开）→ 页脚（报告编号）。
// 语言由调用方 setRequestLocale 决定，locale 只用于市场名；本组件没有任何 /[locale] 内部导航链接，
// 可用于无 locale 的分享路由。variant 只影响文档标题的层级（分享页 h1；工作台里抬头已有 h1，用 h2）。
// run 缺失即 notFound()——路由级 404。
export async function ReportView({
  runId,
  locale = 'zh',
  variant = 'share',
}: {
  runId: string
  locale?: string
  variant?: 'share' | 'workspace'
}) {
  const [t, tt, to, ts, tRoot, run] = await Promise.all([
    getTranslations('report'),
    getTranslations('terms'),
    getTranslations('overview'),
    getTranslations('screen2'),
    getTranslations(),
    getRun(runId),
  ])
  // 术语翻译层（P1-3「术语裸奔」修复）：术语解释文案统一放 terms.* 命名空间，
  // 与页面自身的 report.* 文案分开维护，供多处 <Term> 复用同一份解释。
  if (!run) notFound()

  // 跨版本回测横幅：run 记录的规则版本 ≠ 当前 RULES_VERSION 时提示（V0 同版本 / 旧数据 null → null，不渲染）。
  const versionDelta = rulesVersionDelta(run.rulesVersion, RULES_VERSION)
  const knowledgeSessionPromise = run.analysisSessionId ? getAnalysisSessionSnapshot(run.analysisSessionId) : Promise.resolve(undefined)
  const knowledgeArtifactsPromise = run.analysisSessionId ? getAnalysisSessionArtifacts(run.analysisSessionId) : Promise.resolve([])

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
    knowledgeSession,
    knowledgeArtifacts,
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
    knowledgeSessionPromise,
    knowledgeArtifactsPromise,
  ])
  const knowledgeSourceUrls = knowledgeSession
    ? await getKnowledgeSourceUrls([...new Set(findingRows.flatMap((finding) => finding.knowledgeVersionRefs))])
    : []
  const intentPageFitArtifact = knowledgeArtifacts.find((artifact) =>
    artifact.artifactType === IPF_ARTIFACT_TYPE && isIntentPageFitArtifactPayload(artifact.payload),
  )
  const intentPageFit: IntentPageFitArtifactPayload | undefined = intentPageFitArtifact && isIntentPageFitArtifactPayload(intentPageFitArtifact.payload)
    ? intentPageFitArtifact.payload
    : undefined

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
      evidence.map((e) => ({ type: e.type, payload: e.payload })),
      competitors.length,
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
  const gradeOf = (ct: string): EvidenceGrade => CLAIM_GRADE[ct] ?? 'inferred'
  const gradeLabel = (g: EvidenceGrade) => tRoot(labelKeyForGrade(g))
  const badgeFor = (ct: string) => <EvidenceBadge grade={gradeOf(ct)} label={gradeLabel(gradeOf(ct))} />
  const inferredBadge = <EvidenceBadge grade="inferred" label={gradeLabel('inferred')} />
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
    target: t('doc.target'),
  }
  // 矩阵里同名建议靠「针对：问题」区分（ux-blueprint §3.3 的同一条规则）。
  const findingTitle = new Map(findingRows.map((f) => [f.id, f.title]))
  const matrixTargets: Record<string, string> = Object.fromEntries(
    recRows.flatMap((r) => (r.findingId && findingTitle.has(r.findingId) ? [[r.id, findingTitle.get(r.findingId)!]] : [])),
  )

  // 引用平台徽标文案（CitedDomainsCard 新增 prop，i18n-free 惯例：调用方 t() 解析好再传入）。
  const citedDomainsPlatformLabels: Record<Exclude<CitationPlatform, 'other'>, string> = {
    reddit: t('geo.citedDomainsPlatformReddit'),
    youtube: t('geo.citedDomainsPlatformYoutube'),
    linkedin: t('geo.citedDomainsPlatformLinkedin'),
    quora: t('geo.citedDomainsPlatformQuora'),
    wikipedia: t('geo.citedDomainsPlatformWikipedia'),
    github: t('geo.citedDomainsPlatformGithub'),
  }

  // P1-1「报告结论不先行」修复：第一屏「接下来做的 3 件事」直接取优先级矩阵 top3
  // （quick_win 优先，其余象限补足），不改矩阵本身的分类逻辑，只在渲染层截取前 3 条。
  // 优先级矩阵为空（无建议）时，调用方按此数组长度整块不渲染，不硬凑空态。
  const nextSteps: ReportRecommendation[] = [
    ...model.priorityMatrix.quick_win,
    ...model.priorityMatrix.strategic,
    ...model.priorityMatrix.fill_in,
    ...model.priorityMatrix.low,
  ].slice(0, 3)

  // ③ 关键数据：与概览页同一套口径（deriveStatCards），报告里不带「去连接」入口和原始数据。
  const sources = dataSourceStatus()
  const cards = deriveStatCards(
    evidence.map((e) => ({ id: e.id, type: e.type, claimLevel: e.claimLevel, payload: e.payload, sitePageId: e.sitePageId })),
    { probe: probeSummary, sources: { renderProvider: sources.renderProvider, renderStaticFallback: sources.renderStaticFallback } },
  )
  const overall = model.execSummary.health.overall
  const keyRows = [
    ...statCardRows(cards, { t: to, ts, tRoot }),
    {
      key: 'health',
      label: t('doc.health'),
      value: overall === null ? t('summary.unscored') : Number.isInteger(overall) ? String(overall) : overall.toFixed(1),
      muted: overall === null,
      note: t('doc.healthNote'),
      evidence: inferredBadge,
    },
  ]

  const findingById = new Map(findingRows.map((f) => [f.id, f]))
  const sevLabel = (sev: string) => t(`severity.${sev === 'high' || sev === 'mid' ? sev : 'ok'}`)
  const reportId = `R-${runShortId(run.id)}`
  const domainText = project ? displayDomain(project.domain) : run.id
  const TitleTag = variant === 'workspace' ? 'h2' : 'h1'
  const copyLabels = { copyLabel: tRoot('common.actions.copyCode'), copiedLabel: tRoot('common.actions.copied') }

  return (
    <article className="ui-doc">
      <ReportDocBehavior />
      <header className="ui-doc__head">
        <p className="ui-doc__brand">
          <span className="ui-doc__brand-name">Veris</span>
          <span className="ui-doc__kind">· {t('title')}</span>
        </p>
        <TitleTag className="ui-doc__title">{domainText}</TitleTag>
        <Facts
          items={[
            { label: t('doc.facts.date'), value: capturedAt ? <LocalTime iso={capturedAt} dateOnly /> : '—' },
            {
              label: t('doc.facts.market'),
              value: (project && marketLabel(project.market, locale)) || project?.market || '—',
            },
            { label: t('doc.facts.protocol'), value: run.protocolVersion ?? '—', mono: true },
            { label: t('doc.facts.rules'), value: run.rulesVersion ?? '—', mono: true },
            { label: t('doc.facts.evidence'), value: t('doc.facts.evidenceCount', { count: evidence.length }) },
            { label: t('doc.facts.reportId'), value: reportId, mono: true },
          ]}
        />
        {knowledgeSession ? (
          <div className="ui-doc__trace">
            <p>
              {t('doc.knowledge')}：
              <span className="ui-mono">
                {knowledgeSession.knowledgeReleaseVersion} · {knowledgeSession.workflowVersion} · {knowledgeSession.ruleConfigVersion}
              </span>
            </p>
            {knowledgeSourceUrls.length ? (
              <details className="ui-disclosure">
                <summary>{t('doc.knowledgeSources', { count: knowledgeSourceUrls.length })}</summary>
                <ul className="ui-kv__list ui-mono">
                  {knowledgeSourceUrls.slice(0, 20).map((url) => (
                    <li key={url}>
                      {url.startsWith('http') ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      ) : (
                        url
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* 规则库升级后，旧报告不能直接和新结果对比（V0 同版本 / 旧数据 null → 不显示） */}
      {versionDelta ? <Notice tone="warn">{t('rulesUpgradedBanner', { from: versionDelta.from, to: versionDelta.to })}</Notice> : null}

      {/* ——— ① 结论：现状判断 + 影响最大的问题（按严重度排序） ——— */}
      <section className="ui-doc__sec" aria-labelledby="doc-sec-1">
        <h2 id="doc-sec-1" className="ui-doc__h">
          <span className="ui-doc__sn">1</span>
          {t('doc.sec.conclusion')}
        </h2>
        <div className="ui-doc__lead">
          <p>
            <b>{t('summary.constraintTitle')}：</b>
            <span>{t(`constraint.${model.execSummary.constraint.kind}`)}</span> {inferredBadge}
          </p>
          {model.execSummary.constraint.focusPillars.length ? (
            <p className="ui-footnote">
              {t('summary.focusPillars')}
              {model.execSummary.constraint.focusPillars.map((p) => pillarName(p)).join(' · ')}
            </p>
          ) : null}
        </div>
        {model.execSummary.topFindings.length ? (
          <ul className="ui-doc__findings">
            {model.execSummary.topFindings.map((f) => (
              <li key={f.id}>
                <SeverityMark level={severityLevel(f.severity)} label={sevLabel(f.severity)} />
                <p>
                  <b>{f.title}</b>
                  {f.description ? <> {f.description}</> : null}
                </p>
                {badgeFor(f.claimType)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-result__note">{t('summary.noFindings')}</p>
        )}
      </section>

      {/* ——— ② 先做这 3 件事：优先级矩阵 top3（quick_win 优先）；矩阵为空时整块不渲染，不硬凑空态 ——— */}
      {nextSteps.length > 0 ? (
        <section className="ui-doc__sec" aria-labelledby="doc-sec-2" data-testid="next-steps">
          <h2 id="doc-sec-2" className="ui-doc__h">
            <span className="ui-doc__sn">2</span>
            {t('summary.nextStepsTitle')}
          </h2>
          <ol className="ui-doc__todo">
            {nextSteps.map((r) => {
              const { action, fixSnippet } = splitRecommendation(r.what)
              const finding = r.findingId ? findingById.get(r.findingId) : undefined
              const impact = shortLevel(r.expectedImpact)
              const effort = shortLevel(r.effort)
              return (
                <li key={r.id}>
                  <div className="ui-doc__todo-title">{action}</div>
                  <div className="ui-doc__todo-meta">
                    {finding ? (
                      <span>
                        {t('doc.target')}
                        {finding.title}
                      </span>
                    ) : null}
                    {impact ? (
                      <span>
                        {t('doc.impact')} <b>{impact}</b>
                      </span>
                    ) : null}
                    {effort ? (
                      <span>
                        {t('doc.effort')} <b>{effort}</b>
                      </span>
                    ) : null}
                    {finding ? badgeFor(finding.claimType) : null}
                  </div>
                  {r.validationMethod ? (
                    <p className="ui-doc__todo-body">
                      {t('doc.validation')}
                      {r.validationMethod}
                    </p>
                  ) : null}
                  {fixSnippet ? <CodeBlock label={t('doc.fixExample')} code={fixSnippet} {...copyLabels} /> : null}
                  <a className="ui-doc__more" href="#sec-priority">
                    {t('summary.nextStepsViewDetail')}
                  </a>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      {/* ——— ③ 关键数据：结果表（与概览同口径）+ 5 个维度的健康分 ——— */}
      <section className="ui-doc__sec" aria-labelledby="doc-sec-3">
        <h2 id="doc-sec-3" className="ui-doc__h">
          <span className="ui-doc__sn">{nextSteps.length > 0 ? 3 : 2}</span>
          {t('doc.sec.keyData')}
        </h2>
        <ResultTable rows={keyRows} head={resultTableHead(to)} />
        <PillarBars
          unscoredLabel={t('summary.unscored')}
          ariaLabel={t('doc.pillarsAria')}
          pillars={PILLARS.map((p) => ({
            key: p,
            label: pillarName(p),
            score: model.execSummary.health.pillars[p].score,
          }))}
        />
        <details className="ui-disclosure">
          <summary>{t('summary.breakdownToggle')}</summary>
          <div className="ui-doc__block">
            <p>{t('summary.breakdownExplainIntro')}</p>
            <p>{t('summary.breakdownExplainRelation')}</p>
            <pre className="ui-code ui-code--wrap">{model.execSummary.health.breakdown}</pre>
          </div>
        </details>
      </section>

      {/* ——— ④ 证据等级怎么读：正文里出现的 4 种徽章 ——— */}
      <section className="ui-doc__sec" aria-labelledby="doc-sec-4">
        <h2 id="doc-sec-4" className="ui-doc__h">
          <span className="ui-doc__sn">{nextSteps.length > 0 ? 4 : 3}</span>
          {t('doc.sec.readEvidence')}
        </h2>
        <EvidenceLadder
          levels={LADDER.map((g) => ({ grade: g, label: gradeLabel(g), desc: t(`doc.ladder.${g}`) }))}
          note={t('doc.ladder.note')}
        />
      </section>

      {/* ——— ⑤ 下一次复查 ——— */}
      <section className="ui-doc__sec" aria-labelledby="doc-sec-5">
        <h2 id="doc-sec-5" className="ui-doc__h">
          <span className="ui-doc__sn">{nextSteps.length > 0 ? 5 : 4}</span>
          {t('doc.sec.retest')}
        </h2>
        <p className="ui-result__note">{t('doc.retestBody')}</p>
        {project?.nextRetestDueAt ? <p>{t('doc.retestDue', { date: project.nextRetestDueAt.slice(0, 10) })}</p> : null}
      </section>

      {/* ——— 详细章节：8 章默认折叠（打印时由 ReportDocBehavior 全部展开）——— */}
      <section className="ui-doc__sec" aria-labelledby="doc-sec-details">
        <h2 id="doc-sec-details" className="ui-doc__h">
          {t('doc.sec.details')}
        </h2>
        <p className="ui-footnote">{t('doc.detailsNote')}</p>

        <div className="ui-doc__chapters">
          {/* 优先级矩阵 */}
          <details className="ui-doc__chapter" id="sec-priority">
            <summary>
              <h3>{t('toc.priority')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              <PriorityMatrix matrix={model.priorityMatrix} labels={matrixLabels} targets={matrixTargets} />
            </div>
          </details>

          {/* 行动路线图 */}
          <details className="ui-doc__chapter" id="sec-roadmap">
            <summary>
              <h3>{t('toc.roadmap')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              {model.roadmap.length ? (
                (['quick', 'mid', 'long'] as const).map((h) => {
                  const items = model.roadmap.filter((i) => i.horizon === h)
                  if (!items.length) return null
                  return (
                    <div key={h} className="ui-doc__block">
                      <h4 className="ui-doc__h4">{t(`roadmap.${h}`)}</h4>
                      <ol className="ui-doc__steps">
                        {items.map((i) => {
                          const { action, fixSnippet } = splitRecommendation(i.recommendation.what)
                          return (
                            <li key={i.recommendation.id}>
                              <span className="ui-doc__step-what">{action}</span>
                              {i.recommendation.validationMethod ? (
                                <span className="ui-footnote">
                                  {t('roadmap.validation')}：{i.recommendation.validationMethod}
                                </span>
                              ) : null}
                              {fixSnippet ? <CodeBlock label={t('doc.fixExample')} code={fixSnippet} {...copyLabels} /> : null}
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  )
                })
              ) : (
                <p className="ui-result__note">{t('roadmap.empty')}</p>
              )}
            </div>
          </details>

          {/* 五支柱明细 */}
          <details className="ui-doc__chapter" id="sec-pillars">
            <summary>
              <h3>{t('toc.pillars')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
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
                    <ul className="ui-doc__plist">
                      {(['high', 'mid', 'ok'] as FindingSeverity[]).flatMap((sev) =>
                        bySev[sev].map((f) => {
                          const isLab = g.pillar === 'P1' && f.evidenceRefs.some((r) => LAB_TYPES.has(r.split('_')[0]))
                          return (
                            <li key={f.id}>
                              <SeverityMark level={severityLevel(sev)} label={sevLabel(sev)} />
                              <div className="ui-doc__pitem">
                                <p className="ui-doc__ptitle">
                                  {f.title} {badgeFor(f.claimType)}
                                  {isLab ? (
                                    <>
                                      {' '}
                                      <Tag>
                                        <Term explain={tt('labData')}>{t('labTag')}</Term>
                                      </Tag>
                                    </>
                                  ) : null}
                                </p>
                                {f.description ? <p className="ui-result__note">{f.description}</p> : null}
                                {f.evidenceRefs.length ? (
                                  <p className="ui-doc__refs">
                                    {t('pillars.evidence')}：<span className="ui-mono">{f.evidenceRefs.join(' · ')}</span>
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          )
                        }),
                      )}
                    </ul>
                  </PillarGroupCard>
                )
              })}
            </div>
          </details>

          {/* GEO 可见度补充（spec 2026-07-13-geo-branded-unbranded-redesign.md） */}
          <details className="ui-doc__chapter" id="sec-geo">
            <summary>
              <h3>{t('toc.geo')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              <p className="ui-footnote">{t('geo.meta')}</p>
              {probeSummary ? (
                <div className="ui-doc__block">
                  <p>
                    {t('geo.unbrandedHeadline', {
                      present: probeSummary.unbranded.present,
                      total: probeSummary.unbranded.total,
                      wilsonPct: Math.round(probeSummary.unbranded.wilsonLow * 100),
                    })}
                  </p>
                  {/* P1-2：mapWilsonNote 的人话解释，把「95% 置信下限」做成可悬停的 Term。 */}
                  <p className="ui-footnote">
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
                    <div className="ui-table-wrap">
                      <table className="ui-table">
                        <thead>
                          <tr>
                            <th>{t('geo.colEngine')}</th>
                            <th>{t('geo.colType')}</th>
                            <th className="ui-num">
                              <Term explain={tt('claimGrounded')}>{t('geo.colGrounded')}</Term>
                            </th>
                            <th className="ui-num">
                              <Term explain={tt('claimSpeculative')}>{t('geo.colSpeculative')}</Term>
                            </th>
                            <th className="ui-num">{t('geo.colUnknown')}</th>
                            <th className="ui-num">
                              <Term explain={tt('claimUnverified')}>{t('geo.colUnverified')}</Term>
                            </th>
                            <th className="ui-num">
                              <Term explain={tt('claimUndetermined')}>{t('geo.colUndetermined')}</Term>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {probeSummary.branded.perEngine.map((e) => (
                            <tr key={e.provider}>
                              <td className="ui-mono">{e.provider}</td>
                              <td>{e.webSearchEnabled ? t('geo.engineOnline') : t('geo.engineMemory')}</td>
                              <td className="ui-num">{e.grounded}</td>
                              <td className="ui-num">{e.speculative}</td>
                              <td className="ui-num">{e.unknown}</td>
                              <td className="ui-num">{e.unverified}</td>
                              <td className="ui-num">{e.undetermined}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <p className="ui-footnote">{t('geo.probeProxyNote')}</p>
                </div>
              ) : (
                <p className="ui-result__note">{t('geo.empty')}</p>
              )}

              {/* 被引用域名 Top 列表（只认 citedUrls，不含 retrievedUrls，口径同 CitedDomainsCard）——只在有引用样本时展示。 */}
              {probeSummary && probeSummary.citedDomains.length > 0 ? (
                <div className="ui-doc__block" data-testid="report-cited-domains">
                  <h4 className="ui-doc__h4">{t('geo.citedDomainsTitle')}</h4>
                  <p className="ui-footnote">{t('geo.citedDomainsMeta')}</p>
                  {/* 社区 / UGC 来源占引用比：无样本时说明「未能计算」，不显示 0%（避免把「无数据」读成「测得 0%」）。 */}
                  <p className="ui-footnote">
                    <b>{t('geo.ugcCitationShareTitle')}</b>：
                    {probeSummary.ugcCitationShare === null
                      ? t('geo.ugcCitationShareUnavailable')
                      : t('geo.ugcCitationShareValue', { pct: Math.round(probeSummary.ugcCitationShare * 100) })}
                  </p>
                  <p className="ui-footnote">{t('geo.ugcCitationShareNote')}</p>
                  <CitedDomainsCard
                    rows={probeSummary.citedDomains}
                    ownedLabel={t('geo.citedDomainsOwned')}
                    thirdPartyLabel={t('geo.citedDomainsThirdParty')}
                    platformLabels={citedDomainsPlatformLabels}
                    listLabels={{
                      domain: to('domainCol'),
                      count: to('countCol'),
                      showAll: to('showAll', { n: probeSummary.citedDomains.length }),
                      showLess: to('showLess', { n: 10 }),
                    }}
                  />
                </div>
              ) : null}

              {/* 双口径的实测半边：Google AI Overviews 真实 SERP 采样（唯一允许「实测」字样的曝光区块）。
                  分享页没有客户端 i18n 上下文，不复用 AioExposureCard（client），这里内联走 report.geo.*。
                  三种空态：①未配置 DataForSEO；②已配置但本轮未采集；③已采集且如实展示（含 0 命中）。 */}
              <div className="ui-doc__block" data-testid="report-aio">
                <h4 className="ui-doc__h4">
                  {t('geo.aioSectionTitle')} <EvidenceBadge grade="hard" label={t('geo.aioMeasuredBadge')} />
                </h4>
                <p className="ui-footnote">{t('geo.aioMeta')}</p>
                {!dataforseoConfigured ? (
                  <p className="ui-result__note">{t('geo.aioEmptyNotConfigured')}</p>
                ) : !aioSummary ? (
                  <p className="ui-result__note">{t('geo.aioEmptyNotCollected')}</p>
                ) : (
                  <>
                    <div className="ui-trio">
                      <div>
                        <span className="ui-big">
                          <b>{aioSummary.aioPresentCount}</b>
                          <small> {t('geo.aioOf', { total: aioSummary.measuredQueries })}</small>
                        </span>
                        <span className="ui-trio__cap">{t('geo.aioPresentLabel')}</span>
                      </div>
                      <div>
                        <span className="ui-big">
                          <b>{aioSummary.ownedCitedCount}</b>
                          <small> {t('geo.aioOf', { total: aioSummary.aioPresentCount })}</small>
                        </span>
                        <span className="ui-trio__cap">{t('geo.aioOwnedLabel')}</span>
                      </div>
                      <div>
                        <span className="ui-big">
                          <b>{aioSummary.measuredQueries}</b>
                          <small> {t('geo.aioOf', { total: aioSummary.totalQueries })}</small>
                        </span>
                        <span className="ui-trio__cap">{t('geo.aioMeasuredLabel')}</span>
                      </div>
                    </div>
                    <p className="ui-label">{t('geo.aioDomainsTitle')}</p>
                    {aioSummary.citedDomains.length === 0 ? (
                      <p className="ui-result__note">{t('geo.aioNoDomains')}</p>
                    ) : (
                      <DomainCountTable
                        rows={aioSummary.citedDomains.map((d) => ({ domain: d.domain, count: d.count, own: d.origin === 'owned' }))}
                        labels={{
                          domain: to('domainCol'),
                          count: to('countCol'),
                          own: t('geo.aioOwnedBadge'),
                          showAll: to('showAll', { n: aioSummary.citedDomains.length }),
                          showLess: to('showLess', { n: 10 }),
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </details>

          {/* 关键词现状与缺口 */}
          <details className="ui-doc__chapter" id="sec-keywords">
            <summary>
              <h3>{t('toc.keywords')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              {intentPageFit ? (
                <div className="ui-doc__block" data-testid="intent-page-fit-map">
                  <h4 className="ui-doc__h4">{t('keywords.intentMap.title')}</h4>
                  <p className="ui-footnote">
                    {t('keywords.intentMap.meta', {
                      rows: intentPageFit.rowCount,
                      issues: intentPageFit.issueRowCount,
                    })}
                  </p>
                  {intentPageFit.rows.length ? (
                    <div className="ui-table-wrap">
                      <table className="ui-table">
                        <thead>
                          <tr>
                            <th>{t('keywords.intentMap.col.query')}</th>
                            <th>{t('keywords.intentMap.col.intent')}</th>
                            <th>{t('keywords.intentMap.col.page')}</th>
                            <th>{t('keywords.intentMap.col.demand')}</th>
                            <th>{t('keywords.intentMap.col.fit')}</th>
                            <th>{t('keywords.intentMap.col.issues')}</th>
                            <th>{t('keywords.intentMap.col.action')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {intentPageFit.rows.slice(0, 12).map((row) => (
                            <tr key={`${row.query}:${row.currentUrl ?? 'missing'}`}>
                              <td>{row.query}</td>
                              <td>{t(`keywords.intentMap.intent.${row.intent as SearchIntentKind}`)}</td>
                              <td>
                                {row.currentUrl ? (
                                  <>
                                    <div className="ui-mono">{row.currentUrl}</div>
                                    <Tag>{t(`keywords.intentMap.role.${(row.currentPageRole ?? 'unknown') as PageRole}`)}</Tag>
                                  </>
                                ) : (
                                  <Tag>{t('keywords.intentMap.noPage')}</Tag>
                                )}
                              </td>
                              <td>{demandLabel(row, t)}</td>
                              <td>{t('keywords.intentMap.fitScore', { score: row.fitScore })}</td>
                              <td>
                                <span className="ui-tags">
                                  {row.issueCodes.map((code) => (
                                    <Tag key={code}>{t(`keywords.intentMap.issue.${code as IntentPageFitIssueCode}`)}</Tag>
                                  ))}
                                </span>
                              </td>
                              <td>{t(`keywords.intentMap.action.${row.action as IntentPageFitAction}`)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="ui-result__note">{t('keywords.intentMap.clean')}</p>
                  )}
                </div>
              ) : null}
              <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
            </div>
          </details>

          {/* 竞品对比 */}
          <details className="ui-doc__chapter" id="sec-competitors">
            <summary>
              <h3>{t('toc.competitors')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              {competitors.length ? (
                <div className="ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t('competitors.col.domain')}</th>
                        <th className="ui-num">{t('competitors.col.overlap')}</th>
                        <th className="ui-num">{t('competitors.col.shared')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.map((c) => (
                        <tr key={c.id}>
                          <td className="ui-mono">{c.domain}</td>
                          <td className="ui-num">{c.overlapScore ?? '—'}</td>
                          <td className="ui-num">{c.sharedKeywordsCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="ui-result__note">{t('competitors.empty')}</p>
              )}
            </div>
          </details>

          {/* 方法与范围 */}
          <details className="ui-doc__chapter" id="sec-method">
            <summary>
              <h3>{t('toc.method')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              <dl className="ui-kv">
                <dt>{t('method.capturedAt')}</dt>
                <dd>{capturedAt ? <LocalTime iso={capturedAt} /> : '—'}</dd>
                <dt>{t('method.protocol')}</dt>
                <dd className="ui-mono">{run.protocolVersion}</dd>
                <dt>{t('method.dataSources')}</dt>
                <dd>
                  {dataSources.length ? (
                    <span className="ui-tags">
                      {dataSources.map((s) => (
                        <Tag key={s}>{t(`method.sourceLabels.${s}`)}</Tag>
                      ))}
                    </span>
                  ) : (
                    t('method.noSources')
                  )}
                </dd>
              </dl>

              {model.reportContract ? (
                <div className="ui-doc__block">
                  <h4 className="ui-doc__h4">{t('contract.scopeTitle')}</h4>
                  <p className="ui-footnote">{t('contract.scopeMeta')}</p>
                  <dl className="ui-kv">
                    <dt>{t('contract.domain')}</dt>
                    <dd className="ui-mono">{model.reportContract.scope.domain || '—'}</dd>
                    <dt>{t('contract.entryUrl')}</dt>
                    <dd className="ui-mono">{model.reportContract.scope.entryUrl || '—'}</dd>
                    <dt>{t('contract.market')}</dt>
                    <dd>{model.reportContract.scope.targetMarket || '—'}</dd>
                    <dt>{t('contract.language')}</dt>
                    <dd>{model.reportContract.scope.language || '—'}</dd>
                    <dt>
                      <Term explain={tt('reportLevel')}>{t('contract.level')}</Term>
                    </dt>
                    <dd>
                      <strong>{model.reportContract.level}</strong> · {t(`contract.levelDesc.${model.reportContract.level}`)}
                    </dd>
                    <dt>{t('contract.coverage')}</dt>
                    <dd>
                      {t('contract.discovered')}: {model.reportContract.coverage.totalDiscovered} · {t('contract.checked')}:{' '}
                      {model.reportContract.coverage.checkedPages}
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

                  <h4 className="ui-doc__h4">{t('contract.dataSourcesTitle')}</h4>
                  {model.reportContract.dataSources.length ? (
                    <ul className="ui-doc__sources">
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
                          {source.children?.length ? (
                            <ul className="ui-doc__subsources" aria-label={t('contract.subSourceTitle')}>
                              {source.children.map((child) => (
                                <li key={child.sourceKey}>
                                  {t(`contract.subSourceLabel.${child.sourceKey.replace(':', '_')}`)}
                                  ：{t(`contract.sourceStatus.${child.status}`)}
                                  {child.capturedEvidenceCount ? ` · ${child.capturedEvidenceCount}` : ''}
                                  {child.failureReason ? ` · ${child.failureReason}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ui-result__note">{t('method.noSources')}</p>
                  )}

                  {model.reportContract.gaps.length ? (
                    <div className="ui-doc__block">
                      <h4 className="ui-doc__h4">{t('contract.gapsTitle')}</h4>
                      <p className="ui-footnote">{t('contract.gapHint')}</p>
                      <ul className="ui-doc__sources">
                        {model.reportContract.gaps.map((sourceKey) => (
                          <li key={sourceKey}>
                            {sourceKey.includes(':')
                              ? `${t(`contract.sourceLabel.${sourceKey.split(':')[0]}`)} · ${t(`contract.subSourceLabel.${sourceKey.replace(':', '_')}`)}`
                              : t(`contract.sourceLabel.${sourceKey}`)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {model.freshness.stale.length ? (
                <Notice tone="warn" title={t('method.staleTitle')}>
                  {t('method.staleIntro', { date: model.freshness.oldestVerifiedAt ?? t('method.staleNever') })}
                  <ul className="ui-doc__sources">
                    {model.freshness.stale.map((s) => (
                      <li key={s.artifactKey}>
                        {s.label} ·{' '}
                        <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                          {s.sourceUrl}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Notice>
              ) : (
                <p className="ui-footnote">{t('method.fresh')}</p>
              )}
            </div>
          </details>

          {/* 回测计划与闭环结果 */}
          <details className="ui-doc__chapter" id="sec-retest">
            <summary>
              <h3>{t('toc.retest')}</h3>
            </summary>
            <div className="ui-doc__chapter-body">
              <Notice>{t('retest.protocolLock')}</Notice>
              {retestSnapshots.length ? (
                <>
                  <div className="ui-table-wrap">
                    <table className="ui-table">
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
                  <p className="ui-footnote">
                    {inferredBadge} {t('retest.compound')}
                  </p>
                </>
              ) : (
                <p className="ui-result__note">{t('retest.empty')}</p>
              )}
            </div>
          </details>
        </div>
      </section>

      <footer className="ui-doc__foot">
        <span>{t('doc.footerId', { id: reportId })}</span>
        <span>{t('generatedBy')}</span>
        <span>{t('doc.footerTrust')}</span>
      </footer>
    </article>
  )
}
