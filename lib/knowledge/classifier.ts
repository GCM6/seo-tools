import type { AnalysisScenario } from './workflow'

export interface AnalysisIntake {
  goal: string
  domain?: string
  industry?: string
  market?: string
  language?: string
  competitors?: string[]
  siteAgeMonths?: number
  gscAvailable?: boolean
  product?: string
  targetCustomers?: string
}

export interface Classification {
  scenario: AnalysisScenario
  siteStage: 'none' | 'new' | 'growth' | 'mature' | 'penalized' | 'unknown'
  detectedSymptoms: string[]
  confidence: 'high' | 'medium' | 'low'
  missingFields: string[]
}

const symptomPatterns: Array<[string, RegExp]> = [
  ['not_indexed', /不收录|未收录|无法索引|not\s+index|deindex/i],
  ['no_traffic', /没流量|没有流量|零流量|no\s+traffic|no\s+organic/i],
  ['traffic_no_inquiries', /没询盘|没有询盘|无转化|no\s+(lead|conversion|inquir)/i],
  ['ranking_stagnation', /排名停滞|排名不动|卡在|stagn|stuck.*rank/i],
  ['traffic_drop', /流量.{0,4}(下降|暴跌|下滑)|掉权|降权|traffic\s+(drop|loss)|lost.*traffic/i],
  ['geo_invisible', /AI.{0,8}(不可见|没提及|没有引用)|GEO|AEO|AI\s+Overview|ChatGPT.{0,8}(搜索|引用)|Perplexity/i],
]

export function classifyAnalysis(input: AnalysisIntake): Classification {
  const goal = input.goal.trim()
  const detectedSymptoms = symptomPatterns.filter(([, pattern]) => pattern.test(goal)).map(([id]) => id)
  let scenario: AnalysisScenario
  if (/学习|了解|知识|怎么做|教程|learn|explain|guide/i.test(goal) && !input.domain) scenario = 'learn'
  else if (/新站|建站|从零|规划|网站还没|new\s+site|build.*site|from\s+scratch/i.test(goal)) scenario = 'new_build'
  else if (detectedSymptoms.length > 0 || /诊断|排查|问题|diagnos|audit|issue/i.test(goal)) scenario = 'diagnose'
  else scenario = 'optimize'

  const siteStage = /掉权|降权|人工措施|manual action|penali[sz]ed/i.test(goal)
    ? 'penalized'
    : scenario === 'new_build'
      ? (/还没|准备|规划|idea|before.*launch/i.test(goal) ? 'none' : 'new')
      : typeof input.siteAgeMonths === 'number'
        ? input.siteAgeMonths < 3 ? 'new' : input.siteAgeMonths < 6 ? 'growth' : 'mature'
        : input.domain ? 'unknown' : 'unknown'
  const missingFields: string[] = []
  if (!goal) missingFields.push('goal')
  if ((scenario === 'diagnose' || scenario === 'optimize') && !input.domain) missingFields.push('domain')
  if (scenario === 'new_build' && !input.industry?.trim() && !input.product?.trim()) missingFields.push('product')
  if (scenario === 'new_build' && !input.market?.trim()) missingFields.push('market')

  return {
    scenario,
    siteStage,
    detectedSymptoms,
    confidence: goal.length >= 12 ? 'high' : goal.length >= 4 ? 'medium' : 'low',
    missingFields,
  }
}
