// DataForSEO v3 基础 POST 封装（纯客户端，不 import DB / inngest）。
// 只做：Basic auth 头、baseUrl、fetchImpl 注入、解析 {tasks:[{result:[...]}]} 信封、
// HTTP 级 + 任务级错误抛出、以及一组防御式取值工具（v3 字段常缺失/类型漂移，一律收窄）。

import type { DataforseoConfig } from './types'

const BASE_URL = 'https://api.dataforseo.com'

// v3 每个 task 的归一化形状：statusCode/statusMessage + result 数组（原样透传给各端点解析）。
export interface DataforseoTask {
  statusCode: number
  statusMessage: string
  result: unknown[]
}

export interface DataforseoClient {
  post(path: string, body: unknown): Promise<DataforseoTask[]>
}

// —— 防御式取值：v3 返回结构不可信，全部经这里收窄，避免 any ——
export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// 域名归一化：去 www. 前缀 + 小写，保证 SERP 域名与 own domain 可比对。
export function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./i, '').toLowerCase()
}

// DataForSEO 状态码：20000 = Ok；>=40000 视为错误（4xxxx 客户端 / 5xxxx 服务端）。
function isErrorStatus(code: number | null): boolean {
  return code !== null && code >= 40000
}

export function createDataforseoClient({ login, password, fetchImpl = fetch }: DataforseoConfig): DataforseoClient {
  // Basic auth = base64(login:password)。login/password 为 ASCII，btoa 足够（运行时无关）。
  const authHeader = `Basic ${btoa(`${login}:${password}`)}`

  return {
    async post(path: string, body: unknown): Promise<DataforseoTask[]> {
      const res = await fetchImpl(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          authorization: authHeader,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      // HTTP 级错误（401/402/429/5xx 等）直接抛。
      if (!res.ok) {
        throw new Error(`dataforseo request failed: ${res.status}`)
      }

      const json = (await res.json().catch(() => ({}))) as unknown
      const envelope = asRecord(json)

      // 信封级错误（付费额度、鉴权失败等，HTTP 仍是 200）。
      const topStatus = asNumber(envelope?.status_code)
      if (isErrorStatus(topStatus)) {
        const msg = asString(envelope?.status_message) ?? ''
        throw new Error(`dataforseo error ${topStatus}: ${msg}`.trim())
      }

      // 逐 task 归一化；任务级错误也抛（单词/单目标失败即整体失败，交由采集层门控）。
      return asArray(envelope?.tasks).map((t) => {
        const rec = asRecord(t)
        const statusCode = asNumber(rec?.status_code) ?? 0
        const statusMessage = asString(rec?.status_message) ?? ''
        if (isErrorStatus(statusCode)) {
          throw new Error(`dataforseo task error ${statusCode}: ${statusMessage}`.trim())
        }
        return { statusCode, statusMessage, result: asArray(rec?.result) }
      })
    },
  }
}
