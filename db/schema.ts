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
  // 任一建议 applied 后自动排期回测（+28~42 天），到期项目页横幅提醒（spec §5.1-6）。
  nextRetestDueAt: text('next_retest_due_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})

export const projectSettings = sqliteTable('project_settings', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  gscConnected: integer('gsc_connected', { mode: 'boolean' }).notNull().default(false),
  // GSC OAuth（readonly）令牌存储 —— V0 BYOK 单用户；V1 再加密。gscSiteUrl 为已授权的 sc-domain/站点。
  gscRefreshToken: text('gsc_refresh_token'),
  gscSiteUrl: text('gsc_site_url'),
  // DataForSEO 是否已配置（派生自 env/key）；未配置时 P3 缺口/P4 竞品/P5 外链降级（spec §3.1）。
  dataforseoConfigured: integer('dataforseo_configured', { mode: 'boolean' }).notNull().default(false),
  seedKeywordLimit: integer('seed_keyword_limit').notNull().default(100),
  competitorSerpTopN: integer('competitor_serp_top_n').notNull().default(10),
  promptTemplateVersion: text('prompt_template_version').notNull().default('template_v1'),
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
  // 规则库版本快照：创建时写入当前 RULES_VERSION，跨版本回测可比横幅据此（spec §11.3）。
  rulesVersion: text('rules_version'),
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
  // 轻检扩展字段（viewport/hreflang/alt/结构可扫描性/协议/重定向链等）——单 JSON 列，
  // 供 T06/T08/T13/T14/C09/C11 规则消费（spec §4.2 通道一 / Phase A 轻检补字段）。
  lightCheckExtra: text('light_check_extra', { mode: 'json' }),
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
  check('evidence_type', sql`${t.type} in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual','sitemap','site_audit','dataforseo_serp','dataforseo_labs','dataforseo_backlinks','psi','ua_probe','third_party_presence')`),
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
  // 五支柱归属（P1-P5），健康分按支柱分组求值（spec §7.1）。规则命中时写入；旧数据可空。
  pillar: text('pillar'),
  // 规则命中时写入原始 rule_id（fingerprint 已是其哈希，此处存原值供 F3 按规则聚合 dismiss/effectiveness）。
  ruleId: text('rule_id'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull().default('mid'),
  claimType: text('claim_type').notNull(),
  confidence: text('confidence').notNull().default(''),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status').notNull().default('open'),
  // 跨 run 身份：hash(rule_id + 归一化作用域)，retest delta 按此对齐四态（spec §5）。
  fingerprint: text('fingerprint'),
  // 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，retest 据此精确取 impressions；非关键词类为 null。
  metricTarget: text('metric_target', { mode: 'json' }).$type<{ keywords: string[] }>(),
  // 误报反馈（喂 §11.2 校准）
  dismissedAt: text('dismissed_at'),
  dismissReason: text('dismiss_reason'),
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
  // 执行-验证闭环（spec §5 建议生命周期 / §5.1-2）
  validationSpec: text('validation_spec', { mode: 'json' }), // {metric_source,metric,scope,direction,window_days}
  appliedAt: text('applied_at'),
  appliedNote: text('applied_note'),
  // outcome 只能由回测 delta 计算写入，恒 inferred（spec §9）
  outcome: text('outcome').notNull().default('unknown'),
  outcomeEvidenceId: text('outcome_evidence_id'),
}, (t) => [
  check('rec_status', sql`${t.status} in ('draft','accepted','edited','rejected')`),
  check('rec_outcome', sql`${t.outcome} in ('unknown','effective','ineffective','regressed')`),
])

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

// —— P3 关键词（spec §6）——project 级持久，跨 run 复用。
export const keywords = sqliteTable('keywords', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  market: text('market').notNull().default(''),
  language: text('language').notNull().default(''),
  source: text('source').notNull().default('gsc'),
  intent: text('intent').notNull().default(''),
  // 第三方估算，UI 恒标「估算」（L3）
  searchVolume: integer('search_volume'),
  difficulty: integer('difficulty'),
  cpc: text('cpc'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('keywords_project_text_market').on(t.projectId, t.text, t.market),
  check('keywords_source', sql`${t.source} in ('gsc','dataforseo','manual')`),
])

// run 级快照：GSC 为 L4，DataForSEO 为 L3。
export const keywordMetrics = sqliteTable('keyword_metrics', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  keywordId: text('keyword_id').notNull().references(() => keywords.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  impressions: integer('impressions'),
  clicks: integer('clicks'),
  ctr: text('ctr'),
  position: text('position'),
  serpFeatures: text('serp_features', { mode: 'json' }),
  evidenceId: text('evidence_id').references(() => evidenceArtifacts.id, { onDelete: 'set null' }),
}, (t) => [check('keyword_metrics_source', sql`${t.source} in ('gsc','dataforseo')`)])

// —— P4 竞品（spec §6）——人工闸门：只有 confirmed 才进 gap 与报告对比。
export const competitors = sqliteTable('competitors', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  name: text('name').notNull().default(''),
  source: text('source').notNull().default('serp_overlap'),
  overlapScore: text('overlap_score'),
  sharedKeywordsCount: integer('shared_keywords_count').notNull().default(0),
  status: text('status').notNull().default('candidate'),
  evidenceId: text('evidence_id').references(() => evidenceArtifacts.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('competitors_project_domain').on(t.projectId, t.domain),
  check('competitors_source', sql`${t.source} in ('manual','serp_overlap')`),
  check('competitors_status', sql`${t.status} in ('candidate','confirmed','dismissed')`),
])

export const keywordGaps = sqliteTable('keyword_gaps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  keywordId: text('keyword_id').notNull().references(() => keywords.id, { onDelete: 'cascade' }),
  gapType: text('gap_type').notNull(),
  ourPosition: text('our_position'),
  competitorPositions: text('competitor_positions', { mode: 'json' }),
  opportunityScore: text('opportunity_score'),
  // §6 新增约束：keyword_gaps 必须引用 dataforseo 证据。
  evidenceId: text('evidence_id').notNull().references(() => evidenceArtifacts.id, { onDelete: 'cascade' }),
}, (t) => [check('keyword_gaps_type', sql`${t.gapType} in ('missing','weak','winning')`)])

