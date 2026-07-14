import { describe, it, expect } from 'vitest'
import { buildDataSourceStatuses } from './data-sources'

const gscConn = { gscAppConfigured: true, gscConnected: true, gscSiteUrl: 'sc-domain:x.com' }

describe('buildDataSourceStatuses', () => {
  it('空 env：GSC 连接态来自入参，其余按 env 判定，PSI/语料恒 configured', () => {
    const rows = buildDataSourceStatuses({}, gscConn)
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.gsc).toMatchObject({ configured: true, connected: true, detail: 'sc-domain:x.com' })
    expect(by.dataforseo.configured).toBe(false)
    expect(by.googleCse.configured).toBe(false)
    expect(by.render.configured).toBe(false)
    expect(by.psi.configured).toBe(true)
    expect(by.publicCorpora.configured).toBe(true)
    expect(by.aiProbe).toMatchObject({ configured: false, detail: '0/4' })
  })
  it('env 就绪：dataforseo/cse/render/探针置真，探针计数正确', () => {
    const rows = buildDataSourceStatuses(
      { DATAFORSEO_LOGIN: 'a', DATAFORSEO_PASSWORD: 'b', GOOGLE_CSE_API_KEY: 'k', GOOGLE_CSE_CX: 'c',
        CLOUDFLARE_ACCOUNT_ID: 'x', CLOUDFLARE_API_TOKEN: 'y', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' },
      gscConn,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.dataforseo.configured).toBe(true)
    expect(by.googleCse.configured).toBe(true)
    expect(by.render.configured).toBe(true)
    expect(by.aiProbe).toMatchObject({ configured: true, detail: '2/4' })
  })
  it('GSC app 未配（env 无 OAuth）→ configured false', () => {
    const rows = buildDataSourceStatuses({}, { gscAppConfigured: false, gscConnected: false, gscSiteUrl: null })
    expect(rows.find((r) => r.key === 'gsc')).toMatchObject({ configured: false, connected: false })
  })
  it('没有 Cloudflare 时，Browserless token 也能启用浏览器级渲染', () => {
    const rows = buildDataSourceStatuses({ BROWSERLESS_API_TOKEN: 'token' }, gscConn)
    expect(rows.find((r) => r.key === 'render')).toMatchObject({ configured: true, detail: 'Browserless' })
  })
  it('DB 已配探针键 → aiProbe 认为已配置（即使 env 空）', () => {
    const rows = buildDataSourceStatuses({}, { gscAppConfigured: false, gscConnected: false, gscSiteUrl: null }, ['OPENAI_API_KEY'])
    const ai = rows.find((s) => s.key === 'aiProbe')!
    expect(ai.configured).toBe(true)
    expect(ai.detail).toBe('1/4')
  })
})
