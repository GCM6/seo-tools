import type { DiagnosisEvidenceRow, RuleContext } from './types'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { ProbeSummary } from '@/lib/probes/summary'
import type { PsiResult } from '@/lib/collection/psi'
import type { GscDimension } from '@/lib/gsc/search-analytics'
import type {
  DataforseoSerpPayload,
  DataforseoLabsPayload,
  DataforseoBacklinksPayload,
} from '@/lib/dataforseo/types'
import { extractMainText } from '@/lib/collection/page-parser'

// buildRuleContext：把一轮 run 的已落库证据行 + 项目 + 探针聚合，规约为规则引擎可直接消费的
// 规范化上下文。纯函数、无 IO——采集/查询在调用方（generate-findings 编排层）完成后传入。

interface EntryPageFetchPayload {
  canonicalUrl?: string | null
  metaRobots?: string | null
  robotsAllowed?: boolean | null
  robotsTxt?: string | null
}
interface RenderCheckPayload {
  initialHtmlMainTextChars?: number
  renderedMainTextChars?: number
  mainContentDelta?: number
}
interface SchemaPayload {
  types?: string[]
  sameAs?: string[]
  blocks?: { ok: boolean; rawText: string }[]
}
// GSC 证据 payload：采集层每维度一条（query / page / queryPage=keys[page,query]）。
interface GscEvidencePayload {
  dimension?: GscDimension | 'queryPage'
  rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[]
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// PSI 证据 payload = PsiResult 原样。防御式归一：缺字段给 null，形状不对返回 null（该条丢弃）。
function normalizePsi(payload: unknown): PsiResult | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Partial<PsiResult>
  if (!p.crux || !p.lighthouse) return null
  return {
    strategy: p.strategy === 'desktop' ? 'desktop' : 'mobile',
    crux: {
      lcpMs: p.crux.lcpMs ?? null,
      inpMs: p.crux.inpMs ?? null,
      cls: p.crux.cls ?? null,
      hasFieldData: !!p.crux.hasFieldData,
    },
    lighthouse: {
      performanceScore: p.lighthouse.performanceScore ?? null,
      opportunities: Array.isArray(p.lighthouse.opportunities) ? p.lighthouse.opportunities : [],
      ttfbMs: p.lighthouse.ttfbMs ?? null,
    },
  }
}

// schema 证据 rawText = JSON.stringify(raw JSON-LD 数组)；解析回对象供 C05c/C05d 用，失败给空数组。
function parseRawJsonLd(rawText: string): unknown[] {
  try {
    const v = JSON.parse(rawText)
    return Array.isArray(v) ? v : [v]
  } catch {
    return []
  }
}

