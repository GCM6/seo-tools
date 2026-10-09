// 问题清单文档（验收交付物）：每个项目一节，逐个问题列出当前状态、决定、标记与完整经过。只读，不写库。
// 用法：LIBSQL_URL=file:./veris.db pnpm -s issues:report > <输出文件>.md
// （-s 关掉 pnpm 自己的启动横幅，否则横幅会混进输出文档的开头。）
import { inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { issueEvents, projects } from '@/db/schema'
import { getProjectIssues } from '@/lib/repositories'
import { renderIssueReport } from '@/lib/issues/report-markdown'
import type { IssueEventDraft } from '@/lib/issues/types'

async function main(): Promise<void> {
  const out: string[] = ['# 问题清单（问题台账验收）', '']
  for (const p of await db.select().from(projects)) {
    const issues = await getProjectIssues(p.id)
    if (!issues.length) continue
    const events = (await db.select().from(issueEvents).where(inArray(issueEvents.issueId, issues.map((i) => i.id)))) as unknown as IssueEventDraft[]
    out.push(renderIssueReport({ domain: p.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''), issues, events }))
  }
  console.log(out.join('\n'))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
