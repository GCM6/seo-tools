// DataForSEO 账户信息（GET /v3/appendix/user_data，免费）：运行前预检用来验证凭据并读取余额（SP-A §4.5）。
// 2026-10-04 实测：cost 0，余额在 tasks[0].result[0].money.balance（数字）；凭据错误返回 HTTP 401（信封 40100）。

import { asArray, asNumber, asRecord } from './client'
import { readRaw, reasonOf } from '@/lib/collection/result'

const USER_DATA_URL = 'https://api.dataforseo.com/v3/appendix/user_data'

export type DataforseoUserData = { ok: true; balance: number | null } | { ok: false; status: number | null; reason: string }

export async function fetchDataforseoUserData(
  creds: { login: string; password: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DataforseoUserData> {
  let status: number
  let body: string
  try {
    const raw = await readRaw(await fetchImpl(USER_DATA_URL, {
      method: 'GET',
      headers: { authorization: `Basic ${btoa(`${creds.login}:${creds.password}`)}` },
    }))
    status = raw.status
    body = raw.body
  } catch (err) {
    return { ok: false, status: null, reason: reasonOf(err) }
  }
  if (status < 200 || status >= 300) return { ok: false, status, reason: `http_${status}` }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return { ok: false, status, reason: 'invalid_json' }
  }
  const envelope = asRecord(json)
  const code = asNumber(envelope?.status_code)
  if (code !== null && code >= 40000) return { ok: false, status, reason: `api_${code}` }
  const result = asRecord(asArray(asRecord(asArray(envelope?.tasks)[0])?.result)[0])
  // 余额缺失时如实给 null，不编造 0。
  return { ok: true, balance: asNumber(asRecord(result?.money)?.balance) }
}
