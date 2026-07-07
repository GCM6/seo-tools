// BYOK 凭据允许清单：矩阵/保存路由/测连接的共用真源。键名 = env 变量名，使 DB>env 同名覆盖。
export type CredentialProvider =
  | 'openai' | 'perplexity' | 'gemini' | 'deepseek' | 'googleCse' | 'dataforseo' | 'cloudflare'

export interface CredentialKeyMeta {
  key: string
  provider: CredentialProvider
  testable: boolean // 本 SP 是否支持「测试连接」（仅 AI 探针 4 家）
}

export const CREDENTIAL_KEYS: CredentialKeyMeta[] = [
  { key: 'OPENAI_API_KEY', provider: 'openai', testable: true },
  { key: 'PERPLEXITY_API_KEY', provider: 'perplexity', testable: true },
  { key: 'GEMINI_API_KEY', provider: 'gemini', testable: true },
  { key: 'DEEPSEEK_API_KEY', provider: 'deepseek', testable: true },
  { key: 'GOOGLE_CSE_API_KEY', provider: 'googleCse', testable: false },
  { key: 'GOOGLE_CSE_CX', provider: 'googleCse', testable: false },
  { key: 'DATAFORSEO_LOGIN', provider: 'dataforseo', testable: false },
  { key: 'DATAFORSEO_PASSWORD', provider: 'dataforseo', testable: false },
  { key: 'CLOUDFLARE_ACCOUNT_ID', provider: 'cloudflare', testable: false },
  { key: 'CLOUDFLARE_API_TOKEN', provider: 'cloudflare', testable: false },
]

export const isAllowedCredentialKey = (k: string): boolean => CREDENTIAL_KEYS.some((c) => c.key === k)
export const credentialMeta = (k: string): CredentialKeyMeta | undefined => CREDENTIAL_KEYS.find((c) => c.key === k)

// 探针工厂需要的 4 个 key（顺序即 openai/perplexity/gemini/deepseek）。
export const PROBE_CREDENTIAL_KEYS = CREDENTIAL_KEYS.filter((c) => c.testable).map((c) => c.key)
