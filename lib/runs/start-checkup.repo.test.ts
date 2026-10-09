import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

// 真库 + 默认依赖：startCheckup 不注入任何 deps，走真实 repositories / db.insert / buildCollectRequestedEvent，
// 只模拟 inngest 客户端。覆盖 start-checkup.test.ts（注入 mock）碰不到的默认依赖胶水：
// 读设置/确认竞品/历史体检 -> 协议指纹 -> 落库的 protocolHash/runType/baselineRunId -> 真实构造的采集事件。
// 临时库名带 pid，避免并发 worker/会话互踩；afterAll 连同 journal/wal 一并删除。
const TEST_DB = `./veris-test-startcheckup-${process.pid}.db`
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。
const removeDb = () => {
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(`${TEST_DB}${suffix}`, { force: true })
}
removeDb()
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(removeDb)

const sendMock = vi.fn(async (...args: unknown[]) => {
  void args
  return { ids: ['evt_1'] }
})
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: (...a: unknown[]) => sendMock(...a) } }))

const { db } = await import('@/db/client')
const { projects, projectSettings, competitors, runs } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')
const { startCheckup } = await import('./start-checkup')
const { computeProtocolHash } = await import('./protocol')
const { COLLECT_REQUESTED_EVENT } = await import('@/lib/inngest/events')

const DOMAIN = 'https://metadocu.com/'

// 期望指纹由播种值独立算出（模板版本用字面量钉死，不引用被测代码的常量）。
const expectedHash = computeProtocolHash({
  industry: 'document metadata removal tool',
  market: 'global-en',
  language: 'en',
  competitors: ['MetaCleaner.com'],
  brandAliases: ['MetaDocu'],
  targetKeywords: ['remove pdf metadata'],
  confirmedCompetitors: ['metadata2go.com'],
  engines: ['deepseek', 'Google AI Overviews'],
  promptTemplateVersion: 'template_v2',
})

async function seedCompletedRun(over: Partial<typeof runs.$inferInsert> & { id: string }) {
  await db.insert(runs).values({ projectId: 'proj_1', status: 'reviewing', protocolHash: expectedHash, startedAt: '2026-10-01T00:00:00.000Z', ...over })
}

const runRow = async (id: string) => (await db.select().from(runs).where(eq(runs.id, id)))[0]

beforeEach(async () => {
  sendMock.mockReset().mockResolvedValue({ ids: ['evt_1'] })
  await db.delete(competitors)
  await db.delete(runs)
  await db.delete(projectSettings)
  await db.delete(projects)
  await db.insert(projects).values({
    id: 'proj_1', domain: DOMAIN, industry: 'document metadata removal tool', market: 'global-en', language: 'en', competitors: ['MetaCleaner.com'],
  })
  await db.insert(projectSettings).values({
    projectId: 'proj_1', defaultModels: ['deepseek', 'Google AI Overviews'], brandAliases: ['MetaDocu'], targetKeywords: ['remove pdf metadata'],
  })
  // 只有 confirmed 的竞品进指纹；candidate 不进。
  await db.insert(competitors).values([
    { id: 'comp_1', projectId: 'proj_1', domain: 'metadata2go.com', status: 'confirmed' },
    { id: 'comp_2', projectId: 'proj_1', domain: 'candidate-only.com', status: 'candidate' },
  ])
})

