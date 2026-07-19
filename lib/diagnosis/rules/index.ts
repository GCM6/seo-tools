import type { Rule } from '../types'
import { technicalRules } from './technical'
import { contentRules } from './content'
import { geoRules } from './geo'
import { keywordRules } from './keywords'
import { competitorRules } from './competitors'
import { authorityRules } from './authority'
import { trustRules } from './trust'
import { reputationRules } from './reputation'

// 规则注册表：引擎按此顺序确定性求值。新增规则加入对应分组即可。
export const allRules: Rule[] = [
  ...technicalRules,
  ...contentRules,
  ...geoRules,
  ...keywordRules,
  ...competitorRules,
  ...authorityRules,
  ...trustRules,
  ...reputationRules,
]

export { technicalRules, contentRules, geoRules, keywordRules, competitorRules, authorityRules, trustRules, reputationRules }
