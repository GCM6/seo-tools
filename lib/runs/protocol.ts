import { sha256Hex } from '@/lib/collection/hash'

// 检测协议（spec 2026-10-09 §3、§5.3）：决定 AI 提问集、AI 概览查询、竞品对比口径的全部用户输入。
// 指纹相同的两次体检，抽样类结论才可比。
export interface ProtocolInputs {
  industry: string
  market: string
  language: string
  // 项目手填竞品：进 AI 提问集（lib/probes/prompt-set.ts PromptSetInput.competitors）。
  competitors: string[]
  brandAliases: string[]
  targetKeywords: string[]
  // 已确认竞品域名：进竞品类规则（competitors.status = 'confirmed'）。
  confirmedCompetitors: string[]
  // project_settings.default_models：AI 引擎与 'Google AI Overviews'。
  engines: string[]
  promptTemplateVersion: string
}

const norm = (xs: string[]): string[] => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].sort()

export function computeProtocolHash(i: ProtocolInputs): string {
  return sha256Hex(
    JSON.stringify({
      v: 1,
      industry: i.industry.trim().toLowerCase(),
      market: i.market.trim().toLowerCase(),
      language: i.language.trim().toLowerCase(),
      competitors: norm(i.competitors),
      brandAliases: norm(i.brandAliases),
      targetKeywords: norm(i.targetKeywords),
      confirmedCompetitors: norm(i.confirmedCompetitors),
      engines: norm(i.engines),
      promptTemplateVersion: i.promptTemplateVersion,
    }),
  )
}

export interface PriorRun {
  id: string
  runType: string
  status: string
  protocolHash: string | null
  baselineRunId: string | null
  protocolVersion: string
  startedAt: string | null
  finishedAt: string | null
}

const COMPLETED = new Set(['reviewing', 'output'])
const timeOf = (r: PriorRun): number => Date.parse(r.startedAt ?? r.finishedAt ?? '') || 0

// 协议起点：最近一次已完成、指纹相同的体检；它若本身是沿用协议的体检，取它的起点。
export function chooseProtocolAnchor(
  hash: string,
  runs: PriorRun[],
): { runType: 'baseline' } | { runType: 'retest'; baselineRunId: string } {
  const latest = runs
    .filter((r) => COMPLETED.has(r.status) && r.protocolHash === hash)
    .sort((a, b) => timeOf(b) - timeOf(a))[0]
  if (!latest) return { runType: 'baseline' }
  return { runType: 'retest', baselineRunId: latest.runType === 'retest' && latest.baselineRunId ? latest.baselineRunId : latest.id }
}
