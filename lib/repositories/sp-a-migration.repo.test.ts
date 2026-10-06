import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

// SP-A §3.6 旧数据迁移：先灌 0015 之前的迁移、写入旧值，再单独执行 0015，断言结果。
const TEST_DB = './veris-test-sp-a-migration.db'
rmSync(TEST_DB, { force: true })
afterAll(() => rmSync(TEST_DB, { force: true }))

const all = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
const target = all.find((f) => f.startsWith('0015_'))

describe('0015 市场 code / 品类 / 语言迁移', () => {
  it('旧显示文案 → code 或清空；8 个旧下拉品类全部清空；语言统一 en；合规值不动', async () => {
    expect(target, '缺少 0015 迁移文件').toBeTruthy()
    const client = createClient({ url: `file:${TEST_DB}` })
    for (const m of all.filter((f) => f < '0015')) await client.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
    const rows: [string, string, string, string][] = [
      ['p1', 'English · Global', 'B2B SaaS · 项目协作', 'zh'],
      ['p2', '中文 · 中国大陆', 'document metadata removal tool', ''],
      ['p3', '东南亚', '其他…', 'zh'],
      ['p4', 'Southeast Asia', 'Cross-border e-commerce', 'en'],
      ['p5', 'Chinese · Mainland China', 'Local services', 'en'],
      ['p6', 'global-en', 'saas tool', 'zh'],
      ['p7', 'gb', '跨境电商', 'zh'],
      ['p8', '', 'B2B SaaS · Team collaboration', ''],
    ]
    for (const [id, market, industry, language] of rows) {
      await client.execute({ sql: 'insert into projects (id, domain, market, industry, language) values (?, ?, ?, ?, ?)', args: [id, `https://${id}.example/`, market, industry, language] })
    }
    await client.executeMultiple(readFileSync(`db/migrations/${target}`, 'utf8'))
    const res = await client.execute('select id, market, industry, language from projects order by id')
    client.close()
    expect(res.rows.map((r) => [r.id, r.market, r.industry, r.language])).toEqual([
      ['p1', 'global-en', '', 'en'],
      ['p2', '', 'document metadata removal tool', 'en'],
      ['p3', '', '', 'en'],
      ['p4', '', '', 'en'],
      ['p5', '', '', 'en'],
      ['p6', 'global-en', 'saas tool', 'en'],
      ['p7', 'gb', '', 'en'],
      ['p8', '', '', 'en'],
    ])
  })
})
