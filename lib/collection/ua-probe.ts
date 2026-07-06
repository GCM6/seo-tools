// GEO 采集器 —— UA 探针（G02 AI 爬虫可达性 + G08 llms.txt）。
//
// 定位（见 v3 方法论 GEO 支柱「可被 AI 引用的前提：能被 AI 爬虫抓到」）：
//   - G02：以各家 AI 爬虫的 User-Agent 对站点关键 URL 发 GET，看是否被 4xx/429 拦截。
//     被封禁 → 该引擎无法抓取 → 无法进入其索引/训练语料 → GEO 可见性天花板被锁死。
//   - G08：llms.txt 是站点主动向 LLM 声明「可引用内容清单」的约定文件，存在与否是 GEO 就绪度信号。
//
// 本模块是自包含纯采集器：不落库、不耦合 RuleContext、不发散抓取（只请求传入 URL）。
// SSRF 校验由采集编排层负责（entryUrl 已校验），此处仅按契约映射结果。

// AI 爬虫 UA 注册表。kind 区分用途：
//   - 'search'：检索/引用型（实时抓取以回答问题，直接影响 AI 答案可见性）。
//   - 'training'：训练语料型（抓取用于模型训练，影响长期被「记住」的概率）。
export const SEARCH_CRAWLER_UAS = [
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
] as const

export const TRAINING_CRAWLER_UAS = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Bytespider',
] as const

type CrawlerKind = 'search' | 'training'

// UA → kind 的展开注册表（供遍历）。
const CRAWLER_REGISTRY: { ua: string; kind: CrawlerKind }[] = [
  ...SEARCH_CRAWLER_UAS.map((ua) => ({ ua, kind: 'search' as const })),
  ...TRAINING_CRAWLER_UAS.map((ua) => ({ ua, kind: 'training' as const })),
]

// 单个 URL 参与探测的上限（去重后），避免对目标站发起过多请求。
const MAX_URLS = 5

// ── 与 context.ts 已钉定的 evidence payload 契约（严格等于，勿改字段）────
export interface UaProbeResult {
  crawlers: {
    ua: string
    kind: CrawlerKind
    url: string
    status: number | null
    blocked: boolean
  }[]
  llmsTxt: { exists: boolean; url: string }
}

export interface UaProbeInput {
  entryUrl: string
  extraUrls?: string[]
}

/**
 * 判定「被封禁」：显式拒绝（403/429）或任意 4xx+ 状态码。
 * status 为 null（请求失败）时**不**判为封禁 —— 网络抖动/超时不等于站点拒绝该 UA。
 */
function isBlocked(status: number | null): boolean {
  if (status === null) return false
  return status === 403 || status === 429 || status >= 400
}

/**
 * 对单个 (url, ua) 发一次 GET，返回 HTTP 状态码；任何异常降级为 null（不误判封禁）。
 */
async function probeStatus(url: string, ua: string, fetchImpl: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'User-Agent': ua },
      redirect: 'manual',
    })
    return res.status
  } catch {
    // 网络错误 / DNS / 超时 → status 未知，按 null 处理。
    return null
  }
}

/**
 * 检测 origin 下是否存在非空 llms.txt。200 且响应体非空 → exists:true。
 * 任何异常/非 200/空体 → exists:false（但仍返回预期的探测 url，便于展示）。
 */
async function probeLlmsTxt(origin: string, fetchImpl: typeof fetch): Promise<{ exists: boolean; url: string }> {
  const url = new URL('/llms.txt', origin).toString()
  try {
    const res = await fetchImpl(url, { method: 'GET' })
    if (res.status !== 200) return { exists: false, url }
    const text = await res.text()
    return { exists: text.trim().length > 0, url }
  } catch {
    return { exists: false, url }
  }
}

/**
 * G02 + G08 采集入口。
 * 对 entryUrl + extraUrls（去重、上限 MAX_URLS）× 每个 AI 爬虫 UA 发 GET，记录 status 与 blocked。
 * 串行执行以控制对目标站的压力（每站 ≤5 URL × 8 UA，规模可控）。
 * @param fetchImpl 可注入的 fetch（测试用 mock）
 */
export async function collectUaProbe(
  input: UaProbeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UaProbeResult> {
  // URL 去重并截断上限；entryUrl 恒在首位。
  const urls = Array.from(new Set([input.entryUrl, ...(input.extraUrls ?? [])])).slice(0, MAX_URLS)

  const crawlers: UaProbeResult['crawlers'] = []
  for (const url of urls) {
    for (const { ua, kind } of CRAWLER_REGISTRY) {
      const status = await probeStatus(url, ua, fetchImpl)
      crawlers.push({ ua, kind, url, status, blocked: isBlocked(status) })
    }
  }

  // llms.txt 只查一次：以 entryUrl 的 origin 为准。
  const origin = new URL(input.entryUrl).origin
  const llmsTxt = await probeLlmsTxt(origin, fetchImpl)

  return { crawlers, llmsTxt }
}
