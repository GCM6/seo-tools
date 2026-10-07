import { sha256Hex } from '@/lib/collection/hash'
import { reasonOf, type RawResponse } from '@/lib/collection/result'
import { identifyCompetitors } from '@/lib/diagnosis/competitor-identify'
import type { RunProgressMessage } from '@/lib/inngest/channels'
import type { createEvidenceArtifact, linkEvidenceRaw, pruneCompetitorCandidates, upsertCompetitor } from '@/lib/repositories'
import type { DataSourceStatus } from '@/db/schema'
import type { DataforseoProvider, SeedSerpResult } from './types'
import type { Seed } from '@/lib/diagnosis/seed-keywords'
import { findMarket } from '@/lib/markets'

// DataForSEO 采集阶段（Phase C → SP-A §4.2）：种子词 Google SERP（+候选竞品）→ Labs → Backlinks → Bing 收录 → 品牌词 SERP，
// 五个子阶段各自如实返回 collected / partial / failed / not_attempted 与原因，由编排层写子阶段状态并汇总父级。
// 全部第三方估算（证据 L3）。每次外部调用独立降级——单个子阶段失败不阻断其余子阶段。
// 种子为空时只跳过依赖种子的 seed_serp / labs（no_seeds），backlinks / bing / 品牌词照常执行（第一波审查 I5）。

interface CollectStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export type DfsSubStage = 'seed_serp' | 'labs' | 'backlinks' | 'bing_index' | 'brand_serp'
export const DFS_SUB_STAGES: DfsSubStage[] = ['seed_serp', 'labs', 'backlinks', 'bing_index', 'brand_serp']

export interface SubStageOutcome {
  stage: DfsSubStage
  status: DataSourceStatus
  reason: string | null
  evidenceCount: number
}

export interface DataforseoStageArgs {
  step: CollectStep
  emit: (msg: RunProgressMessage) => Promise<void>
  runId: string
  projectId: string
  domain: string // 本站域名（已去 www.）
  brand: string
  market: string
  // 带来源标签的种子（SP-A §3.3）；调用 DataForSEO 时只用 text，来源随 seed_serp 证据的 request 落库。
  seeds: Seed[]
  competitorTopN: number
  provider: DataforseoProvider
  // 原文存档（SP-A §4.3）：provider 的 onResponse 缓冲区；每个子阶段在同一个 step 内 drain 并存档（step 返回值会被记忆化回放）。
  drainRaws: () => RawResponse[]
  persistRaws: (stage: DfsSubStage, raws: RawResponse[]) => Promise<string[]>
}

export interface DataforseoStageDeps {
  createEvidenceArtifact: typeof createEvidenceArtifact
  upsertCompetitor: typeof upsertCompetitor
  linkEvidenceRaw: typeof linkEvidenceRaw
  pruneCompetitorCandidates: typeof pruneCompetitorCandidates
}

// 落一条 dataforseo 证据的公共封装：request 记录协议、payload 原样、rawText=payload JSON + hash。
async function persistEvidence(
  deps: DataforseoStageDeps,
  base: { projectId: string; runId: string },
  type: 'dataforseo_serp' | 'dataforseo_labs' | 'dataforseo_backlinks',
  source: string,
  request: unknown,
  payload: unknown,
): Promise<string> {
  const id = `ev_${crypto.randomUUID()}`
  const rawText = JSON.stringify(payload)
  await deps.createEvidenceArtifact({
    id,
    projectId: base.projectId,
    runId: base.runId,
    type,
    claimLevel: 'L3', // DataForSEO 第三方估算：finding claim 上限 measured_sample
    source,
    request,
    payload,
    rawText,
    rawHash: sha256Hex(rawText),
  })
  return id
}

const SEED_SERP_STEP_CHUNK = 20

// 种子 SERP 任务级失败的原因码：取首个失败词的 DataForSEO 状态码（task_<code>）。
function failedKeywordsReason(failed: NonNullable<SeedSerpResult['failedKeywords']>): string {
  const first = failed[0]
  if (typeof first?.statusCode === 'number') return `task_${first.statusCode}`
  // provider 直接记原因码的失败（如任务成功却没有 result → empty_result）。
  if (first && /^[a-z_]+$/.test(first.error)) return first.error
  const m = first?.error.match(/task error (\d+)/)
  return m ? `task_${m[1]}` : 'task_failed'
}

