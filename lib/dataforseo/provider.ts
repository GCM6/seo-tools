// createDataforseoProvider：组合 client + serp/labs/backlinks 各端点为统一 provider。
// isConfigured() = Boolean(login && password)；未配置时每个方法抛 dataforseo_not_configured
// （采集层据此整块跳过，既有诊断不受影响）。

import { createDataforseoClient } from './client'
import { backlinksSummary } from './backlinks'
import { keywordData } from './labs'
import { bingIndex, brandSerp, seedSerp } from './serp'
import type { DataforseoConfig, DataforseoProvider } from './types'

export function createDataforseoProvider(config: DataforseoConfig): DataforseoProvider {
  const configured = Boolean(config.login && config.password)
  const client = createDataforseoClient(config)

  // 门控：未配置时禁止发起任何请求。
  function ensureConfigured(): void {
    if (!configured) throw new Error('dataforseo_not_configured')
  }

  return {
    isConfigured() {
      return configured
    },
    async seedSerp(keywords, opts) {
      ensureConfigured()
      return seedSerp(client, keywords, opts)
    },
    async bingIndex(domain, opts) {
      ensureConfigured()
      return bingIndex(client, domain, opts)
    },
    async brandSerp(brandQuery, domain, opts) {
      ensureConfigured()
      return brandSerp(client, brandQuery, domain, opts)
    },
    async keywordData(keywords, opts) {
      ensureConfigured()
      return keywordData(client, keywords, opts)
    },
    async backlinksSummary(target) {
      ensureConfigured()
      return backlinksSummary(client, target)
    },
  }
}
