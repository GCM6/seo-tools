// 历史回填（spec 2026-10-09 §6.5）：把已有体检按时间顺序重放进问题表。
// 用法（在仓库根目录）：
//   LIBSQL_URL=file:./veris.db pnpm issues:backfill --dry-run          # 只打印，不写
//   LIBSQL_URL=file:./veris.db pnpm issues:backfill                    # 只处理还没有问题的项目（可重复执行）
//   LIBSQL_URL=file:<副本>.db pnpm issues:backfill --rebuild           # 仅限副本演练：先删该项目问题再重放
//   可加 --project <id> 只处理一个项目。
import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, inArray } from 'drizzle-orm'
import { findings, issues, projects, recommendations, runs } from '@/db/schema'
import { backfillEventIds, replayHistory } from '@/lib/issues/backfill'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const valueOf = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

// --rebuild 会删掉项目的全部问题并把所有已完成体检当作「没有台账的历史」重放：
// 在有真实体检结果的库上执行会毁掉检查结果。所以只允许对显式指定的库副本使用，正式库一律拒绝。
function assertRebuildTargetIsNotRealDb(): void {
  const url = process.env.LIBSQL_URL
  if (!url) {
    console.error('--rebuild 必须显式设置 LIBSQL_URL 指向数据库副本（file:<副本路径>），不能使用默认库。')
    process.exit(1)
  }
  if (!url.startsWith('file:')) {
    console.error(`--rebuild 只允许本地 file: 数据库副本，当前 LIBSQL_URL=${url}`)
    process.exit(1)
  }
  // libsql 会对 file: 路径做百分号解码（file:./veris%2Edb 打开的就是 veris.db），护栏必须按同一套规则还原路径。
  let raw: string
  try {
    raw = url.startsWith('file://') ? fileURLToPath(url) : decodeURIComponent(url.slice('file:'.length).split('?')[0])
  } catch {
    console.error(`--rebuild 无法解析 LIBSQL_URL 的路径（百分号编码不合法），按安全起见拒绝：${url}`)
    process.exit(1)
  }
  const target = resolve(process.cwd(), raw)
  const real = resolve(__dirname, '..', 'veris.db')
  const realpath = (p: string) => (existsSync(p) ? realpathSync(p) : p)
  // 路径相同（含符号链接）或同一个文件（硬链接）都算正式库。
  const samePath = realpath(target) === realpath(real)
  const sameFile = existsSync(target) && existsSync(real) && statSync(target).ino === statSync(real).ino && statSync(target).dev === statSync(real).dev
  if (samePath || sameFile) {
    console.error(`拒绝执行：--rebuild 不能作用于正式库 ${real}。请先复制一份副本，再用 LIBSQL_URL=file:<副本路径> 演练。`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const dryRun = flag('--dry-run')
  const rebuild = flag('--rebuild')
  // 护栏必须在任何数据库访问之前：下面才动态加载会打开数据库连接的模块。
  if (rebuild) assertRebuildTargetIsNotRealDb()
  const { db } = await import('@/db/client')
  const { getProjectIssues, recomputeRetestDue, saveIssueChanges } = await import('@/lib/repositories')

  // 一次脚本运行一个计数器：同刻写下的多条决定，事件 id 的字典序就是它们的先后（文档靠它排序）。
  const newEventId = backfillEventIds()
  const only = valueOf('--project')
  const targets = only ? await db.select().from(projects).where(eq(projects.id, only)) : await db.select().from(projects)
  for (const p of targets) {
    const existing = await getProjectIssues(p.id)
    if (existing.length && !rebuild) {
      console.log(`${p.domain}: 已有 ${existing.length} 个问题，跳过（如在副本演练可加 --rebuild）`)
      continue
    }
    const runRows = await db.select().from(runs).where(eq(runs.projectId, p.id))
    const runIds = runRows.map((r) => r.id)
    const findingRows = runIds.length ? await db.select().from(findings).where(inArray(findings.runId, runIds)) : []
    const recRows = runIds.length ? await db.select().from(recommendations).where(inArray(recommendations.runId, runIds)) : []
    const plan = replayHistory({
      projectId: p.id,
      runs: runRows,
      findings: findingRows,
      recommendations: recRows,
      newIssueId: () => `iss_${crypto.randomUUID()}`,
      newEventId,
    })
    // 没有已完成体检的项目没有可回填的内容：不写库，也不去动它的复查提醒。
    if (!plan.issues.length) {
      console.log(`${p.domain}: 没有可回填的已完成体检，跳过`)
      continue
    }
    const count = (key: 'status' | 'decision') =>
      Object.entries(plan.issues.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i[key]]: (acc[i[key]] ?? 0) + 1 }), {}))
        .map(([k, v]) => `${k} ${v}`)
        .join('，')
    console.log(`${p.domain}: 体检 ${runRows.length} 次 → 问题 ${plan.issues.length} 个，变化记录 ${plan.events.length} 条`)
    console.log(`  状态：${count('status')}`)
    console.log(`  决定：${count('decision')}`)
    if (dryRun) continue
    if (rebuild && existing.length) await db.delete(issues).where(eq(issues.projectId, p.id))
    await saveIssueChanges(plan)
    console.log(`  复查提醒：${(await recomputeRetestDue(p.id)) ?? '无'}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
