// Google AI Overviews 实测客户端（分引擎双口径的「实测」半边——四家 AI probe 是开发者 API
// 代理指标，AIO 是消费者搜索 surface 的真实抓取）。复用 lib/dataforseo/client.ts 的 Basic auth +
// POST 信封解析（不重复实现 HTTP/鉴权层），同一个 DataForSEO v3 端点：
//   POST /v3/serp/google/organic/live/advanced，加 load_async_ai_overview: true 展开 AI Overview。
// 契约核实来源见交付报告；两处未核实字段名已按 docs.dataforseo.com 官方页核实：
//   - AI Overview item：type='ai_overview'，markdown 字段为整体摘要（markdown 格式），
//     references[] 为引用来源（source/domain/url/title/text）。
//   - asynchronous_ai_overview=true 表示本次响应未展开完整 AI Overview（需二次异步轮询）——
//     V0 不做二次轮询，原样记录该标记，不伪装成"无 AIO"。
//
// 凭据解析走 resolveCredential（DB 密文优先、env 回退，见 lib/credentials/store.ts）——
// 这与 lib/dataforseo/index.ts 的纯 env 读取不同：AIO 是本 SP 新增的独立 BYOK 消费路径，
// 复用同一对 DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD 凭据，但走标准 BYOK 解析顺序。

import { createDataforseoClient, asArray, asRecord, asString } from '@/lib/dataforseo/client'

export interface AioReference {
  domain: string | null
  url: string | null
  title: string | null
  source: string | null
  text: string | null
}

export interface AioQueryResult {
  keyword: string
  // 本次响应是否含 AI Overview（items[] 里存在 type='ai_overview' 的条目）。
  aioPresent: boolean
  // asynchronous_ai_overview=true：AIO 需要异步展开，本次拿到的是占位/不完整数据。
  asynchronous: boolean
  answerMarkdown: string | null
  references: AioReference[]
}

export interface AioSerpConfig {
  login: string
  password: string
  fetchImpl?: typeof fetch
}

export interface AioSerpProvider {
  isConfigured(): boolean
  fetchAioForKeyword(keyword: string, opts: { locationCode: number; languageCode: string }): Promise<AioQueryResult>
}

function toReference(raw: unknown): AioReference {
  const r = asRecord(raw)
  return {
    domain: r ? asString(r.domain) : null,
    url: r ? asString(r.url) : null,
    title: r ? asString(r.title) : null,
    source: r ? asString(r.source) : null,
    text: r ? asString(r.text) : null,
  }
}

// 在 items[] 里找 type='ai_overview' 的条目；SERP 一页只会有一个 AI Overview 区块。
function parseAioItem(items: unknown[]): {
  present: boolean
  asynchronous: boolean
  markdown: string | null
  references: AioReference[]
} {
  for (const raw of items) {
    const item = asRecord(raw)
    if (!item || asString(item.type) !== 'ai_overview') continue
    return {
      present: true,
      asynchronous: item.asynchronous_ai_overview === true,
      markdown: asString(item.markdown),
      references: asArray(item.references).map(toReference),
    }
  }
  return { present: false, asynchronous: false, markdown: null, references: [] }
}

export function createAioSerpProvider(config: AioSerpConfig): AioSerpProvider {
  const configured = Boolean(config.login && config.password)
  const client = createDataforseoClient(config)

  return {
    isConfigured() {
      return configured
    },
    async fetchAioForKeyword(keyword, opts) {
      if (!configured) throw new Error('dataforseo_aio_not_configured')
      const body = [
        {
          keyword,
          location_code: opts.locationCode,
          language_code: opts.languageCode,
          load_async_ai_overview: true,
        },
      ]
      const tasks = await client.post('/v3/serp/google/organic/live/advanced', body)
      const result = asRecord(tasks[0]?.result[0])
      const items = result ? asArray(result.items) : []
      const parsed = parseAioItem(items)
      return {
        keyword,
        aioPresent: parsed.present,
        asynchronous: parsed.asynchronous,
        answerMarkdown: parsed.markdown,
        references: parsed.references,
      }
    },
  }
}

// env 门控：DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD 均非空才算已配置。
export function isAioConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
}

export function createAioSerpProviderFromEnv(): AioSerpProvider {
  return createAioSerpProvider({
    login: process.env.DATAFORSEO_LOGIN ?? '',
    password: process.env.DATAFORSEO_PASSWORD ?? '',
  })
}
