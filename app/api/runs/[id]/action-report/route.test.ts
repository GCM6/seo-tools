import { describe, it, expect, vi, beforeEach } from 'vitest'

// 端点级测试：mock repositories + credentials 层（隔离 DB/网络），验证 B2（P0-4）证据摘要
// 是否真正流入这条独立的「执行决策报告」生成路由——它和 output/page.tsx 里的初次 SSR 渲染
// 是两条独立调用路径，各自都要传 evidenceById，本文件只覆盖这条 route。
const store = {
  run: null as null | Record<string, unknown>,
  project: null as null | Record<string, unknown>,
  recs: [] as Record<string, unknown>[],
  facts: [] as Record<string, unknown>[],
  evidence: [] as Record<string, unknown>[],
  apiKey: null as string | null,
}

vi.mock('@/lib/repositories', () => ({
  getRun: async () => store.run,
  getProject: async () => store.project,
  getRecommendations: async () => store.recs,
  getBrandFacts: async () => store.facts,
  getRunEvidence: async () => store.evidence,
}))

vi.mock('@/lib/credentials/store', () => ({
  resolveCredential: async () => store.apiKey,
}))

import { POST } from './route'

const call = (id: string) => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  store.run = { id: 'run_1', projectId: 'proj_1', finishedAt: '2026-07-19', startedAt: '2026-07-01' }
  store.project = { id: 'proj_1', domain: 'example.com' }
  store.recs = [
    {
      id: 'rec_1',
      what: '修复 canonical 指向',
      why: '信号错配',
      expectedImpact: '高',
      effort: '低',
      risk: '低',
      confidence: '高',
      validationMethod: '重新抓取确认自指',
      priority: 'quick_win',
      status: 'accepted',
      evidenceRefs: ['ev_1'],
    },
  ]
  store.facts = []
  store.evidence = [
    {
      id: 'ev_1',
      type: 'site_audit',
      claimLevel: 'L4',
      source: 'site_audit',
      capturedAt: '2026-07-18T03:00:00.000Z',
      payload: { stats: { checked: 128 } },
    },
  ]
  store.apiKey = 'sk-test'
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: '- [rec_1] 先修复 canonical，再复测。' }] }],
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch
})

describe('POST /runs/:id/action-report', () => {
  it('run 不存在 → 404', async () => {
    store.run = null
    const res = await call('run_x')
    expect(res.status).toBe(404)
  })

  it('未配置 OpenAI key → 409', async () => {
    store.apiKey = null
    const res = await call('run_1')
    expect(res.status).toBe(409)
  })

  // B2（P0-4）核心断言：evidenceById 从 getRunEvidence 组装并真正传入 renderActionReportMarkdown，
  // 使返回的 markdown 里证据引用是人类可读摘要，而不是裸 `ev_1` ID。
  it('AI 摘要成功时，返回的 markdown 用证据摘要替换裸 ID（B2）', async () => {
    const res = await call('run_1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toContain('证据引用：全站轻检（2026-07-18 · L4）：共检测 128 页（ev_1）')
    expect(body.markdown).not.toContain('证据引用：`ev_1`')
  })
})
