import { getTranslations, setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { KeyResults } from '@/components/KeyResults'
import { IssueSummary, rankIssues, type IssueSummaryItem } from '@/components/IssueSummary'
import type { EvidenceView } from '@/components/EvidenceDrawer'
import { RunProgress } from '@/components/RunProgress'
import { RetestBanner } from '@/components/RetestBanner'
import { PresenceMap, type PresencePrompt } from '@/components/PresenceMap'
import { SovBar } from '@/components/SovBar'
import { CitedDomainsCard } from '@/components/CitedDomainsCard'
import { AioExposureCard } from '@/components/AioExposureCard'
import { EmptyStateCTA } from '@/components/EmptyStateCTA'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { SectionHeader } from '@/components/SectionHeader'
import { Tag } from '@/components/Tag'
import { resolveWebSearchEnabled } from '@/components/probeEngineCapability'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { summarizeProjectDataSourceHealth } from '@/lib/settings/data-source-health'
import {
  getRun,
  getProject,
  getFindings,
  getRunEvidence,
  getRunPrompts,
  getRunProbeResults,
  getRunSerpAioResults,
} from '@/lib/repositories'
import { provenanceForClaim } from '@/lib/evidence'
import { deriveStatCards } from '@/lib/diagnostics'
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { aggregateAioExposure } from '@/lib/serp/aio-summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { dataSourceStatus } from '@/lib/config/data-sources'
import type { ClaimType, RunStatus } from '@/lib/types'
import type { CitationPlatform } from '@/lib/probes/citation-platform'

// Screen 2 — diagnosis dashboard. Server Component (Next 16): await params,
// pin the request locale, fetch the run + evidence + findings from the repo.
// The stat strip is derived from THIS run's real evidence (lib/diagnostics):
// measured where evidence exists, pending otherwise. The presence map / SoV
// depend on AI probes (SP4) and stay pending until that real data source lands.
// The issue list is data-driven; no synthetic findings are injected by the UI.
export default async function RunDiagnosisPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  // 都只依赖 id，并行取；project 依赖 run.projectId，随后单独取。
  const [t, run, findings, evidenceRows, promptRows, probeRows, aioResultRows] = await Promise.all([
    getTranslations(),
    getRun(id),
    getFindings(id),
    getRunEvidence(id),
    getRunPrompts(id),
    getRunProbeResults(id),
    getRunSerpAioResults(id),
  ])
  // 与 site/keywords/output 等子页一致：不存在的 run 走路由级 404，不渲染一个空的"诊断工作台"。
  if (!run) notFound()
  const project = run ? await getProject(run.projectId) : undefined

  // 回测排期（spec §5.1-6）：nextRetestDueAt ≤ 今天即到期，顶部横幅一键同协议重跑；
  // 在未来则显示次要「下次回测」提示。为空表示尚无 applied 建议触发排期。
  const retestDueAt = project?.nextRetestDueAt ?? null
  const retestDue = retestDueAt ? Date.parse(retestDueAt) <= new Date().getTime() : false

  // AI 探针聚合：可见度卡 / 答案地图 / SoV 的唯一数据来源；无结果时为 null（保持空态）。
  // 原始回答按 evidenceId 归档，供聚合期对竞品集重解析（SP-A2 #6）。
  const answerByEvidence = new Map(
    evidenceRows.map((e) => [e.id, (e.payload as { answerText?: string } | null)?.answerText]),
  )
  // D3/D6：web_search_enabled 只落在 evidence_artifacts.request（写入侧见 lib/probes/run-probes.ts），
  // ai_probe_results 表没有这一列——按 evidenceId 反查同一批证据的 request JSON 补齐（Wave 1 契约缺口）。
  const webSearchByEvidence = new Map(
    evidenceRows.map((e) => [e.id, (e.request as { web_search_enabled?: boolean } | null)?.web_search_enabled]),
  )
  // ⑤（引用来源归属分类）：归一化域名（去协议、去 www），与 run-probes.ts 探针期同一口径，
  // 供 summary.ts 的 citedDomains 判定 owned/third_party。解析失败时退回原始字符串——
  // 分类会保守落到 third_party，不会因此抛错阻断整页渲染。
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
        results: probeRows.map((r) => ({
          promptId: r.promptId,
          brandPresent: r.brandPresent,
          competitorsMentioned: r.competitorsMentioned,
          evidenceId: r.evidenceId,
          provider: r.provider,
          sentiment: r.sentiment,
          answerText: answerByEvidence.get(r.evidenceId),
          // Wave 1 契约已落库但此调用点此前未接线：不传则 summary.ts 全兜底成 unbranded/无引用，
          // 头条数字与三态判定都会失真（spec D3/D4）。
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

  // AIO（Google AI Overviews）曝光聚合：分引擎双口径的实测半边。UI 卡片组件尚未落地
  // （并行任务负责），本页只把数据 props 备好——totalQueries 取本 run 已落 serp_aio 证据的
  // 条数（成功+失败，与 AI 探针 attemptedCount 同一语义），measuredQueries 取 aggregateAioExposure
  // 内部由 results.length 派生。未采集/未配置/市场未映射时 aioTotalQueries 为 0，aioSummary 仍
  // 返回一个全零的 summary（不特判为 null，方便未来卡片组件统一处理空态)。
  const aioTotalQueries = evidenceRows.filter((e) => e.type === 'serp_aio').length
  const aioSummary = aggregateAioExposure({
    totalQueries: aioTotalQueries,
    results: aioResultRows.map((r) => ({
      keyword: r.keyword,
      aioPresent: r.aioPresent,
      targetDomainCited: r.targetDomainCited,
      citedUrls: r.citedUrls,
    })),
    domain: normalizedProjectDomain ?? project?.domain ?? '',
  })

  // PresenceMap 下区（品牌提问 · AI 认知质量）按回答粒度五态分色，但 probeSummary.perPrompt.answers
  // 只透传 {provider, answerText, evidenceId, present}（summary.ts 不可修改，见任务边界）。
  // 展示层在此按 evidenceId 补齐 citedUrls/hedged/unknownAdmission/webSearchEnabled，供组件内
  // classifyBrandedAnswer 复算五态——权威头条数字仍然只来自 probeSummary.unbranded/branded。
  const probeRowByEvidence = new Map(probeRows.map((r) => [r.evidenceId, r]))
  const presencePrompts: PresencePrompt[] =
    probeSummary?.perPrompt.map((p) => ({
      ...p,
      answers: p.answers.map((a) => {
        const raw = probeRowByEvidence.get(a.evidenceId)
        return {
          ...a,
          citedUrls: raw?.citedUrls,
          hedged: raw?.hedged,
          unknownAdmission: raw?.unknownAdmission,
          webSearchEnabled: webSearchByEvidence.get(a.evidenceId),
        }
      }),
    })) ?? []

  // 分引擎卡「检索型/记忆型」徽标（D6）：优先用 summary.ts 已算好的 branded.perEngine.webSearchEnabled
  // （逐引擎权威判定），该引擎没有品牌样本时才落到静态兜底表。
  const engineCapability = new Map(probeSummary?.branded.perEngine.map((e) => [e.provider, e.webSearchEnabled]) ?? [])
  const totalSpeculative = probeSummary?.branded.perEngine.reduce((sum, e) => sum + e.speculative, 0) ?? 0
  const sources = dataSourceStatus()

  // 数据源健康度：当前项目的运行覆盖率必须纳入该项目的 GSC，而全局位置不会。
  const dataSourceStatuses = await loadDataSourceStatuses(run?.projectId)
  const dataHealth = summarizeProjectDataSourceHealth(dataSourceStatuses)
  const gscConnected = dataSourceStatuses.find((source) => source.key === 'gsc')?.connected === true
  const dataforseoConfigured = dataSourceStatuses.find((s) => s.key === 'dataforseo')?.configured ?? false
  const runCollected =
    run != null && (['collected', 'diagnosing', 'reviewing', 'output'] as RunStatus[]).includes(run.status as RunStatus)
  const showCoverage = runCollected && dataHealth.up < dataHealth.total
  // GSC 缺失时，通用覆盖率 CTA 也必须落到本项目，而不能把用户带回全局设置。
  const coverageConnectHref = !gscConnected && run
    ? `/${locale}/projects/${encodeURIComponent(run.projectId)}#gsc`
    : `/${locale}/settings`
  const probeAnchor = `/${locale}/settings#source-aiProbe`

  // 从当前 run 的真实证据派生指标卡；measured 卡可点开对应证据原文。
  const cards = deriveStatCards(
    evidenceRows.map((e) => ({ id: e.id, type: e.type, claimLevel: e.claimLevel, payload: e.payload, sitePageId: e.sitePageId })),
    { probe: probeSummary, sources: { renderProvider: sources.renderProvider, renderStaticFallback: sources.renderStaticFallback } },
  )
  const evidenceById: Record<string, EvidenceView> = Object.fromEntries(
    evidenceRows.map((e) => [e.id, { id: e.id, type: e.type, claimLevel: e.claimLevel, source: e.source, payload: e.payload }]),
  )

  // 优先处理的问题：严重度优先、证据越硬越靠前，概览只取前 3 条，完整清单在「问题」视图（ux-blueprint §3.1）。
  const [tw, to] = await Promise.all([getTranslations('workspace'), getTranslations('overview')])
  const openFindings = findings.filter((f) => f.status !== 'dismissed')
  const ranked = rankIssues(
    openFindings.map((f): IssueSummaryItem => {
      const prov = provenanceForClaim(f.claimType as ClaimType)
      return {
        id: f.id,
        title: f.title,
        description: f.description ?? undefined,
        severity: f.severity,
        severityLabel: tw(`sev.${f.severity === 'high' || f.severity === 'mid' ? f.severity : 'ok'}`),
        pillarLabel: f.pillar ? tw(`pillarShort.${f.pillar}`) : undefined,
        grade: prov.grade,
        gradeLabel: t(prov.labelKey),
      }
    }),
  )
  const topIssues = ranked.slice(0, 3)
  const base = `/${locale}/runs/${id}`

  // 结论句：由已有数据模板拼接（品牌名、样本数、首要问题标题），不是 LLM 生成的数字。
  const brand = project ? brandFromDomain(project.domain) : ''
  const leadAi =
    probeSummary && probeSummary.unbranded.total > 0
      ? probeSummary.unbranded.present === 0
        ? to('lead.aiAbsent', { brand, total: probeSummary.unbranded.total })
        : to('lead.aiPartial', { brand, total: probeSummary.unbranded.total, present: probeSummary.unbranded.present })
      : to('lead.aiUnmeasured')
  const leadIssue = topIssues[0] ? to('lead.topIssue', { title: topIssues[0].title }) : to('lead.noIssue')
  const runActive = (['draft', 'collecting', 'collected', 'diagnosing', 'failed'] as RunStatus[]).includes(run.status as RunStatus)
  const missingSourceNames = dataHealth.items
    .filter((i) => !i.up)
    .map((i) => t(`dataHealth.source.${i.key}`))
    .join('、')

  return (
    <RunWorkspace runId={id} locale={locale} current="overview">
      {retestDue ? (
        <RetestBanner runId={id} locale={locale} />
      ) : retestDueAt ? (
        <p className="ui-footnote">{t('retest.nextDue', { date: retestDueAt.slice(0, 10) })}</p>
      ) : null}

      {showCoverage ? (
        <Notice
          title={to('coverage', { up: dataHealth.up, total: dataHealth.total })}
          action={<Link href={coverageConnectHref}>{to('coverageAction')}</Link>}
        >
          {missingSourceNames ? to('coverageMissing', { names: missingSourceNames }) : null}
        </Notice>
      ) : null}

      {/* 采集中 / 诊断中 / 失败：先给实时进度；完成后的下一步由抬头主动作承担 */}
      {runActive ? (
        <RunProgress runId={id} initialStatus={run.status as RunStatus} initialFailureReason={run.failureReason ?? ''} />
      ) : null}

      <section className="ui-section" aria-labelledby="sec-conclusion">
        <SectionHeader id="sec-conclusion" title={to('conclusionTitle')} note={to('conclusionNote')} />
        <p className="ui-lead">
          {leadAi} {leadIssue}
        </p>
        <KeyResults cards={cards} evidenceById={evidenceById} locale={locale} projectId={run.projectId} />
      </section>

      <section className="ui-section" aria-labelledby="sec-top-issues">
        <SectionHeader
          id="sec-top-issues"
          title={to('topIssuesTitle')}
          action={openFindings.length ? <Link href={`${base}/issues`}>{to('allIssues', { n: openFindings.length })} →</Link> : null}
        />
        {topIssues.length ? (
          <IssueSummary items={topIssues} issuesHref={`${base}/issues`} />
        ) : (
          <div className="ui-panel">
            <EmptyState title={t('screen2.emptyFindings')} />
          </div>
        )}
      </section>

      <section className="ui-section" id="geo-presence-section" aria-labelledby="sec-ai">
        <SectionHeader
          id="sec-ai"
          title={to('aiTitle')}
          note={
            probeSummary
              ? t('screen2.geoHeadline', {
                  present: probeSummary.unbranded.present,
                  total: probeSummary.unbranded.total,
                  speculative: totalSpeculative,
                })
              : to('aiNote')
          }
        />
        {probeSummary ? (
          <>
            <p className="ui-footnote mb-3">{to('aiNote')}</p>
            <PresenceMap prompts={presencePrompts} unbranded={probeSummary.unbranded} />
          </>
        ) : sources.aiProviders.length ? (
          <div className="ui-panel">
            <EmptyState title={to('probePending', { providers: sources.aiProviders.join(' / ') })} />
          </div>
        ) : (
          <EmptyStateCTA
            title={t('dataHealth.emptyProbeTitle')}
            impact={t('dataHealth.emptyProbeImpact')}
            actionLabel={t('dataHealth.connect')}
            href={probeAnchor}
          />
        )}
      </section>

      <section className="ui-section" id="sov-section" aria-labelledby="sec-sov">
        <SectionHeader id="sec-sov" title={to('sovTitle')} note={to('sovNote')} />
        {probeSummary ? (
          <SovBar rows={probeSummary.sov} />
        ) : (
          <div className="ui-panel">
            <EmptyState title={to('notMeasured')} description={to('aiNote')} />
          </div>
        )}
        {probeSummary && probeSummary.sentiment.total > 0 ? (
          <p className="ui-footnote mt-3">
            {to('sentimentLine', {
              n: probeSummary.samplesPerPromptPerEngine,
              pos: probeSummary.sentiment.positive,
              neu: probeSummary.sentiment.neutral,
              neg: probeSummary.sentiment.negative,
              cmp: probeSummary.sentiment.comparison,
            })}
          </p>
        ) : null}
      </section>

      {/* ⑤：被引用域名列表（自有高亮，超过 10 个默认折叠）——只在有正文引用样本时展示 */}
      {probeSummary && probeSummary.citedDomains.length > 0 ? (
        <section className="ui-section" id="cited-domains-section" aria-labelledby="sec-cited">
          <SectionHeader id="sec-cited" title={to('citedTitle')} note={to('citedNote')} />
          <CitedDomainsCard
            rows={probeSummary.citedDomains}
            ownedLabel={t('screen2.citedDomainsOwned')}
            thirdPartyLabel={t('screen2.citedDomainsThirdParty')}
            platformLabels={{
              reddit: t('screen2.citedDomainsPlatformReddit'),
              youtube: t('screen2.citedDomainsPlatformYoutube'),
              linkedin: t('screen2.citedDomainsPlatformLinkedin'),
              quora: t('screen2.citedDomainsPlatformQuora'),
              wikipedia: t('screen2.citedDomainsPlatformWikipedia'),
              github: t('screen2.citedDomainsPlatformGithub'),
            } satisfies Record<Exclude<CitationPlatform, 'other'>, string>}
            listLabels={{
              domain: to('domainCol'),
              count: to('countCol'),
              showAll: to('showAll', { n: probeSummary.citedDomains.length }),
              showLess: to('showLess', { n: 10 }),
            }}
          />
        </section>
      ) : null}

      {/* 双口径的实测半边：Google AI Overviews 真实 SERP 采样（唯一允许「实测曝光」字样的区块）。 */}
      <section className="ui-section" id="aio-exposure-section" aria-labelledby="sec-aio">
        <SectionHeader id="sec-aio" title={to('aioTitle')} note={to('aioNote')} />
        <AioExposureCard
          summary={aioTotalQueries > 0 ? aioSummary : null}
          configured={dataforseoConfigured}
          settingsHref={`/${locale}/settings#source-dataforseo`}
        />
      </section>

      {/* 分引擎（引擎间不可互推）——多于一个引擎才展示 */}
      {probeSummary && ((probeSummary.sovByEngine?.length ?? 0) > 1 || probeSummary.perEngine.length > 1) ? (
        <section className="ui-section" id="per-engine-section" aria-labelledby="sec-engines">
          <SectionHeader
            id="sec-engines"
            title={to('perEngineTitle')}
            note={`${t('screen2.perEngineMeta')} · ${t('screen2.citationRateLabel')} ${Math.round(probeSummary.citationRate * 100)}%`}
          />
          {probeSummary.perEngine.length > 1 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {probeSummary.perEngine.map((e) => {
                // D6：优先用 summary.ts 已算好的 branded 分引擎能力判定，无品牌样本时才落到静态兜底表。
                const online = engineCapability.get(e.engine) ?? resolveWebSearchEnabled(e.engine, undefined)
                return (
                  <div key={e.engine} className="ui-panel">
                    <div className="ui-panel__body grid grid-cols-1 gap-1">
                      <span className="ui-label">{e.engine}</span>
                      <span className="ui-big">
                        {e.promptsPresent}
                        <small> / {e.promptsTotal}</small>
                      </span>
                      <span>
                        <Tag>{online ? t('screen2.engineOnline') : t('screen2.engineMemory')}</Tag>
                      </span>
                      {!online ? <p className="ui-footnote">{t('screen2.engineMemoryHint')}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
          {(probeSummary.sovByEngine?.length ?? 0) > 1 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {probeSummary.sovByEngine!.map((e) => (
                <div key={e.engine} className="grid grid-cols-1 gap-2">
                  <span className="ui-label">
                    {e.engine} · n={e.samples}
                  </span>
                  <SovBar rows={e.sov} />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="ui-footnote">{to('footnote')}</p>
    </RunWorkspace>
  )
}
