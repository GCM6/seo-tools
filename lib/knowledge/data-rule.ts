export const SAFE_DATA_RULE_OPERATORS = [
  'exists', 'missing', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ratio', 'age', 'membership',
] as const

export type SafeDataRuleOperator = (typeof SAFE_DATA_RULE_OPERATORS)[number]

export const ALLOWED_DATA_RULE_PATHS = new Set([
  'project.industry', 'project.market', 'project.language',
  'siteAudit.stats.discovered', 'siteAudit.stats.checked', 'siteAudit.stats.http4xx', 'siteAudit.stats.http5xx',
  'siteAudit.stats.blockedByRobots', 'probe.total', 'probe.present', 'dataforseo.configured',
  'uaProbe.llmsTxt.exists', 'thirdParty.wikipedia.exists', 'thirdParty.reddit.mentions',
])

export interface DataRuleDefinition {
  id: string
  path: string
  operator: SafeDataRuleOperator
  value?: unknown
  denominatorPath?: string
  days?: number
}

function readPath(context: unknown, path: string): unknown {
  if (!ALLOWED_DATA_RULE_PATHS.has(path)) throw new Error(`data_rule_path_not_allowed:${path}`)
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, context)
}

export function evaluateDataRule(rule: DataRuleDefinition, context: unknown, now = new Date()): boolean {
  if (!SAFE_DATA_RULE_OPERATORS.includes(rule.operator)) throw new Error(`data_rule_operator_not_allowed:${rule.operator}`)
  const actual = readPath(context, rule.path)
  switch (rule.operator) {
    case 'exists': return actual !== null && actual !== undefined
    case 'missing': return actual === null || actual === undefined
    case 'eq': return actual === rule.value
    case 'neq': return actual !== rule.value
    case 'gt': return Number(actual) > Number(rule.value)
    case 'gte': return Number(actual) >= Number(rule.value)
    case 'lt': return Number(actual) < Number(rule.value)
    case 'lte': return Number(actual) <= Number(rule.value)
    case 'membership': return Array.isArray(rule.value) && rule.value.includes(actual)
    case 'ratio': {
      if (!rule.denominatorPath) throw new Error('data_rule_denominator_required')
      const denominator = Number(readPath(context, rule.denominatorPath))
      return denominator > 0 && Number(actual) / denominator >= Number(rule.value)
    }
    case 'age': {
      const timestamp = new Date(String(actual)).getTime()
      return Number.isFinite(timestamp) && (now.getTime() - timestamp) / 86_400_000 >= Number(rule.days ?? rule.value)
    }
  }
}

