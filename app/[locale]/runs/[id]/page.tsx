import { getTranslations, setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { StatStrip } from '@/components/StatStrip'
import { FindingList, type FindingItem } from '@/components/FindingList'
import { EvidenceDrawer, type EvidenceView } from '@/components/EvidenceDrawer'
import { RunProgress } from '@/components/RunProgress'
import { RetestBanner } from '@/components/RetestBanner'
import { PresenceMap, type PresencePrompt } from '@/components/PresenceMap'
import { SovBar } from '@/components/SovBar'
import { EmptyStateCTA } from '@/components/EmptyStateCTA'
import { resolveWebSearchEnabled } from '@/components/probeEngineCapability'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { summarizeDataSourceHealth } from '@/lib/settings/data-source-health'
import {
  getRun,
  getProject,
  getFindings,
  getEvidence,
  getRunEvidence,
  getRunPrompts,
  getRunProbeResults,
} from '@/lib/repositories'
import { provenanceForClaim } from '@/lib/evidence'
import { deriveStatCards } from '@/lib/diagnostics'
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { dataSourceStatus } from '@/lib/config/data-sources'
import type { ClaimType, RunStatus } from '@/lib/types'

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
  const [t, run, findings, evidenceRows, promptRows, probeRows] = await Promise.all([
    getTranslations(),
    getRun(id),
    getFindings(id),
    getRunEvidence(id),
    getRunPrompts(id),
    getRunProbeResults(id),
  ])
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
      })
    : null

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

  // 数据源健康度：顶栏 pill 常驻 + 采集完成后的覆盖率横幅共用同一次汇总。（spec §SP-G2b-5/6）
  const dataHealth = summarizeDataSourceHealth(await loadDataSourceStatuses(run?.projectId))
  const runCollected =
    run != null && (['collected', 'diagnosing', 'reviewing', 'output'] as RunStatus[]).includes(run.status as RunStatus)
  const showCoverage = runCollected && dataHealth.up < dataHealth.total
  const probeAnchor = `/${locale}/settings#source-aiProbe`

  // 从当前 run 的真实证据派生指标卡；measured 卡可点开对应证据原文。
  const cards = deriveStatCards(
    evidenceRows.map((e) => ({ id: e.id, type: e.type, claimLevel: e.claimLevel, payload: e.payload })),
    { probe: probeSummary, sources: { renderProvider: sources.renderProvider } },
  )
  const evidenceById: Record<string, EvidenceView> = Object.fromEntries(
    evidenceRows.map((e) => [e.id, { id: e.id, type: e.type, claimLevel: e.claimLevel, source: e.source, payload: e.payload }]),
  )

  // 已忽略（dismissed）的发现默认不进入列表——人工判定为误报后即从视图隐去。
  const items: FindingItem[] = await Promise.all(
    findings
      .filter((f) => f.status !== 'dismissed')
      .map(async (f): Promise<FindingItem> => {
      const prov = provenanceForClaim(f.claimType as ClaimType)
      // 证据已随 evidenceRows 一次性载入 evidenceById，同 run 的引用直接命中，
      // 只有跨 run 的引用（数据异常时）才回落到单独查询，避免 N+1。
      const artifacts = await Promise.all(
        (f.evidenceRefs ?? []).map((ref) => evidenceById[ref] ?? getEvidence(ref)),
      )
      return {
        id: f.id,
        side: f.side as FindingItem['side'],
        title: f.title,
        provVariant: prov.variant,
        provLabel: t(prov.labelKey),
        confidence: f.confidence,
        severity: f.severity === 'high' ? 'hi' : f.severity,
        evidence: artifacts
          .filter((a): a is NonNullable<typeof a> => Boolean(a))
          .map((a) => (
            <EvidenceDrawer
              key={a.id}
              evidence={{
                id: a.id,
                type: a.type,
                claimLevel: a.claimLevel,
                source: a.source,
                payload: a.payload,
              }}
            />
          )),
      }
    }),
  )

  return (
    <Shell active={2} locale={locale} runId={id} domain={project?.domain}>
      <section className="screen show" data-screen="2">
        {retestDue ? (
          <RetestBanner runId={id} locale={locale} />
        ) : retestDueAt ? (
          <div className="note">{t('retest.nextDue', { date: retestDueAt.slice(0, 10) })}</div>
        ) : null}

        {showCoverage ? (
          <div className="coverage-note">
            <span>{t('dataHealth.coverage', { up: dataHealth.up, total: dataHealth.total })}</span>
            <Link href={`/${locale}/settings`} className="coverage-action">
              {t('dataHealth.coverageAction')}
            </Link>
          </div>
        ) : null}

        {run ? (
          <RunProgress runId={id} initialStatus={run.status as RunStatus} initialFailureReason={run.failureReason ?? ''} />
        ) : null}

        <div className="work-summary">
          <div>
            <div className="ws-label">{t('screen2.overviewLabel')}</div>
            <h1>{project?.domain ?? id}</h1>
            <p>{t('screen2.overviewBody', { findings: items.length, evidence: evidenceRows.length })}</p>
            <div className="flex gap-4">
              <Link href={`/${locale}/runs/${id}/site`} className="text-sm underline underline-offset-2">
                {t('screen2.siteLink')}
              </Link>
              <Link href={`/${locale}/runs/${id}/keywords`} className="text-sm underline underline-offset-2">
                {t('screen2.keywordsLink')}
              </Link>
              <Link href={`/${locale}/runs/${id}/competitors`} className="text-sm underline underline-offset-2">
                {t('screen2.competitorsLink')}
              </Link>
            </div>
          </div>
          <div className="ws-next">
            <span>{t('screen2.nextLabel')}</span>
            <b>
              {items.length
                ? t('screen2.nextReview')
                : run?.status === 'collected'
                  ? t('screen2.nextCollected')
                  : t('screen2.nextCollect')}
            </b>
          </div>
        </div>

        <div className="sec-h">
          <h2>{t('screen2.currentTitle')}</h2>
          <span className="meta">{t('screen2.currentMeta')}</span>
        </div>
        <StatStrip cards={cards} evidenceById={evidenceById} locale={locale} />

        <div className="sec-h">
          <h2>{t('screen2.mapTitle')}</h2>
          <span className="meta">
            {probeSummary
              ? t('screen2.geoHeadline', {
                  present: probeSummary.unbranded.present,
                  total: probeSummary.unbranded.total,
                  speculative: totalSpeculative,
                })
              : t('screen2.mapMeta')}
          </span>
        </div>
        {probeSummary ? (
          <PresenceMap prompts={presencePrompts} unbranded={probeSummary.unbranded} />
        ) : sources.aiProviders.length ? (
          <div className="card pending-block">
            {t('screen2.probePendingRerun', { providers: sources.aiProviders.join(' / ') })}
          </div>
        ) : (
          <EmptyStateCTA
            title={t('dataHealth.emptyProbeTitle')}
            impact={t('dataHealth.emptyProbeImpact')}
            actionLabel={t('dataHealth.connect')}
            href={probeAnchor}
          />
        )}

        <div className="sec-h">
          <h2>{t('screen2.sovTitle')}</h2>
          <span className="meta">{t('screen2.sovMeta')}</span>
        </div>
        {probeSummary ? (
          <SovBar rows={probeSummary.sov} />
        ) : sources.aiProviders.length ? (
          <div className="card pending-block">
            {t('screen2.probePendingRerun', { providers: sources.aiProviders.join(' / ') })}
          </div>
        ) : (
          <EmptyStateCTA
            title={t('dataHealth.emptyProbeTitle')}
            impact={t('dataHealth.emptyProbeImpact')}
            actionLabel={t('dataHealth.connect')}
            href={probeAnchor}
          />
        )}

        {/* 分引擎 SoV（SP-A2 #6，引擎不可互推）——多于一个引擎才展示 */}
        {probeSummary && (probeSummary.sovByEngine?.length ?? 0) > 1 && (
          <>
            <div className="sec-h">
              <h2>{t('screen2.sovPerEngineTitle')}</h2>
              <span className="meta">{t('screen2.sovPerEngineMeta')}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {probeSummary.sovByEngine!.map((e) => (
                <div key={e.engine}>
                  <div className="text-xs text-neutral-500">
                    {e.engine} · n={e.samples}
                  </div>
                  <SovBar rows={e.sov} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* 分引擎可见度（G05/G06 分引擎报告，引擎间不可互推）——多于一个引擎才展示 */}
        {probeSummary && probeSummary.perEngine.length > 1 && (
          <>
            <div className="sec-h">
              <h2>{t('screen2.perEngineTitle')}</h2>
              <span className="meta">
                {t('screen2.perEngineMeta')} · {t('screen2.citationRateLabel')} {Math.round(probeSummary.citationRate * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {probeSummary.perEngine.map((e) => {
                // D6：分引擎语义标注——优先用 summary.ts 已算好的 branded 分引擎能力判定，
                // 该引擎无品牌样本时才落到本文件的静态兜底表（见 probeEngineCapability.ts 注释）。
                const online = engineCapability.get(e.engine) ?? resolveWebSearchEnabled(e.engine, undefined)
                return (
                  <div key={e.engine} className="rounded border p-3">
                    <div className="text-xs text-neutral-500">{e.engine}</div>
                    <div className="text-xl font-semibold">
                      {e.promptsPresent}/{e.promptsTotal}
                    </div>
                    <span className={`engine-badge ${online ? 'online' : 'memory'}`}>
                      {online ? t('screen2.engineOnline') : t('screen2.engineMemory')}
                    </span>
                    {!online && <p className="engine-memory-hint">{t('screen2.engineMemoryHint')}</p>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 引用情感分布（G09，测量层解析器，n=5 方向性）——有含品牌样本才展示 */}
        {probeSummary && probeSummary.sentiment.total > 0 && (
          <>
            <div className="sec-h">
              <h2>{t('screen2.sentimentTitle')}</h2>
              <span className="meta">{t('screen2.sentimentMeta')}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['sentPositive', probeSummary.sentiment.positive],
                  ['sentNeutral', probeSummary.sentiment.neutral],
                  ['sentNegative', probeSummary.sentiment.negative],
                  ['sentComparison', probeSummary.sentiment.comparison],
                ] as const
              ).map(([key, val]) => (
                <div key={key} className="rounded border p-3">
                  <div className="text-xs text-neutral-500">{t(`screen2.${key}`)}</div>
                  <div className="text-xl font-semibold">{val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="sec-h">
          <h2>{t('screen2.findingsTitle')}</h2>
          <span className="meta">{t('screen2.findingsMeta')}</span>
        </div>
        {items.length ? (
          <FindingList items={items} />
        ) : (
          <div className="card pending-block">{t('screen2.emptyFindings')}</div>
        )}

        <div className="note">{t('screen2.note')}</div>
      </section>
    </Shell>
  )
}
