import type { WikipediaCheck, RedditCheck } from '@/lib/collection/third-party-presence'
import type { ClaimType, FindingSide, EvidenceType, EvidenceLevel } from '@/lib/types'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { ProbeSummary } from '@/lib/probes/summary'
import type { PsiResult } from '@/lib/collection/psi'
import type { GscDimension } from '@/lib/gsc/search-analytics'
import type { SourceRequirement } from './sources'

// 规则库版本：随规则/阈值变更单调递增，钉进 run 协议保证同协议回测可比（spec §11.3）。
// v1 → v2：G05/G06 改为 unbranded 层口径 + 新增全 branded 降级 finding，新增 G10（GEO branded/
// unbranded 重设计，见 docs/superpowers/specs/2026-07-13-geo-branded-unbranded-redesign.md）。
// v2 → v3：新增仅对明确电商购买链路生效的 TR04/TR05 配送/退货政策发现规则。
// v3 → v4：新增社媒/第三方谈论面诊断规则 G11（品类回答引用大量来自社区/UGC 平台且未引用本站）、
// SP01/SP02（YouTube 前台检索缺失 / 主流第三方评价站前台检索缺失），见 lib/diagnosis/rules/geo.ts
// 与新增 lib/diagnosis/rules/reputation.ts。
// v4 → v5：新增 Intent-to-Page Fit（IPF01-IPF04），用 GSC query×page、crawl 与 DataForSEO
// 判断搜索意图是否有清晰承接页、页型是否错位、泛页是否承接过多意图、承接页内链是否不足。
// v5 → v6：S1 链接图谱地基——T12 改读图谱精确深度（修默认配置下永不触发），T05 抓取未穷尽时降级为
// inferred、入口零出链时不判定（spec 2026-09-29-s1-link-graph-foundation §8）。
// v6 → v7：S2 链接完整性——新增 L01–L07（站内断链/指向跳转/指向不可收录页/首页不可达孤岛/仅 nofollow 可达/
// 死胡同页/站外链接失效），T12 只对已抓 HTML 页下实测、未抓超深目标降为 inferred；T02 不计 401/403/429 拒绝访问码、
// T03 不计功能页 noindex，与 L01/L03 口径一致（spec 2026-09-29-s2-link-integrity + 第二轮独立审查 #16）。
// v7 → v8：S3 内链权重——新增 W01–W04（高价值页权重偏低/权重集中在低价值页/锚文本泛化/缺正文上下文内链），
// 站内 PageRank 为模型估算，W01/W02/W04 只标 inferred（spec 2026-09-29-s3-internal-link-equity）。
// v8 → v9：S4 文章级 E-E-A-T 与博客数据支撑——新增 AR01–AR05、TR06、SO01、SO02；文章页 ≥3 时 C06/C07 让位
// （spec 2026-09-29-s4-article-eeat-evidence-social）。第三轮独立审查后 AR01–AR03、TR06、SO01、SO02 改标 inferred（识别均为启发式），
// W02 不再使用「零展现」与功能页，C06/C07 只让出被接管的项。
// v9 → v10：SP-A 可信地基（spec 2026-10-04-sp-a-trustworthy-foundation）——C05c 按 Google 文档拆必填 / 推荐两条
// （词表 google_rich_results_2026-10，同页 @id 引用按被引用节点判断），C05b 列页面、不再说"整体失效"；T14 改用 ISO 代码表；
// T01 只禁抓非重点 URL 降为 notice；T08 只计会加载资源的元素；G01 把 Google-Extended 归训练 / 使用控制，G02 不再探测它；
// C10 改按可见正文哈希并排除跳转行；C03 的 H1 = title 降为 notice + hypothesis；K03 域名归一；G05/G06/G09/G11/Q02 写实际 n；
// G07 只用采集成功的子结果；G08 只记录不出建议。
export const RULES_VERSION = 'rules_v10'

export type Pillar = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
// 规则域用 error|warning|notice（Ahrefs/Semrush 通用三级），落库时映射为 finding 的 high|mid|ok。
export type RuleSeverity = 'error' | 'warning' | 'notice'

// —— 规则引擎输入：由 buildRuleContext 从已落库证据 + 项目 + 探针聚合派生（纯数据，无副作用）——
export interface DiagnosisEvidenceRow {
  id: string
  type: EvidenceType
  claimLevel: EvidenceLevel
  source: string
  payload: unknown
  rawText: string
  sitePageId: string | null
}

