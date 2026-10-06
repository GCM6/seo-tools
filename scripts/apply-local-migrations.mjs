// 本地库补跑迁移（运维工具，见 docs/runbooks/local-env.md）。
// 用 libsql 客户端执行迁移 SQL——与 lib/repositories/*.repo.test.ts 回放迁移的方式相同。
// 不要用 sqlite3 命令行执行 drizzle 的"重建表"迁移（如 0011）：改名一步会失败，而删旧表已执行，整表丢失。
//
// 用法（在仓库根目录）：
//   node scripts/apply-local-migrations.mjs <库文件绝对路径> <要执行的迁移序号,逗号分隔> [--record]
//   例：node scripts/apply-local-migrations.mjs "$PWD/veris.db" 0011,0015,0016,0017 --record
// --record：把 journal 中 idx ≥ 11 且尚未记录的迁移补记进 __drizzle_migrations
//   （hash = 迁移文件 sha256，created_at = journal when），之后 drizzle-kit migrate 应为空操作。
//   只在确认这些迁移的结构已全部生效（执行过或早先由 db:push 推过）时使用。

import { createClient } from '@libsql/client'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [dbPath, which, flag] = process.argv.slice(2)
if (!dbPath?.startsWith('/')) throw new Error('第一个参数必须是库文件的绝对路径')
if (!which) throw new Error('第二个参数必须是迁移序号，如 0011,0015')

const client = createClient({ url: `file:${dbPath}` })
const files = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8')).entries

for (const idx of which.split(',').map((s) => s.trim()).filter(Boolean)) {
  const file = files.find((f) => f.startsWith(`${idx}_`))
  if (!file) throw new Error(`找不到迁移 ${idx}`)
  await client.executeMultiple(readFileSync(`db/migrations/${file}`, 'utf8'))
  console.log('applied', file)
}

if (flag === '--record') {
  const applied = new Set((await client.execute('select hash from __drizzle_migrations')).rows.map((r) => r.hash))
  for (const e of journal.filter((x) => x.idx >= 11)) {
    const hash = createHash('sha256').update(readFileSync(`db/migrations/${e.tag}.sql`, 'utf8')).digest('hex')
    if (applied.has(hash)) continue
    await client.execute({ sql: 'insert into __drizzle_migrations (hash, created_at) values (?, ?)', args: [hash, e.when] })
    console.log('recorded', e.tag)
  }
}
client.close()
