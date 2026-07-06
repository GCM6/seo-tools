import { inngest } from './client'
import { checkArtifactFreshness } from '@/lib/diagnosis/reference-artifacts'
import { aggregateRuleStats } from '@/lib/diagnosis/rule-stats'
import {
  getReferenceArtifacts,
  getPendingProposalKeys,
  createRuleChangeProposal,
  getFindingStatRecords,
  getRecStatRecords,
} from '@/lib/repositories'

// —— Phase F 规则进化 cron（spec §11）：本仓库首个定时触发（cron）Inngest 函数 ——
// 每月 1 号巡检：F1 超期参考资产 → scheduled_research 提案（携官方信源 URL）；
// F3 内部效果统计 → modify_threshold 提案。全程幂等（${source}::${target} 去重）。

export interface RulesEvolutionDeps {
  now: () => Date
  getReferenceArtifacts: typeof getReferenceArtifacts
  getPendingProposalKeys: typeof getPendingProposalKeys
  createRuleChangeProposal: typeof createRuleChangeProposal
  getFindingStatRecords: typeof getFindingStatRecords
  getRecStatRecords: typeof getRecStatRecords
}

export function defaultDeps(): RulesEvolutionDeps {
  return {
    now: () => new Date(),
    getReferenceArtifacts,
    getPendingProposalKeys,
    createRuleChangeProposal,
    getFindingStatRecords,
    getRecStatRecords,
  }
}

interface ScanArgs {
  step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
}

export async function rulesEvolutionScanHandler(
  { step }: ScanArgs,
  deps: RulesEvolutionDeps = defaultDeps(),
): Promise<{ enqueued: number }> {
  const now = deps.now()

  const enqueued = await step.run('rules-evolution-enqueue', async () => {
    const pending = await deps.getPendingProposalKeys()
    let count = 0

    // —— F1 月度外部监测：超期参考资产 → scheduled_research 提案（携官方信源 URL）——
    const artifacts = await deps.getReferenceArtifacts()
    const report = checkArtifactFreshness(
      artifacts.map((a) => ({
        artifactKey: a.artifactKey,
        sourceUrl: a.sourceUrl,
        lastVerifiedAt: a.lastVerifiedAt,
        refreshCadenceDays: a.refreshCadenceDays,
      })),
      now,
    )
    for (const stale of report.stale) {
      const artifact = artifacts.find((a) => a.artifactKey === stale.artifactKey)
      // 无一手来源 URL 无法入库（铁律）——跳过，留人工 runbook 补信源。
      if (!artifact || !artifact.sourceUrl.trim()) continue
      const key = `scheduled_research::${stale.artifactKey}`
      if (pending.has(key)) continue
      await deps.createRuleChangeProposal({
        id: `rcp_${crypto.randomUUID()}`,
        source: 'scheduled_research',
        changeType: 'update_artifact',
        target: stale.artifactKey,
        evidenceRefs: [artifact.sourceUrl],
        diff: {
          reason: '超 refresh_cadence_days 未校验',
          lastVerifiedAt: stale.lastVerifiedAt,
          cadence: artifact.refreshCadenceDays,
        },
        status: 'pending',
      })
      pending.add(key)
      count++
    }

    // —— F3 内部效果统计 → modify_threshold 提案（单用户 V0 下多半休眠）——
    const [findingRecs, recRecs] = await Promise.all([deps.getFindingStatRecords(), deps.getRecStatRecords()])
    const drafts = aggregateRuleStats(findingRecs, recRecs)
    for (const d of drafts) {
      const key = `${d.source}::${d.target}`
      if (pending.has(key)) continue
      await deps.createRuleChangeProposal({ id: `rcp_${crypto.randomUUID()}`, ...d, status: 'pending' })
      pending.add(key)
      count++
    }

    return count
  })

  return { enqueued }
}

export const rulesEvolutionScan = inngest.createFunction(
  { id: 'rules-evolution-scan', retries: 3 },
  { cron: 'TZ=Asia/Shanghai 0 3 1 * *' }, // 每月 1 号 03:00
  (ctx) => rulesEvolutionScanHandler(ctx as unknown as ScanArgs),
)
