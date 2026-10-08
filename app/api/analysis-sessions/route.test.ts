import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

// 真库：迁移全量灌入临时库后再 import 路由（同 lib/repositories/*.repo.test.ts 的 bootstrap 方式）。
const TEST_DB = './veris-test-analysis-sessions.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const sendMock = vi.fn(async (...args: unknown[]) => { void args; return { ids: ['evt_1'] } })
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: (...a: unknown[]) => sendMock(...a) } }))

// 知识脑仓库只保留本测试需要的最小行为；会话行直接读真库。
vi.mock('@/lib/knowledge/repository', async () => {
  const { db } = await import('@/db/client')
  const { analysisSessions } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  return {
    ensureBootstrapReleases: async () => undefined,
    latestWorkflowVersion: async () => ({ version: 'wf_test', knowledgeReleaseVersion: 'kr_test', definition: { version: 'wf_test', nodes: [], routes: {}, symptomRoutes: {} } }),
    latestRuleConfigRelease: async () => null,
    createSessionSteps: async () => undefined,
    completeKnowledgeOnlySession: async () => undefined,
    getAnalysisSession: async (id: string) => (await db.select().from(analysisSessions).where(eq(analysisSessions.id, id)))[0] ?? null,
    getSessionSteps: async () => [],
    getSessionArtifacts: async () => [],
  }
})

const { db } = await import('@/db/client')
const { projects, projectSettings, runs, analysisSessions } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')
const { POST } = await import('./route')
const { PATCH } = await import('./[id]/route')

const post = (body: unknown) => POST(new Request('http://x/api/analysis-sessions', { method: 'POST', body: JSON.stringify(body) }))
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://x/api/analysis-sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  sendMock.mockClear()
  await db.delete(analysisSessions)
  await db.delete(runs)
  await db.delete(projectSettings)
  await db.delete(projects)
})

const GOAL = '诊断一下我的网站为什么没流量'

describe('analysis-sessions 入口的建 run 闸门（SP-A §3.5）', () => {
  it('新项目品类/市场为空 → 不建 run、不派发，会话回到 waiting_input 并要求补 industry/market', async () => {
    const res = await post({ goal: GOAL, domain: 'metadocu.com' })
    const body = await res.json()
    expect(body.status).toBe('waiting_input')
    expect(body.missingFields).toEqual(['industry', 'market'])
    expect(await db.select().from(runs)).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('合规品类与市场 → 建 run 并派发；项目语言恒为 en，不再写 market_location', async () => {
    const res = await post({ goal: GOAL, domain: 'metadocu.com', industry: 'document metadata removal tool', market: 'gb' })
    expect(res.status).toBe(201)
    const created = await db.select().from(runs)
    expect(created).toHaveLength(1)
    // 与回测路由同语义：创建即写 startedAt（项目列表「最近诊断」与回测锚点按它排序）。
    expect(created[0].startedAt).toEqual(expect.any(String))
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [project] = await db.select().from(projects)
    expect(project).toMatchObject({ industry: 'document metadata removal tool', market: 'gb', language: 'en' })
    const [settings] = await db.select().from(projectSettings).where(eq(projectSettings.projectId, project.id))
    expect(settings.marketLocation).toBe('')
  })

  it('已有项目带旧默认值、会话补了合规值 → 先修项目再建 run', async () => {
    await db.insert(projects).values({ id: 'proj_old', domain: 'https://metadocu.com/', industry: 'B2B SaaS · 项目协作', market: 'English · Global', language: 'zh' })
    await db.insert(projectSettings).values({ projectId: 'proj_old' })
    await post({ goal: GOAL, domain: 'metadocu.com', industry: 'document metadata removal tool', market: 'global-en' })
    const [project] = await db.select().from(projects).where(eq(projects.id, 'proj_old'))
    expect(project).toMatchObject({ industry: 'document metadata removal tool', market: 'global-en', language: 'en' })
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('PATCH 补齐 industry/market 后放行建 run', async () => {
    const created = await (await post({ goal: GOAL, domain: 'metadocu.com' })).json()
    expect(created.status).toBe('waiting_input')
    const res = await patch(created.id, { industry: 'document metadata removal tool', market: 'us' })
    expect(res.status).toBe(200)
    const runRows = await db.select().from(runs)
    expect(runRows).toHaveLength(1)
    expect(runRows[0].startedAt).toEqual(expect.any(String))
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('PATCH 时同项目已有进行中的 run（例如向导刚建的）→ 不再建第二个 run、不派发，会话挂到该 run（审查 I2）', async () => {
    const created = await (await post({ goal: GOAL, domain: 'metadocu.com' })).json()
    expect(created.status).toBe('waiting_input')
    await db.insert(runs).values({ id: 'run_wizard', projectId: created.projectId, runType: 'baseline', status: 'collecting' })
    const res = await patch(created.id, { industry: 'document metadata removal tool', market: 'us' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'running', runId: 'run_wizard' })
    expect((await db.select().from(runs)).map((r) => r.id)).toEqual(['run_wizard'])
    expect(sendMock).not.toHaveBeenCalled()
    const [run] = await db.select().from(runs).where(eq(runs.id, 'run_wizard'))
    expect(run.analysisSessionId).toBe(created.id)
  })

  it('PATCH 补的值仍不合规 → 仍不建 run，继续等待补充', async () => {
    const created = await (await post({ goal: GOAL, domain: 'metadocu.com' })).json()
    const body = await (await patch(created.id, { industry: '文档工具', market: '东南亚' })).json()
    expect(body.status).toBe('waiting_input')
    expect(body.missingFields).toEqual(['industry', 'market'])
    expect(await db.select().from(runs)).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
