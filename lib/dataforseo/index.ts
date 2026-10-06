// DataForSEO provider 公共入口：re-export 契约类型 + provider 工厂。
// 凭据统一走 lib/credentials/dataforseo.ts 的 resolveDataforseoCredentials（DB 优先、env 回退，SP-A §4.6）；
// 原先只读 env 的 isDataforseoConfigured / createDataforseoProviderFromEnv 已删除，避免再出现各链路各读各的凭据。

export * from './types'
export { createDataforseoProvider } from './provider'
