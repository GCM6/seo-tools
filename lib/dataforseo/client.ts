// DataForSEO v3 基础 POST 封装（纯客户端，不 import DB / inngest）。
// 只做：Basic auth 头、baseUrl、fetchImpl 注入、解析 {tasks:[{result:[...]}]} 信封、
// HTTP 级 + 任务级错误抛出、以及一组防御式取值工具（v3 字段常缺失/类型漂移，一律收窄）。

import type { DataforseoConfig } from './types'
import { readRaw } from '@/lib/collection/result'

const BASE_URL = 'https://api.dataforseo.com'

// v3 每个 task 的归一化形状：statusCode/statusMessage + result 数组（原样透传给各端点解析）。
export interface DataforseoTask {
  statusCode: number
  statusMessage: string
  result: unknown[]
}

// 任务级错误（单个 task 的 status_code 非 2xx）：与 HTTP/信封级错误（鉴权、额度）区分，调用方可只跳过该任务。
export class DataforseoTaskError extends Error {
  constructor(
    readonly statusCode: number,
    statusMessage: string,
  ) {
    super(`dataforseo task error ${statusCode}: ${statusMessage}`.trim())
    this.name = 'DataforseoTaskError'
  }
}

export interface DataforseoClient {
  post(path: string, body: unknown): Promise<DataforseoTask[]>
}

// 带原因码的采集错误（reasonOf 读取 reason 字段，见 lib/collection/result.ts）。
export function collectError(message: string, reason: string): Error {
  return Object.assign(new Error(message), { reason })
}

// 任务成功的 result 必须带 items 数组，或 items 为空且 items_count 为 0（合法的"没有数据"）；
// 两者都不满足说明响应形态不对——不能当成"0 条 / 0 收录 / 没有 AI Overview"（最终审查 F1-1）。
export function itemsOf(result: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(result.items)) return result.items
  if (result.items == null && result.items_count === 0) return []
  return null
}
export function itemsOrThrow(result: Record<string, unknown>): unknown[] {
  const items = itemsOf(result)
  if (items === null) throw collectError('dataforseo result has no items array', 'invalid_shape')
  return items
}

// 任务成功时取第一条 result；没有 result 就是失败（empty_result），不能编成"0 条 / 0 外链 / 无知识面板"（第二波审查 C1）。
// 注意：40102（零结果）在调用方单独处理为测量值，不走这里。
export function firstResultOrThrow(tasks: DataforseoTask[]): Record<string, unknown> {
  const result = asRecord(tasks[0]?.result[0])
  if (!result) throw collectError('dataforseo task returned no result', 'empty_result')
  return result
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

export function createDataforseoClient({ login, password, fetchImpl = fetch, onResponse }: DataforseoConfig): DataforseoClient {
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

      // 原文存档（SP-A §4.3）：每个 HTTP 响应（成功、401、信封错误）先交给 onResponse，再按原逻辑判定。
      const raw = await readRaw(res)
      onResponse?.({ path, raw })

      // HTTP 级错误（401/402/429/5xx 等）直接抛。
      if (raw.status < 200 || raw.status >= 300) {
        throw new Error(`dataforseo request failed: ${raw.status}`)
      }

      // 200 但不是 JSON（维护页 / 代理页）：失败，不能当成空数据——否则各端点会写出全 0 的"测得值"（第二波审查 C1）。
      let json: unknown
      try {
        json = JSON.parse(raw.body)
      } catch {
        throw collectError('dataforseo response is not JSON', 'invalid_json')
      }
      const envelope = asRecord(json)

      // 信封级错误（付费额度、鉴权失败等，HTTP 仍是 200）：带原因码 api_<status_code>，子阶段状态据此如实记录。
      const topStatus = asNumber(envelope?.status_code)
      if (isErrorStatus(topStatus)) {
        const msg = asString(envelope?.status_message) ?? ''
        throw Object.assign(new Error(`dataforseo error ${topStatus}: ${msg}`.trim()), { reason: `api_${topStatus}` })
      }

      // 每个请求只提交 1 个任务（live 端点），信封里必须有任务回来；没有就是失败而不是"0 条结果"。
      const tasks = asArray(envelope?.tasks)
      if (tasks.length === 0) throw collectError('dataforseo response has no tasks', 'no_tasks')

      // 逐 task 归一化；任务级错误也抛（单词/单目标失败即整体失败，交由采集层门控）。
      return tasks.map((t) => {
        const rec = asRecord(t)
        const statusCode = asNumber(rec?.status_code) ?? 0
        const statusMessage = asString(rec?.status_message) ?? ''
        if (isErrorStatus(statusCode)) {
          throw new DataforseoTaskError(statusCode, statusMessage)
        }
        return { statusCode, statusMessage, result: asArray(rec?.result) }
      })
    },
  }
}
