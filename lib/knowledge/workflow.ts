import { sha256, stableJson } from './hash'

export type AnalysisScenario = 'new_build' | 'diagnose' | 'optimize' | 'learn'

export interface WorkflowNode {
  id: string
  title: string
  purpose: string
  knowledgeTopics: string[]
  knowledgeVersionRefs?: string[]
  ruleIds: string[]
  requiredSources: string[]
  missingPolicy: 'continue_with_gap' | 'wait_for_input'
}

export interface WorkflowDefinition {
  version: string
  nodes: WorkflowNode[]
  routes: Record<AnalysisScenario, string[]>
  symptomRoutes: Record<string, string[]>
}

export const WORKFLOW_V1: WorkflowDefinition = {
  version: 'workflow_v1',
  nodes: [
    { id: 'W0', title: '目标分类与覆盖度', purpose: '识别场景、站点阶段、症状和缺失输入', knowledgeTopics: ['diagnostic_method'], ruleIds: [], requiredSources: [], missingPolicy: 'wait_for_input' },
    { id: 'S1', title: '可行性与搜索需求', purpose: '判断需求、市场和查询机会是否成立', knowledgeTopics: ['demand'], ruleIds: [], requiredSources: ['gsc', 'dataforseo'], missingPolicy: 'continue_with_gap' },
    { id: 'S2', title: '关键词、意图与架构', purpose: '检查选词、意图映射、页面架构和蚕食', knowledgeTopics: ['keyword_intent', 'site_architecture'], ruleIds: [], requiredSources: ['gsc', 'crawl'], missingPolicy: 'continue_with_gap' },
    { id: 'S3', title: '抓取、索引、渲染与技术地基', purpose: '定位可抓取、可索引、规范化和渲染问题', knowledgeTopics: ['crawl', 'indexing', 'rendering', 'structured_data'], ruleIds: [], requiredSources: ['crawl', 'render', 'gsc'], missingPolicy: 'continue_with_gap' },
    { id: 'S4', title: '内容、信任与转化', purpose: '检查内容满足度、可信度和询盘路径', knowledgeTopics: ['content_quality', 'trust', 'conversion'], ruleIds: [], requiredSources: ['crawl', 'render'], missingPolicy: 'continue_with_gap' },
    { id: 'S5', title: '权威、外链与品牌', purpose: '判断站外权威、链接质量和社区信号', knowledgeTopics: ['authority', 'backlinks', 'local_seo'], ruleIds: [], requiredSources: ['dataforseo', 'third_party'], missingPolicy: 'continue_with_gap' },
    { id: 'S6', title: 'GEO 与 AI 可见度', purpose: '检查答案引擎提及、引用和实体理解', knowledgeTopics: ['geo_ai_visibility', 'content_quality', 'authority'], ruleIds: [], requiredSources: ['ai_probe', 'serp_aio'], missingPolicy: 'continue_with_gap' },
    { id: 'S7', title: '趋势、衰退与维护', purpose: '用 GSC 趋势识别增长、衰退和维护优先级', knowledgeTopics: ['gsc_measurement'], ruleIds: [], requiredSources: ['gsc'], missingPolicy: 'continue_with_gap' },
    { id: 'S8', title: '算法、人工措施与降权', purpose: '排查更新影响、手动措施和站点级风险', knowledgeTopics: ['algorithm_updates', 'manual_actions'], ruleIds: [], requiredSources: ['gsc', 'crawl'], missingPolicy: 'continue_with_gap' },
    { id: 'S9', title: '综合、优先级与回测', purpose: '合并证据，生成行动顺序和同协议回测方案', knowledgeTopics: ['diagnostic_method', 'gsc_measurement'], ruleIds: [], requiredSources: [], missingPolicy: 'continue_with_gap' },
  ],
  routes: {
    new_build: ['W0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S9'],
    diagnose: ['W0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'],
    optimize: ['W0', 'S7', 'S1', 'S2', 'S4', 'S5', 'S6', 'S3', 'S8', 'S9'],
    learn: ['W0', 'S9'],
  },
  symptomRoutes: {
    not_indexed: ['S3'],
    no_traffic: ['S1', 'S2', 'S3'],
    traffic_no_inquiries: ['S1', 'S2', 'S4'],
    ranking_stagnation: ['S2', 'S4', 'S5', 'S7', 'S8'],
    traffic_drop: ['S8', 'S7', 'S3'],
    geo_invisible: ['S6', 'S4', 'S5'],
  },
}

export function validateWorkflow(definition: WorkflowDefinition): string[] {
  const errors: string[] = []
  const ids = new Set(definition.nodes.map((node) => node.id))
  if (ids.size !== definition.nodes.length) errors.push('duplicate_node_id')
  for (const [key, route] of Object.entries({ ...definition.routes, ...definition.symptomRoutes })) {
    if (!route.length) errors.push(`empty_route:${key}`)
    for (const id of route) if (!ids.has(id)) errors.push(`unknown_node:${key}:${id}`)
    if (new Set(route).size !== route.length) errors.push(`cycle_or_duplicate:${key}`)
  }
  for (const node of definition.nodes) {
    if (node.knowledgeVersionRefs && new Set(node.knowledgeVersionRefs).size !== node.knowledgeVersionRefs.length) {
      errors.push(`duplicate_knowledge_ref:${node.id}`)
    }
  }
  return errors
}

export function routeWorkflow(
  scenario: AnalysisScenario,
  symptoms: string[],
  definition: WorkflowDefinition = WORKFLOW_V1,
  siteStage?: string,
): string[] {
  if (scenario === 'new_build') {
    if (siteStage === 'new') return ['W0', 'S5', 'S6', 'S2', 'S4', 'S3', 'S9']
    if (siteStage === 'growth') return ['W0', 'S6', 'S7', 'S2', 'S4', 'S9']
    if (siteStage === 'mature') return ['W0', 'S7', 'S2', 'S4', 'S5', 'S9']
    if (siteStage === 'penalized') return ['W0', 'S8', 'S9']
  }
  if (scenario !== 'diagnose' || symptoms.length === 0) return definition.routes[scenario]
  const priority = symptoms.flatMap((symptom) => definition.symptomRoutes[symptom] ?? [])
  return ['W0', ...new Set([...priority, ...definition.routes.diagnose.slice(1, -1)]), 'S9']
}

export function workflowChecksum(definition: WorkflowDefinition): string {
  return sha256(stableJson(definition))
}