const outcome = (stage: DfsSubStage, status: DataSourceStatus, reason: string | null, evidenceCount = 0): SubStageOutcome => ({
  stage, status, reason, evidenceCount,
})

export async function collectDataforseoStage(args: DataforseoStageArgs, deps: DataforseoStageDeps): Promise<SubStageOutcome[]> {
  const { step, emit, runId, projectId, domain, brand, market, seeds, competitorTopN, provider } = args
  if (!provider.isConfigured()) return DFS_SUB_STAGES.map((s) => outcome(s, 'not_configured', null))
  // 市场单一真源（SP-A §3.1）：查不到即不采（不再静默回落 US/en）；建 run 闸门已挡住无效市场，这里理论上不可达。
  const m = findMarket(market)
  if (!m) return DFS_SUB_STAGES.map((s) => outcome(s, 'failed', 'market_unmapped'))
  const locOpts = { locationCode: m.locationCode, languageCode: m.languageCode }
  const seedTexts = seeds.map((s) => s.text)
  const base = { projectId, runId }
  const outcomes: SubStageOutcome[] = []

  // 在同一个 step 里执行请求并存档本次缓冲的原文；请求失败时也先存档再抛出。
  const callAndArchive = async <T,>(stage: DfsSubStage, call: () => Promise<T>): Promise<{ value: T; rawIds: string[] }> => {
    try {
      const value = await call()
      return { value, rawIds: await args.persistRaws(stage, args.drainRaws()) }
    } catch (err) {
      await args.persistRaws(stage, args.drainRaws())
      throw err
    }
  }

  // —— 1. 种子词 Google SERP + 候选竞品识别 ——
  if (seedTexts.length === 0) {
    outcomes.push(outcome('seed_serp', 'not_attempted', 'no_seeds'))
  } else {
    try {
      // live 接口逐词请求，耗时随词数线性增长：每 SEED_SERP_STEP_CHUNK 个词一个 step，单次函数调用不超时，
      // 且已完成的分块在重试时直接复用（2026-10-03）。
      const parts: SeedSerpResult[] = []
      const rawIds: string[] = []
      for (let i = 0; i < seedTexts.length; i += SEED_SERP_STEP_CHUNK) {
        const chunk = seedTexts.slice(i, i + SEED_SERP_STEP_CHUNK)
        const r = await step.run(`dfs-seed-serp-${i / SEED_SERP_STEP_CHUNK}`, () => callAndArchive('seed_serp', () => provider.seedSerp(chunk, locOpts)))
        parts.push(r.value)
        rawIds.push(...r.rawIds)
      }
      const failedKeywords = parts.flatMap((p) => p.failedKeywords ?? [])
      const serp: SeedSerpResult = {
        engine: 'google', ...locOpts,
        results: parts.flatMap((p) => p.results),
        ...(failedKeywords.length ? { failedKeywords } : {}),
      }
      // 全部种子词都失败：没有可用的 SERP 测量，不落空证据。40102 零结果已由 provider 记为空结果（测量值），不在 failedKeywords 里。
      if (serp.results.length === 0 && failedKeywords.length > 0) {
        outcomes.push(outcome('seed_serp', 'failed', failedKeywordsReason(failedKeywords)))
      } else {
        const serpEvId = await step.run('dfs-persist-serp', async () => {
          const id = await persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'seed_serp', ...locOpts, seedCount: seeds.length, seeds }, { kind: 'seed_serp', ...serp })
          await deps.linkEvidenceRaw(rawIds, id)
          return id
        })
        await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
        outcomes.push(failedKeywords.length
          ? outcome('seed_serp', 'partial', failedKeywordsReason(failedKeywords), 1)
          : outcome('seed_serp', 'collected', null, 1))

        // 候选竞品：Search Overlap 识别 → upsert 为 candidate（人工闸门后才进 gap/对比）。
        const candidates = identifyCompetitors({ serp: serp.results, ownDomain: domain, topN: competitorTopN })
        // 种子 SERP 采集成功就换代：写入本次候选，再删掉本次没被识别出来的旧 candidate（验收新发现 1）。
        await step.run('dfs-upsert-competitors', async () => {
          for (const c of candidates) {
            await deps.upsertCompetitor({
              id: `cmp_${crypto.randomUUID()}`,
              projectId,
              domain: c.domain,
              source: 'serp_overlap',
              overlapScore: String(c.overlapScore),
              sharedKeywordsCount: c.sharedKeywordsCount,
              status: 'candidate',
              evidenceId: serpEvId,
            })
          }
          await deps.pruneCompetitorCandidates(projectId, candidates.map((c) => c.domain))
        })
      }
    } catch (err) {
      // HTTP / 信封级错误（鉴权、额度）：无候选竞品、无 gap 依据；其余子阶段继续。
      outcomes.push(outcome('seed_serp', 'failed', reasonOf(err)))
    }
  }

  // —— 2. Labs 关键词数据（搜索量/难度/意图）——
  if (seedTexts.length === 0) {
    outcomes.push(outcome('labs', 'not_attempted', 'no_seeds'))
  } else {
    try {
      const { value: keywords, rawIds } = await step.run('dfs-labs', () => callAndArchive('labs', () => provider.keywordData(seedTexts, locOpts)))
      if (keywords.length) {
        await step.run('dfs-persist-labs', async () => {
          const id = await persistEvidence(deps, base, 'dataforseo_labs', domain, { kind: 'keyword_data', ...locOpts, keywordCount: keywords.length }, { kind: 'keyword_data', keywords })
          await deps.linkEvidenceRaw(rawIds, id)
        })
        await emit({ type: 'evidence_created', evidenceType: 'dataforseo_labs' })
        outcomes.push(outcome('labs', 'collected', null, 1))
      } else {
        // 请求成功但没有数据：是测量结果（这些词没有 Labs 数据），不是失败；不落空证据。
        outcomes.push(outcome('labs', 'collected', 'no_data'))
      }
    } catch (err) {
      outcomes.push(outcome('labs', 'failed', reasonOf(err)))
    }
  }

  // —— 3. Backlinks 概况（本站；确认竞品的对比在 reeval 阶段补采）——
  try {
    const { value: summary, rawIds } = await step.run('dfs-backlinks', () => callAndArchive('backlinks', () => provider.backlinksSummary(domain)))
    await step.run('dfs-persist-backlinks', async () => {
      const id = await persistEvidence(deps, base, 'dataforseo_backlinks', domain, { kind: 'summary', target: domain }, { kind: 'summary', ...summary })
      await deps.linkEvidenceRaw(rawIds, id)
    })
    await emit({ type: 'evidence_created', evidenceType: 'dataforseo_backlinks' })
    outcomes.push(outcome('backlinks', 'collected', null, 1))
  } catch (err) {
    outcomes.push(outcome('backlinks', 'failed', reasonOf(err)))
  }

  // —— 4. Bing 收录（G04：影响 ChatGPT 可发现性）——
  try {
    const { value: bing, rawIds } = await step.run('dfs-bing', () => callAndArchive('bing_index', () => provider.bingIndex(domain, locOpts)))
    await step.run('dfs-persist-bing', async () => {
      const id = await persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'bing_index', target: domain }, { kind: 'bing_index', ...bing })
      await deps.linkEvidenceRaw(rawIds, id)
    })
    await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
    outcomes.push(outcome('bing_index', 'collected', null, 1))
  } catch (err) {
    outcomes.push(outcome('bing_index', 'failed', reasonOf(err)))
  }

  // —— 5. 品牌词 SERP（E02 Knowledge Panel / K05 品牌词占位）——
  if (!brand) {
    outcomes.push(outcome('brand_serp', 'not_attempted', 'no_brand'))
  } else {
    try {
      const { value: brandSerp, rawIds } = await step.run('dfs-brand-serp', () => callAndArchive('brand_serp', () => provider.brandSerp(brand, domain, locOpts)))
      await step.run('dfs-persist-brand-serp', async () => {
        const id = await persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'brand_serp', brandQuery: brand }, { kind: 'brand_serp', ...brandSerp })
        await deps.linkEvidenceRaw(rawIds, id)
      })
      await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
      outcomes.push(outcome('brand_serp', 'collected', null, 1))
    } catch (err) {
      outcomes.push(outcome('brand_serp', 'failed', reasonOf(err)))
    }
  }

  return outcomes
}