// —— DataForSEO 证据解析（Phase C）——：dataforseo_serp 按 payload.kind 分流；labs/backlinks 各一类。
// configured = 存在任一 dataforseo_* 证据；未采集时各集合空、依赖规则整组 no-op。
function buildDataforseo(evidence: DiagnosisEvidenceRow[]): RuleContext['dataforseo'] {
  const out: RuleContext['dataforseo'] = {
    configured: false,
    serpByKeyword: [],
    keywordData: [],
    backlinks: [],
    bingIndex: null,
    brandSerp: null,
  }
  for (const e of evidence) {
    if (e.type === 'dataforseo_serp') {
      out.configured = true
      const p = (e.payload ?? {}) as Partial<DataforseoSerpPayload>
      if (p.kind === 'seed_serp') {
        for (const r of p.results ?? []) {
          if (!r.keyword) continue
          out.serpByKeyword.push({
            keyword: r.keyword,
            items: (r.items ?? []).map((it) => ({ domain: it.domain, url: it.url, rank: num(it.rank) })),
            evidenceId: e.id,
          })
        }
      } else if (p.kind === 'bing_index') {
        out.bingIndex = { domain: p.domain ?? '', totalCount: p.totalCount ?? null, itemCount: num(p.itemCount), evidenceId: e.id }
      } else if (p.kind === 'brand_serp') {
        out.brandSerp = {
          brandQuery: p.brandQuery ?? '',
          hasKnowledgePanel: !!p.hasKnowledgePanel,
          ownDomainPresent: !!p.ownDomainPresent,
          items: (p.items ?? []).map((it) => ({ domain: it.domain, url: it.url, rank: num(it.rank) })),
          evidenceId: e.id,
        }
      }
    } else if (e.type === 'dataforseo_labs') {
      out.configured = true
      const p = (e.payload ?? {}) as Partial<DataforseoLabsPayload>
      for (const k of p.keywords ?? []) {
        if (!k.keyword) continue
        out.keywordData.push({
          keyword: k.keyword,
          searchVolume: k.searchVolume ?? null,
          difficulty: k.difficulty ?? null,
          cpc: k.cpc ?? null,
          intent: k.intent ?? null,
          evidenceId: e.id,
        })
      }
    } else if (e.type === 'dataforseo_backlinks') {
      out.configured = true
      const p = (e.payload ?? {}) as Partial<DataforseoBacklinksPayload>
      if (p.target) {
        out.backlinks.push({
          target: p.target,
          referringDomains: num(p.referringDomains),
          backlinks: num(p.backlinks),
          rank: p.rank ?? null,
          anchors: Array.isArray(p.anchors) ? p.anchors : [],
          newLost: p.newLost ?? null,
          evidenceId: e.id,
        })
      }
    }
  }
  return out
}

// —— GEO 深化证据解析（Phase D）——
interface UaProbePayload {
  crawlers?: { ua?: string; kind?: 'search' | 'training'; url?: string; status?: number | null; blocked?: boolean }[]
  llmsTxt?: { exists?: boolean; url?: string }
}
interface ThirdPartyPayload {
  wikipedia?: { exists?: boolean; title?: string | null; url?: string | null }
  reddit?: { mentions?: number; windowDays?: number }
}

function buildUaProbe(evidence: DiagnosisEvidenceRow[]): RuleContext['uaProbe'] {
  const e = evidence.find((ev) => ev.type === 'ua_probe')
  if (!e) return null
  const p = (e.payload ?? {}) as UaProbePayload
  return {
    crawlers: (p.crawlers ?? []).map((c) => ({
      ua: c.ua ?? '',
      kind: c.kind === 'training' ? 'training' : 'search',
      url: c.url ?? '',
      status: c.status ?? null,
      blocked: !!c.blocked,
    })),
    llmsTxt: { exists: !!p.llmsTxt?.exists, url: p.llmsTxt?.url ?? '' },
    evidenceId: e.id,
  }
}

function buildThirdParty(evidence: DiagnosisEvidenceRow[]): RuleContext['thirdParty'] {
  const e = evidence.find((ev) => ev.type === 'third_party_presence')
  if (!e) return null
  const p = (e.payload ?? {}) as ThirdPartyPayload
  return {
    wikipedia: { exists: !!p.wikipedia?.exists, title: p.wikipedia?.title ?? null, url: p.wikipedia?.url ?? null },
    reddit: { mentions: num(p.reddit?.mentions), windowDays: num(p.reddit?.windowDays) },
    evidenceId: e.id,
  }
}

