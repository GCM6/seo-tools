// 统一采集结果（SP-A §4.1）：失败必须带原因与状态码，绝不收敛成 0 / 空 / collected。
// 不 import 任何 provider（dataforseo/client 会反过来 import readRaw，避免循环依赖）。
export interface RawResponse {
  status: number
  contentType: string | null
  body: string
}

export type CollectResult<T> =
  | { ok: true; value: T; raw: RawResponse | null }
  | { ok: false; httpStatus: number | null; reason: string; raw: RawResponse | null }

export const okResult = <T>(value: T, raw: RawResponse | null = null): CollectResult<T> => ({ ok: true, value, raw })

export const failResult = <T>(reason: string, httpStatus: number | null = null, raw: RawResponse | null = null): CollectResult<T> => ({
  ok: false,
  httpStatus,
  reason,
  raw,
})

export async function readRaw(res: Response): Promise<RawResponse> {
  return { status: res.status, contentType: res.headers.get('content-type'), body: await res.text() }
}

// 错误 → 短原因码：错误对象自带字符串 reason 时以它为准（采集器自己已判定，如 invalid_json）；
// DataForSEO 任务级错误 task_<code>（按 name 与 statusCode 鸭子类型判定）；「... failed: 4xx」类 HTTP 错误 http_<status>；其余 network_error。
export function reasonOf(err: unknown): string {
  const explicit = err && typeof err === 'object' ? (err as { reason?: unknown }).reason : undefined
  if (typeof explicit === 'string' && explicit) return explicit
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'DataforseoTaskError') {
    const code = (err as { statusCode?: unknown }).statusCode
    if (typeof code === 'number') return `task_${code}`
  }
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = msg.match(/\bfailed:\s*(\d{3})\b/)
  return m ? `http_${m[1]}` : 'network_error'
}
