import type { ClaimType, FindingSide, EvidenceType, EvidenceLevel } from '@/lib/types'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { ProbeSummary } from '@/lib/probes/summary'
import type { PsiResult } from '@/lib/collection/psi'
import type { GscDimension } from '@/lib/gsc/search-analytics'

// 规则库版本：随规则/阈值变更单调递增，钉进 run 协议保证同协议回测可比（spec §11.3）。
export const RULES_VERSION = 'rules_v1'

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
  // 第三方语料存在度（G07）：Wikipedia 条目 / Reddit 近 N 月讨论。品牌提及与 AI 可见性强相关（§2）。
  thirdParty: {
    wikipedia: { exists: boolean; title: string | null; url: string | null }
    reddit: { mentions: number; windowDays: number }
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

export interface Rule {
  id: string
  pillar: Pillar
  side: FindingSide
  severity: RuleSeverity
  claimType: ClaimType
  // 确定性代码（非 LLM）：命中返回草稿（可多条），不命中返回 null。抛错由引擎吞掉不沉没整轮。
  evaluate: (ctx: RuleContext) => RuleHitDraft | RuleHitDraft[] | null
}

// finding 严重度落库枚举（对齐 lib/types.Finding.severity 与 UI 的 sev class）。
export type FindingSeverity = 'high' | 'mid' | 'ok'

export function severityToFinding(sev: RuleSeverity): FindingSeverity {
  if (sev === 'error') return 'high'
  if (sev === 'warning') return 'mid'
  return 'ok'
}
