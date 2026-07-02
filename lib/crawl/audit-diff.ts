import type { SiteAuditPayload } from './site-audit'

export interface SiteAuditDiff {
  protocolMismatch: boolean
  metrics: { name: string; baseline: number; retest: number; delta: number }[]
  newTemplates: string[]
  removedTemplates: string[]
}

const METRIC_KEYS = [
  'totalDiscovered', 'checked', 'http4xx', 'http5xx', 'noindex',
  'canonicalOffsite', 'orphanPages', 'citedPages',
] as const

// 同协议重测对比：参数不同（maxPages/maxDepth）时只标记不硬比；
// 新出现的模板不参与本次对比结论（标 new 由 UI 呈现）。
export function diffSiteAudits(baseline: SiteAuditPayload, retest: SiteAuditPayload): SiteAuditDiff {
  const protocolMismatch =
    baseline.protocol.maxPages !== retest.protocol.maxPages ||
    baseline.protocol.maxDepth !== retest.protocol.maxDepth
  const basePatterns = new Set(baseline.templates.map((t) => t.pattern))
  const retestPatterns = new Set(retest.templates.map((t) => t.pattern))
  return {
    protocolMismatch,
    metrics: METRIC_KEYS.map((name) => ({
      name,
      baseline: baseline.stats[name],
      retest: retest.stats[name],
      delta: retest.stats[name] - baseline.stats[name],
    })),
    newTemplates: [...retestPatterns].filter((p) => !basePatterns.has(p)),
    removedTemplates: [...basePatterns].filter((p) => !retestPatterns.has(p)),
  }
}
