import { CREDENTIAL_KEYS, type CredentialProvider } from '@/lib/credentials/keys'

// 录入区行模型：只暴露「配没配 + 来源」，绝不把 env/DB 明文值下发给前端。
export interface CredentialRow {
  key: string
  provider: CredentialProvider
  testable: boolean
  source: 'db' | 'env' | 'none'
}

export function buildCredentialRows(env: Record<string, string | undefined>, dbKeys: string[]): CredentialRow[] {
  return CREDENTIAL_KEYS.map((c) => ({
    key: c.key,
    provider: c.provider,
    testable: c.testable,
    source: dbKeys.includes(c.key) ? 'db' : env[c.key] ? 'env' : 'none',
  }))
}
