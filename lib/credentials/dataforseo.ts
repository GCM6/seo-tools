import { resolveCredential } from './store'

// DataForSEO 凭据统一解析（SP-A §4.6）：DB 优先、env 回退；主采集 / AIO / 预检 / 设置页共用这一处，
// 避免各条链路各读各的（此前主采集只读 env，AIO 走 DB>env）。缺任一项返回 null，不拿半套凭据发请求。
export async function resolveDataforseoCredentials(
  resolve: (key: string) => Promise<string | undefined> = (key) => resolveCredential(key),
): Promise<{ login: string; password: string } | null> {
  const [login, password] = await Promise.all([resolve('DATAFORSEO_LOGIN'), resolve('DATAFORSEO_PASSWORD')])
  return login && password ? { login, password } : null
}
