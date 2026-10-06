import { gzipSync, gunzipSync } from 'node:zlib'
import { sha256Hex } from './hash'
import type { RawResponse } from './result'

// 原始响应压缩存储（SP-A §4.3）：sha256 恒为「完整原文」的哈希；压缩后超上限则截断原文前缀并标 truncated。
// 单行 4MB 远低于 libSQL 单值 1GB 上限（实现笔记 Task 9），Turso 侧真正的约束是整库体积。
export const RAW_CAP_BYTES = 4 * 1024 * 1024

export interface PackedRaw {
  content: Buffer
  byteLength: number
  sha256: string
  truncated: boolean
}

export function packRaw(raw: RawResponse, capBytes = RAW_CAP_BYTES): PackedRaw {
  const body = raw.body
  const byteLength = Buffer.byteLength(body, 'utf8')
  const sha256 = sha256Hex(body)
  let content = gzipSync(Buffer.from(body, 'utf8'))
  let truncated = false
  let keepChars = body.length
  // 按字符（而非字节）截断，避免切断多字节字符；必要时迭代收缩直到压缩体不超上限。
  while (content.length > capBytes && keepChars > 0) {
    keepChars = Math.floor(keepChars * (capBytes / content.length) * 0.9)
    let prefix = body.slice(0, keepChars)
    const last = prefix.charCodeAt(prefix.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1) // 不留半个代理对
    content = gzipSync(Buffer.from(prefix, 'utf8'))
    truncated = true
  }
  return { content, byteLength, sha256, truncated }
}

export function unpackRaw(content: Buffer | Uint8Array): string {
  return gunzipSync(Buffer.from(content)).toString('utf8')
}
