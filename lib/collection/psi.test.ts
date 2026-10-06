import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPsiConfigured, fetchPageSpeedInsights } from './psi'
import { PSI_429_QUOTA_BODY } from '@/lib/test-fixtures/real-shapes'

// 成功时取出解析结果；失败直接让用例失败并带上原因。
async function okValue(p: ReturnType<typeof fetchPageSpeedInsights>) {
  const r = await p
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`)
  return r.value
}

// 代表性 PSI v5 响应：有 CrUX 字段数据 + Lighthouse 实验室数据。
const psiWithFieldData = {
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3200, category: 'AVERAGE' },
      INTERACTION_TO_NEXT_PAINT: { percentile: 150, category: 'GOOD' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: 'NEEDS_IMPROVEMENT' },
    },
  },
  lighthouseResult: {
    categories: { performance: { score: 0.74 } },
    audits: {
      'render-blocking-resources': {
        title: '消除阻塞渲染的资源',
        details: { type: 'opportunity', overallSavingsMs: 900 },
      },
      'unminified-javascript': {
        title: '压缩 JavaScript',
        details: { type: 'opportunity', overallSavingsMs: 300 },
      },
      'server-response-time': {
        title: '初始服务器响应时间较短',
        numericValue: 1200,
        details: { type: 'table' },
      },
    },
  },
}

// 小流量站：无 CrUX 字段数据（loadingExperience 缺失），仅有实验室数据。
const psiNoFieldData = {
  lighthouseResult: {
    categories: { performance: { score: 0.9 } },
    audits: {
      'server-response-time': { title: '响应时间', numericValue: 500, details: { type: 'table' } },
    },
  },
}

function mockFetch(json: unknown) {
  return vi.fn(async (url: string) => {
    void url
    return new Response(JSON.stringify(json), { status: 200 })
  })
}

afterEach(() => {
  delete process.env.PAGESPEED_API_KEY
  vi.restoreAllMocks()
})

describe('isPsiConfigured', () => {
  it('恒为 true（PSI 免费无需 key）', () => {
    expect(isPsiConfigured()).toBe(true)
  })
})

describe('fetchPageSpeedInsights', () => {
  it('解析 CrUX 字段数据与 Lighthouse 诊断（有字段数据）', async () => {
    const fetchImpl = mockFetch(psiWithFieldData)
    const result = await okValue(fetchPageSpeedInsights('https://example.com', 'mobile', fetchImpl))

    expect(result.strategy).toBe('mobile')
    expect(result.crux.hasFieldData).toBe(true)
    expect(result.crux.lcpMs).toBe(3200)
    expect(result.crux.inpMs).toBe(150)
    expect(result.crux.cls).toBeCloseTo(0.12) // CrUX ×100 → 归一化为比值
    expect(result.lighthouse.performanceScore).toBe(74) // 0.74 → 74
    expect(result.lighthouse.ttfbMs).toBe(1200)
    // 机会按节省毫秒降序
    expect(result.lighthouse.opportunities.map((o) => o.id)).toEqual([
      'render-blocking-resources',
      'unminified-javascript',
    ])
    expect(result.lighthouse.opportunities[0].savingsMs).toBe(900)
  })

  it('无 CrUX 时 hasFieldData=false 且各指标 null，仍保留实验室数据', async () => {
    const fetchImpl = mockFetch(psiNoFieldData)
    const result = await okValue(fetchPageSpeedInsights('https://tiny-site.com', 'desktop', fetchImpl))

    expect(result.crux.hasFieldData).toBe(false)
    expect(result.crux.lcpMs).toBeNull()
    expect(result.crux.inpMs).toBeNull()
    expect(result.crux.cls).toBeNull()
    expect(result.lighthouse.performanceScore).toBe(90)
    expect(result.lighthouse.ttfbMs).toBe(500)
  })

  // SP-A §4.1：采集失败不得变成"测得全空"——失败如实返回原因，并带上原始响应供存档。
  it('真实 429 配额错误 → 失败 http_429，带原始响应', async () => {
    const fetchImpl = vi.fn(async () => new Response(PSI_429_QUOTA_BODY, { status: 429, headers: { 'content-type': 'application/json; charset=UTF-8' } }))
    const r = await fetchPageSpeedInsights('https://metadocu.com/', 'mobile', fetchImpl)
    expect(r).toMatchObject({ ok: false, reason: 'http_429', httpStatus: 429 })
    expect(r.raw?.status).toBe(429)
    expect(r.raw?.body).toContain('Quota exceeded')
  })

  it('200 但不是 JSON → invalid_json', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>maintenance</html>', { status: 200 }))
    expect(await fetchPageSpeedInsights('https://example.com', 'mobile', fetchImpl)).toMatchObject({ ok: false, reason: 'invalid_json' })
  })

  it('200 但既无 Lighthouse 分数也无 CrUX 现场数据 → empty_result，不当成测得全空', async () => {
    const r = await fetchPageSpeedInsights('https://example.com', 'mobile', mockFetch({}))
    expect(r).toMatchObject({ ok: false, reason: 'empty_result' })
  })

  it('fetch 抛错 → network_error', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await fetchPageSpeedInsights('https://example.com', 'mobile', fetchImpl)).toMatchObject({ ok: false, reason: 'network_error', raw: null })
  })

  it('带 category=performance 与 strategy 请求，配置 key 时附加 key 参数', async () => {
    process.env.PAGESPEED_API_KEY = 'test-key'
    const fetchImpl = mockFetch(psiNoFieldData)
    await fetchPageSpeedInsights('https://example.com/page', 'desktop', fetchImpl)

    const calledUrl = fetchImpl.mock.calls[0][0]
    expect(calledUrl).toContain('strategy=desktop')
    expect(calledUrl).toContain('category=performance')
    expect(calledUrl).toContain('key=test-key')
    expect(calledUrl).toContain('url=https%3A%2F%2Fexample.com%2Fpage')
  })

  it('未配置 key 时 URL 不含 key 参数', async () => {
    const fetchImpl = mockFetch(psiNoFieldData)
    await fetchPageSpeedInsights('https://example.com', 'mobile', fetchImpl)
    const calledUrl = fetchImpl.mock.calls[0][0]
    expect(calledUrl).not.toContain('key=')
  })
})