export interface RuleContext {
  project: { domain: string; industry: string; market: string; language: string; competitors: string[] }
  // 全站轻检不可变快照：多数 P1 规则的证据锚（预聚合 stats + 逐页）。
  siteAudit: { id: string; payload: SiteAuditPayload } | null
  // 入口页 page_fetch：rawHtml 供 C 组解析 title/meta/h1；robotsAllowed 为 Googlebot 判定。
  entryPage: {
    id: string
    rawHtml: string
    canonicalUrl: string | null
    metaRobots: string | null
    robotsAllowed: boolean | null
  } | null
  renderChecks: {
    id: string
    source: string
    sitePageId: string | null
    initialChars: number
    renderedChars: number
    delta: number
    // 渲染后正文文本：C05d 校验 JSON-LD 文本值是否出现在渲染后正文（子串匹配）。
    renderedText: string
  }[]
  schemas: {
    id: string
    source: string
    sitePageId: string | null
    types: string[]
    // 实体消歧节点（E01）
    sameAs: string[]
    // 解析后的 JSON-LD 对象（C05c/C05d 字段与一致性校验）
    raw: unknown[]
    // 块级语法有效性（C05b：ok=false 即 JSON 解析失败的块）
    blocks: { ok: boolean; rawText: string }[]
  }[]
  // AI 探针聚合（分引擎可见性/SoV）；无 key 或未采集时为 null，GEO 规则据此降级。
  probe: ProbeSummary | null
  probeEvidenceId: string | null
  // robots.txt 原文：G01 检索爬虫屏蔽检测所需；本期未单独落证据时为 null（规则 no-op）。
  robotsText: string | null
  // PSI/CWV 性能证据（T09a-c）。存完整 PsiResult 让规则调 psi-analyze 的分析器（唯一真源）。
  // 未采集（PSI 失败/未启用）时为空数组，T09 规则整体 no-op。
  psiChecks: {
    id: string // evidence id
    source: string // 目标页面 URL
    sitePageId: string | null
    result: PsiResult
  }[]
  // GSC 关键词证据（K 组）。query 维供 K01/K02/K08；queryPage 维（keys=[page,query]）供 K06 蚕食。
  // 未连接 GSC 时均为空数组，K 组规则整体 no-op。ctr/position 已转数值（GSC 原始为小数/浮点）。
  keywordMetrics: {
    evidenceId: string | null
    dimension: GscDimension // 'query' | 'page'
    keyText: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }[]
  // GSC page×query 交叉（keys=[pageUrl, query]）：K06 关键词蚕食需同一 query 落在多个 page。
  queryPageMetrics: {
    evidenceId: string | null
    page: string
    query: string
    clicks: number
    impressions: number
    position: number
  }[]
  // —— DataForSEO 证据（Phase C，P3/P4/P5）——：由 context 从 dataforseo_* 证据解析。
  // 未配置/未采集时 configured=false 且各集合为空，依赖它的规则整组 no-op。均为第三方估算（L3）。
  dataforseo: {
    configured: boolean
    // 种子词 Google Top-N：竞品识别与 K03/K04/K07/Q01 取数锚。
    serpByKeyword: { keyword: string; items: { domain: string; url: string; rank: number }[]; evidenceId: string }[]
    // Labs 关键词数据：K03/K04 搜索量·难度·意图、E03 品牌搜索量。
    keywordData: { keyword: string; searchVolume: number | null; difficulty: number | null; cpc: number | null; intent: string | null; evidenceId: string }[]
    // Backlinks summary：own + 每个确认竞品各一条（A01/A02/A03）。
    backlinks: { target: string; referringDomains: number; backlinks: number; rank: number | null; anchors: { anchor: string; count: number; dofollow: boolean }[]; newLost: { new: number; lost: number; windowDays: number } | null; evidenceId: string }[]
    // Bing site: 收录（G04）。
    bingIndex: { domain: string; totalCount: number | null; itemCount: number; evidenceId: string } | null
    // 品牌词 SERP knowledge_graph（E02）。
    brandSerp: { brandQuery: string; hasKnowledgePanel: boolean; ownDomainPresent: boolean; items: { domain: string; url: string; rank: number }[]; evidenceId: string } | null
  }
  // 已确认竞品（status=confirmed）：编排层从 competitors 表加载传入；首轮为空 → 竞品依赖规则 no-op。
  // 人在环闸门（spec §4 P4-5）：只有确认竞品才进 gap 与对比。
  confirmedCompetitors: { domain: string; name: string }[]
  // 缺口词（reeval 阶段计算后传入；首轮为空）。K03/K04 据此出机会表。
  keywordGaps: { keyword: string; gapType: 'missing' | 'weak' | 'winning'; ourPosition: number | null; opportunityScore: number | null; searchVolume: number | null; evidenceId: string }[]
  // —— GEO 深化（Phase D）——：由 context 从 ua_probe / third_party_presence 证据解析，未采集时为 null。
  // AI 爬虫可达性（G02：用各爬虫 UA 实测入口/代表页状态码，403/429/challenge=blocked）+ llms.txt 存在性（G08，只记录）。
  uaProbe: {
    crawlers: { ua: string; kind: 'search' | 'training'; url: string; status: number | null; blocked: boolean }[]
    llmsTxt: { exists: boolean; url: string }
    evidenceId: string
  } | null
  // 第三方语料存在度（G07）：Wikipedia 同名词条 / Reddit 近 N 天讨论。品牌提及与 AI 可见性强相关（§2）。
  // 两路各自 ok / failed（SP-A §4.4）：G07 只用 ok 的子结果，失败不当成"无词条 / 0 条"。
  thirdParty: {
    wikipedia: WikipediaCheck
    reddit: RedditCheck
    evidenceId: string
  } | null
  // 社媒/第三方评价站前台存在度（G11/SP01/SP02）：由 context 从 social_presence 证据解析（L2，
  // 前台检索结果，非平台 API 全量数据）。未采集时为 null，SP 规则组整组 no-op。
  socialPresence: {
    brand: string
    // status=failed 时 resultCount 恒 0、不可当"没有"解读（SP-A §4.4）；规则只认 ok。
    platforms: { platform: 'youtube' | 'g2' | 'trustpilot' | 'capterra'; query: string; status: 'ok' | 'failed'; reason?: string; resultCount: number; topResults: { title: string; url: string }[] }[]
    checkedAt: string
    evidenceId: string
  } | null
}

