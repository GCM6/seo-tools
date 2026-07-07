import { randomBytes } from 'node:crypto'

// 只读分享 token：16 字节随机 → base64url（22 字符），够长防枚举猜测。
// 仅在服务端生成（randomBytes 需 Node crypto）。（spec §SP-G1e-2）
export function generateShareToken(): string {
  return randomBytes(16).toString('base64url')
}
