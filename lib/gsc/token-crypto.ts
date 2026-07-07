import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets'

// GSC refresh_token 存储加密（SP-G1f）。密文自带 v1. 前缀；存量明文行迁移前按 legacy 透传。
export function encryptGscToken(plaintext: string): string {
  return encryptSecret(plaintext)
}

export function readGscToken(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (stored.startsWith('v1.')) {
    try {
      return decryptSecret(stored)
    } catch {
      return null // 密钥轮换/损坏：跳过 GSC 采集，不崩链。
    }
  }
  return stored // legacy 明文（迁移前），透传兼容。
}