// —— §11 规则保鲜与进化 ——
export const referenceArtifacts = sqliteTable('reference_artifacts', {
  id: text('id').primaryKey(),
  artifactKey: text('artifact_key').notNull(),
  version: text('version').notNull().default('v1'),
  sourceUrl: text('source_url').notNull().default(''),
  lastVerifiedAt: text('last_verified_at'),
  refreshCadenceDays: integer('refresh_cadence_days').notNull().default(90),
  payload: text('payload', { mode: 'json' }),
}, (t) => [uniqueIndex('reference_artifacts_key').on(t.artifactKey)])

export const ruleChangeProposals = sqliteTable('rule_change_proposals', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  source: text('source').notNull(),
  changeType: text('change_type').notNull(),
  target: text('target').notNull().default(''),
  // 必须含一手来源 URL，空则拒绝入库（spec §11.2）——应用层校验，此处存 JSON。
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  diff: text('diff', { mode: 'json' }),
  status: text('status').notNull().default('pending'),
  reviewedAt: text('reviewed_at'),
  releasedInRulesVersion: text('released_in_rules_version'),
}, (t) => [
  check('rcp_source', sql`${t.source} in ('scheduled_research','effectiveness_stats','dismissal_stats','manual')`),
  check('rcp_change', sql`${t.changeType} in ('new_rule','modify_threshold','deprecate','update_artifact')`),
  check('rcp_status', sql`${t.status} in ('pending','approved','rejected')`),
])
