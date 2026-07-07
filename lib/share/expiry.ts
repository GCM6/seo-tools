// 分享是否过期。纯函数：null = 永不过期；到点（含边界）即过期；无法解析保守判为已过期。
// （spec §SP-G1e-2）
export function isShareExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return true
  return t <= now.getTime()
}
