import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'

// 真库回归（SP-A 第一波审查 C1 / I1 / I3）：迁移全量灌入临时库后再 import 路由。
// 库文件名带 pid：并发会话跑同一批测试时不会互删对方的临时库。
const TEST_DB = `./veris-test-projects-realdb-${process.pid}.db`
process.env.LIBSQL_URL = `file:${TEST_DB}`
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const { db } = await import('@/db/client')
const { projects, projectSettings, runs, keywords, keywordMetrics } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')
const { POST } = await import('./route')
const { GET, PATCH } = await import('./[id]/route')

const DOMAIN = normalizeDomain('metadocu.com')!
const post = (body: unknown) => POST(new Request('http://x/api/projects', { method: 'POST', body: JSON.stringify(body) }))
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://x/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
const get = async (id: string) =>
  (await (await GET(new Request(`http://x/api/projects/${id}`), { params: Promise.resolve({ id }) })).json()) as { industry: string; market: string; competitors: string[]; targetKeywords: string[] }
const projectRow = async () => (await db.select().from(projects).where(eq(projects.id, 'proj_old')))[0]

// 迁移后的旧项目形态：品类已清空、市场已映射成 code；跑过一轮 GSC，有一条关键词和它的指标。
async function seedLegacy(over: Partial<{ industry: string; market: string }> = {}) {
  await db.delete(keywordMetrics)
  await db.delete(keywords)
  await db.delete(runs)
  await db.delete(projectSettings)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_old', domain: DOMAIN, industry: '', market: 'global-en', language: 'en', ...over })
  await db.insert(projectSettings).values({ projectId: 'proj_old' })
  await db.insert(runs).values({ id: 'run_1', projectId: 'proj_old' })
  await db.insert(keywords).values({ id: 'kw_gsc', projectId: 'proj_old', text: 'remove pdf metadata', source: 'gsc', market: 'global-en' })
  await db.insert(keywordMetrics).values({ id: 'km_gsc', runId: 'run_1', keywordId: 'kw_gsc', source: 'gsc', clicks: 7, impressions: 120 })
}

describe('目标关键词写入不碰关键词测量表（审查 C1 / I1）', () => {
  beforeEach(() => seedLegacy())

  it('目标词与已有 GSC 词同文同市场 → 200，GET 能读回', async () => {
    const res = await patch('proj_old', { targetKeywords: ['remove pdf metadata', 'strip exif'] })
    expect(res.status).toBe(200)
    expect((await get('proj_old')).targetKeywords).toEqual(['remove pdf metadata', 'strip exif'])
  })

  it('提交空目标词只清空目标词，GSC 关键词与历史指标都保留', async () => {
    await patch('proj_old', { targetKeywords: ['remove pdf metadata'] })
    const res = await patch('proj_old', { industry: 'document metadata removal tool', market: 'global-en', targetKeywords: [] })
    expect(res.status).toBe(200)
    expect((await get('proj_old')).targetKeywords).toEqual([])
    expect(await db.select().from(keywords)).toHaveLength(1)
    expect(await db.select().from(keywordMetrics)).toHaveLength(1)
  })

  it('GSC 指标合并进了旧的 manual 词行（upsert 冲突时不改 source）：清空目标词也不级联删指标', async () => {
    await db.insert(keywords).values({ id: 'kw_manual', projectId: 'proj_old', text: 'clean docx metadata', source: 'manual', market: 'global-en' })
    await db.insert(keywordMetrics).values({ id: 'km_merged', runId: 'run_1', keywordId: 'kw_manual', source: 'gsc', clicks: 3, impressions: 40 })
    const res = await patch('proj_old', { targetKeywords: [] })
    expect(res.status).toBe(200)
    expect((await db.select().from(keywordMetrics)).map((m) => m.id).sort()).toEqual(['km_gsc', 'km_merged'])
  })
})

describe('空白向导填写已存在的域名（审查 I3）', () => {
  const wizardBody = (over: Record<string, unknown> = {}) => ({
    domain: 'metadocu.com', industry: 'document metadata removal tool', market: 'global-en', competitors: '', targetKeywords: ['strip exif'],
    gscConnected: false, defaultModels: [], ...over,
  })

  it('复用项目时写入用户填写的品类与目标词，响应即为更新后的值', async () => {
    await seedLegacy()
    const res = await post(wizardBody())
    const body = (await res.json()) as { id: string; industry: string; targetKeywords: string[]; reused: boolean }
    expect(body).toMatchObject({ id: 'proj_old', reused: true, industry: 'document metadata removal tool', targetKeywords: ['strip exif'] })
    expect((await projectRow()).industry).toBe('document metadata removal tool')
  })

  it('提交的目标词为空时不清空已存目标词（空白表单没展示过它们）', async () => {
    await seedLegacy()
    await patch('proj_old', { targetKeywords: ['strip exif'] })
    const body = (await (await post(wizardBody({ targetKeywords: [] }))).json()) as { targetKeywords: string[] }
    expect(body.targetKeywords).toEqual(['strip exif'])
    expect((await get('proj_old')).targetKeywords).toEqual(['strip exif'])
  })

  it('已有合规市场不被表单默认值覆盖；缺市场的旧项目则补上', async () => {
    await seedLegacy({ market: 'gb' })
    await post(wizardBody({ market: 'global-en' }))
    expect((await projectRow()).market).toBe('gb')
    await seedLegacy({ market: '' })
    await post(wizardBody({ market: 'us' }))
    expect((await projectRow()).market).toBe('us')
  })

  it('用户填写的竞品写入（非空时），空则保留原值', async () => {
    await seedLegacy()
    await post(wizardBody({ competitors: 'exiftool.org, metaclean.app' }))
    expect((await projectRow()).competitors).toEqual(['exiftool.org', 'metaclean.app'])
    await post(wizardBody({ competitors: '' }))
    expect((await projectRow()).competitors).toEqual(['exiftool.org', 'metaclean.app'])
  })
})