export function buildRuleContext(input: {
  project: RuleContext['project']
  evidence: DiagnosisEvidenceRow[]
  probe: ProbeSummary | null
  probeEvidenceId?: string | null
  robotsText?: string | null
  // Phase C：编排层从 competitors 表(confirmed)与 keyword_gaps 表传入；首轮默认空。
  confirmedCompetitors?: RuleContext['confirmedCompetitors']
  keywordGaps?: RuleContext['keywordGaps']
}): RuleContext {
  const { project, evidence, probe } = input

  const siteAuditRow = evidence.find((e) => e.type === 'site_audit')
  const siteAudit = siteAuditRow
    ? { id: siteAuditRow.id, payload: siteAuditRow.payload as SiteAuditPayload }
    : null

  // 入口页 = 无 sitePageId 的 page_fetch（深检页均挂 sitePageId）。取首条。
  const entryRow = evidence.find((e) => e.type === 'page_fetch' && !e.sitePageId)
  const entryPayload = (entryRow?.payload ?? {}) as EntryPageFetchPayload
  const entryPage = entryRow
    ? {
        id: entryRow.id,
        rawHtml: entryRow.rawText,
        canonicalUrl: entryPayload.canonicalUrl ?? null,
        metaRobots: entryPayload.metaRobots ?? null,
        robotsAllowed: entryPayload.robotsAllowed ?? null,
      }
    : null

  const renderChecks = evidence
    .filter((e) => e.type === 'render_check')
    .map((e) => {
      const p = (e.payload ?? {}) as RenderCheckPayload
      return {
        id: e.id,
        source: e.source,
        sitePageId: e.sitePageId,
        initialChars: p.initialHtmlMainTextChars ?? 0,
        renderedChars: p.renderedMainTextChars ?? 0,
        delta: p.mainContentDelta ?? 0,
        // rawText = 渲染后 HTML；抽正文供 C05d 子串匹配。
        renderedText: extractMainText(e.rawText),
      }
    })

  const schemas = evidence
    .filter((e) => e.type === 'schema')
    .map((e) => {
      const p = (e.payload ?? {}) as SchemaPayload
      return {
        id: e.id,
        source: e.source,
        sitePageId: e.sitePageId,
        types: p.types ?? [],
        sameAs: p.sameAs ?? [],
        raw: parseRawJsonLd(e.rawText),
        blocks: p.blocks ?? [],
      }
    })

  // robotsText 优先取显式入参；否则从入口 page_fetch payload.robotsTxt 提取（G01 逐 UA 判定）。
  const robotsText = input.robotsText ?? entryPayload.robotsTxt ?? null

  // —— PSI/CWV（T09a-c）——：每条 psi 证据存一次 PsiResult；形状不合法的丢弃。
  const psiChecks = evidence
    .filter((e) => e.type === 'psi')
    .map((e) => ({ id: e.id, source: e.source, sitePageId: e.sitePageId, result: normalizePsi(e.payload) }))
    .filter((c): c is { id: string; source: string; sitePageId: string | null; result: PsiResult } => c.result !== null)

  // —— GSC 关键词（K 组）——：按 payload.dimension 归入 query/page 单维或 queryPage 交叉。
  const keywordMetrics: RuleContext['keywordMetrics'] = []
  const queryPageMetrics: RuleContext['queryPageMetrics'] = []
  for (const e of evidence.filter((ev) => ev.type === 'gsc')) {
    const payload = (e.payload ?? {}) as GscEvidencePayload
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    if (payload.dimension === 'queryPage') {
      for (const r of rows) {
        const page = r.keys?.[0]
        const query = r.keys?.[1]
        if (!page || !query) continue
        queryPageMetrics.push({
          evidenceId: e.id, page, query,
          clicks: num(r.clicks), impressions: num(r.impressions), position: num(r.position),
        })
      }
    } else if (payload.dimension === 'query' || payload.dimension === 'page') {
      for (const r of rows) {
        const key = r.keys?.[0]
        if (!key) continue
        keywordMetrics.push({
          evidenceId: e.id, dimension: payload.dimension, keyText: key,
          clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position),
        })
      }
    }
  }

  return {
    project,
    siteAudit,
    entryPage,
    renderChecks,
    schemas,
    probe,
    probeEvidenceId: input.probeEvidenceId ?? probe?.sampleEvidenceId ?? null,
    robotsText,
    psiChecks,
    keywordMetrics,
    queryPageMetrics,
    dataforseo: buildDataforseo(evidence),
    confirmedCompetitors: input.confirmedCompetitors ?? [],
    keywordGaps: input.keywordGaps ?? [],
    uaProbe: buildUaProbe(evidence),
    thirdParty: buildThirdParty(evidence),
  }
}
