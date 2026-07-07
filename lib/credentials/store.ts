import { getProviderCredentialRow } from '@/lib/repositories'
import { decryptSecret } from '@/lib/crypto/secrets'

// DB 密文优先、env 回退的凭据解析。解密失败（密钥轮换/损坏）时降级到 env，不使采集整链崩溃。
export interface ResolveDeps {
  getRow: (key: string) => Promise<{ ciphertext: string } | undefined>
  env: Record<string, string | undefined>
}
const defaultDeps: ResolveDeps = { getRow: getProviderCredentialRow, env: process.env }

export async function resolveCredential(key: string, deps: ResolveDeps = defaultDeps): Promise<string | undefined> {
  const row = await deps.getRow(key)
  if (row?.ciphertext) {
    try {
      return decryptSecret(row.ciphertext)
    } catch {
      console.warn(`credential_decrypt_failed:${key}`)
    }
  }
  return deps.env[key] || undefined
}

export async function resolveCredentials(
  keys: string[],
  deps: ResolveDeps = defaultDeps,
): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await resolveCredential(k, deps)] as const))
  return Object.fromEntries(entries)
}
