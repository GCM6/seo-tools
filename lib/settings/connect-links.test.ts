import { describe, expect, it } from 'vitest'
import { getDataSourceConnectHref, isExternalConnectHref } from './connect-links'

describe('getDataSourceConnectHref', () => {
  it('没有项目上下文时，GSC / CSE / DataForSEO 直接指向对应官方配置入口', () => {
    expect(getDataSourceConnectHref('gsc', 'zh')).toBe('https://console.cloud.google.com/apis/credentials')
    expect(getDataSourceConnectHref('googleCse', 'zh')).toBe('https://programmablesearchengine.google.com/controlpanel/all')
    expect(getDataSourceConnectHref('dataforseo', 'zh')).toBe('https://app.dataforseo.com/api-access')
  })

  it('有项目上下文时，GSC 保持项目级 OAuth 入口', () => {
    expect(getDataSourceConnectHref('gsc', 'en', 'project_1')).toBe('/en/projects/project_1')
    expect(getDataSourceConnectHref('aiProbe', 'zh')).toBe('/zh/settings#source-aiProbe')
    expect(isExternalConnectHref('https://app.dataforseo.com/api-access')).toBe(true)
    expect(isExternalConnectHref('/zh/settings#source-aiProbe')).toBe(false)
  })
})
