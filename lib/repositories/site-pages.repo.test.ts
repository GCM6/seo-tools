import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'
import type { InternalLinkDetail } from '@/lib/crawl/light-check'

const TEST_DB = './veris-test-sitepagesrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

// fresh sqlite 无表，drizzle 不自动建表：在 import @/db/client 前把 migration 全量按序灌进临时库。
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
const migrations = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const m of migrations) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()

afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, sitePages, urlTemplates } = await import('@/db/schema')

const row = (url: string, linkDetails: InternalLinkDetail[] = []): Parameters<typeof repo.upsertSitePages>[2][number] => ({
  url, discoveredVia: 'crawl', depth: 1, httpStatus: 200, finalUrl: null, title: null, canonicalUrl: null,
  metaRobots: null, mainTextChars: 10, contentHash: null, internalLinks: linkDetails.map((d) => d.url),
  linkDetails, externalLinks: [], lightCheckExtra: null, checkStatus: 'checked', errorReason: null,
})

async function seed() {
  await db.delete(urlTemplates)
  await db.delete(sitePages)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_s1', domain: 'ex.com' })
  await db.insert(runs).values([{ id: 'run_1', projectId: 'proj_s1' }, { id: 'run_2', projectId: 'proj_s1' }])
}

// 覆盖 spec S1 D4/D5：快照按 run 隔离；入度每轮先清零再写入。
describe('site_pages run 隔离（spec S1 §5）', () => {
  beforeEach(seed)

  it('getRunSitePages 只返回本 run 见过的页；链接明细 JSON 往返', async () => {
    await repo.upsertSitePages('proj_s1', 'run_1', [row('https://ex.com/a'), row('https://ex.com/b')])
    const detail: InternalLinkDetail = { url: 'https://ex.com/b', count: 2, anchors: ['B'], regions: ['nav'], nofollow: false }
    await repo.upsertSitePages('proj_s1', 'run_2', [row('https://ex.com/a', [detail])])
    const r2 = await repo.getRunSitePages('proj_s1', 'run_2')
    expect(r2.map((p) => p.url)).toEqual(['https://ex.com/a'])
    expect(r2[0].linkDetails).toEqual([detail])
    expect(r2[0].externalLinks).toEqual([])
    expect(r2[0].lastSeenRunId).toBe('run_2')
    expect(r2[0].firstSeenRunId).toBe('run_1')
  })

  it('updateInboundCounts 先把本 run 页入度清零，不动其他 run 的页', async () => {
    await repo.upsertSitePages('proj_s1', 'run_1', [row('https://ex.com/a'), row('https://ex.com/b')])
    await repo.updateInboundCounts('proj_s1', 'run_1', { 'https://ex.com/a': 5, 'https://ex.com/b': 4 })
    await repo.upsertSitePages('proj_s1', 'run_2', [row('https://ex.com/a')])
    await repo.updateInboundCounts('proj_s1', 'run_2', {})
    const all = Object.fromEntries((await repo.getSitePages('proj_s1')).map((p) => [p.url, p.inboundLinkCount]))
    expect(all).toEqual({ 'https://ex.com/a': 0, 'https://ex.com/b': 4 })
  })
})
