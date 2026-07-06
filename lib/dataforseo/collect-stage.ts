import { sha256Hex } from '@/lib/collection/hash'
import { identifyCompetitors } from '@/lib/diagnosis/competitor-identify'
import type { RunProgressMessage } from '@/lib/inngest/channels'
import type { createEvidenceArtifact, upsertCompetitor } from '@/lib/repositories'
import type { DataforseoProvider } from './types'
import { resolveLocation } from './locations'

// DataForSEO 采集阶段（Phase C）：种子词 Google SERP → 候选竞品识别 → Labs 关键词数据 →
// Backlinks 概况 → Bing 收录 → 品牌词 SERP。全部第三方估算（证据 L3）。
// 设计同 collectProbesStage：deps 注入、每次外部调用独立 try/catch 降级——单点失败不阻断整轮，
// 缺证据时对应规则自然 no-op（证据先于结论）。未配置 provider 时调用方不应进入本阶段。

interface CollectStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export interface DataforseoStageArgs {
  step: CollectStep
  emit: (msg: RunProgressMessage) => Promise<void>
  runId: string
  projectId: string
  domain: string // 本站域名（已去 www.）
  brand: string
  market: string
  seeds: string[]
  competitorTopN: number
  provider: DataforseoProvider
}

export interface DataforseoStageDeps {
  createEvidenceArtifact: typeof createEvidenceArtifact
  upsertCompetitor: typeof upsertCompetitor
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

export async function collectDataforseoStage(args: DataforseoStageArgs, deps: DataforseoStageDeps): Promise<void> {
  const { step, emit, runId, projectId, domain, brand, market, seeds, competitorTopN, provider } = args
  if (!provider.isConfigured() || seeds.length === 0) return
  const base = { projectId, runId }
  const loc = resolveLocation(market)
  const locOpts = { locationCode: loc.locationCode, languageCode: loc.languageCode }

  // —— 1. 种子词 Google SERP + 候选竞品识别 ——
  try {
    const serp = await step.run('dfs-seed-serp', () => provider.seedSerp(seeds, locOpts))
    const serpEvId = await step.run('dfs-persist-serp', () =>
      persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'seed_serp', ...locOpts, seedCount: seeds.length }, { kind: 'seed_serp', ...serp }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })

    // 候选竞品：Search Overlap 识别 → upsert 为 candidate（人工闸门后才进 gap/对比）。
    const candidates = identifyCompetitors({ serp: serp.results, ownDomain: domain, topN: competitorTopN })
    if (candidates.length) {
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
      })
    }
  } catch {
    // SERP 失败：无候选竞品、无 gap 依据；其余 DataForSEO 采集继续。
  }

  // —— 2. Labs 关键词数据（搜索量/难度/意图）——
  try {
    const keywords = await step.run('dfs-labs', () => provider.keywordData(seeds, locOpts))
    if (keywords.length) {
      await step.run('dfs-persist-labs', () =>
        persistEvidence(deps, base, 'dataforseo_labs', domain, { kind: 'keyword_data', ...locOpts, keywordCount: keywords.length }, { kind: 'keyword_data', keywords }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'dataforseo_labs' })
    }
  } catch {
    // Labs 失败：缺口词无搜索量/难度加权，K03/K04 opportunityScore 降级。
  }

  // —— 3. Backlinks 概况（本站；确认竞品的对比在 reeval 阶段补采）——
  try {
    const summary = await step.run('dfs-backlinks', () => provider.backlinksSummary(domain))
    await step.run('dfs-persist-backlinks', () =>
      persistEvidence(deps, base, 'dataforseo_backlinks', domain, { kind: 'summary', target: domain }, { kind: 'summary', ...summary }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'dataforseo_backlinks' })
  } catch {
    // Backlinks 失败：A01-A03 no-op。
  }

  // —— 4. Bing 收录（G04：影响 ChatGPT 可发现性）——
  try {
    const bing = await step.run('dfs-bing', () => provider.bingIndex(domain, locOpts))
    await step.run('dfs-persist-bing', () =>
      persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'bing_index', target: domain }, { kind: 'bing_index', ...bing }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
  } catch {
    // Bing 失败：G04 no-op。
  }

  // —— 5. 品牌词 SERP（E02 Knowledge Panel / K05 品牌词占位）——
  if (brand) {
    try {
      const brandSerp = await step.run('dfs-brand-serp', () => provider.brandSerp(brand, domain, locOpts))
      await step.run('dfs-persist-brand-serp', () =>
        persistEvidence(deps, base, 'dataforseo_serp', domain, { kind: 'brand_serp', brandQuery: brand }, { kind: 'brand_serp', ...brandSerp }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
    } catch {
      // 品牌 SERP 失败：E02/K05 no-op。
    }
  }
}
