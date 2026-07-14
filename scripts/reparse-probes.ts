// D8（GEO branded/unbranded 重设计 历史回填）：一次性 / 可重跑脚本。
// 用途：用 PROBE_PARSER_VERSION v4 重新解析历史 prompts.branded 与 ai_probe_results，
// 但 --apply 只写回 spec D8 白名单的 4 列：brandPresent/hedged/unknownAdmission/parserVersion。
//
// 用法：
//   pnpm reparse-probes            # dry-run（默认）：只打印差异统计，不写库
//   pnpm reparse-probes --apply    # 实际写库
//
// 铁律：
// - 只更新 prompts.branded 与 ai_probe_results 的 brandPresent/hedged/unknownAdmission/
//   parserVersion 这 4 列；evidence_artifacts（raw_text/payload 等不可变原始证据）任何字段都不写。
// - targetDomainCited/competitorsMentioned/sentiment 不在回填范围内——它们依赖 project 当前
//   竞品集等「今天」的上下文，不是探针期冻结事实；重算出来只用于 dry-run 内部计算，绝不写库、
//   绝不计入差异统计（否则用户在 baseline 后编辑竞品列表会污染 diff 报告，并让 --apply 用
//   今天的竞品集覆写历史基线的 competitors_mentioned，破坏冻结列回退路径的消费方）。
// 幂等：对同一批数据重复跑 --apply，第二次 dry-run 应得到 0 diff（parserVersion 已是 v4 且其余字段未变）。

import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { prompts, aiProbeResults, evidenceArtifacts, runs, projects, projectSettings } from '@/db/schema'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { PROBE_PARSER_VERSION } from '@/lib/probes/parse'
import {
  reparsePromptRow,
  reparseProbeRow,
  buildProbeUpdatePayload,
  summarizeProbeDiffs,
  summarizePromptDiffs,
  type ProbePayloadLike,
  type PromptRowDiff,
  type ProbeRowDiff,
} from './reparse-probes-logic'

interface ProjectContext {
  brand: string
  domain: string
  competitors: string[]
  aliases: string[]
}

// 与 lib/probes/run-probes.ts 的 probe-config 步骤同一套归一化口径：brand 取自域名，
// domain 归一化为去 www 的 hostname，competitors/aliases 取项目与项目设置。
function buildProjectContext(project: { domain: string; competitors: string[] }, aliases: string[]): ProjectContext {
  let domain = project.domain
  try {
    domain = new URL(project.domain).hostname.replace(/^www\./, '')
  } catch {
    // 域名格式异常时保留原始字符串，与线上探针路径的兜底行为一致（不在回填脚本里加分歧逻辑）。
  }
  return {
    brand: brandFromDomain(project.domain),
    domain,
    competitors: project.competitors ?? [],
    aliases,
  }
}

async function loadProjectContexts(): Promise<Map<string, ProjectContext>> {
  const projectRows = await db.select({ id: projects.id, domain: projects.domain, competitors: projects.competitors }).from(projects)
  const settingsRows = await db
    .select({ projectId: projectSettings.projectId, brandAliases: projectSettings.brandAliases })
    .from(projectSettings)
  const aliasesByProject = new Map(settingsRows.map((s) => [s.projectId, s.brandAliases ?? []]))

  const map = new Map<string, ProjectContext>()
  for (const p of projectRows) {
    map.set(p.id, buildProjectContext({ domain: p.domain, competitors: p.competitors ?? [] }, aliasesByProject.get(p.id) ?? []))
  }
  return map
}

async function computePromptDiffs(contexts: Map<string, ProjectContext>): Promise<PromptRowDiff[]> {
  const rows = await db
    .select({ id: prompts.id, text: prompts.text, branded: prompts.branded, projectId: runs.projectId })
    .from(prompts)
    .innerJoin(runs, eq(prompts.runId, runs.id))

  const diffs: PromptRowDiff[] = []
  for (const row of rows) {
    const ctx = contexts.get(row.projectId)
    if (!ctx) {
      console.warn(`[reparse-probes] skip prompt ${row.id}: project ${row.projectId} not found`)
      continue
    }
    diffs.push(reparsePromptRow({ id: row.id, text: row.text, brand: ctx.brand, aliases: ctx.aliases, existingBranded: row.branded }))
  }
  return diffs
}