// 规则产出的「命中草稿」：规则只写业务字段，引擎补 ruleId/pillar/side/severity/claimType/fingerprint。
export interface RuleHitDraft {
  title: string
  description: string
  // 触发该命中的证据 artifact id，非空（证据先于结论；引擎会二次过滤空引用）。
  evidenceRefs: string[]
  // fingerprint 作用域：URL 模板 / 页面集 / 'site'，跨 run 对齐 finding 身份。
  scope: string
  // 供建议模板取数（计数、样例 URL 等）；不参与证据判定。
  detail?: Record<string, unknown>
  // 单条命中可覆盖规则默认严重度/claim 上限（如同一规则轻重两档）。
  severity?: RuleSeverity
  claimType?: ClaimType
}

export interface RuleHit extends RuleHitDraft {
  ruleId: string
  pillar: Pillar
  side: FindingSide
  severity: RuleSeverity
  claimType: ClaimType
  fingerprint: string
}

// 「未检查」哨兵（spec 2026-10-09 §5.1-1）：规则自身门槛不满足、数据不够判断时显式返回它，
// 与「返回 null = 在范围内没查出问题」区分开。外层的数据源缺失由引擎按 requiredSources 统一判定。
export interface NotChecked {
  notChecked: true
  kind: 'data_gap' | 'site_condition' | 'unsupported'
  reason: string
}
export const notChecked = (kind: NotChecked['kind'], reason: string): NotChecked => ({ notChecked: true, kind, reason })
export const isNotChecked = (x: unknown): x is NotChecked =>
  typeof x === 'object' && x !== null && (x as { notChecked?: unknown }).notChecked === true

export type RuleEvaluation = RuleHitDraft | RuleHitDraft[] | NotChecked | null

export interface Rule {
  id: string
  // 规则判定逻辑版本（spec 2026-10-09 §6.4）：改哪条规则只升那一条，见 rules/rule-meta.ts。
  version: number
  pillar: Pillar
  side: FindingSide
  severity: RuleSeverity
  claimType: ClaimType
  // 知识脑元数据：复杂确定性检查仍由 TypeScript 执行，但由版本化工作流负责路由与溯源。
  workflowStepIds?: string[]
  knowledgeVersionRefs?: string[]
  requiredSources: SourceRequirement[]
  // 确定性代码（非 LLM）：命中返回草稿（可多条），范围内没查出问题返回 null，数据不够判断返回 notChecked(...)。
  // 抛错由引擎吞掉不沉没整轮。
  evaluate: (ctx: RuleContext) => RuleEvaluation
}

// 规则文件里手写的规则定义不含 version / requiredSources；这两项由 rules/rule-meta.ts 的 RULE_META 在注册表合并。
export type RuleDef = Omit<Rule, 'version' | 'requiredSources'>

// finding 严重度落库枚举（对齐 lib/types.Finding.severity 与 UI 的 sev class）。
export type FindingSeverity = 'high' | 'mid' | 'ok'

export function severityToFinding(sev: RuleSeverity): FindingSeverity {
  if (sev === 'error') return 'high'
  if (sev === 'warning') return 'mid'
  return 'ok'
}
