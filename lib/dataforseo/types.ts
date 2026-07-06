// DataForSEO 契约（Phase C 真源）——provider 产出这些结构，采集层包成 evidence payload，
// context.ts 再解析回 RuleContext.dataforseo。三处形状必须一致，改这里即改全链。
// 分级：SERP/Labs/Backlinks 均第三方估算（证据 L3、finding claim ≤ measured_sample）。
// 只用 v3 端点，basic auth（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）。V0 不做 key 存储 UI。

// —— 结果型（provider 方法返回，纯 plain object，不含持久化字段）——

export interface SerpItem {
  domain: string
  url: string
  rank: number // rankAbsolute，1..N
  title: string
  type: string // organic / featured_snippet / knowledge_graph 等
}

// 单个种子词的 Google Top-N 结果。
export interface SeedSerpEntry {
  keyword: string
  items: SerpItem[]
}

export interface SeedSerpResult {
  engine: 'google'
  locationCode: number
  languageCode: string
  results: SeedSerpEntry[]
}

// Bing `site:` 收录检查（G04，影响 ChatGPT 可发现性）。
export interface BingIndexResult {
  engine: 'bing'
  domain: string
  totalCount: number | null
  itemCount: number
}

// 品牌词 Google SERP：knowledge_graph 存在性（E02）+ 官网是否占位。
export interface BrandSerpResult {
  engine: 'google'
  brandQuery: string
  hasKnowledgePanel: boolean
  ownDomainPresent: boolean
  items: { domain: string; url: string; rank: number }[]
}

// DataForSEO Labs 关键词数据（K03/K04 搜索量·难度·意图；E03 品牌词搜索量）。
export interface LabsKeywordDatum {
  keyword: string
  searchVolume: number | null
  difficulty: number | null
  cpc: number | null
  intent: string | null // informational/commercial/transactional/navigational
}

// Backlinks summary（A01 概况 / A02 锚文本 / A03 增长节奏）。own + 每个确认竞品各取一条。
export interface BacklinksSummary {
  target: string
  referringDomains: number
  backlinks: number
  rank: number | null
  anchors: { anchor: string; count: number; dofollow: boolean }[]
  newLost: { new: number; lost: number; windowDays: number } | null
}

// —— provider 接口（isConfigured 门控；未配置时采集层整块跳过）——
export interface DataforseoProvider {
  isConfigured(): boolean
  // Google Top-N SERP，批量种子词（内部可分批/限流）。
  seedSerp(keywords: string[], opts: { locationCode: number; languageCode: string; depth?: number }): Promise<SeedSerpResult>
  // Bing `site:domain` 收录量。
  bingIndex(domain: string, opts: { locationCode: number; languageCode: string }): Promise<BingIndexResult>
  // 品牌词 Google SERP（取 knowledge_graph）。
  brandSerp(brandQuery: string, domain: string, opts: { locationCode: number; languageCode: string }): Promise<BrandSerpResult>
  // Labs 关键词数据。
  keywordData(keywords: string[], opts: { locationCode: number; languageCode: string }): Promise<LabsKeywordDatum[]>
  // Backlinks summary（单 target）。
  backlinksSummary(target: string): Promise<BacklinksSummary>
}

export interface DataforseoConfig {
  login: string
  password: string
  fetchImpl?: typeof fetch
}

// —— evidence payload 判别联合（采集层落库 / context 解析的权威形状，plan §0.2）——

export type DataforseoSerpPayload =
  | ({ kind: 'seed_serp' } & SeedSerpResult)
  | ({ kind: 'bing_index' } & BingIndexResult)
  | ({ kind: 'brand_serp' } & BrandSerpResult)

export type DataforseoLabsPayload = { kind: 'keyword_data'; keywords: LabsKeywordDatum[] }

export type DataforseoBacklinksPayload = { kind: 'summary' } & BacklinksSummary