async function computeProbeDiffs(contexts: Map<string, ProjectContext>): Promise<ProbeRowDiff[]> {
  const rows = await db
    .select({
      id: aiProbeResults.id,
      provider: aiProbeResults.provider,
      brandPresent: aiProbeResults.brandPresent,
      targetDomainCited: aiProbeResults.targetDomainCited,
      competitorsMentioned: aiProbeResults.competitorsMentioned,
      sentiment: aiProbeResults.sentiment,
      hedged: aiProbeResults.hedged,
      unknownAdmission: aiProbeResults.unknownAdmission,
      parserVersion: aiProbeResults.parserVersion,
      payload: evidenceArtifacts.payload,
      rawText: evidenceArtifacts.rawText,
      projectId: runs.projectId,
    })
    .from(aiProbeResults)
    .innerJoin(evidenceArtifacts, eq(aiProbeResults.evidenceId, evidenceArtifacts.id))
    .innerJoin(runs, eq(aiProbeResults.runId, runs.id))

  const diffs: ProbeRowDiff[] = []
  for (const row of rows) {
    const ctx = contexts.get(row.projectId)
    if (!ctx) {
      console.warn(`[reparse-probes] skip ai_probe_result ${row.id}: project ${row.projectId} not found`)
      continue
    }
    diffs.push(
      reparseProbeRow({
        id: row.id,
        provider: row.provider,
        brand: ctx.brand,
        domain: ctx.domain,
        competitors: ctx.competitors,
        aliases: ctx.aliases,
        payload: row.payload as ProbePayloadLike | null,
        rawText: row.rawText,
        existing: {
          brandPresent: row.brandPresent,
          targetDomainCited: row.targetDomainCited,
          competitorsMentioned: row.competitorsMentioned,
          sentiment: row.sentiment,
          hedged: row.hedged,
          unknownAdmission: row.unknownAdmission,
          parserVersion: row.parserVersion,
        },
      }),
    )
  }
  return diffs
}

async function applyPromptDiffs(diffs: PromptRowDiff[]): Promise<number> {
  const changed = diffs.filter((d) => d.changed)
  for (const d of changed) {
    await db.update(prompts).set({ branded: d.branded }).where(eq(prompts.id, d.id))
  }
  return changed.length
}

async function applyProbeDiffs(diffs: ProbeRowDiff[]): Promise<number> {
  const changed = diffs.filter((d) => d.anyChanged)
  for (const d of changed) {
    // D8 白名单：只写 brandPresent/hedged/unknownAdmission/parserVersion 这 4 列（见
    // buildProbeUpdatePayload 注释）；targetDomainCited/competitorsMentioned/sentiment
    // 不落库，避免用今天的 project.competitors 覆写探针期冻结的历史基线。
    await db.update(aiProbeResults).set(buildProbeUpdatePayload(d)).where(eq(aiProbeResults.id, d.id))
  }
  return changed.length
}

function printReport(promptDiffs: PromptRowDiff[], probeDiffs: ProbeRowDiff[], apply: boolean): void {
  const promptSummary = summarizePromptDiffs(promptDiffs)
  const probeSummary = summarizeProbeDiffs(probeDiffs)

  console.log(`\n== reparse-probes ${apply ? '(apply)' : '(dry-run)'} ==`)
  console.log(`parser_version target: ${PROBE_PARSER_VERSION}`)
  console.log(`\n-- prompts --`)
  console.log(`total: ${promptSummary.totalRows}`)
  console.log(`branded 标注变化行数 (changed): ${promptSummary.changedRows}`)
  console.log(`branded=true 总行数: ${promptSummary.brandedTrue}`)

  console.log(`\n-- ai_probe_results --`)
  console.log(`total: ${probeSummary.totalRows}`)
  console.log(`白名单 4 列(brandPresent/hedged/unknownAdmission/parserVersion)任一变化的行数 (anyChanged): ${probeSummary.anyChangedRows}`)
  console.log(`brandPresent 翻转行数: ${probeSummary.brandPresentFlips}`)
  console.log(`hedged=true 命中数: ${probeSummary.hedgedTrue}`)
  console.log(`unknownAdmission=true 命中数: ${probeSummary.unknownAdmissionTrue}`)
  console.log(`按 provider 分组:`)
  for (const [provider, stat] of Object.entries(probeSummary.byProvider)) {
    console.log(
      `  ${provider}: total=${stat.total} anyChanged=${stat.anyChanged} brandPresentFlips=${stat.brandPresentFlips} hedgedTrue=${stat.hedgedTrue} unknownAdmissionTrue=${stat.unknownAdmissionTrue}`,
    )
  }
  console.log('')
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')

  const contexts = await loadProjectContexts()
  const promptDiffs = await computePromptDiffs(contexts)
  const probeDiffs = await computeProbeDiffs(contexts)

  printReport(promptDiffs, probeDiffs, apply)

  if (!apply) {
    console.log('dry-run 完成，未写库。加 --apply 执行实际更新。')
    return
  }

  const promptsUpdated = await applyPromptDiffs(promptDiffs)
  const probesUpdated = await applyProbeDiffs(probeDiffs)
  console.log(`已写库：prompts 更新 ${promptsUpdated} 行，ai_probe_results 更新 ${probesUpdated} 行。`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