describe('startCheckup（真库 + 默认依赖）', () => {
  it('首次体检：新协议落库，派发的真实事件带 runId/projectId/项目域名，不带基线', async () => {
    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const row = await runRow(res.run.id)
    expect(row).toMatchObject({ projectId: 'proj_1', runType: 'baseline', status: 'collecting', baselineRunId: null, analysisSessionId: null })
    expect(row.protocolHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.protocolHash).toBe(expectedHash)
    expect(row.startedAt).toEqual(expect.any(String))
    expect(row.rulesVersion).toEqual(expect.any(String))

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0]).toStrictEqual({
      name: COLLECT_REQUESTED_EVENT,
      data: { runId: res.run.id, projectId: 'proj_1', url: DOMAIN, baselineRunId: undefined },
    })
  })

  it('指纹相同且已有完成的体检：沿用协议，落库 retest + 基线 id + 起点的 protocolVersion，事件带基线', async () => {
    await seedCompletedRun({ id: 'run_prev', protocolVersion: 'v3' })

    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const row = await runRow(res.run.id)
    expect(row).toMatchObject({ runType: 'retest', baselineRunId: 'run_prev', protocolVersion: 'v3', protocolHash: expectedHash, status: 'collecting' })
    expect(sendMock.mock.calls[0][0]).toStrictEqual({
      name: COLLECT_REQUESTED_EVENT,
      data: { runId: res.run.id, projectId: 'proj_1', url: DOMAIN, baselineRunId: 'run_prev' },
    })
  })

  it('最近一次完成的体检本身是沿用协议的：基线取协议起点，不取最近一次', async () => {
    await seedCompletedRun({ id: 'run_origin', status: 'output' })
    await seedCompletedRun({ id: 'run_again', runType: 'retest', baselineRunId: 'run_origin', status: 'output', startedAt: '2026-10-05T00:00:00.000Z' })

    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect((await runRow(res.run.id))).toMatchObject({ runType: 'retest', baselineRunId: 'run_origin' })
    expect(sendMock.mock.calls[0][0]).toStrictEqual({
      name: COLLECT_REQUESTED_EVENT,
      data: { runId: res.run.id, projectId: 'proj_1', url: DOMAIN, baselineRunId: 'run_origin' },
    })
  })

  it('历史体检指纹不同或为空：新协议，落库 baseline、基线为空，事件不带基线', async () => {
    await seedCompletedRun({ id: 'run_other_hash', protocolHash: 'f'.repeat(64) })
    await seedCompletedRun({ id: 'run_legacy', protocolHash: null, startedAt: '2026-10-02T00:00:00.000Z' })

    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(await runRow(res.run.id)).toMatchObject({ runType: 'baseline', baselineRunId: null, protocolHash: expectedHash })
    expect((sendMock.mock.calls[0][0] as { data: { baselineRunId?: string } }).data.baselineRunId).toBeUndefined()
  })

  it('从库里读到的输入变了（目标关键词、确认竞品）：指纹变，不再沿用', async () => {
    await seedCompletedRun({ id: 'run_prev' })
    await db.update(projectSettings).set({ targetKeywords: ['remove pdf metadata', 'strip exif'] }).where(eq(projectSettings.projectId, 'proj_1'))
    const a = await startCheckup({ projectId: 'proj_1' })
    expect(a.ok && (await runRow(a.run.id))).toMatchObject({ runType: 'baseline', baselineRunId: null })
    if (a.ok) await db.update(runs).set({ status: 'failed' }).where(eq(runs.id, a.run.id))

    await db.update(projectSettings).set({ targetKeywords: ['remove pdf metadata'] }).where(eq(projectSettings.projectId, 'proj_1'))
    await db.update(competitors).set({ status: 'confirmed' }).where(eq(competitors.id, 'comp_2'))
    const b = await startCheckup({ projectId: 'proj_1' })
    expect(b.ok && (await runRow(b.run.id))).toMatchObject({ runType: 'baseline', baselineRunId: null })
  })

  it('analysisSessionId 写入新体检', async () => {
    const res = await startCheckup({ projectId: 'proj_1', analysisSessionId: 'session_x' })
    expect(res.ok && (await runRow(res.run.id))?.analysisSessionId).toBe('session_x')
  })

  it('同项目已有进行中的体检 → 409，不新增 run、不派发', async () => {
    await db.insert(runs).values({ id: 'run_busy', projectId: 'proj_1', status: 'collecting', startedAt: '2026-10-08T00:00:00.000Z' })
    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res).toEqual({ ok: false, status: 409, error: 'run_in_progress', runId: 'run_busy' })
    expect(await db.select().from(runs)).toHaveLength(1)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('派发失败 → 503，真库里该体检被标 failed 并写入原因与完成时间', async () => {
    sendMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8288'))
    const res = await startCheckup({ projectId: 'proj_1' })
    expect(res).toMatchObject({ ok: false, status: 503, error: 'dispatch_failed', runId: expect.stringMatching(/^run_/) })
    if (res.ok) return
    expect(await runRow(res.runId!)).toMatchObject({
      status: 'failed',
      failureReason: '采集事件派发失败：ECONNREFUSED 127.0.0.1:8288',
      finishedAt: expect.any(String),
    })
  })
})
