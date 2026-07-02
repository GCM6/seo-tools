import { sqliteTable, text, integer, check, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  industry: text('industry').notNull().default(''),
  market: text('market').notNull().default(''),
  language: text('language').notNull().default(''),
  // 手动填写的竞品清单：SoV 对比与探针回答解析（competitors_mentioned）都从这里取。
  competitors: text('competitors', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  ownerId: text('owner_id').notNull().default('local'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})

export const projectSettings = sqliteTable('project_settings', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  gscConnected: integer('gsc_connected', { mode: 'boolean' }).notNull().default(false),
  defaultModels: text('default_models', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  probeN: integer('probe_n').notNull().default(5),
  marketLocation: text('market_location').notNull().default(''),
  cachePolicy: text('cache_policy').notNull().default('default'),
  crawlEnabled: integer('crawl_enabled', { mode: 'boolean' }).notNull().default(true),
  crawlMaxPages: integer('crawl_max_pages').notNull().default(200),
  crawlMaxDepth: integer('crawl_max_depth').notNull().default(3),
})

export const brandFacts = sqliteTable('brand_facts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  factType: text('fact_type').notNull(),
  factText: text('fact_text').notNull(),
  sourceUrl: text('source_url'),
  sourceNote: text('source_note'),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [check('brand_facts_status', sql`${t.status} in ('verified','draft','retired')`)])

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  runType: text('run_type').notNull().default('baseline'),
  status: text('status').notNull().default('draft'),
  protocolVersion: text('protocol_version').notNull().default('v2'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  failureReason: text('failure_reason'),
}, (t) => [
  check('runs_type', sql`${t.runType} in ('baseline','retest')`),
  check('runs_status', sql`${t.status} in ('draft','collecting','collected','diagnosing','reviewing','output','failed')`),
])

// 站点页面：全站轻检的「当前状态」模型（可变）。不可变快照存 site_audit evidence。
export const sitePages = sqliteTable('site_pages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  firstSeenRunId: text('first_seen_run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  discoveredVia: text('discovered_via').notNull(),
  depth: integer('depth'),
  httpStatus: integer('http_status'),
  finalUrl: text('final_url'),
  title: text('title'),
  canonicalUrl: text('canonical_url'),
  metaRobots: text('meta_robots'),
  mainTextChars: integer('main_text_chars'),
  contentHash: text('content_hash'),
  inboundLinkCount: integer('inbound_link_count').notNull().default(0),
  checkStatus: text('check_status').notNull().default('discovered_only'),
  errorReason: text('error_reason'),
  // 与 url_templates.representative_page_id 互为环，SQLite 单侧建 FK，此列存普通 id 字符串。
  templateId: text('template_id'),
  isKeyPage: integer('is_key_page', { mode: 'boolean' }).notNull().default(false),
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('site_pages_project_url').on(t.projectId, t.url),
  check('site_pages_via', sql`${t.discoveredVia} in ('entry','sitemap','crawl','both')`),
  check('site_pages_status', sql`${t.checkStatus} in ('checked','discovered_only','blocked_by_robots','error')`),
])

// URL 模板：project 级持久，保障同协议重测（代表页被用户改过后启发式不再覆盖）。
export const urlTemplates = sqliteTable('url_templates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  pageCount: integer('page_count').notNull().default(0),
  representativePageId: text('representative_page_id').references(() => sitePages.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('heuristic'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('url_templates_project_pattern').on(t.projectId, t.pattern),
  check('url_templates_source', sql`${t.source} in ('heuristic','user')`),
])

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  intent: text('intent').notNull().default(''),
  source: text('source').notNull().default(''),
  market: text('market').notNull().default(''),
  language: text('language').notNull().default(''),
  priority: integer('priority').notNull().default(0),
})

export const evidenceArtifacts = sqliteTable('evidence_artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  claimLevel: text('claim_level').notNull(),
  source: text('source').notNull().default(''),
  capturedAt: text('captured_at').notNull().default(sql`(current_timestamp)`),
  request: text('request', { mode: 'json' }),
  payload: text('payload', { mode: 'json' }),
  rawText: text('raw_text').notNull().default(''),
  rawHash: text('raw_hash').notNull(),
  parserVersion: text('parser_version').notNull().default('v0'),
  // 深检证据挂到具体站点页面；历史行与站点无关的证据留空。
  sitePageId: text('site_page_id').references(() => sitePages.id, { onDelete: 'set null' }),
}, (t) => [
  check('evidence_type', sql`${t.type} in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual','sitemap','site_audit')`),
  check('evidence_level', sql`${t.claimLevel} in ('L1','L2','L3','L4')`),
])

export const aiProbeResults = sqliteTable('ai_probe_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  promptId: text('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  evidenceId: text('evidence_id').notNull().references(() => evidenceArtifacts.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  runIdx: integer('run_idx').notNull(),
  brandPresent: integer('brand_present', { mode: 'boolean' }).notNull().default(false),
  targetDomainCited: integer('target_domain_cited', { mode: 'boolean' }).notNull().default(false),
  competitorsMentioned: text('competitors_mentioned', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  citedUrls: text('cited_urls', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  sentiment: text('sentiment').notNull().default('neutral'),
  rawAnswerHash: text('raw_answer_hash').notNull(),
  parserVersion: text('parser_version').notNull().default('v0'),
})

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  side: text('side').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull().default('mid'),
  claimType: text('claim_type').notNull(),
  confidence: text('confidence').notNull().default(''),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status').notNull().default('open'),
}, (t) => [
  check('findings_side', sql`${t.side} in ('seo','geo','technical')`),
  check('findings_claim', sql`${t.claimType} in ('hypothesis','inferred','measured_sample','measured_hard')`),
  check('findings_status', sql`${t.status} in ('open','dismissed','converted')`),
  // §6.2：evidence_refs 非空（JSON 数组长度 > 0）
  check('findings_evidence_nonempty', sql`json_array_length(${t.evidenceRefs}) > 0`),
])

export const recommendations = sqliteTable('recommendations', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  findingId: text('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
  what: text('what').notNull(),
  why: text('why').notNull().default(''),
  expectedImpact: text('expected_impact').notNull().default(''),
  effort: text('effort').notNull().default(''),
  risk: text('risk').notNull().default(''),
  validationMethod: text('validation_method').notNull().default(''),
  priority: text('priority').notNull().default('P2'),
  confidence: text('confidence').notNull().default(''),
  status: text('status').notNull().default('draft'),
  editedPayload: text('edited_payload', { mode: 'json' }),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull(),
}, (t) => [check('rec_status', sql`${t.status} in ('draft','accepted','edited','rejected')`)])

export const generatedPrompts = sqliteTable('generated_prompts', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id').notNull().references(() => recommendations.id, { onDelete: 'cascade' }),
  promptType: text('prompt_type').notNull(),
  promptText: text('prompt_text').notNull(),
  inputFactRefs: text('input_fact_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [check('gp_type', sql`${t.promptType} in ('content','technical','brief','cms')`)])

export const retestSnapshots = sqliteTable('retest_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  baselineRunId: text('baseline_run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  retestRunId: text('retest_run_id').references(() => runs.id, { onDelete: 'cascade' }),
  metricName: text('metric_name').notNull(),
  baselineValue: text('baseline_value').notNull().default(''),
  retestValue: text('retest_value').notNull().default(''),
  delta: text('delta').notNull().default(''),
  interpretation: text('interpretation').notNull().default(''),
})
