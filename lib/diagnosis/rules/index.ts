import type { Rule, RuleDef } from '../types'
import { RULE_META } from './rule-meta'
import { technicalRules } from './technical'
import { contentRules } from './content'
import { geoRules } from './geo'
import { keywordRules } from './keywords'
import { competitorRules } from './competitors'
import { authorityRules } from './authority'
import { trustRules } from './trust'
import { reputationRules } from './reputation'
import { linkRules } from './links'
import { equityRules } from './equity'
import { eeatRules } from './eeat'

// 规则注册表：引擎按此顺序确定性求值。新增规则加入对应分组即可。
const registeredRules: RuleDef[] = [
  ...technicalRules,
  ...linkRules,
  ...equityRules,
  ...contentRules,
  ...eeatRules,
  ...geoRules,
  ...keywordRules,
  ...competitorRules,
  ...authorityRules,
  ...trustRules,
  ...reputationRules,
]

function defaultWorkflowStep(rule: RuleDef): string {
  if (rule.side === 'geo') return 'S6'
  if (rule.pillar === 'P1') return 'S3'
  if (rule.pillar === 'P2') return 'S4'
  if (rule.pillar === 'P3') return 'S2'
  if (rule.pillar === 'P4') return 'S5'
  return 'S5'
}

export const allRules: Rule[] = registeredRules.map((rule) => {
  const meta = RULE_META[rule.id]
  if (!meta) throw new Error(`rule_meta_missing:${rule.id}`)
  return {
    ...rule,
    version: meta.version,
    requiredSources: meta.requiredSources,
    workflowStepIds: rule.workflowStepIds ?? [defaultWorkflowStep(rule)],
    knowledgeVersionRefs: rule.knowledgeVersionRefs ?? [`knowledge_legacy_${rule.id.toLowerCase()}_v1`],
  }
})

export { technicalRules, linkRules, equityRules, eeatRules, contentRules, geoRules, keywordRules, competitorRules, authorityRules, trustRules, reputationRules }
