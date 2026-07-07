import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// 凭据加密：AES-256-GCM，自包含串 v1.<iv>.<tag>.<ct>（base64 段）。
// 主密钥来自 CREDENTIALS_ENCRYPTION_KEY（base64 的 32 字节，openssl rand -base64 32）。
// 版本位 v1 预留未来密钥轮换；本 SP 不做轮换。
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const VERSION = 'v1'

function loadKey(): Buffer {
  const key = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('credentials_encryption_key_invalid')
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, loadKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

export function decryptSecret(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('secret_decrypt_failed')
  try {
    const decipher = createDecipheriv(ALGO, loadKey(), Buffer.from(parts[1], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8')
  } catch (e) {
    if (e instanceof Error && e.message === 'credentials_encryption_key_invalid') throw e
    throw new Error('secret_decrypt_failed')
  }
}
