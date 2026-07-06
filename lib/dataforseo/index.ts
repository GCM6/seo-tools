// DataForSEO provider 公共入口：re-export 契约类型 + provider 工厂 + env 派生工厂/门控。

export * from './types'
export { createDataforseoProvider } from './provider'

import { createDataforseoProvider } from './provider'
import type { DataforseoProvider } from './types'

// env 门控：DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD 均非空才算已配置（BYOK，V0 无 key 存储 UI）。
export function isDataforseoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
}

// 从 env 构造 provider（缺失时 login/password 为空串 → isConfigured() 为 false）。
export function createDataforseoProviderFromEnv(): DataforseoProvider {
  return createDataforseoProvider({
    login: process.env.DATAFORSEO_LOGIN ?? '',
    password: process.env.DATAFORSEO_PASSWORD ?? '',
  })
}
