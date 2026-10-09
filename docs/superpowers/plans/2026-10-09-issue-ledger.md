# 问题台账（以问题为中心的闭环 · 子项目 1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「问题」成为项目级、跨体检持续存在的对象：每次体检写检查台账、自动对账问题表、决定跨次继承，并把历史 5 次诊断回填进来。

**Architecture:** 新增 `issues` / `issue_events` / `check_results` 三张表。规则引擎在求值时同时产出检查台账；纯函数 `reconcileIssues` 用「问题现状 + 本次命中 + 台账 + 协议指纹 + 体检开始时间」算出问题表更新与变化记录，由 Inngest 诊断流水线在落库发现后执行。四个建诊断入口收敛为 `startCheckup`，按协议指纹决定沿用还是新建检测协议。旧界面（建议页、执行清单）通过桥接把决定写进问题表，直到子项目 2 换掉界面。

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Drizzle ORM + libSQL · Inngest · vitest（pnpm）

**Spec:** `docs/superpowers/specs/2026-10-09-issue-centric-loop-design.md`（同时阅读本计划「计划阶段对规格的细化」一节）

## Global Constraints

- 编码前调用 `veris-coding` skill；React 19 / Next 16 写法；包管理器只用 pnpm。
- DB 读写函数集中在 `lib/repositories/`（新文件经 `lib/repositories/index.ts` 的 `export *` 暴露，调用方一律 `import from '@/lib/repositories'`）。
- 插入行必须显式给前缀 id：问题 `iss_`、变化记录 `iev_`、台账 `chk_`。
- 本项目没有 Zod，校验用 `lib/repositories/validators.ts` 风格的手写 assert，失败 `throw new Error('snake_case')`。
- 测试与源码同层（`foo.ts` 旁 `foo.test.ts`），不建 `__tests__/`。
- 涉及 DB 的测试用真实 libsql 临时库（参照 `lib/repositories/runs-baseline.repo.test.ts`：回放 `db/migrations/*.sql`）。
- 测试夹具优先取真实生产函数的输出；不得手写真实采集产生不了的形状。
- 判定与文字全部确定性生成，不引入大模型（spec D10）。
- 不改任何界面组件与文案（子项目 2–4）；唯一例外是 Task 13 的旧界面桥接只改 API 路由的服务端行为。
- 本地库迁移只用 libsql 执行（`scripts/apply-local-migrations.mjs`），不用 sqlite3 命令行；先在副本演练。
- drizzle-kit 为 SQLite 生成 `ADD COLUMN ... REFERENCES` 时会丢 `ON DELETE`，生成后人工核对并用真库删父行测试验证。
- 提交信息用中文，结尾带 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`；分支 `feat/issue-centric-loop`。

## Review Focus

1. **数据源状态是 `partial` 但一条证据都没采到**（真实库里 `render` 就是 `partial` + 0 条）：依赖它的规则必须记「没查（data_gap）」，不能记「没查出」，否则问题会被误判已修复。→ Task 3 用例。
2. **体检进行中你标了已执行**（执行时间晚于本次体检开始）：本次对账后问题必须仍是「已执行，待复查」，不能直接判已修复或改了没生效。→ Task 8 用例。
3. **同一次体检对账被执行两次**（Inngest 步骤提交后重放、竞品确认后的局部重算）：不得重复叠加变化记录，也不得把「新出现 / 复发」标记冲掉。→ Task 9、Task 10、Task 11 用例。
4. **在一次旧体检的竞品页确认竞品**：局部重算只能作用于该项目最近一次完成的体检，不能用旧观测覆盖新状态。→ Task 11 用例。
5. **单条规则抛错或命中全部证据引用为空**：台账记 `error`，对应问题标「未复查（出错）」，状态不变，不能判已修复。→ Task 3、Task 8 用例。

## 计划阶段对规格的细化（已随本计划同一提交写入规格 §3 / §6，标「计划阶段细化」）

1. `issues.detection` 只取 `present` / `gone`。「未复查」用 `flags` 里的 `unverified` 加 `unverified_reason` 表达，对账时检测值与检查时间都不动，从而满足规格 4.4-3「状态不变」。
2. `issues` 增加两列：`last_checked_at`（最近一次真正查过本问题的体检的开始时间，状态推导用它判断「执行之后开始的体检」）与 `retired_reason`（`protocol_changed` / `rule_changed`，非空即已关闭）。
3. 协议指纹的输入按代码实况补齐：除市场、品类、目标关键词、已确认竞品、提问模板版本、引擎列表外，还包括语言、项目手填竞品（进 AI 提问集，见 `lib/probes/prompt-set.ts` 的 `PromptSetInput`）与品牌别名。
4. 数据源键按 `data_source_statuses.source_key` 的实际取值（含 `dataforseo:labs`、`aio`、`third_party:reddit` 这类子键），另加伪数据源 `confirmed_competitors`。可用的判定：`status = 'collected'`，或 `status = 'partial'` 且 `captured_evidence_count > 0`。
5. 提示词闸门：本子项目新增 `assertIssueIncluded` 并在 `generated_prompts` 写入 `issue_id`；旧界面仍按建议状态把关，但 Task 13 的桥接保证「建议已接受」与「问题已纳入」同步。闸门整体切到问题，在子项目 2 换界面时完成。
6. 对账失败会让本次体检失败（重试 3 次后 `onFailure` 标 failed），不静默吞掉——问题台账是主线，不能悄悄变旧。

## 文件结构

| 文件 | 职责 | Task |
|---|---|---|
| `db/schema.ts` | 新表 `issues` / `issueEvents` / `checkResults`；`findings.detail`、`runs.protocolHash`、`generatedPrompts.issueId` | 1 |
| `db/migrations/0019_issue_ledger.sql`（+ meta） | 迁移 | 1 |
| `lib/repositories/issues-schema.repo.test.ts` | 新表约束与级联的真库测试 | 1 |
| `lib/diagnosis/sources.ts` | 数据源键、可用性判定、协议相关数据源 | 2 |
| `lib/diagnosis/rules/*.ts` | 每条规则加 `version` 与 `requiredSources`；有内部门槛的规则返回「未检查」 | 2、3 |
| `lib/diagnosis/rules/rule-versions.snapshot.json`、`scripts/rules-snapshot.ts` | 规则逻辑指纹快照，改规则未升版本时测试失败 | 2 |
| `lib/diagnosis/check-ledger.ts` | 引擎求值同时产出台账（纯函数） | 3 |
| `lib/diagnosis/finding-detail.ts` | 规则命中 → 统一明细形状 | 4 |
| `lib/runs/protocol.ts` | 协议指纹与协议起点选择（纯函数） | 5 |
| `lib/runs/start-checkup.ts` | 统一的「发起体检」 | 5 |
| `lib/diagnosis/competitor-context.ts` | 已确认竞品与关键词缺口的规则输入（主诊断与竞品再评估共用） | 6 |
| `lib/issues/types.ts`、`lib/issues/status.ts` | 问题类型、展示状态推导（纯函数） | 7 |
| `lib/issues/reconcile.ts` | 对账（纯函数） | 8 |
| `lib/repositories/issues.ts` | 问题、变化记录、台账读写；复查提醒重算；体检变化摘要与待办查询 | 9、12 |
| `lib/inngest/generate-findings.ts` | 写台账 → 对账；停用旧回测对比 | 10 |
| `lib/inngest/reevaluate-competitors.ts` | 台账改写 + 局部对账 | 11 |
| `lib/issues/actions.ts` | 纳入 / 暂不处理 / 误报 / 撤销排除 / 执行 / 撤销执行（纯函数） | 12 |
| `lib/issues/bridge.ts` | 旧界面写入映射到问题动作 | 13 |
| `lib/issues/backfill.ts`、`scripts/backfill-issues.ts` | 历史回填 | 14 |
| `lib/issues/report-markdown.ts`、`scripts/issue-report.ts` | 问题清单文档（验收交付物） | 15 |
| `docs/runbooks/local-env.md` | 0019 迁移与回填步骤 | 16 |

---

### Task 1: 新表、新列与迁移 0019

**Files:**
- Modify: `db/schema.ts`（`runs` 约 61-82 行、`findings` 约 268-302 行、`recommendations` 之后、`generatedPrompts` 约 331-339 行）
- Create: `db/migrations/0019_issue_ledger.sql`（drizzle-kit 生成后人工核对），以及它更新的 `db/migrations/meta/_journal.json`、`db/migrations/meta/0019_snapshot.json`
- Test: `lib/repositories/issues-schema.repo.test.ts`

**Interfaces:**
- Produces: drizzle 表对象 `issues`、`issueEvents`、`checkResults`；`findings.detail`（类型 `FindingDetailJson`）、`runs.protocolHash`、`generatedPrompts.issueId`；导出类型 `FindingDetailJson`。

- [ ] **Step 1: 写失败的真库测试**

Create `lib/repositories/issues-schema.repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-issues-schema.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const { db } = await import('@/db/client')
const { projects, runs, findings, recommendations, generatedPrompts, issues, issueEvents, checkResults } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')

const issueRow = (over: Record<string, unknown> = {}) => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'T01', ruleVersion: 1,
  side: 'technical', title: '入口页被 noindex', severity: 'high', detection: 'present', status: 'pending',
  ...over,
})

describe('0019 问题台账表', () => {
  beforeEach(async () => {
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
    await db.insert(findings).values({ id: 'find_1', runId: 'run_1', side: 'technical', title: 't', claimType: 'measured_hard', evidenceRefs: ['ev_1'] })
  })

  it('同一项目同一指纹只能有一个问题', async () => {
    await db.insert(issues).values(issueRow())
    await expect(db.insert(issues).values(issueRow({ id: 'iss_2' }))).rejects.toThrow()
  })

  it('暂不处理与误报必须写理由', async () => {
    await expect(db.insert(issues).values(issueRow({ decision: 'deferred', status: 'excluded' }))).rejects.toThrow()
    await expect(db.insert(issues).values(issueRow({ decision: 'false_positive', decisionReason: '  ', status: 'excluded' }))).rejects.toThrow()
    await db.insert(issues).values(issueRow({ decision: 'deferred', decisionReason: '先做 Google', status: 'excluded' }))
  })

  it('只有已纳入的问题能有执行时间', async () => {
    await expect(db.insert(issues).values(issueRow({ executedAt: '2026-10-09T00:00:00.000Z' }))).rejects.toThrow()
    await db.insert(issues).values(issueRow({ decision: 'included', executedAt: '2026-10-09T00:00:00.000Z', status: 'executed_awaiting' }))
  })

  it('检测值只接受 present / gone', async () => {
    await expect(db.insert(issues).values(issueRow({ detection: 'unverified' }))).rejects.toThrow()
  })

  it('删项目级联删问题、变化记录与台账', async () => {
    await db.insert(issues).values(issueRow())
    await db.insert(issueEvents).values({ id: 'iev_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', toStatus: 'pending', actor: 'system' })
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'hit', hitCount: 1 })
    await db.delete(projects).where(eq(projects.id, 'proj_1'))
    expect(await db.select().from(issues)).toHaveLength(0)
    expect(await db.select().from(issueEvents)).toHaveLength(0)
    expect(await db.select().from(checkResults)).toHaveLength(0)
  })

  it('删体检：台账级联删除，变化记录与问题上的体检引用置空', async () => {
    await db.insert(issues).values(issueRow({ firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1', latestFindingId: 'find_1' }))
    await db.insert(issueEvents).values({ id: 'iev_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', toStatus: 'pending', actor: 'system' })
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'hit', hitCount: 1 })
    await db.delete(runs).where(eq(runs.id, 'run_1'))
    const [issue] = await db.select().from(issues)
    expect(issue.firstSeenRunId).toBeNull()
    expect(issue.lastSeenRunId).toBeNull()
    expect(issue.latestFindingId).toBeNull() // 发现随体检级联删除 → 置空
    expect((await db.select().from(issueEvents))[0].runId).toBeNull()
    expect(await db.select().from(checkResults)).toHaveLength(0)
  })

  it('台账：同一体检同一规则唯一；「没查」必须带原因类别', async () => {
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'clear', hitCount: 0 })
    await expect(db.insert(checkResults).values({ id: 'chk_2', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'clear', hitCount: 0 })).rejects.toThrow()
    await expect(db.insert(checkResults).values({ id: 'chk_3', runId: 'run_1', ruleId: 'T02', ruleVersion: 1, outcome: 'not_checked', hitCount: 0 })).rejects.toThrow()
  })

  it('删问题级联删它的执行提示词（generated_prompts.issue_id ON DELETE cascade）', async () => {
    await db.insert(issues).values(issueRow())
    await db.insert(recommendations).values({ id: 'rec_1', runId: 'run_1', findingId: 'find_1', what: 'w', evidenceRefs: ['ev_1'] })
    await db.insert(generatedPrompts).values({ id: 'gp_1', recommendationId: 'rec_1', issueId: 'iss_1', promptType: 'technical', promptText: 'p' })
    await db.delete(issues).where(eq(issues.id, 'iss_1'))
    expect(await db.select().from(generatedPrompts)).toHaveLength(0)
  })

  it('findings.detail 与 runs.protocol_hash 可读写', async () => {
    const detail = { scale: { affected: 2 }, rows: [{ url: 'https://example.com/a', field: 'aggregateRating', current: '缺失', expected: '补上' }], truncated: false }
    await db.update(findings).set({ detail }).where(eq(findings.id, 'find_1'))
    await db.update(runs).set({ protocolHash: 'h1' }).where(eq(runs.id, 'run_1'))
    expect((await db.select().from(findings))[0].detail).toEqual(detail)
    expect((await db.select().from(runs))[0].protocolHash).toBe('h1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/repositories/issues-schema.repo.test.ts`
Expected: FAIL（`issues` 等导出不存在 / 表不存在）。

- [ ] **Step 3: 改 schema**

在 `db/schema.ts` 中：

(a) `runs` 表 `baselineRunId` 那一列之后加：

```ts
  // 协议指纹（spec 2026-10-09 §5.3）：市场、品类、语言、竞品、别名、目标关键词、已确认竞品、引擎、提问模板版本的哈希。
  // 指纹相同的两次体检，抽样指标才可比；旧体检为空。
  protocolHash: text('protocol_hash'),
```

(b) 在 `findings` 表定义之前加导出类型：

```ts
// 发现明细（spec 2026-10-09 §6.4）：受影响规模 + 最多 20 行「页面 / 字段 / 现在 / 应该」。
// 规则命中里没有的值如实为 null（关键词、平台类明细没有页面；多数规则没给「应该」），不编造。
export interface FindingDetailRow {
  url: string | null
  field: string
  current: string | null
  expected: string | null
}
export interface FindingDetailJson {
  scale: { affected: number | null; total?: number | null }
  rows: FindingDetailRow[]
  truncated: boolean
}
```

并在 `findings` 表 `ruleConfigVersion` 列之后加：

```ts
  // 统一明细（spec 2026-10-09 §6.4）；旧发现为空。
  detail: text('detail', { mode: 'json' }).$type<FindingDetailJson>(),
```

(c) 在 `recommendations` 表定义结束之后、`generatedPrompts` 之前加三张表：

```ts
// —— 以问题为中心的闭环：问题台账（spec 2026-10-09 §6）——
// 项目级问题：项目 + 问题指纹唯一。决定 / 执行由人写，检测由体检对账写，展示状态由二者推出后落库便于筛选。
export const issues = sqliteTable('issues', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  ruleId: text('rule_id').notNull(),
  ruleVersion: integer('rule_version').notNull().default(1),
  pillar: text('pillar'),
  side: text('side').notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  affectedCount: integer('affected_count'),
  latestFindingId: text('latest_finding_id').references(() => findings.id, { onDelete: 'set null' }),
  decision: text('decision').notNull().default('pending'),
  decisionReason: text('decision_reason'),
  decidedAt: text('decided_at'),
  // 预留站主自助（spec D2）：现在只写 operator。
  decidedBy: text('decided_by'),
  executedAt: text('executed_at'),
  executedNote: text('executed_note'),
  executedBy: text('executed_by'),
  detection: text('detection').notNull().default('present'),
  status: text('status').notNull().default('pending'),
  flags: text('flags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  unverifiedReason: text('unverified_reason'),
  retiredReason: text('retired_reason'),
  protocolHash: text('protocol_hash'),
  firstSeenRunId: text('first_seen_run_id').references(() => runs.id, { onDelete: 'set null' }),
  lastSeenRunId: text('last_seen_run_id').references(() => runs.id, { onDelete: 'set null' }),
  lastCheckedRunId: text('last_checked_run_id').references(() => runs.id, { onDelete: 'set null' }),
  // 最近一次真正查过本问题的体检的开始时间：判断「执行之后开始的体检」（spec 4.4-2）。
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('issues_project_fingerprint').on(t.projectId, t.fingerprint),
  check('issues_severity', sql`${t.severity} in ('high','mid','ok')`),
  check('issues_decision', sql`${t.decision} in ('pending','included','deferred','false_positive')`),
  check('issues_detection', sql`${t.detection} in ('present','gone')`),
  check('issues_status', sql`${t.status} in ('pending','to_execute','executed_awaiting','fixed','not_effective','self_resolved','excluded','retired')`),
  check('issues_decided_by', sql`${t.decidedBy} is null or ${t.decidedBy} in ('operator','owner')`),
  check('issues_executed_by', sql`${t.executedBy} is null or ${t.executedBy} in ('operator','owner')`),
  check('issues_unverified_reason', sql`${t.unverifiedReason} is null or ${t.unverifiedReason} in ('data_gap','site_condition','unsupported','error','history_no_ledger')`),
  check('issues_retired_reason', sql`${t.retiredReason} is null or ${t.retiredReason} in ('protocol_changed','rule_changed')`),
  check('issues_reason_required', sql`${t.decision} not in ('deferred','false_positive') or length(trim(coalesce(${t.decisionReason}, ''))) > 0`),
  check('issues_exec_requires_included', sql`${t.executedAt} is null or ${t.decision} = 'included'`),
])

// 问题变化记录：只追加（仓储层不提供改删；observed 记录按 id 幂等覆盖，供同一体检的重算使用）。
export const issueEvents = sqliteTable('issue_events', {
  id: text('id').primaryKey(),
  issueId: text('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  checked: integer('checked', { mode: 'boolean' }),
  hit: integer('hit', { mode: 'boolean' }),
  severity: text('severity'),
  affectedCount: integer('affected_count'),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  flags: text('flags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  note: text('note'),
  actor: text('actor').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  check('iev_kind', sql`${t.kind} in ('observed','decision','execution')`),
  check('iev_actor', sql`${t.actor} in ('system','operator','owner')`),
])

// 检查台账：每次体检每条规则一行（spec 2026-10-09 §5.1-1）。
export const checkResults = sqliteTable('check_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  ruleId: text('rule_id').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  outcome: text('outcome').notNull(),
  reasonKind: text('reason_kind'),
  reason: text('reason'),
  hitCount: integer('hit_count').notNull().default(0),
}, (t) => [
  uniqueIndex('check_results_run_rule').on(t.runId, t.ruleId),
  check('chk_outcome', sql`${t.outcome} in ('hit','clear','not_checked','error')`),
  check('chk_reason_kind', sql`${t.reasonKind} is null or ${t.reasonKind} in ('data_gap','site_condition','unsupported','error')`),
  check('chk_not_checked_reason', sql`${t.outcome} <> 'not_checked' or ${t.reasonKind} is not null`),
])
```

(d) `generatedPrompts` 表 `recommendationId` 列之后加：

```ts
  // 问题闸门（spec 2026-10-09 §6.4）：提示词归属的问题；旧记录为空。
  issueId: text('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
```

- [ ] **Step 4: 生成迁移并人工核对**

Run: `LIBSQL_URL=file:./veris.db pnpm exec drizzle-kit generate --name issue_ledger`
Expected: 生成 `db/migrations/0019_issue_ledger.sql`，journal 增加 idx 19。

打开 SQL 核对：
- 三个 `CREATE TABLE` 里的外键都带 `ON DELETE`（cascade / set null 与 schema 一致）。
- `generated_prompts` 的 `ALTER TABLE ... ADD issue_id ... REFERENCES issues(id)` **没有** `ON DELETE` 子句时，手工改为：

```sql
ALTER TABLE `generated_prompts` ADD `issue_id` text REFERENCES issues(id) ON DELETE cascade;
```

并在文件顶部加注释：`-- drizzle-kit 为 SQLite 生成 ADD COLUMN 时丢掉了 ON DELETE（快照里是 cascade），这里手动补齐。`
- 不得出现对 `runs` / `findings` / `generated_prompts` 的整表重建（`__new_` 临时表）。若出现，说明 schema 改了既有约束，回到 Step 3 检查。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run lib/repositories/issues-schema.repo.test.ts lib/repositories/runs-baseline.repo.test.ts lib/repositories/sp-a-migration.repo.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add db/schema.ts db/migrations/0019_issue_ledger.sql db/migrations/meta lib/repositories/issues-schema.repo.test.ts
git commit -m "feat(db): 问题台账三张表与 0019 迁移（issues / issue_events / check_results）"
```

---

### Task 2: 数据源键、规则元数据（版本号 + 依赖数据源）与版本快照守卫

**Files:**
- Create: `lib/diagnosis/sources.ts`、`lib/diagnosis/sources.test.ts`
- Create: `lib/diagnosis/rules/rule-meta.ts`
- Modify: `lib/diagnosis/types.ts`（`Rule` 接口：`requiredSources` 改为强类型，新增 `version`）
- Modify: `lib/diagnosis/rules/index.ts`（`allRules` 合并元数据）
- Create: `lib/diagnosis/rules/rule-meta.test.ts`、`lib/diagnosis/rules/rule-versions.snapshot.json`

**Interfaces:**
- Produces:
  - `type SourceKey = 'entry' | 'crawl' | 'render' | 'psi' | 'gsc' | 'ai_probe' | 'ua_probe' | 'dataforseo:seed_serp' | 'dataforseo:labs' | 'dataforseo:backlinks' | 'dataforseo:bing_index' | 'dataforseo:brand_serp' | 'third_party:wikipedia' | 'third_party:reddit' | 'social_presence:youtube' | 'social_presence:g2' | 'social_presence:trustpilot' | 'social_presence:capterra' | 'confirmed_competitors'`
  - `type SourceRequirement = SourceKey | SourceKey[]`（数组 = 其中任一可用即可）
  - `availableSources(rows: { sourceKey: string; status: string; capturedEvidenceCount: number }[], opts: { confirmedCompetitorCount: number }): Set<SourceKey>`
  - `unmetRequirements(reqs: SourceRequirement[], available: Set<SourceKey>): SourceRequirement[]`
  - `PROTOCOL_SOURCES: ReadonlySet<SourceKey>`、`isProtocolBound(reqs: SourceRequirement[]): boolean`、`protocolBoundRuleIds(rules: Rule[]): Set<string>`
  - `RULE_META: Record<string, { version: number; requiredSources: SourceRequirement[] }>`
  - `Rule.version: number`、`Rule.requiredSources: SourceRequirement[]`（`allRules` 中每条规则必有）

依赖表的依据：只读代理逐条读 87 条规则后整理的「ctx 字段 → 数据源」对照（入口页抓取没有 `data_source_statuses` 行，记作伪数据源 `entry`，恒可用；已确认竞品记作伪数据源 `confirmed_competitors`）。只列「缺了就无法评估」的硬依赖；「有更好、没有也能判」的可选数据源不列。

- [ ] **Step 1: 写数据源判定的失败测试**

Create `lib/diagnosis/sources.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { availableSources, unmetRequirements, isProtocolBound } from './sources'

// 形状取自真实库 run_188896f4 的 data_source_statuses（10-06 体检）。
const realRows = [
  { sourceKey: 'ai_probe', status: 'collected', capturedEvidenceCount: 30 },
  { sourceKey: 'aio', status: 'partial', capturedEvidenceCount: 18 },
  { sourceKey: 'crawl', status: 'collected', capturedEvidenceCount: 21 },
  { sourceKey: 'dataforseo:labs', status: 'collected', capturedEvidenceCount: 1 },
  { sourceKey: 'dataforseo:seed_serp', status: 'collected', capturedEvidenceCount: 1 },
  { sourceKey: 'google_cse', status: 'not_configured', capturedEvidenceCount: 0 },
  { sourceKey: 'gsc', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'psi', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'render', status: 'partial', capturedEvidenceCount: 0 },
  { sourceKey: 'third_party:reddit', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'third_party:wikipedia', status: 'collected', capturedEvidenceCount: 1 },
]

describe('availableSources', () => {
  const avail = availableSources(realRows, { confirmedCompetitorCount: 0 })

  it('collected 可用；failed / not_configured 不可用', () => {
    expect(avail.has('crawl')).toBe(true)
    expect(avail.has('gsc')).toBe(false)
    expect(avail.has('psi')).toBe(false)
  })

  it('partial 且采到证据才可用：render partial + 0 条不可用（Review Focus 1）', () => {
    expect(avail.has('render')).toBe(false)
  })

  it('没有状态行的数据源不可用（社媒没配置时连子键行都没有）', () => {
    expect(avail.has('social_presence:youtube')).toBe(false)
  })

  it('入口页恒可用；已确认竞品按数量判定', () => {
    expect(avail.has('entry')).toBe(true)
    expect(avail.has('confirmed_competitors')).toBe(false)
    expect(availableSources(realRows, { confirmedCompetitorCount: 2 }).has('confirmed_competitors')).toBe(true)
  })
})

describe('unmetRequirements', () => {
  const avail = availableSources(realRows, { confirmedCompetitorCount: 0 })
  it('全部满足 → 空', () => {
    expect(unmetRequirements(['crawl', 'entry'], avail)).toEqual([])
  })
  it('缺一个就列出来', () => {
    expect(unmetRequirements(['crawl', 'gsc'], avail)).toEqual(['gsc'])
  })
  it('任一组：组内有一个可用即满足，全不可用时整组列出', () => {
    expect(unmetRequirements([['gsc', 'dataforseo:seed_serp']], avail)).toEqual([])
    expect(unmetRequirements([['gsc', 'psi']], avail)).toEqual([['gsc', 'psi']])
  })
})

describe('isProtocolBound', () => {
  it('依赖 AI 探针、已确认竞品、种子词 SERP / Labs 的规则受协议约束；任一组不计', () => {
    expect(isProtocolBound(['ai_probe'])).toBe(true)
    expect(isProtocolBound(['dataforseo:seed_serp', 'confirmed_competitors'])).toBe(true)
    expect(isProtocolBound(['crawl'])).toBe(false)
    expect(isProtocolBound([['gsc', 'dataforseo:seed_serp']])).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/sources.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 sources.ts，并把 `Rule` 接口改为强类型**

Create `lib/diagnosis/sources.ts`:

```ts
import type { Rule } from './types'

// 规则依赖的数据源键（spec 2026-10-09 §5.1-1）。取值对齐 data_source_statuses.source_key（含 dataforseo:* 等子键），
// 另有两个伪数据源：entry（入口页抓取，没有状态行，失败会让整轮采集失败，故恒可用）、confirmed_competitors（已确认竞品）。
export type SourceKey =
  | 'entry'
  | 'crawl'
  | 'render'
  | 'psi'
  | 'gsc'
  | 'ai_probe'
  | 'ua_probe'
  | 'dataforseo:seed_serp'
  | 'dataforseo:labs'
  | 'dataforseo:backlinks'
  | 'dataforseo:bing_index'
  | 'dataforseo:brand_serp'
  | 'third_party:wikipedia'
  | 'third_party:reddit'
  | 'social_presence:youtube'
  | 'social_presence:g2'
  | 'social_presence:trustpilot'
  | 'social_presence:capterra'
  | 'confirmed_competitors'

// 数组 = 「其中任一可用即可」。
export type SourceRequirement = SourceKey | SourceKey[]

export interface SourceStatusLike {
  sourceKey: string
  status: string
  capturedEvidenceCount: number
}

// 可用 = collected，或 partial 且确实采到证据（render 自动降级时是 partial + 0 条，不能当可用）。
export function availableSources(rows: SourceStatusLike[], opts: { confirmedCompetitorCount: number }): Set<SourceKey> {
  const out = new Set<SourceKey>(['entry'])
  for (const r of rows) {
    if (r.status === 'collected' || (r.status === 'partial' && r.capturedEvidenceCount > 0)) out.add(r.sourceKey as SourceKey)
  }
  if (opts.confirmedCompetitorCount > 0) out.add('confirmed_competitors')
  return out
}

export function unmetRequirements(reqs: SourceRequirement[], available: Set<SourceKey>): SourceRequirement[] {
  return reqs.filter((r) => (Array.isArray(r) ? !r.some((k) => available.has(k)) : !available.has(r)))
}

// 协议相关数据源：结论随检测协议（AI 提问集、已确认竞品、种子词）变化，换协议后不能拿来判「已修复」（spec 4.4-6）。
export const PROTOCOL_SOURCES: ReadonlySet<SourceKey> = new Set<SourceKey>([
  'ai_probe',
  'confirmed_competitors',
  'dataforseo:seed_serp',
  'dataforseo:labs',
])

// 只看必需项（单键）；任一组不计——组内总有不受协议约束的替代来源。
export function isProtocolBound(reqs: SourceRequirement[]): boolean {
  return reqs.some((r) => !Array.isArray(r) && PROTOCOL_SOURCES.has(r))
}

export function protocolBoundRuleIds(rules: Rule[]): Set<string> {
  return new Set(rules.filter((r) => isProtocolBound(r.requiredSources)).map((r) => r.id))
}
```

在 `lib/diagnosis/types.ts` 的 `Rule` 接口里：
- 把 `requiredSources?: string[]` 改为 `requiredSources: SourceRequirement[]`；
- 在 `id: string` 之后加一行 `version: number`（注释：`// 规则判定逻辑版本（spec 2026-10-09 §6.4）：改哪条规则只升那一条，见 rules/rule-meta.ts。`）；
- 文件顶部加 `import type { SourceRequirement } from './sources'`。

> 各规则文件里的规则对象是用 `const X: Rule = {...}` 声明的，接口加了必填字段后会报类型错误。为不逐个改 13 个规则文件，把规则文件里的注解改成 `RuleDef`：在 `types.ts` 里加
> `export type RuleDef = Omit<Rule, 'version' | 'requiredSources'>`，
> 然后对 `lib/diagnosis/rules/*.ts`（不含测试）执行文本替换 `: Rule = {` → `: RuleDef = {`、`): Rule {` → `): RuleDef {`、`Rule[]` → `RuleDef[]`（导出数组的注解），并把对应 `import type { Rule, ...}` 改为 `import type { RuleDef, ...}`。替换后 `pnpm exec tsc --noEmit` 指出的剩余位置逐个改成 `RuleDef`。
> 测试文件里手写的 `Rule` 对象（例如 `engine.test.ts`、`lib/inngest/*.test.ts` 里的假规则）同样会报缺字段：能改注解为 `RuleDef` 的改注解；必须是 `Rule` 的（传给 `evaluateRules` / `evaluateRulesWithLedger` 的）补上 `version: 1, requiredSources: ['crawl']`。以 tsc 输出为准，不改测试断言。

- [ ] **Step 4: 跑数据源测试确认通过**

Run: `pnpm vitest run lib/diagnosis/sources.test.ts`
Expected: PASS

- [ ] **Step 5: 写规则元数据的失败测试**

Create `lib/diagnosis/rules/rule-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { allRules } from './index'
import { RULE_META } from './rule-meta'
import { protocolBoundRuleIds } from '../sources'

const SNAPSHOT = 'lib/diagnosis/rules/rule-versions.snapshot.json'
type Snapshot = Record<string, Record<string, string>> // 规则 id → { 版本号 → 判定代码哈希 }
const codeHash = (fn: unknown) => createHash('sha256').update(String(fn)).digest('hex').slice(0, 16)

describe('规则元数据（spec 2026-10-09 §6.4）', () => {
  it('87 条注册规则都有元数据，且没有多余的元数据', () => {
    const ids = allRules.map((r) => r.id).sort()
    expect(ids).toHaveLength(87)
    expect(Object.keys(RULE_META).sort()).toEqual(ids)
  })

  it('allRules 上的 version 与 requiredSources 来自元数据', () => {
    for (const r of allRules) {
      expect(r.version).toBe(RULE_META[r.id].version)
      expect(r.requiredSources).toEqual(RULE_META[r.id].requiredSources)
      expect(r.requiredSources.length).toBeGreaterThan(0)
    }
  })

  it('受协议约束的规则正好是依赖 AI 探针 / 已确认竞品 / 种子词数据的那些', () => {
    expect([...protocolBoundRuleIds(allRules)].sort()).toEqual(
      ['E03', 'G05', 'G06', 'G09', 'G10', 'G11', 'K03', 'K04', 'K07', 'Q01', 'Q02', 'Q03'].sort(),
    )
  })

  // 版本守卫：判定代码变了必须升版本（spec §9 风险 2）。快照按版本只追加：
  // UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts 只会为「新版本号」写入哈希，
  // 已有版本号的哈希不同则直接失败——改了代码却没升版本，重新生成快照也过不了。
  // 局限：工厂函数生成的规则（AR01–AR05 等）闭包里的参数变化看不出来，改这类参数要人工升版本。
  it('判定代码与版本快照一致', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot
    const update = process.env.UPDATE_RULE_SNAPSHOT === '1'
    const problems: string[] = []
    for (const r of allRules) {
      const h = codeHash(r.evaluate)
      const byVersion = (snap[r.id] ??= {})
      const recorded = byVersion[String(r.version)]
      if (recorded === undefined) {
        if (update) byVersion[String(r.version)] = h
        else problems.push(`${r.id} v${r.version} 没有快照：运行 UPDATE_RULE_SNAPSHOT=1 pnpm vitest run ${SNAPSHOT.replace('.snapshot.json', '').replace('rule-versions', 'rule-meta.test.ts')}`)
      } else if (recorded !== h) {
        problems.push(`${r.id} 的判定代码变了，但版本仍是 v${r.version}：在 rule-meta.ts 把它升到 v${r.version + 1}，再按上面的命令更新快照`)
      }
    }
    if (update) writeFileSync(SNAPSHOT, `${JSON.stringify(snap, null, 2)}\n`)
    expect(problems).toEqual([])
  })
})
```

Create `lib/diagnosis/rules/rule-versions.snapshot.json`，内容为 `{}`。

- [ ] **Step 6: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts`
Expected: FAIL（`./rule-meta` 不存在）。

- [ ] **Step 7: 实现 RULE_META 并在注册表合并**

Create `lib/diagnosis/rules/rule-meta.ts`:

```ts
import type { SourceRequirement } from '../sources'

// 规则元数据（spec 2026-10-09 §6.4）：判定逻辑版本 + 必需数据源。
// version：改哪条规则的判定就只升那一条（rule-meta.test.ts 的快照守卫会拦住忘记升版本）。
// requiredSources：缺了就无法评估的硬依赖；数组元素为数组时表示「其中任一可用即可」。
// 依据：2026-10-09 只读代理逐条核对 87 条规则读取的 ctx 字段（见计划 Task 2 说明）。
type Meta = { version: number; requiredSources: SourceRequirement[] }
const v1 = (...requiredSources: SourceRequirement[]): Meta => ({ version: 1, requiredSources })

export const RULE_META: Record<string, Meta> = {
  // technical.ts
  T01: v1('entry'),
  T02: v1('crawl'),
  T03: v1('crawl'),
  T04: v1('crawl'),
  T05: v1('crawl'),
  T07: v1('crawl'),
  T10: v1('render'),
  T11: v1('crawl'),
  T12: v1('crawl'),
  T06: v1('crawl'),
  T08: v1('crawl'),
  T13: v1('crawl'),
  T14: v1('crawl'),
  T15: v1('crawl', 'gsc'),
  T09a: v1('psi'),
  T09b: v1('psi'),
  T09c: v1('psi'),
  // links.ts
  L01: v1('crawl'),
  L02: v1('crawl'),
  L03: v1('crawl'),
  L04: v1('crawl'),
  L05: v1('crawl'),
  L06: v1('crawl'),
  L07: v1('crawl'),
  // equity.ts
  W01: v1('crawl'),
  W02: v1('crawl'),
  W03: v1('crawl'),
  W04: v1('crawl'),
  // content.ts
  C01: v1('entry'),
  C02: v1('entry'),
  C03: v1('entry'),
  C05a: v1('entry'),
  C04: v1('crawl'),
  C05b: v1('entry'),
  C05c: v1('entry'),
  C05d: v1('render', 'entry'),
  C06: v1('entry'),
  C07: v1('entry'),
  C08: v1('entry'),
  C10: v1('crawl'),
  C09: v1('crawl'),
  C11: v1('crawl'),
  TA01: v1('crawl'),
  TA02: v1('crawl'),
  // eeat.ts
  AR01: v1('crawl'),
  AR02: v1('crawl'),
  AR03: v1('crawl'),
  AR04: v1('crawl'),
  AR05: v1('crawl'),
  TR06: v1('crawl'),
  SO01: v1('crawl'),
  SO02: v1('crawl', 'entry'),
  // geo.ts
  G03: v1('render'),
  G05: v1('ai_probe'),
  G06: v1('ai_probe'),
  G01: v1('entry'),
  E01: v1('entry'),
  G02: v1('ua_probe'),
  G07: v1('third_party:wikipedia', 'third_party:reddit'),
  G08: v1('ua_probe'),
  G09: v1('ai_probe'),
  G10: v1('ai_probe'),
  G11: v1('ai_probe'),
  // keywords.ts
  K01: v1('gsc'),
  K02: v1('gsc'),
  K06: v1('gsc'),
  K03: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  K04: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  K05: v1('dataforseo:brand_serp'),
  K07: v1('dataforseo:seed_serp', 'dataforseo:labs'),
  IPF01: v1(['gsc', 'dataforseo:seed_serp']),
  IPF02: v1('gsc'),
  IPF03: v1(['gsc', 'dataforseo:seed_serp']),
  IPF04: v1('crawl', ['gsc', 'dataforseo:seed_serp']),
  // competitors.ts
  Q01: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  Q02: v1('ai_probe', 'confirmed_competitors'),
  Q03: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  // authority.ts
  A01: v1('dataforseo:backlinks'),
  A02: v1('dataforseo:backlinks'),
  A03: v1('dataforseo:backlinks'),
  G04: v1('dataforseo:bing_index'),
  E02: v1('dataforseo:brand_serp'),
  E03: v1('dataforseo:labs', 'confirmed_competitors'),
  // trust.ts
  TR04: v1('crawl', 'entry'),
  TR05: v1('crawl', 'entry'),
  // reputation.ts
  SP01: v1('social_presence:youtube'),
  SP02: v1('social_presence:g2', 'social_presence:trustpilot', 'social_presence:capterra'),
}
```

在 `lib/diagnosis/rules/index.ts`：
- 加 `import { RULE_META } from './rule-meta'`，并把 `import type { Rule } from '../types'` 改为 `import type { Rule, RuleDef } from '../types'`；
- `const registeredRules: Rule[]` 改为 `const registeredRules: RuleDef[]`；
- 把 `allRules` 的构造改为：

```ts
export const allRules: Rule[] = registeredRules.map((rule) => {
  const meta = RULE_META[rule.id]
  if (!meta) throw new Error(`rule_meta_missing:${rule.id}`)
  return {
    ...rule,
    version: meta.version,
    requiredSources: meta.requiredSources,
    workflowStepIds: rule.workflowStepIds ?? [defaultWorkflowStep(rule)],
    knowledgeVersionRefs: rule.knowledgeVersionRefs ?? [`knowledge_legacy_${rule.id.toLowerCase()}_v1`],
  }
})
```

（`defaultWorkflowStep` 的参数类型改为 `RuleDef`。）

- [ ] **Step 8: 生成首份版本快照并跑测试**

Run: `UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts && pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts`
Expected: 两次都 PASS；`rule-versions.snapshot.json` 有 87 个键，每个键下只有 `"1"`。

再做一次阳性对照：临时在 `lib/diagnosis/rules/technical.ts` 的 T02 判定里加一个空语句 `void 0`，跑 `pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts`，Expected: FAIL，提示「T02 的判定代码变了，但版本仍是 v1」；然后撤销这个改动（`git checkout lib/diagnosis/rules/technical.ts`）。

- [ ] **Step 9: 全量规则与引擎测试 + 类型检查**

Run: `pnpm vitest run lib/diagnosis && pnpm exec tsc --noEmit`
Expected: PASS，tsc 无输出。

- [ ] **Step 10: 提交**

```bash
git add lib/diagnosis/sources.ts lib/diagnosis/sources.test.ts lib/diagnosis/types.ts lib/diagnosis/rules
git commit -m "feat(diagnosis): 规则元数据——版本号、必需数据源与版本快照守卫"
```

---

### Task 3: 检查台账——引擎求值时同时记下每条规则查了没有

**Files:**
- Modify: `lib/diagnosis/types.ts`（新增「未检查」哨兵与 `RuleEvaluation`）
- Modify: `lib/diagnosis/engine.ts`（导出 `stamp`；`evaluateRules` 忽略哨兵）
- Create: `lib/diagnosis/check-ledger.ts`、`lib/diagnosis/check-ledger.test.ts`
- Modify（规则内部门槛改为返回「未检查」）：`lib/diagnosis/rules/eeat.ts`、`lib/diagnosis/rules/links.ts`、`lib/diagnosis/rules/equity.ts`、`lib/diagnosis/rules/technical.ts`、`lib/diagnosis/rules/geo.ts`、`lib/diagnosis/rules/authority.ts`，以及它们同名的 `*.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Rule.version`、`Rule.requiredSources`、`unmetRequirements`。
- Produces:
  - `interface NotChecked { notChecked: true; kind: 'data_gap' | 'site_condition' | 'unsupported'; reason: string }`、`notChecked(kind, reason): NotChecked`、`isNotChecked(x): x is NotChecked`
  - `type RuleEvaluation = RuleHitDraft | RuleHitDraft[] | NotChecked | null`
  - `interface LedgerRow { ruleId: string; ruleVersion: number; outcome: 'hit' | 'clear' | 'not_checked' | 'error'; reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null; reason: string | null; hitCount: number }`
  - `evaluateRulesWithLedger(ctx: RuleContext, rules: Rule[], available: Set<SourceKey>): { hits: RuleHit[]; ledger: LedgerRow[] }`

**哪些门槛改成「未检查」**（规格 §5.1-1：「规则自身门槛不满足 → 规则显式返回未检查」）。只改「数据不够、无法判断」的门槛；「这个站根本不存在该问题」的适用性门槛（如单语言站没有 hreflang、非电商站没有配送页）保持返回 `null`，记为「没查出」：

| 规则 | 位置 | 现在 | 改为 |
|---|---|---|---|
| AR01–AR05 | `eeat.ts` `articlesOf`（文章页 < 3）与 `shareRule` 内 `population.length < minPopulation` | `return null` | `notChecked('site_condition', '文章页少于 3 篇，无法评估')` / `notChecked('site_condition', '符合条件的文章少于 N 篇，无法评估')` |
| TR06、SO01、SO02 | `eeat.ts` `graphOf`：没有链接图谱 / 入口页零站内出链 | `return null` | 没有图谱：`notChecked('unsupported', '旧证据没有链接图谱')`；零出链：`notChecked('site_condition', '入口页没有可抓取的站内链接（多为 JS 渲染导航），无法评估')` |
| L01–L07 | `links.ts` `integrity`：`analyzeLinkIntegrity` 返回空 | `return null` | `notChecked('site_condition', '没有链接图谱或入口页零站内出链，无法评估')` |
| W01–W04 | `equity.ts` `equityOf`：`analyzeLinkEquity` 返回空 | `return null` | `notChecked('site_condition', '没有链接图谱、入口页零出链或已抓 HTML 页少于 10，无法评估')` |
| T05 | `technical.ts` 约 263 行：入口页零站内出链 | `return null` | `notChecked('site_condition', '入口页没有可抓取的站内链接，孤岛判定不可信')` |
| T11 | `technical.ts` 约 342 行之前 | （无此判断） | 新增：没有任何 `isKeyPage` 页 → `notChecked('site_condition', '没有标记重点页，无法评估')` |
| G06 | `geo.ts` 约 151 行：没有联网检索引擎 | `return null` | `notChecked('data_gap', '没有支持联网检索的 AI 引擎')` |
| G10 | `geo.ts` 约 378 行：品牌提问回答 < 3 | `return null` | `notChecked('site_condition', '品牌提问的回答少于 3 条，无法评估')` |
| G11 | `geo.ts` 约 415 行：`ugcCitationShare === null` | `return null` | `notChecked('data_gap', '本轮 AI 引擎没有返回引用来源')`（`< 阈值` 的分支仍返回 `null`） |
| A02 | `authority.ts` 约 105 行：`anchors.length === 0` | `return null` | `notChecked('unsupported', '本期未采集外链锚文本')`（`!ownBl` 仍返回 `null`，由数据源依赖兜底） |
| A03 | `authority.ts` 约 148 行：`!ownBl.newLost` | `return null` | `notChecked('unsupported', '本期未采集新增/丢失外链')`（`!ownBl` 仍返回 `null`） |

- [ ] **Step 1: 写台账的失败测试**

Create `lib/diagnosis/check-ledger.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateRulesWithLedger } from './check-ledger'
import { notChecked, type Rule, type RuleContext, type RuleHitDraft } from './types'
import type { SourceKey } from './sources'

const ctx = {} as RuleContext
const draft = (over: Partial<RuleHitDraft> = {}): RuleHitDraft => ({ title: 't', description: 'd', evidenceRefs: ['ev_1'], scope: 'site', ...over })
const rule = (id: string, evaluate: Rule['evaluate'], requiredSources: Rule['requiredSources'] = ['crawl'], version = 1): Rule => ({
  id, version, requiredSources, pillar: 'P1', side: 'technical', severity: 'warning', claimType: 'measured_hard', evaluate,
})
const avail = (...keys: SourceKey[]) => new Set<SourceKey>(['entry', ...keys])

describe('evaluateRulesWithLedger', () => {
  it('命中 → hit，带命中数与规则版本；命中被盖上 ruleId 与指纹', () => {
    const { hits, ledger } = evaluateRulesWithLedger(ctx, [rule('T02', () => [draft(), draft({ scope: 'x' })], ['crawl'], 3)], avail('crawl'))
    expect(ledger).toEqual([{ ruleId: 'T02', ruleVersion: 3, outcome: 'hit', reasonKind: null, reason: null, hitCount: 2 }])
    expect(hits.map((h) => h.ruleId)).toEqual(['T02', 'T02'])
    expect(hits[0].fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('返回空 → clear', () => {
    expect(evaluateRulesWithLedger(ctx, [rule('T03', () => null)], avail('crawl')).ledger[0]).toMatchObject({ outcome: 'clear', hitCount: 0 })
  })

  it('必需数据源不可用 → not_checked / data_gap，且不执行规则', () => {
    let called = false
    const { ledger } = evaluateRulesWithLedger(ctx, [rule('T15', () => { called = true; return draft() }, ['crawl', 'gsc'])], avail('crawl'))
    expect(called).toBe(false)
    expect(ledger[0]).toMatchObject({ outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：gsc' })
  })

  it('任一组全部不可用 → 原因里列出整组', () => {
    const { ledger } = evaluateRulesWithLedger(ctx, [rule('IPF01', () => null, [['gsc', 'dataforseo:seed_serp']])], avail())
    expect(ledger[0].reason).toBe('缺数据源：gsc 或 dataforseo:seed_serp')
  })

  it('规则返回「未检查」哨兵 → not_checked，带规则给的类别与原因', () => {
    const { ledger, hits } = evaluateRulesWithLedger(ctx, [rule('AR01', () => notChecked('site_condition', '文章页少于 3 篇，无法评估'))], avail('crawl'))
    expect(hits).toEqual([])
    expect(ledger[0]).toMatchObject({ outcome: 'not_checked', reasonKind: 'site_condition', reason: '文章页少于 3 篇，无法评估' })
  })

  it('规则抛错 → error，不沉没其他规则（Review Focus 5）', () => {
    const { ledger, hits } = evaluateRulesWithLedger(
      ctx,
      [rule('T04', () => { throw new Error('boom') }), rule('T05', () => draft())],
      avail('crawl'),
    )
    expect(ledger[0]).toMatchObject({ ruleId: 'T04', outcome: 'error', reasonKind: 'error', reason: 'boom' })
    expect(ledger[1]).toMatchObject({ ruleId: 'T05', outcome: 'hit' })
    expect(hits).toHaveLength(1)
  })

  it('命中全部证据引用为空被丢弃 → error；部分为空 → hit，只算有效命中', () => {
    const allEmpty = evaluateRulesWithLedger(ctx, [rule('C04', () => [draft({ evidenceRefs: [] })])], avail('crawl'))
    expect(allEmpty.ledger[0]).toMatchObject({ outcome: 'error', reasonKind: 'error', reason: 'empty_evidence_refs' })
    expect(allEmpty.hits).toEqual([])
    const someEmpty = evaluateRulesWithLedger(ctx, [rule('C09', () => [draft({ evidenceRefs: [''] }), draft()])], avail('crawl'))
    expect(someEmpty.ledger[0]).toMatchObject({ outcome: 'hit', hitCount: 1 })
  })

  it('每条规则恰好一行台账，顺序与规则顺序一致', () => {
    const rules = [rule('A', () => null), rule('B', () => draft()), rule('C', () => null, ['gsc'])]
    expect(evaluateRulesWithLedger(ctx, rules, avail('crawl')).ledger.map((l) => l.ruleId)).toEqual(['A', 'B', 'C'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/check-ledger.test.ts`
Expected: FAIL（模块与 `notChecked` 不存在）。

- [ ] **Step 3: 实现哨兵、引擎改动与台账**

在 `lib/diagnosis/types.ts` 的 `RuleHit` 接口之后加：

```ts
// 「未检查」哨兵（spec 2026-10-09 §5.1-1）：规则自身门槛不满足、数据不够判断时显式返回它，
// 与「返回 null = 在范围内没查出问题」区分开。外层的数据源缺失由引擎按 requiredSources 统一判定。
export interface NotChecked {
  notChecked: true
  kind: 'data_gap' | 'site_condition' | 'unsupported'
  reason: string
}
export const notChecked = (kind: NotChecked['kind'], reason: string): NotChecked => ({ notChecked: true, kind, reason })
export const isNotChecked = (x: unknown): x is NotChecked =>
  typeof x === 'object' && x !== null && (x as { notChecked?: unknown }).notChecked === true

export type RuleEvaluation = RuleHitDraft | RuleHitDraft[] | NotChecked | null
```

并把 `Rule.evaluate` 的返回类型改为 `RuleEvaluation`。

`lib/diagnosis/engine.ts`：把 `function stamp(` 改为 `export function stamp(`；在 `evaluateRules` 里 `let out: RuleHitDraft | RuleHitDraft[] | null = null` 改为 `let out: RuleEvaluation = null`，并在 `if (!out) continue` 之后加 `if (isNotChecked(out)) continue`（import `isNotChecked`、`RuleEvaluation`）。

Create `lib/diagnosis/check-ledger.ts`:

```ts
import { stamp } from './engine'
import { unmetRequirements, type SourceKey } from './sources'
import { isNotChecked, type Rule, type RuleContext, type RuleEvaluation, type RuleHit } from './types'

export interface LedgerRow {
  ruleId: string
  ruleVersion: number
  outcome: 'hit' | 'clear' | 'not_checked' | 'error'
  reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null
  reason: string | null
  hitCount: number
}

const describeUnmet = (reqs: ReturnType<typeof unmetRequirements>) =>
  `缺数据源：${reqs.map((r) => (Array.isArray(r) ? r.join(' 或 ') : r)).join('、')}`

// 检查台账（spec 2026-10-09 §5.1-1）：每条规则一行。数据源缺失时不执行规则；
// 规则抛错记 error；命中全部因证据引用为空被丢弃也记 error（不能当成「没查出」）。
export function evaluateRulesWithLedger(
  ctx: RuleContext,
  rules: Rule[],
  available: Set<SourceKey>,
): { hits: RuleHit[]; ledger: LedgerRow[] } {
  const hits: RuleHit[] = []
  const ledger: LedgerRow[] = []
  for (const rule of rules) {
    const row = (outcome: LedgerRow['outcome'], reasonKind: LedgerRow['reasonKind'] = null, reason: string | null = null, hitCount = 0) =>
      ledger.push({ ruleId: rule.id, ruleVersion: rule.version, outcome, reasonKind, reason, hitCount })

    const unmet = unmetRequirements(rule.requiredSources, available)
    if (unmet.length) {
      row('not_checked', 'data_gap', describeUnmet(unmet))
      continue
    }
    let out: RuleEvaluation
    try {
      out = rule.evaluate(ctx)
    } catch (err) {
      row('error', 'error', err instanceof Error ? err.message : String(err))
      continue
    }
    if (!out) {
      row('clear')
      continue
    }
    if (isNotChecked(out)) {
      row('not_checked', out.kind, out.reason)
      continue
    }
    const drafts = Array.isArray(out) ? out : [out]
    let valid = 0
    for (const draft of drafts) {
      const refs = (draft.evidenceRefs ?? []).filter(Boolean)
      if (refs.length === 0) continue
      hits.push(stamp(rule, { ...draft, evidenceRefs: refs }))
      valid += 1
    }
    if (valid > 0) row('hit', null, null, valid)
    else if (drafts.length > 0) row('error', 'error', 'empty_evidence_refs')
    else row('clear')
  }
  return { hits, ledger }
}
```

- [ ] **Step 4: 跑台账测试确认通过**

Run: `pnpm vitest run lib/diagnosis/check-ledger.test.ts lib/diagnosis/engine.test.ts`
Expected: PASS

- [ ] **Step 5: 按上表改规则门槛（每处都是「先改测试断言 → 看失败 → 改代码」）**

对上表每一行：
1. 在对应规则文件同名的 `*.test.ts` 中找到覆盖该门槛的用例（断言 `toBeNull()`），改为断言 `toEqual(notChecked('<类别>', '<原因>'))`，原因文字与上表一字不差；若没有覆盖该门槛的用例，新增一条（夹具从同文件已有用例复制，只改出门槛条件）。
2. Run: `pnpm vitest run <该测试文件>`，Expected: FAIL（仍返回 null）。
3. 改规则代码：把该门槛的 `return null` 换成上表的 `return notChecked(...)`；涉及共用守卫（`articlesOf`、`graphOf`、`integrity`、`equityOf`）时，守卫函数的返回类型改为 `{...} | NotChecked | null`，调用处在 `if (!got) return null` 之后加 `if (isNotChecked(got)) return got`；被改规则的 `evaluate(ctx): RuleHitDraft | null` 注解改为 `evaluate(ctx): RuleEvaluation`。
4. Run 同一测试文件，Expected: PASS。

示例（`eeat.ts`）：

```ts
function articlesOf(ctx: RuleContext): { auditId: string; articles: ArticlePage[] } | NotChecked | null {
  const audit = ctx.siteAudit
  if (!audit) return null
  const articles = articlePagesOf(audit.payload.pages)
  return articles.length >= MIN_ARTICLES ? { auditId: audit.id, articles } : notChecked('site_condition', '文章页少于 3 篇，无法评估')
}
// shareRule.evaluate 内：
      const got = articlesOf(ctx)
      if (!got) return null
      if (isNotChecked(got)) return got
      const population = got.articles.filter((p) => (opts.population ? opts.population(p.article) : true))
      const minPopulation = opts.minPopulation ?? MIN_ARTICLES
      if (population.length < minPopulation) return notChecked('site_condition', `符合条件的文章少于 ${minPopulation} 篇，无法评估`)
```

示例（`technical.ts` T11，在 `if (!audit) return null` 之后插入）：

```ts
    if (!audit.payload.pages.some((p) => p.isKeyPage)) return notChecked('site_condition', '没有标记重点页，无法评估')
```

5. 本步全部改完后，按 Task 2 Step 8 的命令为改过的规则升版本：被改规则在 `rule-meta.ts` 的 `v1(...)` 改为 `{ version: 2, requiredSources: [...] }`（保留原依赖），再运行 `UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts`。涉及的规则：AR01–AR05、TR06、SO01、SO02、L01–L07、W01–W04、T05、T11、G06、G10、G11、A02、A03。

- [ ] **Step 6: 跑全部规则测试与类型检查**

Run: `pnpm vitest run lib/diagnosis && pnpm exec tsc --noEmit`
Expected: PASS，tsc 无输出。

- [ ] **Step 7: 提交**

```bash
git add lib/diagnosis
git commit -m "feat(diagnosis): 检查台账——区分没查出、没查与出错，数据不够判断的门槛显式返回未检查"
```

---

### Task 3A: T04 / C07 本站域名求错（复发陷阱「域名带协议」）

**Files:**
- Modify: `lib/diagnosis/rules/technical.ts`（`hostOf` 之后加 `projectHost`；T04 约 230 行）
- Modify: `lib/diagnosis/rules/content.ts`（C07 约 597 行）
- Modify: `lib/diagnosis/rules/technical.test.ts`、`lib/diagnosis/rules/content.test.ts`
- Modify: `lib/diagnosis/rules/rule-meta.ts`（T04、C07 升 v2）、`rule-versions.snapshot.json`

**Interfaces:**
- Produces: `projectHost(domain: string): string`（`technical.ts` 导出）

背景（已用真实库复现）：`project.domain` 存的是 `normalizeDomain` 输出的完整 URL（`https://metadocu.com/`），`hostOf(\`https://${ctx.project.domain}\`)` 得到 `'https'`。T04 的样例因此把同站 canonical 当成站外（与 `count` 不一致）；C07 把本站链接算成外链，漏报「缺引用」。

- [ ] **Step 1: 写失败测试（夹具用真实形状的 domain）**

在 `lib/diagnosis/rules/technical.test.ts` 末尾加：

```ts
describe('projectHost / T04 本站域名（复发陷阱：域名带协议）', () => {
  it('兼容 normalizeDomain 输出的完整 URL 与裸域名', () => {
    expect(projectHost('https://metadocu.com/')).toBe('metadocu.com')
    expect(projectHost('https://www.metadocu.com/')).toBe('metadocu.com')
    expect(projectHost('metadocu.com')).toBe('metadocu.com')
  })
})
```

并在已有的 T04 用例组里加一条：用该文件现有 T04 用例的夹具，把 `project.domain` 改为 `'https://example.com/'`，让 `pages` 里同时有 canonical 指向 `https://example.com/a`（同站）和 `https://other.com/a`（站外）的两页、`stats.canonicalOffsite = 1`，断言 `detail.examples` 只有站外那一页，且 `detail.count === detail.examples.length`。

在 `lib/diagnosis/rules/content.test.ts` 的 C07 用例组里加一条：`project.domain = 'https://example.com/'`，入口页正文含 `<a href="https://example.com/x">` 与 `<a href="https://other.com/y">`，断言 `detail.externalLinks === 1`。

（文件顶部 import 加 `projectHost`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/rules/technical.test.ts lib/diagnosis/rules/content.test.ts`
Expected: FAIL（`projectHost` 不存在；T04 样例含同站页；C07 外链数为 2）。

- [ ] **Step 3: 修复**

`technical.ts` 在 `hostOf` 之后加：

```ts
// 本站 host：project.domain 是 normalizeDomain 输出的完整 URL（https://host/），也兼容旧数据的裸域名。
// 规则里求本站 host 一律用它，不要就地拼 `https://`（陷阱：域名带协议，K03 / T04 / C07 三次复发）。
export function projectHost(domain: string): string {
  return hostOf(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`) ?? domain
}
```

T04 中 `const domainHost = hostOf(\`https://${ctx.project.domain}\`) ?? ctx.project.domain` 改为 `const domainHost = projectHost(ctx.project.domain)`。

`content.ts` 顶部从 `./technical` 的 import 里加上 `projectHost`，C07 中同一行改为 `const domainHost = projectHost(ctx.project.domain)`。

- [ ] **Step 4: 升版本并更新快照**

`rule-meta.ts`：`T04: { version: 2, requiredSources: ['crawl'] }`、`C07: { version: 2, requiredSources: ['entry'] }`。
Run: `UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts`

- [ ] **Step 5: 跑测试 + 收口 grep**

Run: `pnpm vitest run lib/diagnosis/rules && grep -rnE "\`https://\\$\{|'https://' *\+" lib/diagnosis --include='*.ts' --exclude='*.test.*'`
Expected: 测试 PASS；grep 无输出。

- [ ] **Step 6: 提交**

```bash
git add lib/diagnosis/rules
git commit -m "fix(rules): T04/C07 本站域名带协议时求出 https，改用 projectHost（复发陷阱）"
```

---

### Task 4: 发现明细——规则命中转成统一的「页面 / 字段 / 现在 / 应该」

**Files:**
- Create: `lib/diagnosis/finding-detail.ts`、`lib/diagnosis/finding-detail.test.ts`
- Modify: `lib/diagnosis/finding-rows.ts`（`FindingRow` 加 `detail`，`buildFindingRows` 写入）
- Modify: `lib/diagnosis/finding-rows.test.ts`（若断言了行的完整形状，补 `detail`）

**Interfaces:**
- Consumes: Task 1 的 `FindingDetailJson`、`FindingDetailRow`（`@/db/schema`）。
- Produces: `toFindingDetail(hit: Pick<RuleHit, 'ruleId' | 'scope' | 'detail'>): FindingDetailJson | null`；`FindingRow.detail: FindingDetailJson | null`；`NO_DETAIL_RULES: ReadonlySet<string>`。

依据：只读代理逐条整理的 87 条规则 `hit.detail` 键表。规则命中里本来就没有的值填 `null`，不推测。一些「现在」是规则触发条件本身决定的事实（例如 T03 触发即页面带 noindex），这类写成常量。

> 范围说明：规格 D8 要求所有问题都精确到四项。现有规则大多只给页面清单，「现在 / 应该」缺失的规则要改规则的 `detail` 产出才能补齐，这属于子项目 2 设计解决方案卡时的内容工作。本任务把规则已经给出的信息全部落成统一明细，缺口清单在交付时一并报告。

- [ ] **Step 1: 写失败测试**

Create `lib/diagnosis/finding-detail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toFindingDetail, NO_DETAIL_RULES, EXTRACTED_RULES } from './finding-detail'
import { allRules } from './rules'

const hit = (ruleId: string, detail: Record<string, unknown>, scope = 'site') => ({ ruleId, scope, detail })

describe('toFindingDetail', () => {
  it('87 条规则要么有提取器、要么明确列为没有明细，不重不漏', () => {
    const ids = allRules.map((r) => r.id).sort()
    expect([...EXTRACTED_RULES, ...NO_DETAIL_RULES].sort()).toEqual(ids)
  })

  it('T04：页面 + canonical 现值', () => {
    expect(toFindingDetail(hit('T04', { count: 1, examples: [{ url: 'https://a.com/x', canonical: 'https://b.com/x' }] }))).toEqual({
      scale: { affected: 1 },
      rows: [{ url: 'https://a.com/x', field: 'canonical', current: 'https://b.com/x', expected: null }],
      truncated: false,
    })
  })

  it('L02：改的是来源页的链接，应改为跳转后的最终地址', () => {
    const d = toFindingDetail(hit('L02', {
      count: 1, links: 2,
      examples: [{ url: 'https://a.com/old', finalUrl: 'https://a.com/new', sourceCount: 2, sources: [{ from: 'https://a.com/p1', anchor: 'x', regions: ['main'], linkedAs: '/old' }, { from: 'https://a.com/p2', anchor: 'y', regions: ['footer'] }] }],
    }))
    expect(d?.rows).toEqual([
      { url: 'https://a.com/p1', field: '链接 href', current: '/old', expected: 'https://a.com/new' },
      { url: 'https://a.com/p2', field: '链接 href', current: 'https://a.com/old', expected: 'https://a.com/new' },
    ])
  })

  it('C05c：每个缺失字段一行，超过 20 行截断并标记', () => {
    const examples = Array.from({ length: 11 }, (_, i) => ({ url: `https://a.com/p${i}`, type: 'Product', missing: ['offers', 'review'] }))
    const d = toFindingDetail(hit('C05c', { examples, total: 11, vocabVersion: 'v1' }, 'schema:required'))
    expect(d?.rows).toHaveLength(20)
    expect(d?.truncated).toBe(true)
    expect(d?.rows[0]).toEqual({ url: 'https://a.com/p0', field: 'Product.offers', current: '缺失', expected: null })
    expect(d?.scale).toEqual({ affected: 11 })
  })

  it('入口页规则：scope 是绝对 URL 时作为页面，否则页面为空', () => {
    expect(toFindingDetail(hit('C03', { h1Count: 2, h1Texts: ['A', 'B'] }, 'https://a.com/'))?.rows[0]).toEqual({ url: 'https://a.com/', field: 'H1', current: 'A | B', expected: '每页唯一 H1' })
    expect(toFindingDetail(hit('C03', { h1Count: 0 }, 'entry'))?.rows[0].url).toBeNull()
  })

  it('关键词类：没有页面，字段写关键词', () => {
    expect(toFindingDetail(hit('K03', { keywords: [{ text: 'remove pdf metadata', searchVolume: 500, opportunityScore: 3, ourPosition: null }] }, 'keywords:gap-missing'))?.rows[0]).toEqual({
      url: null, field: '关键词：remove pdf metadata', current: '未排名', expected: null,
    })
  })

  it('AR01：受影响 / 总数来自缺失数与文章数', () => {
    expect(toFindingDetail(hit('AR01', { articleCount: 5, missingCount: 3, share: 0.6, sampleUrls: ['https://a.com/b1'] }))).toEqual({
      scale: { affected: 3, total: 5 },
      rows: [{ url: 'https://a.com/b1', field: '作者署名', current: '缺失', expected: null }],
      truncated: false,
    })
  })

  it('没有明细的规则 → null；detail 缺失或形状不符 → 不抛错', () => {
    expect(toFindingDetail(hit('G05', { present: 0, total: 23 }))).toBeNull()
    expect(toFindingDetail({ ruleId: 'T04', scope: 'site', detail: undefined })).toEqual({ scale: { affected: null }, rows: [], truncated: false })
    expect(toFindingDetail(hit('L01', { examples: 'oops' }))).toEqual({ scale: { affected: null }, rows: [], truncated: false })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/finding-detail.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `lib/diagnosis/finding-detail.ts`:

```ts
import type { FindingDetailJson, FindingDetailRow } from '@/db/schema'
import type { RuleHit } from './types'

// 发现明细（spec 2026-10-09 §6.4）：把各规则形状不一的 hit.detail 转成统一的「页面 / 字段 / 现在 / 应该」。
// 只搬运规则已经给出的信息，缺的值为 null；不改规则判定。键表依据见计划 Task 4。
const MAX_ROWS = 20

type D = Record<string, unknown>
type Extracted = { affected: number | null; total?: number | null; rows: FindingDetailRow[] }
type Extractor = (d: D, scope: string) => Extracted

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): D => (typeof v === 'object' && v !== null ? (v as D) : {})
const strs = (v: unknown): string[] => list(v).map(str).filter((x): x is string => x !== null)
const row = (url: string | null, field: string, current: string | null = null, expected: string | null = null): FindingDetailRow => ({ url, field, current, expected })
const urlOrNull = (scope: string): string | null => (/^https?:\/\//i.test(scope) ? scope : null)
const pct = (v: unknown): string | null => (num(v) === null ? null : `${Math.round((num(v) as number) * 100)}%`)

// 页面清单类：examples / sampleUrls 等是字符串数组。
const urlList = (key: string, field: string, current: string | null = null, affectedKey = 'count'): Extractor => (d) => ({
  affected: num(d[affectedKey]),
  rows: strs(d[key]).map((u) => row(u, field, current)),
})

// 来源页类（L01/L02/L03/L07）：要改的是来源页里的链接。
const linkSources = (current: (ex: D, src: D) => string | null, expected: (ex: D) => string | null, affectedKey: string): Extractor => (d) => ({
  affected: num(d[affectedKey]),
  rows: list(d.examples).flatMap((e) => {
    const ex = obj(e)
    return list(ex.sources).map((s) => row(str(obj(s).from), '链接 href', current(ex, obj(s)), expected(ex)))
  }),
})

const AR_FIELD: Record<string, string> = { AR01: '作者署名', AR02: '作者页链接', AR03: '发布/更新日期', AR04: '数据来源引用', AR05: '权威来源引用' }
const article = (id: string): Extractor => (d) => ({
  affected: num(d.missingCount) ?? num(d.unsupportedCount),
  total: num(d.articleCount),
  rows: strs(d.sampleUrls).map((u) => row(u, AR_FIELD[id], '缺失')),
})
const keywordRows = (current: (k: D) => string | null): Extractor => (d) => ({
  affected: list(d.keywords).length || null,
  rows: list(d.keywords).map((k) => row(null, `关键词：${str(obj(k).text) ?? ''}`, current(obj(k)))),
})
const fitRows: Extractor = (d) => ({
  affected: num(d.count),
  rows: list(d.keywords).map((k) => {
    const kw = obj(k)
    return row(str(kw.currentUrl), `关键词：${str(kw.text) ?? ''}`, str(kw.currentPageRole) ?? '无承接页', strs(kw.expectedPageRoles).join(' / ') || null)
  }),
})
const ENTRY_LABEL: Record<string, string> = { author: '作者', date: '日期', about_contact: '关于/联系页', statistics: '统计数据', citations: '外部引用', quotes: '引语' }
const entryMissing: Extractor = (d, scope) => ({
  affected: strs(d.missing).length || null,
  rows: strs(d.missing).map((m) => row(urlOrNull(scope), ENTRY_LABEL[m] ?? m, '缺失')),
})

const EXTRACTORS: Record<string, Extractor> = {
  T01: (d) => ({ affected: num(d.blockedCount), rows: strs(d.blockedUrls).map((u) => row(u, 'robots.txt 禁止 Googlebot 抓取', '被禁止')) }),
  T02: (d) => ({
    affected: (num(d.http4xx) ?? 0) + (num(d.http5xx) ?? 0) - (num(d.denied) ?? 0) || null,
    total: num(d.checked),
    rows: list(d.examples).map((e) => row(str(obj(e).url), 'HTTP 状态码', str(obj(e).status))),
  }),
  T03: urlList('examples', 'meta robots', 'noindex'),
  T04: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), 'canonical', str(obj(e).canonical))) }),
  T05: urlList('examples', '站内入链数', '0'),
  T06: urlList('examples', '重定向', '会跳转'),
  T08: urlList('examples', 'HTTPS / 混合内容'),
  T09a: (d) => ({ affected: null, rows: list(d.failing).map((f) => row(null, `${str(obj(f).metric) ?? ''}（${str(obj(f).strategy) ?? ''}）`, str(obj(f).value))) }),
  T09b: (d) => ({ affected: null, rows: list(d.clues).map((c) => row(null, str(obj(c).title) ?? '性能优化项', num(obj(c).savingsMs) === null ? null : `可省约 ${num(obj(c).savingsMs)} ms`)) }),
  T10: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '初始 HTML 正文占渲染后比例', pct(d.ratio))] }),
  T11: (d) => ({ affected: 1, rows: [row(str(d.url), '站内入链数', str(d.inboundLinkCount), num(d.threshold) === null ? null : `≥ ${num(d.threshold)}`)] }),
  T12: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).map((e) => row(str(obj(e).url), '点击深度', str(obj(e).depth), num(d.maxDepth) === null ? null : `≤ ${num(d.maxDepth)}`)),
  }),
  T13: urlList('examples', 'viewport meta', '缺失'),
  T14: (d) => ({
    affected: strs(d.invalidCodes).length + (d.hasXDefault === false ? 1 : 0) || null,
    rows: [
      ...strs(d.invalidCodes).map((c) => row(null, 'hreflang', c, str(obj(d.suggestions)[c]))),
      ...(d.hasXDefault === false ? [row(null, 'hreflang x-default', '缺失')] : []),
    ],
  }),
  T15: (d) => ({ affected: num(d.zeroImpressionCount), total: num(d.langPageCount), rows: strs(d.sampleUrls).map((u) => row(u, 'GSC 展示量', '0')) }),
  L01: linkSources((ex, s) => `${str(s.linkedAs) ?? str(ex.url) ?? ''}（${str(ex.httpStatus) ?? str(ex.reason) ?? '不可达'}）`, () => null, 'brokenTargets'),
  L02: linkSources((ex, s) => str(s.linkedAs) ?? str(ex.url), (ex) => str(ex.finalUrl), 'count'),
  L03: linkSources((ex) => `${str(ex.url) ?? ''}（${str(ex.reason) ?? ''}）`, () => null, 'count'),
  L04: urlList('examples', '站内可达性', '只在孤岛内互链'),
  L05: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).flatMap((e) => list(obj(e).via).map((v) => row(str(obj(v).from), 'rel=nofollow', `nofollow → ${str(obj(e).url) ?? ''}`))),
  }),
  L06: urlList('examples', '站内出链数', '0'),
  L07: linkSources((ex) => `${str(ex.url) ?? ''}（${str(ex.status) ?? ''}）`, () => null, 'count'),
  W01: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), '站内权重相对值', str(obj(e).relative))) }),
  W02: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).map((e) => row(str(obj(e).url), '站内权重相对值', `${str(obj(e).relative) ?? ''}（${strs(obj(e).reasons).join('、')}）`)),
  }),
  W03: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).flatMap((e) => list(obj(e).samples).map((s) => row(str(obj(s).from), '锚文本', str(obj(s).anchor)))),
  }),
  W04: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), '正文入链占比', pct(obj(e).mainShare))) }),
  C01: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '<title>', str(d.title) ?? '缺失', num(d.max) === null ? null : `≤ ${num(d.max)} 字符`)] }),
  C02: (_d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), 'meta description')] }),
  C03: (d, scope) => ({
    affected: 1,
    rows: [row(urlOrNull(scope), 'H1', strs(d.h1Texts).join(' | ') || str(d.h1) || `${num(d.h1Count) ?? 0} 个`, '每页唯一 H1')],
  }),
  C04: (d) => ({ affected: num(d.pageCount), rows: [row(str(d.representativeUrl), '正文字符数', str(d.mainTextChars), num(d.threshold) === null ? null : `≥ ${num(d.threshold)}`)] }),
  C05a: (d) => ({ affected: 1, rows: [row(null, '结构化数据类型', (strs(d.foundTypes).length ? strs(d.foundTypes) : strs(d.presentTypes)).join(', ') || null)] }),
  C05b: (d) => ({ affected: strs(d.pages).length || null, rows: strs(d.pages).map((u) => row(u, 'JSON-LD', '语法或 @context 错误')) }),
  C05c: (d) => ({
    affected: num(d.total),
    rows: list(d.examples).flatMap((e) => strs(obj(e).missing).map((m) => row(str(obj(e).url), `${str(obj(e).type) ?? ''}.${m}`, '缺失'))),
  }),
  C05d: (d) => ({ affected: num(d.mismatchCount), rows: list(d.mismatches).map((m) => row(null, str(obj(m).field) ?? 'JSON-LD 字段', str(obj(m).value))) }),
  C06: entryMissing,
  C07: entryMissing,
  C09: (d) => ({ affected: num(d.missing), total: num(d.imgs), rows: strs(d.examples).map((u) => row(u, 'img alt', '缺失')) }),
  C10: (d) => ({
    affected: num(d.duplicatePageCount),
    rows: list(d.examples).flatMap((g) => strs(obj(g).urls).map((u) => row(u, '正文', `与同组 ${strs(obj(g).urls).length - 1} 页重复`))),
  }),
  C11: (d) => ({ affected: num(d.count), rows: strs(d.examples).map((u) => row(u, '平均段落长度', null, num(d.threshold) === null ? null : `≤ ${num(d.threshold)} 词`)) }),
  TA01: (d) => ({
    affected: list(d.shallowClusters).length + list(d.isolatedClusters).length || null,
    rows: [...list(d.shallowClusters), ...list(d.isolatedClusters)].map((c) => row(null, `话题群 ${str(obj(c).pattern) ?? ''}`, `${str(obj(c).pageCount) ?? '?'} 页，平均入链 ${str(obj(c).avgInbound) ?? '?'}`)),
  }),
  TA02: (d) => ({
    affected: list(d.clustersWithoutHub).length || null,
    rows: list(d.clustersWithoutHub).map((c) => row(str(obj(c).representativeUrl), `话题群 ${str(obj(c).pattern) ?? ''} 缺中心页`, `最大入链 ${str(obj(c).maxInbound) ?? '?'}`)),
  }),
  AR01: article('AR01'),
  AR02: article('AR02'),
  AR03: article('AR03'),
  AR04: article('AR04'),
  AR05: article('AR05'),
  TR06: (d) => {
    const label: Record<string, string> = { about: '关于页', contact: '联系页', privacy: '隐私政策页', terms: '服务条款页' }
    const state: Record<string, string> = { missing: '缺失', broken: '链接失效', unreachable: '不可达' }
    const rows = (['missing', 'broken', 'unreachable'] as const).flatMap((k) => strs(d[k]).map((c) => row(null, label[c] ?? c, state[k])))
    return { affected: rows.length || null, rows }
  },
  SO02: (d) => {
    const rows = [
      ...strs(d.inSchemaNotLinked).map((p) => row(null, p, 'schema 已声明，站内未链接')),
      ...strs(d.linkedNotInSchema).map((p) => row(null, p, '站内已链接，schema 未声明')),
    ]
    return { affected: rows.length || null, rows }
  },
  G01: (d) => ({ affected: strs(d.blocked).length || null, rows: strs(d.blocked).map((ua) => row(null, `robots.txt：${ua}`, 'Disallow')) }),
  G02: (d) => ({ affected: list(d.blocked).length || null, rows: list(d.blocked).map((b) => row(str(obj(b).url), str(obj(b).ua) ?? 'UA', str(obj(b).status) ?? '无响应')) }),
  G03: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '初始 / 渲染后正文字符数', `${str(d.initialChars) ?? '?'} / ${str(d.renderedChars) ?? '?'}`)] }),
  E01: (d) => ({ affected: 1, rows: [row(null, 'Organization.sameAs', strs(d.sameAs).join(', ') || '缺失', strs(d.authorityHosts).join(', ') || null)] }),
  G04: (d) => ({ affected: 1, rows: [row(null, 'Bing 收录数', str(d.indexed))] }),
  K01: keywordRows((k) => `排名 ${str(k.position) ?? '?'}`),
  K02: keywordRows((k) => `CTR ${pct(k.ctr) ?? '?'}，排名 ${str(k.position) ?? '?'}`),
  K03: keywordRows((k) => (num(k.ourPosition) === null ? '未排名' : `排名 ${num(k.ourPosition)}`)),
  K04: keywordRows((k) => (num(k.ourPosition) === null ? '未排名' : `排名 ${num(k.ourPosition)}`)),
  K05: (d) => ({
    affected: 1,
    rows: [row(null, `品牌词：${str(d.brandQuery) ?? ''}`, str(obj(d.top).domain) ? `首位 ${str(obj(d.top).domain)}` : '本站未出现')],
  }),
  K06: (d) => ({
    affected: list(d.queries).length || null,
    rows: list(d.queries).flatMap((q) => list(obj(q).pages).map((p) => row(str(obj(p).url), `关键词：${str(obj(q).query) ?? ''}`, `排名 ${str(obj(p).position) ?? '?'}`))),
  }),
  K07: (d) => ({
    affected: list(d.keywords).length || null,
    rows: list(d.keywords).map((k) => row(str(obj(k).ourUrl), `关键词：${str(obj(k).text) ?? ''}`, str(obj(k).ourPageType), str(obj(k).expectedPageType))),
  }),
  IPF01: fitRows,
  IPF02: fitRows,
  IPF03: (d) => ({
    affected: num(d.count),
    rows: list(d.pages).map((p) => row(str(obj(p).url), '承接关键词', `${str(obj(p).queryCount) ?? '?'} 个词、${str(obj(p).intentCount) ?? '?'} 种意图`)),
  }),
  IPF04: fitRows,
  Q03: keywordRows((k) => (str(k.gapType) === 'missing' ? '竞品有排名、本站没有' : '本站排名偏弱')),
  A01: (d) => ({
    affected: 1,
    rows: [row(null, '引荐域数', str(obj(d.own).referringDomains), num(d.competitorMedianReferringDomains) === null ? null : `竞品中位数 ${num(d.competitorMedianReferringDomains)}`)],
  }),
  TR04: () => ({ affected: 1, rows: [row(null, '配送政策页', '未找到')] }),
  TR05: () => ({ affected: 1, rows: [row(null, '退货退款政策页', '未找到')] }),
  SP01: (d) => ({ affected: 1, rows: [row(null, str(d.platform) ?? 'youtube', `结果数 ${str(d.resultCount) ?? '0'}`)] }),
  SP02: (d) => ({ affected: list(d.platforms).length || null, rows: list(d.platforms).map((p) => row(null, str(obj(p).platform) ?? '', `结果数 ${str(obj(p).resultCount) ?? '0'}`)) }),
}

// 站级 / 抽样 / 对比类：命中里没有逐项明细（spec 允许 detail 为空）。
export const NO_DETAIL_RULES: ReadonlySet<string> = new Set([
  'T07', 'T09c', 'C08', 'SO01', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'Q01', 'Q02', 'A02', 'A03', 'E02', 'E03',
])
// 计数核对：提取器 70 条 + 无明细 17 条 = 87 条注册规则（测试第一条用例锁死）。
export const EXTRACTED_RULES: readonly string[] = Object.keys(EXTRACTORS)

export function toFindingDetail(hit: Pick<RuleHit, 'ruleId' | 'scope' | 'detail'>): FindingDetailJson | null {
  const extract = EXTRACTORS[hit.ruleId]
  if (!extract) return null
  let out: Extracted
  try {
    out = extract(hit.detail ?? {}, hit.scope)
  } catch {
    out = { affected: null, rows: [] }
  }
  const rows = out.rows.slice(0, MAX_ROWS)
  return {
    scale: out.total === undefined ? { affected: out.affected } : { affected: out.affected, total: out.total },
    rows,
    truncated: out.rows.length > MAX_ROWS,
  }
}
```

> 注：测试「detail 缺失或形状不符」期望 `scale: { affected: null }`——各提取器在键缺失时 `num()` 返回 null、`list()` 返回空数组，不需要 try/catch 之外的特判。若某条提取器在空对象上产出非空行（例如 C01 的固定一行），把该用例换成 `rows` 只断言不抛错即可；T04 与 L01 在空对象上必须是 `rows: []`。

- [ ] **Step 4: buildFindingRows 写入明细**

`lib/diagnosis/finding-rows.ts`：
- import `toFindingDetail` 与 `type FindingDetailJson`（`@/db/schema`）；
- `FindingRow` 接口加 `detail: FindingDetailJson | null`（注释：`// 统一明细（spec 2026-10-09 §6.4），对账取 affected 作受影响数。`）；
- `buildFindingRows` 的映射里加 `detail: toFindingDetail(hit),`。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run lib/diagnosis/finding-detail.test.ts lib/diagnosis/finding-rows.test.ts lib/inngest`
Expected: PASS（若 `finding-rows.test.ts` 或 inngest 测试用 `toEqual` 断言了整行形状，按新增的 `detail` 字段补齐期望值，不改其他字段）。

- [ ] **Step 6: 提交**

```bash
git add lib/diagnosis/finding-detail.ts lib/diagnosis/finding-detail.test.ts lib/diagnosis/finding-rows.ts lib/diagnosis/finding-rows.test.ts lib/inngest
git commit -m "feat(diagnosis): 发现明细——规则命中转成统一的页面/字段/现在/应该"
```

---

### Task 5: 协议指纹与统一的「发起体检」

**Files:**
- Modify: `lib/probes/prompt-set.ts`（导出模板版本常量，`buildPromptSetV2` 引用它）
- Create: `lib/runs/protocol.ts`、`lib/runs/protocol.test.ts`
- Create: `lib/runs/start-checkup.ts`、`lib/runs/start-checkup.test.ts`
- Modify: `app/api/runs/route.ts`、`app/api/runs/route.test.ts`
- Modify: `app/api/runs/[id]/retest/route.ts`、`app/api/runs/[id]/retest/route.test.ts`
- Modify: `app/api/analysis-sessions/route.ts`（POST 内建 run 段，约 91-104 行）、`app/api/analysis-sessions/[id]/route.ts`（PATCH 内建 run 段，约 124-139 行）

**Interfaces:**
- Consumes: Task 1 的 `runs.protocolHash`。
- Produces:
  - `PROMPT_TEMPLATE_VERSION: 'template_v2'`（`lib/probes/prompt-set.ts`）
  - `interface ProtocolInputs { industry: string; market: string; language: string; competitors: string[]; brandAliases: string[]; targetKeywords: string[]; confirmedCompetitors: string[]; engines: string[]; promptTemplateVersion: string }`
  - `computeProtocolHash(i: ProtocolInputs): string`
  - `interface PriorRun { id: string; runType: string; status: string; protocolHash: string | null; baselineRunId: string | null; protocolVersion: string; startedAt: string | null; finishedAt: string | null }`
  - `chooseProtocolAnchor(hash: string, runs: PriorRun[]): { runType: 'baseline' } | { runType: 'retest'; baselineRunId: string }`
  - `startCheckup(input: { projectId: string; analysisSessionId?: string; legacySession?: boolean }, deps?: StartCheckupDeps): Promise<StartCheckupResult>`
  - `type StartCheckupResult = { ok: true; run: typeof runs.$inferSelect } | { ok: false; status: 404 | 409 | 422 | 503; error: string; runId?: string; projectId?: string }`

> 行为变化（spec D3）：「以这次为基线回测」不再以被点的那次为基线，而是统一按项目当前协议决定沿用或新建。

- [ ] **Step 1: 写协议指纹的失败测试**

Create `lib/runs/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeProtocolHash, chooseProtocolAnchor, type ProtocolInputs, type PriorRun } from './protocol'

const base: ProtocolInputs = {
  industry: 'document metadata removal tool', market: 'global-en', language: 'en',
  competitors: ['metacleaner.com'], brandAliases: ['MetaDocu'], targetKeywords: ['remove pdf metadata'],
  confirmedCompetitors: ['metadata2go.com'], engines: ['deepseek', 'Google AI Overviews'], promptTemplateVersion: 'template_v2',
}

describe('computeProtocolHash', () => {
  it('列表顺序、大小写、首尾空白、重复项不影响指纹', () => {
    const shuffled = { ...base, engines: ['Google AI Overviews ', 'DEEPSEEK', 'deepseek'], competitors: [' MetaCleaner.com'] }
    expect(computeProtocolHash(shuffled)).toBe(computeProtocolHash(base))
  })

  it.each([
    ['industry', { industry: 'pdf editor' }],
    ['market', { market: 'us' }],
    ['language', { language: 'de' }],
    ['competitors', { competitors: [] }],
    ['brandAliases', { brandAliases: ['Meta Docu'] }],
    ['targetKeywords', { targetKeywords: ['pdf metadata'] }],
    ['confirmedCompetitors', { confirmedCompetitors: [] }],
    ['engines', { engines: ['deepseek'] }],
    ['promptTemplateVersion', { promptTemplateVersion: 'template_v3' }],
  ])('%s 变了 → 指纹变', (_name, patch) => {
    expect(computeProtocolHash({ ...base, ...patch })).not.toBe(computeProtocolHash(base))
  })
})

const run = (over: Partial<PriorRun>): PriorRun => ({
  id: 'run_x', runType: 'baseline', status: 'reviewing', protocolHash: 'h1', baselineRunId: null, protocolVersion: 'v2',
  startedAt: '2026-10-01T00:00:00.000Z', finishedAt: '2026-10-01T00:10:00.000Z', ...over,
})

describe('chooseProtocolAnchor', () => {
  it('没有历史 → 新协议', () => {
    expect(chooseProtocolAnchor('h1', [])).toEqual({ runType: 'baseline' })
  })
  it('最近一次已完成且指纹相同的是基线 → 沿用它', () => {
    expect(chooseProtocolAnchor('h1', [run({ id: 'run_a' })])).toEqual({ runType: 'retest', baselineRunId: 'run_a' })
  })
  it('最近一次是沿用协议的体检 → 沿用它的协议起点', () => {
    const runs = [run({ id: 'run_a' }), run({ id: 'run_b', runType: 'retest', baselineRunId: 'run_a', startedAt: '2026-10-05T00:00:00.000Z' })]
    expect(chooseProtocolAnchor('h1', runs)).toEqual({ runType: 'retest', baselineRunId: 'run_a' })
  })
  it('失败或进行中的体检不能当协议起点', () => {
    expect(chooseProtocolAnchor('h1', [run({ status: 'failed' }), run({ id: 'run_c', status: 'collecting' })])).toEqual({ runType: 'baseline' })
  })
  it('指纹不同 → 新协议；旧体检指纹为空 → 新协议', () => {
    expect(chooseProtocolAnchor('h2', [run({})])).toEqual({ runType: 'baseline' })
    expect(chooseProtocolAnchor('h1', [run({ protocolHash: null })])).toEqual({ runType: 'baseline' })
  })
  it('开始时间为空时回落到完成时间排序', () => {
    const runs = [run({ id: 'run_old', startedAt: null, finishedAt: '2026-09-01T00:00:00.000Z' }), run({ id: 'run_new', startedAt: null, finishedAt: '2026-10-01T00:00:00.000Z' })]
    expect(chooseProtocolAnchor('h1', runs)).toEqual({ runType: 'retest', baselineRunId: 'run_new' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/runs/protocol.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`lib/probes/prompt-set.ts`：在 `buildPromptSetV2` 之前加

```ts
// 提问模板版本：进协议指纹（lib/runs/protocol.ts）；改模板时同步改这里，旧协议自然失效。
export const PROMPT_TEMPLATE_VERSION = 'template_v2' as const
```

并把 `buildPromptSetV2` 里 `source: 'template_v2',` 改为 `source: PROMPT_TEMPLATE_VERSION,`。

Create `lib/runs/protocol.ts`:

```ts
import { sha256Hex } from '@/lib/collection/hash'

// 检测协议（spec 2026-10-09 §3、§5.3）：决定 AI 提问集、AI 概览查询、竞品对比口径的全部用户输入。
// 指纹相同的两次体检，抽样类结论才可比。
export interface ProtocolInputs {
  industry: string
  market: string
  language: string
  // 项目手填竞品：进 AI 提问集（lib/probes/prompt-set.ts PromptSetInput.competitors）。
  competitors: string[]
  brandAliases: string[]
  targetKeywords: string[]
  // 已确认竞品域名：进竞品类规则（competitors.status = 'confirmed'）。
  confirmedCompetitors: string[]
  // project_settings.default_models：AI 引擎与 'Google AI Overviews'。
  engines: string[]
  promptTemplateVersion: string
}

const norm = (xs: string[]): string[] => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].sort()

export function computeProtocolHash(i: ProtocolInputs): string {
  return sha256Hex(
    JSON.stringify({
      v: 1,
      industry: i.industry.trim().toLowerCase(),
      market: i.market.trim().toLowerCase(),
      language: i.language.trim().toLowerCase(),
      competitors: norm(i.competitors),
      brandAliases: norm(i.brandAliases),
      targetKeywords: norm(i.targetKeywords),
      confirmedCompetitors: norm(i.confirmedCompetitors),
      engines: norm(i.engines),
      promptTemplateVersion: i.promptTemplateVersion,
    }),
  )
}

export interface PriorRun {
  id: string
  runType: string
  status: string
  protocolHash: string | null
  baselineRunId: string | null
  protocolVersion: string
  startedAt: string | null
  finishedAt: string | null
}

const COMPLETED = new Set(['reviewing', 'output'])
const timeOf = (r: PriorRun): number => Date.parse(r.startedAt ?? r.finishedAt ?? '') || 0

// 协议起点：最近一次已完成、指纹相同的体检；它若本身是沿用协议的体检，取它的起点。
export function chooseProtocolAnchor(
  hash: string,
  runs: PriorRun[],
): { runType: 'baseline' } | { runType: 'retest'; baselineRunId: string } {
  const latest = runs
    .filter((r) => COMPLETED.has(r.status) && r.protocolHash === hash)
    .sort((a, b) => timeOf(b) - timeOf(a))[0]
  if (!latest) return { runType: 'baseline' }
  return { runType: 'retest', baselineRunId: latest.runType === 'retest' && latest.baselineRunId ? latest.baselineRunId : latest.id }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/runs/protocol.test.ts lib/probes/prompt-set.test.ts`
Expected: PASS

- [ ] **Step 5: 写 startCheckup 的失败测试**

Create `lib/runs/start-checkup.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { startCheckup, type StartCheckupDeps } from './start-checkup'
import type { PriorRun } from './protocol'

const project = {
  id: 'proj_1', domain: 'https://metadocu.com/', industry: 'document metadata removal tool', market: 'global-en',
  language: 'en', competitors: [] as string[], ownerId: 'local', nextRetestDueAt: null, createdAt: '', updatedAt: '',
}

function makeDeps(over: Partial<StartCheckupDeps> = {}): StartCheckupDeps & Record<string, ReturnType<typeof vi.fn>> {
  const inserted: Record<string, unknown>[] = []
  return {
    getProject: vi.fn(async (id: string) => (id === 'proj_1' ? project : undefined)),
    getProjectSettings: vi.fn(async () => ({ defaultModels: ['deepseek'], brandAliases: [], targetKeywords: [] })),
    getConfirmedCompetitors: vi.fn(async () => []),
    getProjectRuns: vi.fn(async (): Promise<PriorRun[]> => []),
    findActiveRun: vi.fn(async () => undefined),
    insertRun: vi.fn(async (row: Record<string, unknown>) => {
      inserted.push(row)
      return { ...row } as never
    }),
    markRunStatus: vi.fn(async () => undefined) as never,
    sendCollect: vi.fn(async () => ({ ids: ['evt_1'] })),
    createLegacySession: vi.fn(async () => undefined),
    now: () => '2026-10-09T00:00:00.000Z',
    ...over,
  } as never
}

describe('startCheckup', () => {
  it('项目不存在 → 404', async () => {
    expect(await startCheckup({ projectId: 'nope' }, makeDeps())).toMatchObject({ ok: false, status: 404, error: 'not_found' })
  })

  it('品类为空 → 422 category_required，带 projectId，不建 run 不派发', async () => {
    const deps = makeDeps({ getProject: vi.fn(async () => ({ ...project, industry: '' })) as never })
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toMatchObject({ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' })
    expect(deps.insertRun).not.toHaveBeenCalled()
  })

  it('已有进行中的体检 → 409，带 runId', async () => {
    const deps = makeDeps({ findActiveRun: vi.fn(async () => ({ id: 'run_busy' })) as never })
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toMatchObject({ ok: false, status: 409, error: 'run_in_progress', runId: 'run_busy' })
  })

  it('首次体检 → 新协议：runType baseline、写协议指纹与开始时间，派发时不带基线', async () => {
    const deps = makeDeps()
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    expect(res.ok).toBe(true)
    const row = deps.insertRun.mock.calls[0][0] as Record<string, unknown>
    expect(row).toMatchObject({ projectId: 'proj_1', runType: 'baseline', status: 'collecting', startedAt: '2026-10-09T00:00:00.000Z', baselineRunId: null })
    expect(String(row.id)).toMatch(/^run_/)
    expect(String(row.protocolHash)).toMatch(/^[0-9a-f]{64}$/)
    expect(deps.sendCollect.mock.calls[0][2]).toBeUndefined()
  })

  it('输入没变 → 沿用上次协议：runType retest、基线为协议起点、派发带基线、沿用起点的 protocolVersion', async () => {
    const first = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, first)
    const hash = (first.insertRun.mock.calls[0][0] as { protocolHash: string }).protocolHash
    const prior: PriorRun[] = [{ id: 'run_a', runType: 'baseline', status: 'output', protocolHash: hash, baselineRunId: null, protocolVersion: 'v2', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null }]
    const deps = makeDeps({ getProjectRuns: vi.fn(async () => prior) as never })
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).toMatchObject({ runType: 'retest', baselineRunId: 'run_a', protocolHash: hash, protocolVersion: 'v2' })
    expect(deps.sendCollect.mock.calls[0][2]).toBe('run_a')
  })

  it('改了竞品确认 → 新协议', async () => {
    const first = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, first)
    const hash = (first.insertRun.mock.calls[0][0] as { protocolHash: string }).protocolHash
    const prior: PriorRun[] = [{ id: 'run_a', runType: 'baseline', status: 'output', protocolHash: hash, baselineRunId: null, protocolVersion: 'v2', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null }]
    const deps = makeDeps({
      getProjectRuns: vi.fn(async () => prior) as never,
      getConfirmedCompetitors: vi.fn(async () => [{ domain: 'metadata2go.com' }]) as never,
    })
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).toMatchObject({ runType: 'baseline', baselineRunId: null })
  })

  it('派发失败 → 体检标 failed、返回 503 dispatch_failed', async () => {
    const deps = makeDeps({ sendCollect: vi.fn(async () => { throw new Error('inngest down') }) as never })
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    expect(res).toMatchObject({ ok: false, status: 503, error: 'dispatch_failed' })
    expect(deps.markRunStatus).toHaveBeenCalledWith(expect.stringMatching(/^run_/), 'failed', expect.objectContaining({ failureReason: '采集事件派发失败：inngest down' }))
  })

  it('legacySession 且没有会话 → 补建会话；带 analysisSessionId → 写入 run、不另建会话', async () => {
    const a = makeDeps()
    await startCheckup({ projectId: 'proj_1', legacySession: true }, a)
    expect(a.createLegacySession).toHaveBeenCalledTimes(1)
    const b = makeDeps()
    await startCheckup({ projectId: 'proj_1', legacySession: true, analysisSessionId: 'sess_1' }, b)
    expect(b.createLegacySession).not.toHaveBeenCalled()
    expect(b.insertRun.mock.calls[0][0]).toMatchObject({ analysisSessionId: 'sess_1' })
  })

  it('补建会话失败不阻断体检', async () => {
    const deps = makeDeps({ createLegacySession: vi.fn(async () => { throw new Error('0013 missing') }) as never })
    expect((await startCheckup({ projectId: 'proj_1', legacySession: true }, deps)).ok).toBe(true)
  })
})
```

- [ ] **Step 6: 跑测试确认失败**

Run: `pnpm vitest run lib/runs/start-checkup.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 7: 实现 startCheckup**

Create `lib/runs/start-checkup.ts`:

```ts
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import {
  getProject,
  getProjectSettings,
  getConfirmedCompetitors,
  getProjectRuns,
  findActiveRun,
  markRunStatus,
} from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { PROMPT_TEMPLATE_VERSION } from '@/lib/probes/prompt-set'
import { runGateError } from './gate'
import { computeProtocolHash, chooseProtocolAnchor, type PriorRun } from './protocol'

type RunRow = typeof runs.$inferSelect
type ProjectRow = NonNullable<Awaited<ReturnType<typeof getProject>>>

export type StartCheckupResult =
  | { ok: true; run: RunRow }
  | { ok: false; status: 404 | 409 | 422 | 503; error: string; runId?: string; projectId?: string }

export interface StartCheckupDeps {
  getProject: (id: string) => Promise<ProjectRow | undefined>
  getProjectSettings: (projectId: string) => Promise<{ defaultModels: string[]; brandAliases: string[]; targetKeywords: string[] } | undefined>
  getConfirmedCompetitors: (projectId: string) => Promise<{ domain: string }[]>
  getProjectRuns: (projectId: string) => Promise<PriorRun[]>
  findActiveRun: (projectId: string) => Promise<{ id: string } | undefined>
  insertRun: (row: typeof runs.$inferInsert) => Promise<RunRow>
  markRunStatus: typeof markRunStatus
  sendCollect: (run: RunRow, url: string, baselineRunId?: string) => Promise<unknown>
  createLegacySession: (run: RunRow, project: ProjectRow) => Promise<void>
  now: () => string
}

function defaultDeps(): StartCheckupDeps {
  return {
    getProject,
    getProjectSettings,
    getConfirmedCompetitors,
    getProjectRuns,
    findActiveRun,
    insertRun: async (row) => (await db.insert(runs).values(row).returning())[0],
    markRunStatus,
    sendCollect: (run, url, baselineRunId) => inngest.send(buildCollectRequestedEvent(run, url, baselineRunId)),
    createLegacySession: async (run, project) => {
      const { createLegacySessionForRun } = await import('@/lib/knowledge/repository')
      await createLegacySessionForRun({ runId: run.id, project })
    },
    now: () => new Date().toISOString(),
  }
}

// 统一的「发起体检」（spec 2026-10-09 §5.3）：POST /api/runs、/runs/[id]/retest、分析会话两处入口共用。
// 按项目当前输入算协议指纹：与最近一次完成体检相同 → 沿用协议起点（runType retest），否则新协议（baseline）。
export async function startCheckup(
  input: { projectId: string; analysisSessionId?: string; legacySession?: boolean },
  deps: StartCheckupDeps = defaultDeps(),
): Promise<StartCheckupResult> {
  const project = await deps.getProject(input.projectId)
  if (!project) return { ok: false, status: 404, error: 'not_found' }

  // SP-A §3.5 闸门：品类/市场无效不得启动（也就不会触发任何付费采集）。
  const gate = runGateError(project)
  if (gate) return { ok: false, status: 422, error: gate, projectId: project.id }

  // 同项目并发保护（spec §2.3）。
  const active = await deps.findActiveRun(project.id)
  if (active) return { ok: false, status: 409, error: 'run_in_progress', runId: active.id }

  const [settings, confirmed, prior] = await Promise.all([
    deps.getProjectSettings(project.id),
    deps.getConfirmedCompetitors(project.id),
    deps.getProjectRuns(project.id),
  ])
  const protocolHash = computeProtocolHash({
    industry: project.industry,
    market: project.market,
    language: project.language,
    competitors: project.competitors ?? [],
    brandAliases: settings?.brandAliases ?? [],
    targetKeywords: settings?.targetKeywords ?? [],
    confirmedCompetitors: confirmed.map((c) => c.domain),
    engines: settings?.defaultModels ?? [],
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
  })
  const anchor = chooseProtocolAnchor(protocolHash, prior)
  const anchorRun = anchor.runType === 'retest' ? prior.find((r) => r.id === anchor.baselineRunId) : undefined

  const run = await deps.insertRun({
    id: `run_${crypto.randomUUID()}`,
    projectId: project.id,
    runType: anchor.runType,
    status: 'collecting',
    ...(anchorRun ? { protocolVersion: anchorRun.protocolVersion } : {}),
    rulesVersion: RULES_VERSION,
    startedAt: deps.now(),
    protocolHash,
    baselineRunId: anchor.runType === 'retest' ? anchor.baselineRunId : null,
    analysisSessionId: input.analysisSessionId ?? null,
  })

  // 兼容旧入口：尽力补建知识脑会话，失败不阻断。
  if (input.legacySession && !input.analysisSessionId) {
    try {
      await deps.createLegacySession(run, project)
    } catch (error) {
      console.warn('legacy_session_bridge_failed', error instanceof Error ? error.message : String(error))
    }
  }

  // 派发失败时不能让体检卡在 collecting。
  try {
    await deps.sendCollect(run, project.domain, anchor.runType === 'retest' ? anchor.baselineRunId : undefined)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await deps.markRunStatus(run.id, 'failed', { failureReason: `采集事件派发失败：${reason}`, finishedAt: deps.now() })
    return { ok: false, status: 503, error: 'dispatch_failed', runId: run.id }
  }
  return { ok: true, run }
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm vitest run lib/runs/start-checkup.test.ts`
Expected: PASS

- [ ] **Step 9: 两个 run 路由改为调用 startCheckup，并改写路由测试**

把 `app/api/runs/route.ts` 整个替换为：

```ts
import { NextResponse } from 'next/server'
import { startCheckup } from '@/lib/runs/start-checkup'

// POST /runs —— 发起一次体检（spec 2026-10-09 §5.3）。基线/回测由协议指纹决定，请求体里的 runType 不再生效。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string }
  const projectId = body.projectId?.trim()
  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })

  const result = await startCheckup({ projectId, legacySession: true })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.runId ? { runId: result.runId } : {}), ...(result.projectId ? { projectId: result.projectId } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json(result.run, { status: 201 })
}
```

把 `app/api/runs/[id]/retest/route.ts` 整个替换为：

```ts
import { NextResponse } from 'next/server'
import { getRun } from '@/lib/repositories'
import { startCheckup } from '@/lib/runs/start-checkup'

// POST /runs/{id}/retest —— 兼容旧入口：对该体检所属项目发起一次体检（spec D3：不再区分基线/回测，
// 沿用还是新建协议由协议指纹决定）。响应形状保持 { baselineRunId, retest }（RetestButton 读 retest.id）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clicked = await getRun(id)
  if (!clicked) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const result = await startCheckup({ projectId: clicked.projectId })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.runId ? { runId: result.runId } : {}), ...(result.projectId ? { projectId: result.projectId } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json({ baselineRunId: result.run.baselineRunId ?? id, retest: result.run }, { status: 201 })
}
```

把 `app/api/runs/route.test.ts` 整个替换为（行为细节已移到 start-checkup.test.ts，这里只测参数与结果映射）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const startCheckupMock = vi.fn()
vi.mock('@/lib/runs/start-checkup', () => ({ startCheckup: (...a: unknown[]) => startCheckupMock(...a) }))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new Request('http://x/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/runs', () => {
  beforeEach(() => startCheckupMock.mockReset())

  it('缺 projectId → 422，不发起体检', async () => {
    const res = await post({})
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'project_id_required' })
    expect(startCheckupMock).not.toHaveBeenCalled()
  })

  it('成功 → 201 返回新体检，并要求补建会话', async () => {
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', status: 'collecting' } })
    const res = await post({ projectId: 'proj_1', runType: 'retest' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'run_new', status: 'collecting' })
    expect(startCheckupMock).toHaveBeenCalledWith({ projectId: 'proj_1', legacySession: true })
  })

  it.each([
    [{ ok: false, status: 404, error: 'not_found' }, 404, { error: 'not_found' }],
    [{ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' }, 422, { error: 'category_required', projectId: 'proj_1' }],
    [{ ok: false, status: 409, error: 'run_in_progress', runId: 'run_busy' }, 409, { error: 'run_in_progress', runId: 'run_busy' }],
    [{ ok: false, status: 503, error: 'dispatch_failed', runId: 'run_x' }, 503, { error: 'dispatch_failed', runId: 'run_x' }],
  ])('失败结果原样映射：%j', async (result, status, body) => {
    startCheckupMock.mockResolvedValueOnce(result)
    const res = await post({ projectId: 'proj_1' })
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
  })
})
```

把 `app/api/runs/[id]/retest/route.test.ts` 整个替换为：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRunMock = vi.fn()
const startCheckupMock = vi.fn()
vi.mock('@/lib/repositories', () => ({ getRun: (id: string) => getRunMock(id) }))
vi.mock('@/lib/runs/start-checkup', () => ({ startCheckup: (...a: unknown[]) => startCheckupMock(...a) }))

import { POST } from './route'

const call = (id: string) => POST(new Request(`http://x/api/runs/${id}/retest`, { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/retest', () => {
  beforeEach(() => {
    getRunMock.mockReset()
    startCheckupMock.mockReset()
  })

  it('被点的体检不存在 → 404', async () => {
    getRunMock.mockResolvedValueOnce(undefined)
    expect((await call('run_x')).status).toBe(404)
    expect(startCheckupMock).not.toHaveBeenCalled()
  })

  it('对它所属项目发起体检，响应保持 { baselineRunId, retest } 形状', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', baselineRunId: 'run_anchor' } })
    const res = await call('run_old')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ baselineRunId: 'run_anchor', retest: { id: 'run_new', baselineRunId: 'run_anchor' } })
    expect(startCheckupMock).toHaveBeenCalledWith({ projectId: 'proj_1' })
  })

  it('新协议（没有基线）时 baselineRunId 回落为被点的体检 id', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', baselineRunId: null } })
    expect((await (await call('run_old')).json()).baselineRunId).toBe('run_old')
  })

  it('闸门失败带 projectId（界面据此直链向导）', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' })
    const res = await call('run_old')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'category_required', projectId: 'proj_1' })
  })
})
```

- [ ] **Step 10: 分析会话两处建 run 改为调用 startCheckup**

`app/api/analysis-sessions/route.ts`：在文件顶部 import 区加 `import { startCheckup } from '@/lib/runs/start-checkup'`，把 `else` 分支里从 `const [run] = await db.insert(runs).values({` 到派发失败返回 503 的整段（约 91-104 行）替换为：

```ts
      const started = await startCheckup({ projectId: project.id, analysisSessionId: sessionId })
      if (!started.ok) {
        await db.update(analysisSessions).set({ status: 'failed', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, sessionId))
        return NextResponse.json({ error: started.error, sessionId }, { status: started.status })
      }
      await db.update(analysisSessions).set({ projectId: project.id, runId: started.run.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, sessionId))
```

`app/api/analysis-sessions/[id]/route.ts`：同样加 import，把从 `const [run] = await db.insert(runs).values({` 到派发失败返回 503 的整段（约 124-139 行）替换为：

```ts
    const started = await startCheckup({ projectId: project.id, analysisSessionId: id })
    if (!started.ok) {
      await db.update(analysisSessions).set({ status: 'failed', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, id))
      return NextResponse.json({ error: started.error, sessionId: id }, { status: started.status })
    }
    await db.update(analysisSessions).set({ projectId: project.id, runId: started.run.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, id))
```

删掉两个文件里因此不再使用的 import（`runs`、`RULES_VERSION`、`inngest`、`buildCollectRequestedEvent` 中已无引用者；用 `pnpm exec tsc --noEmit` 与 `pnpm exec eslint` 确认）。

`app/api/analysis-sessions/route.test.ts` 用真库 + 模拟 `@/lib/inngest/client`，startCheckup 的默认依赖会走同一个模拟，既有断言（`sendMock` 调用次数、项目修正、挂到进行中 run）保持不变。

- [ ] **Step 11: 跑相关测试与类型检查**

Run: `pnpm vitest run lib/runs app/api/runs app/api/analysis-sessions lib/probes && pnpm exec tsc --noEmit`
Expected: PASS，tsc 无输出。

- [ ] **Step 12: 提交**

```bash
git add lib/probes/prompt-set.ts lib/runs/protocol.ts lib/runs/protocol.test.ts lib/runs/start-checkup.ts lib/runs/start-checkup.test.ts app/api/runs app/api/analysis-sessions
git commit -m "feat(runs): 协议指纹与统一的发起体检，四个入口收敛到 startCheckup"
```

---

### Task 6: 主诊断带上已确认竞品（竞品类规则不再空转）

**Files:**
- Create: `lib/diagnosis/competitor-context.ts`、`lib/diagnosis/competitor-context.test.ts`
- Modify: `lib/inngest/reevaluate-competitors.ts`（约 131-192 行改为调用共享函数）
- Modify: `lib/inngest/generate-findings.ts`（`run-rules` step；新增 `persist-keyword-gaps` step；deps 加 `getConfirmedCompetitors`、`upsertKeyword`、`createKeywordGaps`、`computeKeywordGaps`）
- Modify: `lib/inngest/generate-findings.test.ts`

**Interfaces:**
- Produces:
  - `buildCompetitorInputs(args: { evidence: DiagnosisEvidenceRow[]; confirmed: { domain: string; name: string | null }[]; projectDomain: string; projectCompetitors: string[]; computeKeywordGaps: typeof computeKeywordGaps }): CompetitorInputs`
  - `interface CompetitorInputs { confirmedCompetitors: { domain: string; name: string }[]; gaps: KeywordGapResult[]; ctxGaps: RuleContext['keywordGaps']; serpEvidenceId: string | null; probeCompetitors: string[] }`
  - `persistKeywordGaps(deps: { upsertKeyword; createKeywordGaps }, args: { projectId: string; runId: string; market: string; language: string; gaps: KeywordGapResult[]; serpEvidenceId: string | null }): Promise<number>`

背景：主诊断构造规则上下文时不传已确认竞品（`generate-findings.ts` 只用 `project.competitors`），Q01–Q03、K03、K04、E03 在每次体检都返回空，只有在竞品页点「确认」触发的再评估里才跑（spec §5.4-1）。

- [ ] **Step 1: 写共享函数的失败测试**

Create `lib/diagnosis/competitor-context.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildCompetitorInputs, persistKeywordGaps } from './competitor-context'
import type { DiagnosisEvidenceRow } from './types'

const serpEv: DiagnosisEvidenceRow = {
  id: 'ev_serp', type: 'dataforseo_serp', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null,
  payload: { kind: 'seed_serp', results: [{ keyword: 'remove pdf metadata', items: [] }] },
} as never
const labsEv: DiagnosisEvidenceRow = {
  id: 'ev_labs', type: 'dataforseo_labs', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null,
  payload: { keywords: [{ keyword: 'remove pdf metadata', searchVolume: 500 }] },
} as never

describe('buildCompetitorInputs', () => {
  const gap = { keyword: 'remove pdf metadata', gapType: 'missing' as const, ourPosition: null, competitorPositions: { 'rival.com': 3 }, opportunityScore: 4, searchVolume: 500 }

  it('有已确认竞品与种子 SERP → 计算缺口，规则上下文的缺口带 SERP 证据 id', () => {
    const compute = vi.fn(() => [gap])
    const out = buildCompetitorInputs({
      evidence: [serpEv, labsEv], confirmed: [{ domain: 'rival.com', name: 'Rival' }],
      projectDomain: 'https://metadocu.com/', projectCompetitors: ['metacleaner.com'], computeKeywordGaps: compute as never,
    })
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ ownDomain: 'https://metadocu.com/', confirmedCompetitorDomains: ['rival.com'] }))
    expect(out.confirmedCompetitors).toEqual([{ domain: 'rival.com', name: 'Rival' }])
    expect(out.ctxGaps).toEqual([{ keyword: 'remove pdf metadata', gapType: 'missing', ourPosition: null, opportunityScore: 4, searchVolume: 500, evidenceId: 'ev_serp' }])
    expect(out.probeCompetitors).toEqual(['metacleaner.com', 'Rival'])
  })

  it('没有已确认竞品 → 不计算缺口；没有种子 SERP → 不计算缺口', () => {
    const compute = vi.fn(() => [gap])
    expect(buildCompetitorInputs({ evidence: [serpEv], confirmed: [], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: compute as never }).gaps).toEqual([])
    expect(buildCompetitorInputs({ evidence: [], confirmed: [{ domain: 'rival.com', name: null }], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: compute as never }).gaps).toEqual([])
    expect(compute).not.toHaveBeenCalled()
  })

  it('竞品没名字时探针竞品集回退用域名', () => {
    const out = buildCompetitorInputs({ evidence: [], confirmed: [{ domain: 'rival.com', name: null }], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: vi.fn(() => []) as never })
    expect(out.probeCompetitors).toEqual(['rival.com'])
  })
})

describe('persistKeywordGaps', () => {
  it('逐个 upsert 关键词并一次写入缺口行；没有缺口时不写', async () => {
    const deps = { upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]), createKeywordGaps: vi.fn(async (rows: unknown[]) => rows) }
    const gaps = [{ keyword: 'remove pdf metadata', gapType: 'missing' as const, ourPosition: null, competitorPositions: {}, opportunityScore: 4, searchVolume: 500 }]
    expect(await persistKeywordGaps(deps as never, { projectId: 'proj_1', runId: 'run_1', market: 'global-en', language: 'en', gaps, serpEvidenceId: 'ev_serp' })).toBe(1)
    const rows = deps.createKeywordGaps.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({ runId: 'run_1', keywordId: 'kw_1', gapType: 'missing', ourPosition: null, opportunityScore: '4', evidenceId: 'ev_serp' })
    expect(await persistKeywordGaps(deps as never, { projectId: 'proj_1', runId: 'run_1', market: '', language: '', gaps: [], serpEvidenceId: 'ev_serp' })).toBe(0)
    expect(deps.createKeywordGaps).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/diagnosis/competitor-context.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现（逻辑原样从 reevaluate-competitors.ts 131-192 行搬出）**

Create `lib/diagnosis/competitor-context.ts`:

```ts
import type { computeKeywordGaps, KeywordGapResult } from './keyword-gap'
import type { DiagnosisEvidenceRow, RuleContext } from './types'
import type { SeedSerpEntry, LabsKeywordDatum } from '@/lib/dataforseo/types'
import type { upsertKeyword, createKeywordGaps } from '@/lib/repositories'

// 已确认竞品相关的规则输入（spec 2026-10-09 §5.4-1）：主诊断与竞品确认后的再评估共用，口径一致。
export interface CompetitorInputs {
  confirmedCompetitors: { domain: string; name: string }[]
  gaps: KeywordGapResult[]
  ctxGaps: RuleContext['keywordGaps']
  serpEvidenceId: string | null
  // 探针 SoV 竞品集：项目手填竞品 ∪ 已确认竞品名（缺名回退域名）——名才能被答案原文匹配到（SP-A2 #6）。
  probeCompetitors: string[]
}

export function buildCompetitorInputs(args: {
  evidence: DiagnosisEvidenceRow[]
  confirmed: { domain: string; name: string | null }[]
  projectDomain: string
  projectCompetitors: string[]
  computeKeywordGaps: typeof computeKeywordGaps
}): CompetitorInputs {
  const confirmedCompetitors = args.confirmed.map((c) => ({ domain: c.domain, name: c.name ?? '' }))
  const serpRow = args.evidence.find((e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'seed_serp')
  const serpResults = serpRow ? ((serpRow.payload as { results?: SeedSerpEntry[] }).results ?? []) : []
  const serpEvidenceId = serpRow?.id ?? null
  const labsRow = args.evidence.find((e) => e.type === 'dataforseo_labs')
  const keywordData = labsRow ? ((labsRow.payload as { keywords?: LabsKeywordDatum[] }).keywords ?? []) : []

  // 缺口计算需种子 SERP + 已确认竞品；缺一则空（K03/K04 由台账记「没查」，见 rule-meta）。
  const gaps =
    serpResults.length && confirmedCompetitors.length && serpEvidenceId
      ? args.computeKeywordGaps({
          serp: serpResults,
          ownDomain: args.projectDomain,
          confirmedCompetitorDomains: confirmedCompetitors.map((c) => c.domain),
          keywordData,
        })
      : []
  const ctxGaps: RuleContext['keywordGaps'] = serpEvidenceId
    ? gaps.map((g) => ({
        keyword: g.keyword,
        gapType: g.gapType,
        ourPosition: g.ourPosition,
        opportunityScore: g.opportunityScore,
        searchVolume: g.searchVolume,
        evidenceId: serpEvidenceId,
      }))
    : []
  const tokens = confirmedCompetitors.map((c) => c.name || c.domain)
  return {
    confirmedCompetitors,
    gaps,
    ctxGaps,
    serpEvidenceId,
    probeCompetitors: [...new Set([...args.projectCompetitors, ...tokens])],
  }
}

// 落 keyword_gaps（upsert 关键词取 id）。返回写入行数。
export async function persistKeywordGaps(
  deps: { upsertKeyword: typeof upsertKeyword; createKeywordGaps: typeof createKeywordGaps },
  args: { projectId: string; runId: string; market: string; language: string; gaps: KeywordGapResult[]; serpEvidenceId: string | null },
): Promise<number> {
  if (!args.gaps.length || !args.serpEvidenceId) return 0
  const rows: Parameters<typeof createKeywordGaps>[0] = []
  for (const g of args.gaps) {
    const [kw] = await deps.upsertKeyword({
      id: `kw_${crypto.randomUUID()}`,
      projectId: args.projectId,
      text: g.keyword,
      market: args.market,
      language: args.language,
      source: 'dataforseo',
      intent: '',
    })
    rows.push({
      id: `gap_${crypto.randomUUID()}`,
      runId: args.runId,
      keywordId: kw.id,
      gapType: g.gapType,
      ourPosition: g.ourPosition === null ? null : String(g.ourPosition),
      competitorPositions: g.competitorPositions,
      opportunityScore: String(g.opportunityScore),
      evidenceId: args.serpEvidenceId,
    })
  }
  await deps.createKeywordGaps(rows)
  return rows.length
}
```

（若 `keyword-gap.ts` 没有导出 `KeywordGapResult` 类型名，用 `ReturnType<typeof computeKeywordGaps>[number]` 定义同名本地类型。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/diagnosis/competitor-context.test.ts`
Expected: PASS

- [ ] **Step 5: 再评估改用共享函数（行为不变）**

`lib/inngest/reevaluate-competitors.ts` 的 `reeval-rules` step 内：把从 `const confirmedDomains = ...` 到 `const competitors = [...new Set(...)]`（约 131-192 行）替换为：

```ts
    const inputs = buildCompetitorInputs({
      evidence,
      confirmed,
      projectDomain: project.domain,
      projectCompetitors: project.competitors ?? [],
      computeKeywordGaps: deps.computeKeywordGaps,
    })
    await persistKeywordGaps(deps, {
      projectId, runId, market: project.market ?? '', language: project.language ?? '', gaps: inputs.gaps, serpEvidenceId: inputs.serpEvidenceId,
    })
    const competitors = inputs.probeCompetitors
    const confirmedCompetitors = inputs.confirmedCompetitors
    const ctxGaps = inputs.ctxGaps
```

其后对 `confirmedCompetitors`、`ctxGaps`、`competitors` 的使用保持不变。Run: `pnpm vitest run lib/inngest/reevaluate-competitors.test.ts`，Expected: PASS（既有断言不改）。

- [ ] **Step 6: 主诊断的失败测试**

在 `lib/inngest/generate-findings.test.ts` 的 `makeDeps` 里加默认依赖：

```ts
    getConfirmedCompetitors: vi.fn(async () => []),
    upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]),
    createKeywordGaps: vi.fn(async (rows: unknown[]) => rows),
    computeKeywordGaps: vi.fn(() => []),
```

并加用例：

```ts
  it('主诊断带上已确认竞品与关键词缺口（spec §5.4-1：竞品类规则不再只在再评估里跑）', async () => {
    const serp = { id: 'ev_serp', type: 'dataforseo_serp', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null, payload: { kind: 'seed_serp', results: [{ keyword: 'k', items: [] }] } }
    const deps = makeDeps({
      getRunEvidence: vi.fn(async () => [serp]),
      getConfirmedCompetitors: vi.fn(async () => [{ id: 'cmp_1', domain: 'rival.com', name: 'Rival' }]),
      computeKeywordGaps: vi.fn(() => [{ keyword: 'k', gapType: 'missing', ourPosition: null, competitorPositions: {}, opportunityScore: 2, searchVolume: 100 }]),
    })
    const { args } = makeArgs()
    await generateFindingsHandler(args, asDeps(deps))
    const ctxInput = deps.buildRuleContext.mock.calls[0][0] as { confirmedCompetitors: unknown[]; keywordGaps: unknown[] }
    expect(ctxInput.confirmedCompetitors).toEqual([{ domain: 'rival.com', name: 'Rival' }])
    expect(ctxInput.keywordGaps).toEqual([{ keyword: 'k', gapType: 'missing', ourPosition: null, opportunityScore: 2, searchVolume: 100, evidenceId: 'ev_serp' }])
    expect(deps.createKeywordGaps).toHaveBeenCalledTimes(1)
    const probeInput = deps.aggregateProbeSummary.mock.calls[0][0] as { competitors: string[] }
    expect(probeInput.competitors).toEqual(['rival.com', 'Rival'])
  })
```

（`makeDeps` 的默认项目 `competitors: ['rival.com']`，所以探针竞品集是 `['rival.com', 'Rival']`。）

Run: `pnpm vitest run lib/inngest/generate-findings.test.ts`
Expected: 新用例 FAIL（`confirmedCompetitors` 未传）。

- [ ] **Step 7: 主诊断接线**

`lib/inngest/generate-findings.ts`：
- `GenerateFindingsDeps` 加 `getConfirmedCompetitors: typeof getConfirmedCompetitors`、`upsertKeyword: typeof upsertKeyword`、`createKeywordGaps: typeof createKeywordGaps`、`computeKeywordGaps: typeof computeKeywordGaps`，`defaultDeps()` 对应补上（前三个从 `@/lib/repositories` 导入，后一个从 `@/lib/diagnosis/keyword-gap` 导入）。
- `run-rules` step：`Promise.all` 里加 `deps.getConfirmedCompetitors(projectId)`；在构造 `evidence` 之后加

```ts
    const competitorInputs = buildCompetitorInputs({
      evidence,
      confirmed,
      projectDomain: project.domain,
      projectCompetitors: project.competitors ?? [],
      computeKeywordGaps: deps.computeKeywordGaps,
    })
```

  把原来的 `const competitors = project.competitors ?? []` 改为 `const competitors = competitorInputs.probeCompetitors`（只用于探针聚合）；`deps.buildRuleContext({...})` 的 `project.competitors` 仍传 `project.competitors ?? []`，并加 `confirmedCompetitors: competitorInputs.confirmedCompetitors, keywordGaps: competitorInputs.ctxGaps`；step 返回值加 `gaps: competitorInputs.gaps, serpEvidenceId: competitorInputs.serpEvidenceId, market: project.market ?? '', language: project.language ?? ''`。
- 在 `run-rules` 之后、`create-findings` 之前加：

```ts
  // 关键词缺口落库单独一步：step 记忆化保证重试不重复写（spec §5.4-1）。
  await step.run('persist-keyword-gaps', () =>
    persistKeywordGaps(deps, { projectId, runId, market, language, gaps, serpEvidenceId }),
  )
```

  （`market`、`language`、`gaps`、`serpEvidenceId` 从 `run-rules` 的返回值解构。）

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm vitest run lib/inngest lib/diagnosis/competitor-context.test.ts && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add lib/diagnosis/competitor-context.ts lib/diagnosis/competitor-context.test.ts lib/inngest/reevaluate-competitors.ts lib/inngest/generate-findings.ts lib/inngest/generate-findings.test.ts
git commit -m "fix(diagnosis): 主诊断带上已确认竞品与关键词缺口，竞品类规则不再只在再评估里跑"
```

---

### Task 7: 问题类型与展示状态推导

**Files:**
- Create: `lib/issues/types.ts`
- Create: `lib/issues/status.ts`、`lib/issues/status.test.ts`

**Interfaces:**
- Produces（`lib/issues/types.ts`）:

```ts
export type IssueSeverity = 'high' | 'mid' | 'ok'
export type IssueDecision = 'pending' | 'included' | 'deferred' | 'false_positive'
export type IssueDetection = 'present' | 'gone'
export type IssueStatus = 'pending' | 'to_execute' | 'executed_awaiting' | 'fixed' | 'not_effective' | 'self_resolved' | 'excluded' | 'retired'
export type IssueFlag = 'new' | 'worse' | 'relapse' | 'partial' | 'unverified' | 'protocol_changed' | 'rule_changed'
export type UnverifiedReason = 'data_gap' | 'site_condition' | 'unsupported' | 'error' | 'history_no_ledger'
export type RetiredReason = 'protocol_changed' | 'rule_changed'
export type HumanActor = 'operator' | 'owner'
export type EventActor = 'system' | HumanActor
export interface IssueRecord { /* 与 issues 表逐列对应，见 Step 3 */ }
export interface IssueEventDraft { /* 与 issue_events 表逐列对应，见 Step 3 */ }
```

- `deriveStatus(i: StatusInput): IssueStatus`，`interface StatusInput { decision; executedAt; detection; lastCheckedAt; retiredReason }`

- [ ] **Step 1: 写失败测试**

Create `lib/issues/status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveStatus, type StatusInput } from './status'

const T0 = '2026-10-01T00:00:00.000Z' // 执行时间
const BEFORE = '2026-09-30T00:00:00.000Z'
const AFTER = '2026-10-02T00:00:00.000Z'
const s = (over: Partial<StatusInput>): StatusInput => ({
  decision: 'pending', executedAt: null, detection: 'present', lastCheckedAt: BEFORE, retiredReason: null, ...over,
})

describe('deriveStatus（spec 4.2 / 4.4）', () => {
  it.each<[string, Partial<StatusInput>, string]>([
    ['待处理 + 查出 → 待处理', {}, 'pending'],
    ['待处理 + 没了 → 自行消失', { detection: 'gone' }, 'self_resolved'],
    ['已纳入未执行 + 查出 → 待执行', { decision: 'included' }, 'to_execute'],
    ['已纳入未执行 + 没了 → 自行消失', { decision: 'included', detection: 'gone' }, 'self_resolved'],
    ['已执行，最近检查早于执行 → 已执行待复查', { decision: 'included', executedAt: T0, lastCheckedAt: BEFORE }, 'executed_awaiting'],
    ['已执行，还没有检查时间 → 已执行待复查', { decision: 'included', executedAt: T0, lastCheckedAt: null }, 'executed_awaiting'],
    ['已执行，执行后检查仍查出 → 改了没生效', { decision: 'included', executedAt: T0, lastCheckedAt: AFTER }, 'not_effective'],
    ['已执行，执行后检查没了 → 已修复', { decision: 'included', executedAt: T0, lastCheckedAt: AFTER, detection: 'gone' }, 'fixed'],
    ['检查与执行同一时刻算执行之后（与 isRetestAttributable 同口径）', { decision: 'included', executedAt: T0, lastCheckedAt: T0, detection: 'gone' }, 'fixed'],
    ['执行时间无法解析 → 保守为待复查', { decision: 'included', executedAt: 'not-a-date', lastCheckedAt: AFTER, detection: 'gone' }, 'executed_awaiting'],
    ['暂不处理 → 已排除', { decision: 'deferred' }, 'excluded'],
    ['误报 → 已排除', { decision: 'false_positive', detection: 'gone' }, 'excluded'],
    ['已关闭 → retired', { decision: 'included', retiredReason: 'protocol_changed' }, 'retired'],
    ['排除优先于关闭（4.4-9）', { decision: 'false_positive', retiredReason: 'rule_changed' }, 'excluded'],
  ])('%s', (_name, over, expected) => {
    expect(deriveStatus(s(over))).toBe(expected)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/status.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现类型与状态推导**

Create `lib/issues/types.ts`:

```ts
// 问题台账类型（spec 2026-10-09 §4、§6）。与 db/schema.ts 的 issues / issue_events 逐列对应。
export type IssueSeverity = 'high' | 'mid' | 'ok'
export type IssueDecision = 'pending' | 'included' | 'deferred' | 'false_positive'
export type IssueDetection = 'present' | 'gone'
export type IssueStatus =
  | 'pending'
  | 'to_execute'
  | 'executed_awaiting'
  | 'fixed'
  | 'not_effective'
  | 'self_resolved'
  | 'excluded'
  | 'retired'
export type IssueFlag = 'new' | 'worse' | 'relapse' | 'partial' | 'unverified' | 'protocol_changed' | 'rule_changed'
export type UnverifiedReason = 'data_gap' | 'site_condition' | 'unsupported' | 'error' | 'history_no_ledger'
export type RetiredReason = 'protocol_changed' | 'rule_changed'
export type HumanActor = 'operator' | 'owner'
export type EventActor = 'system' | HumanActor

export interface IssueRecord {
  id: string
  projectId: string
  fingerprint: string
  ruleId: string
  ruleVersion: number
  pillar: string | null
  side: string
  title: string
  severity: IssueSeverity
  affectedCount: number | null
  latestFindingId: string | null
  decision: IssueDecision
  decisionReason: string | null
  decidedAt: string | null
  decidedBy: HumanActor | null
  executedAt: string | null
  executedNote: string | null
  executedBy: HumanActor | null
  detection: IssueDetection
  status: IssueStatus
  flags: IssueFlag[]
  unverifiedReason: UnverifiedReason | null
  retiredReason: RetiredReason | null
  protocolHash: string | null
  firstSeenRunId: string | null
  lastSeenRunId: string | null
  lastCheckedRunId: string | null
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IssueEventDraft {
  id: string
  issueId: string
  runId: string | null
  kind: 'observed' | 'decision' | 'execution'
  checked: boolean | null
  hit: boolean | null
  severity: IssueSeverity | null
  affectedCount: number | null
  fromStatus: IssueStatus | null
  toStatus: IssueStatus
  flags: IssueFlag[]
  note: string | null
  actor: EventActor
  createdAt: string
}
```

Create `lib/issues/status.ts`:

```ts
import type { IssueDecision, IssueDetection, IssueStatus, RetiredReason } from './types'

export interface StatusInput {
  decision: IssueDecision
  executedAt: string | null
  detection: IssueDetection
  // 最近一次真正查过本问题的体检的开始时间。
  lastCheckedAt: string | null
  retiredReason: RetiredReason | null
}

const ms = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN)

// 展示状态（spec 4.2）。顺序即优先级：排除优先（4.4-9）→ 已关闭 → 按决定 / 执行 / 检测推出。
export function deriveStatus(i: StatusInput): IssueStatus {
  if (i.decision === 'deferred' || i.decision === 'false_positive') return 'excluded'
  if (i.retiredReason) return 'retired'
  if (i.decision === 'pending') return i.detection === 'present' ? 'pending' : 'self_resolved'
  if (!i.executedAt) return i.detection === 'present' ? 'to_execute' : 'self_resolved'
  // 4.4-2：只认执行之后开始的体检；没有这样的体检（或时间无法比较）→ 已执行，待复查。
  const executed = ms(i.executedAt)
  const checked = ms(i.lastCheckedAt)
  if (!Number.isFinite(executed) || !Number.isFinite(checked) || checked < executed) return 'executed_awaiting'
  return i.detection === 'present' ? 'not_effective' : 'fixed'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/issues/status.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add lib/issues/types.ts lib/issues/status.ts lib/issues/status.test.ts
git commit -m "feat(issues): 问题类型与展示状态推导"
```

---

### Task 8: 对账——一次体检之后问题表怎么变（纯函数）

**Files:**
- Create: `lib/issues/reconcile.ts`、`lib/issues/reconcile.test.ts`

**Interfaces:**
- Consumes: Task 7 的类型与 `deriveStatus`。
- Produces:

```ts
export interface ObservedHit { findingId: string; fingerprint: string; ruleId: string; title: string; pillar: string | null; side: string; severity: IssueSeverity; affectedCount: number | null }
export interface LedgerEntry { ruleId: string; ruleVersion: number; outcome: 'hit' | 'clear' | 'not_checked' | 'error'; reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null }
export interface ReconcileInput {
  projectId: string
  run: { id: string; startedAt: string; protocolHash: string | null }
  issues: IssueRecord[]
  hits: ObservedHit[]
  ledger: LedgerEntry[]
  protocolBoundRuleIds: ReadonlySet<string>
  missingLedger: 'retire' | 'history'
  onlyRuleIds?: ReadonlySet<string>
  newIssueId: () => string
  now: string
}
export interface ReconcileOutput { issues: IssueRecord[]; events: IssueEventDraft[] }
export function reconcileIssues(input: ReconcileInput): ReconcileOutput
export const observedEventId = (runId: string, issueId: string) => `iev_obs_${runId}_${issueId}`
```

规则（spec 4.4 / 5.1）：
- 本次命中：表里没有 → 新建（`pending` + `new`）；表里有 → 更新检测与观测字段，按 4.4 加标记、转状态。
- 表里有、本次没命中：台账没这条规则 → `missingLedger === 'retire'` 时关闭为 `rule_changed`（规则已下线），`'history'` 时记未复查 `history_no_ledger`；台账「没查 / 出错」→ 未复查（检测值与检查时间都不动）；规则版本变了 → 关闭 `rule_changed`；受协议约束且协议指纹变了 → 关闭 `protocol_changed`；否则检测为 `gone`。
- `onlyRuleIds` 给定时只处理这些规则的问题与命中（竞品再评估的局部对账）。
- 每个处理过的问题产出一条 `observed` 变化记录，id 用 `observedEventId` 保证同一次体检重算时覆盖而不是叠加。

- [ ] **Step 1: 写失败测试**

Create `lib/issues/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reconcileIssues, observedEventId, type ReconcileInput, type ObservedHit, type LedgerEntry } from './reconcile'
import type { IssueRecord } from './types'

const RUN = { id: 'run_2', startedAt: '2026-11-01T00:00:00.000Z', protocolHash: 'P1' }
const NOW = '2026-11-01T01:00:00.000Z'

const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo',
  title: '不符合 Google 富媒体结果要求', severity: 'mid', affectedCount: 2, latestFindingId: 'find_old',
  decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null,
  detection: 'present', status: 'pending', flags: [], unverifiedReason: null, retiredReason: null,
  protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const hit = (over: Partial<ObservedHit> = {}): ObservedHit => ({
  findingId: 'find_new', fingerprint: 'fp_1', ruleId: 'C05c', title: '不符合 Google 富媒体结果要求', pillar: 'P2', side: 'seo', severity: 'mid', affectedCount: 2, ...over,
})
const led = (ruleId: string, outcome: LedgerEntry['outcome'], over: Partial<LedgerEntry> = {}): LedgerEntry => ({ ruleId, ruleVersion: 1, outcome, reasonKind: null, ...over })

const run = (over: Partial<ReconcileInput>) => {
  let n = 0
  return reconcileIssues({
    projectId: 'proj_1', run: RUN, issues: [], hits: [], ledger: [], protocolBoundRuleIds: new Set(['G05']),
    missingLedger: 'retire', newIssueId: () => `iss_new_${++n}`, now: NOW, ...over,
  })
}
const only = (out: ReturnType<typeof reconcileIssues>) => {
  expect(out.issues).toHaveLength(1)
  expect(out.events).toHaveLength(1)
  return { i: out.issues[0], e: out.events[0] }
}

describe('reconcileIssues', () => {
  it('只在本次命中里有 → 新建问题：待处理 + 新出现，首见/最近见/最近检查都是本次', () => {
    const { i, e } = only(run({ hits: [hit({ fingerprint: 'fp_9' })], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({
      id: 'iss_new_1', fingerprint: 'fp_9', decision: 'pending', status: 'pending', detection: 'present', flags: ['new'],
      firstSeenRunId: 'run_2', lastSeenRunId: 'run_2', lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, protocolHash: 'P1', latestFindingId: 'find_new',
    })
    expect(e).toMatchObject({ id: observedEventId('run_2', 'iss_new_1'), kind: 'observed', checked: true, hit: true, fromStatus: null, toStatus: 'pending', actor: 'system' })
  })

  it('只在问题表里有、规则查过且没命中 → 没了：待处理变自行消失', () => {
    const { i, e } = only(run({ issues: [issue()], ledger: [led('C05c', 'clear')] }))
    expect(i).toMatchObject({ detection: 'gone', status: 'self_resolved', lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, flags: [] })
    expect(e).toMatchObject({ checked: true, hit: false, fromStatus: 'pending', toStatus: 'self_resolved' })
  })

  it('两边都有、严重度上升 → 变严重；受影响数下降 → 部分改善', () => {
    expect(only(run({ issues: [issue()], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i.flags).toEqual(['worse'])
    expect(only(run({ issues: [issue()], hits: [hit({ affectedCount: 1 })], ledger: [led('C05c', 'hit')] })).i.flags).toEqual(['partial'])
  })

  it('已执行，执行后的体检仍命中 → 改了没生效；没命中 → 已修复', () => {
    const executed = issue({ decision: 'included', decidedBy: 'operator', executedAt: '2026-10-15T00:00:00.000Z', status: 'executed_awaiting' })
    expect(only(run({ issues: [executed], hits: [hit()], ledger: [led('C05c', 'hit')] })).i.status).toBe('not_effective')
    expect(only(run({ issues: [executed], ledger: [led('C05c', 'clear')] })).i.status).toBe('fixed')
  })

  it('执行时间晚于本次体检开始 → 仍是已执行待复查（Review Focus 2）', () => {
    const late = issue({ decision: 'included', executedAt: '2026-11-01T00:30:00.000Z', status: 'executed_awaiting' })
    expect(only(run({ issues: [late], ledger: [led('C05c', 'clear')] })).i.status).toBe('executed_awaiting')
  })

  it.each<[LedgerEntry, string]>([
    [led('C05c', 'not_checked', { reasonKind: 'data_gap' }), 'data_gap'],
    [led('C05c', 'not_checked', { reasonKind: 'site_condition' }), 'site_condition'],
    [led('C05c', 'not_checked', { reasonKind: 'unsupported' }), 'unsupported'],
    [led('C05c', 'error', { reasonKind: 'error' }), 'error'],
  ])('没查 / 出错（%j）→ 未复查，检测与检查时间都不动，状态不变（Review Focus 5）', (entry, reason) => {
    const executed = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', status: 'executed_awaiting' })
    const { i, e } = only(run({ issues: [executed], ledger: [entry] }))
    expect(i).toMatchObject({ detection: 'present', lastCheckedRunId: 'run_1', lastCheckedAt: '2026-10-01T00:00:00.000Z', status: 'executed_awaiting', flags: ['unverified'], unverifiedReason: reason })
    expect(e).toMatchObject({ checked: false, hit: false, note: reason })
  })

  it('规则版本变了且没命中 → 关闭（规则已更新），不算修复', () => {
    const { i } = only(run({ issues: [issue({ decision: 'included' })], ledger: [led('C05c', 'clear', { ruleVersion: 2 })] }))
    expect(i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], ruleVersion: 2 })
  })

  it('台账里没有这条规则（已下线）→ 关闭；历史回填模式 → 未复查 history_no_ledger', () => {
    expect(only(run({ issues: [issue()], ledger: [] })).i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed' })
    expect(only(run({ issues: [issue()], ledger: [], missingLedger: 'history' })).i).toMatchObject({ status: 'pending', flags: ['unverified'], unverifiedReason: 'history_no_ledger' })
  })

  it('受协议约束的规则：协议变了且没命中 → 关闭（协议已变）；协议没变 → 正常判没了', () => {
    const ai = issue({ ruleId: 'G05', protocolHash: 'P0' })
    expect(only(run({ issues: [ai], ledger: [led('G05', 'clear')] })).i).toMatchObject({ status: 'retired', retiredReason: 'protocol_changed', protocolHash: 'P1' })
    expect(only(run({ issues: [issue({ ruleId: 'G05' })], ledger: [led('G05', 'clear')] })).i.status).toBe('self_resolved')
  })

  it('不受协议约束的规则换协议照常比较', () => {
    expect(only(run({ issues: [issue({ protocolHash: 'P0' })], ledger: [led('C05c', 'clear')] })).i.status).toBe('self_resolved')
  })

  it('关闭的问题在新口径下再命中 → 新出现，已纳入的回到待执行（执行记录清空）', () => {
    const retired = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', retiredReason: 'rule_changed', status: 'retired' })
    const { i } = only(run({ issues: [retired], hits: [hit()], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({ status: 'to_execute', retiredReason: null, executedAt: null, flags: ['new'] })
  })

  it('已修复的问题再命中 → 复发，回到待执行；待处理的自行消失再命中 → 复发，仍待处理', () => {
    const fixed = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', detection: 'gone', status: 'fixed', lastCheckedAt: '2026-10-20T00:00:00.000Z' })
    expect(only(run({ issues: [fixed], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ status: 'to_execute', executedAt: null, flags: ['relapse'] })
    expect(only(run({ issues: [issue({ detection: 'gone', status: 'self_resolved' })], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ status: 'pending', flags: ['relapse'] })
  })

  it('暂不处理的问题变严重 → 退回待处理；误报变严重 → 仍排除', () => {
    const deferred = issue({ decision: 'deferred', decisionReason: '先做 Google', decidedBy: 'operator', status: 'excluded' })
    expect(only(run({ issues: [deferred], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ decision: 'pending', decisionReason: null, status: 'pending', flags: ['worse'] })
    const fp = issue({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', status: 'excluded' })
    expect(only(run({ issues: [fp], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ decision: 'false_positive', status: 'excluded', flags: ['worse'] })
  })

  it('排除优先：误报的问题遇到规则版本变化只加标记，仍是已排除（4.4-9）', () => {
    const fp = issue({ decision: 'false_positive', decisionReason: 'x', status: 'excluded' })
    expect(only(run({ issues: [fp], ledger: [led('C05c', 'clear', { ruleVersion: 2 })] })).i).toMatchObject({ status: 'excluded', flags: ['rule_changed'] })
  })

  it('同一指纹本次有多条命中 → 取最严重的一条', () => {
    const { i } = only(run({ hits: [hit({ severity: 'ok', findingId: 'f_a' }), hit({ severity: 'high', findingId: 'f_b' })], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({ severity: 'high', latestFindingId: 'f_b' })
  })

  it('onlyRuleIds：只处理给定规则的问题与命中，其余原样不出现在输出里', () => {
    const out = run({
      issues: [issue(), issue({ id: 'iss_2', fingerprint: 'fp_2', ruleId: 'Q01' })],
      hits: [hit({ fingerprint: 'fp_3', ruleId: 'Q01' }), hit({ fingerprint: 'fp_4', ruleId: 'C05c' })],
      ledger: [led('Q01', 'hit'), led('C05c', 'clear')],
      onlyRuleIds: new Set(['Q01']),
    })
    expect(out.issues.map((i) => i.fingerprint).sort()).toEqual(['fp_2', 'fp_3'])
  })

  it('同一体检对同一问题的变化记录 id 固定（重算时覆盖，不叠加）', () => {
    expect(run({ issues: [issue()], ledger: [led('C05c', 'clear')] }).events[0].id).toBe('iev_obs_run_2_iss_1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/reconcile.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `lib/issues/reconcile.ts`:

```ts
import { deriveStatus } from './status'
import type { IssueEventDraft, IssueFlag, IssueRecord, IssueSeverity, RetiredReason, UnverifiedReason } from './types'

export interface ObservedHit {
  findingId: string
  fingerprint: string
  ruleId: string
  title: string
  pillar: string | null
  side: string
  severity: IssueSeverity
  affectedCount: number | null
}

export interface LedgerEntry {
  ruleId: string
  ruleVersion: number
  outcome: 'hit' | 'clear' | 'not_checked' | 'error'
  reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null
}

export interface ReconcileInput {
  projectId: string
  run: { id: string; startedAt: string; protocolHash: string | null }
  issues: IssueRecord[]
  hits: ObservedHit[]
  ledger: LedgerEntry[]
  protocolBoundRuleIds: ReadonlySet<string>
  // 台账里没有这条规则时：retire = 规则已下线（关闭）；history = 历史回填，旧体检没有台账（未复查）。
  missingLedger: 'retire' | 'history'
  onlyRuleIds?: ReadonlySet<string>
  newIssueId: () => string
  now: string
}

export interface ReconcileOutput {
  issues: IssueRecord[]
  events: IssueEventDraft[]
}

export const observedEventId = (runId: string, issueId: string) => `iev_obs_${runId}_${issueId}`

const RANK: Record<IssueSeverity, number> = { ok: 0, mid: 1, high: 2 }

const withStatus = (i: IssueRecord): IssueRecord => ({ ...i, status: deriveStatus(i) })

function event(input: ReconcileInput, from: IssueRecord | null, next: IssueRecord, checked: boolean, hit: boolean, note: string | null): IssueEventDraft {
  return {
    id: observedEventId(input.run.id, next.id),
    issueId: next.id,
    runId: input.run.id,
    kind: 'observed',
    checked,
    hit,
    severity: hit ? next.severity : null,
    affectedCount: hit ? next.affectedCount : null,
    fromStatus: from ? from.status : null,
    toStatus: next.status,
    flags: next.flags,
    note,
    actor: 'system',
    createdAt: input.now,
  }
}

function observedFields(input: ReconcileInput, h: ObservedHit, ruleVersion: number) {
  return {
    detection: 'present' as const,
    severity: h.severity,
    affectedCount: h.affectedCount,
    title: h.title,
    pillar: h.pillar,
    side: h.side,
    latestFindingId: h.findingId,
    ruleVersion,
    protocolHash: input.run.protocolHash,
    lastSeenRunId: input.run.id,
    lastCheckedRunId: input.run.id,
    lastCheckedAt: input.run.startedAt,
    retiredReason: null,
    unverifiedReason: null,
    updatedAt: input.now,
  }
}

function applyHit(input: ReconcileInput, issue: IssueRecord, h: ObservedHit, entry: LedgerEntry | undefined) {
  const flags: IssueFlag[] = []
  let { decision, decisionReason, decidedAt, decidedBy, executedAt, executedNote, executedBy } = issue
  const clearExecution = () => {
    executedAt = null
    executedNote = null
    executedBy = null
  }
  if (issue.retiredReason) {
    // 4.4-8：关闭后在新口径下再命中，按新出现处理；已纳入的回到待执行。
    flags.push('new')
    if (decision === 'included') clearExecution()
  } else if (issue.detection === 'gone') {
    // 4.4-5：已修复 / 自行消失后又命中 → 复发；已纳入的回到待执行（执行历史留在变化记录）。
    flags.push('relapse')
    if (decision === 'included') clearExecution()
  }
  if (RANK[h.severity] > RANK[issue.severity]) {
    flags.push('worse')
    // 4.4-4：暂不处理的问题变严重 → 退回待处理；误报不退回。
    if (decision === 'deferred') {
      decision = 'pending'
      decisionReason = null
      decidedAt = null
      decidedBy = null
    }
  }
  if (!issue.retiredReason && issue.detection === 'present' && h.affectedCount !== null && issue.affectedCount !== null && h.affectedCount < issue.affectedCount) {
    flags.push('partial')
  }
  const next = withStatus({
    ...issue,
    ...observedFields(input, h, entry?.ruleVersion ?? issue.ruleVersion),
    decision,
    decisionReason,
    decidedAt,
    decidedBy,
    executedAt,
    executedNote,
    executedBy,
    flags,
  })
  return { issue: next, event: event(input, issue, next, true, true, null) }
}

function unverified(input: ReconcileInput, issue: IssueRecord, reason: UnverifiedReason) {
  // 4.4-3：没查 / 出错 → 检测值与检查时间都不动，状态不变，只加标记与原因。
  const next = withStatus({ ...issue, flags: ['unverified'], unverifiedReason: reason, updatedAt: input.now })
  return { issue: next, event: event(input, issue, next, false, false, reason) }
}

function retire(input: ReconcileInput, issue: IssueRecord, reason: RetiredReason, entry: LedgerEntry | undefined) {
  // 4.4-6 / 4.4-7：新口径下没命中 → 关闭，不算修复；排除优先（deriveStatus 里 excluded 先于 retired）。
  const next = withStatus({
    ...issue,
    retiredReason: reason,
    flags: [reason],
    unverifiedReason: null,
    ruleVersion: entry?.ruleVersion ?? issue.ruleVersion,
    protocolHash: input.run.protocolHash,
    lastCheckedRunId: input.run.id,
    lastCheckedAt: input.run.startedAt,
    updatedAt: input.now,
  })
  return { issue: next, event: event(input, issue, next, true, false, reason) }
}

function applyMiss(input: ReconcileInput, issue: IssueRecord, entry: LedgerEntry | undefined) {
  if (!entry) {
    return input.missingLedger === 'history' ? unverified(input, issue, 'history_no_ledger') : retire(input, issue, 'rule_changed', undefined)
  }
  if (entry.outcome === 'not_checked') return unverified(input, issue, entry.reasonKind ?? 'unsupported')
  if (entry.outcome === 'error') return unverified(input, issue, 'error')
  if (entry.ruleVersion !== issue.ruleVersion) return retire(input, issue, 'rule_changed', entry)
  if (input.protocolBoundRuleIds.has(issue.ruleId) && issue.protocolHash !== input.run.protocolHash) {
    return retire(input, issue, 'protocol_changed', entry)
  }
  const next = withStatus({
    ...issue,
    detection: 'gone',
    flags: [],
    unverifiedReason: null,
    lastCheckedRunId: input.run.id,
    lastCheckedAt: input.run.startedAt,
    updatedAt: input.now,
  })
  return { issue: next, event: event(input, issue, next, true, false, null) }
}

function createIssue(input: ReconcileInput, h: ObservedHit, entry: LedgerEntry | undefined) {
  const next = withStatus({
    id: input.newIssueId(),
    projectId: input.projectId,
    fingerprint: h.fingerprint,
    ruleId: h.ruleId,
    decision: 'pending',
    decisionReason: null,
    decidedAt: null,
    decidedBy: null,
    executedAt: null,
    executedNote: null,
    executedBy: null,
    status: 'pending',
    flags: ['new'],
    firstSeenRunId: input.run.id,
    createdAt: input.now,
    ...observedFields(input, h, entry?.ruleVersion ?? 1),
  })
  return { issue: next, event: event(input, null, next, true, true, null) }
}

// 对账（spec 2026-10-09 §5.1）：问题现状 + 本次命中 + 台账 → 问题表更新与变化记录。纯函数。
export function reconcileIssues(input: ReconcileInput): ReconcileOutput {
  const inScope = (ruleId: string) => !input.onlyRuleIds || input.onlyRuleIds.has(ruleId)
  const ledgerByRule = new Map(input.ledger.map((e) => [e.ruleId, e]))
  const hitsByFp = new Map<string, ObservedHit>()
  for (const h of input.hits) {
    if (!inScope(h.ruleId)) continue
    const prev = hitsByFp.get(h.fingerprint)
    if (!prev || RANK[h.severity] > RANK[prev.severity]) hitsByFp.set(h.fingerprint, h)
  }

  const out: ReconcileOutput = { issues: [], events: [] }
  const push = (r: { issue: IssueRecord; event: IssueEventDraft }) => {
    out.issues.push(r.issue)
    out.events.push(r.event)
  }
  const known = new Set<string>()
  for (const issue of input.issues) {
    if (!inScope(issue.ruleId)) continue
    known.add(issue.fingerprint)
    const h = hitsByFp.get(issue.fingerprint)
    const entry = ledgerByRule.get(issue.ruleId)
    push(h ? applyHit(input, issue, h, entry) : applyMiss(input, issue, entry))
  }
  for (const [fp, h] of hitsByFp) {
    if (!known.has(fp)) push(createIssue(input, h, ledgerByRule.get(h.ruleId)))
  }
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/issues`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add lib/issues/reconcile.ts lib/issues/reconcile.test.ts
git commit -m "feat(issues): 对账纯函数——新出现、复发、已修复、未复查、关闭与排除优先"
```

---

### Task 9: 问题仓储——读写、事务、复查提醒、体检变化摘要与待办

**Files:**
- Create: `lib/repositories/issues.ts`、`lib/repositories/issues.repo.test.ts`
- Modify: `lib/repositories/index.ts`（末尾 `export * from './validators'` 之后加 `export * from './issues'`）

**Interfaces:**
- Consumes: Task 1 表；Task 3 `LedgerRow`；Task 7 类型。
- Produces:
  - `RETEST_WINDOW_DAYS = 28`
  - `getProjectIssues(projectId): Promise<IssueRecord[]>`、`getIssue(id): Promise<IssueRecord | undefined>`、`getIssueByFingerprint(projectId, fingerprint): Promise<IssueRecord | undefined>`
  - `saveIssueChanges(changes: { issues: IssueRecord[]; events: IssueEventDraft[] }): Promise<void>`（单事务；问题按 id upsert；变化记录按 id upsert）
  - `hasObservedEvents(runId): Promise<boolean>`
  - `saveCheckLedger(runId, rows: LedgerRow[]): Promise<void>`（按 `(runId, ruleId)` upsert）、`getRunCheckLedger(runId)`
  - `recomputeRetestDue(projectId): Promise<string | null>`
  - `getRunIssueSummary(runId): Promise<RunIssueSummary>`、`getProjectIssueTodos(projectId): Promise<IssueTodos>`

- [ ] **Step 1: 写失败的真库测试**

Create `lib/repositories/issues.repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-issues-repo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, issueEvents, checkResults } = await import('@/db/schema')
import type { IssueRecord, IssueEventDraft } from '@/lib/issues/types'

const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo', title: 't',
  severity: 'mid', affectedCount: 2, latestFindingId: null, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null, detection: 'present', status: 'pending', flags: ['new'],
  unverifiedReason: null, retiredReason: null, protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
})
const ev = (over: Partial<IssueEventDraft> = {}): IssueEventDraft => ({
  id: 'iev_obs_run_1_iss_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', checked: true, hit: true, severity: 'mid', affectedCount: 2,
  fromStatus: null, toStatus: 'pending', flags: ['new'], note: null, actor: 'system', createdAt: '2026-10-01T00:00:00.000Z', ...over,
})

describe('问题仓储', () => {
  beforeEach(async () => {
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
  })

  it('saveIssueChanges：首次插入，同 id 再存则更新；observed 记录按 id 覆盖不叠加', async () => {
    await repo.saveIssueChanges({ issues: [issue()], events: [ev()] })
    await repo.saveIssueChanges({ issues: [issue({ status: 'self_resolved', detection: 'gone', flags: [] })], events: [ev({ toStatus: 'self_resolved', hit: false })] })
    const got = await repo.getProjectIssues('proj_1')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ status: 'self_resolved', detection: 'gone', flags: [] })
    const events = await db.select().from(issueEvents)
    expect(events).toHaveLength(1)
    expect(events[0].toStatus).toBe('self_resolved')
  })

  it('saveIssueChanges 是单事务：任何一行违反约束则全部不写', async () => {
    await expect(repo.saveIssueChanges({ issues: [issue(), issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'deferred' })], events: [] })).rejects.toThrow()
    expect(await repo.getProjectIssues('proj_1')).toHaveLength(0)
  })

  it('getIssueByFingerprint / hasObservedEvents', async () => {
    expect(await repo.hasObservedEvents('run_1')).toBe(false)
    await repo.saveIssueChanges({ issues: [issue()], events: [ev()] })
    expect((await repo.getIssueByFingerprint('proj_1', 'fp_1'))?.id).toBe('iss_1')
    expect(await repo.hasObservedEvents('run_1')).toBe(true)
  })

  it('saveCheckLedger 按（体检, 规则）覆盖', async () => {
    await repo.saveCheckLedger('run_1', [{ ruleId: 'Q01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：confirmed_competitors', hitCount: 0 }])
    await repo.saveCheckLedger('run_1', [{ ruleId: 'Q01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 }])
    const rows = await db.select().from(checkResults)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ outcome: 'hit', reasonKind: null, hitCount: 1 })
    expect(String(rows[0].id)).toMatch(/^chk_/)
  })

  it('recomputeRetestDue：最早一条「已执行待复查」的执行时间 + 28 天；没有则清空', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ decision: 'included', executedAt: '2026-10-05T00:00:00.000Z', status: 'executed_awaiting' }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'executed_awaiting' }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'fixed', detection: 'gone' }),
      ],
      events: [],
    })
    expect(await repo.recomputeRetestDue('proj_1')).toBe('2026-10-29T00:00:00.000Z')
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBe('2026-10-29T00:00:00.000Z')
    await repo.saveIssueChanges({ issues: [issue({ decision: 'included', executedAt: '2026-10-05T00:00:00.000Z', status: 'fixed', detection: 'gone' }), issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'fixed', detection: 'gone' })], events: [] })
    expect(await repo.recomputeRetestDue('proj_1')).toBeNull()
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBeNull()
  })

  it('getRunIssueSummary：按状态计数，列出本次关闭的数量与原因，曾纳入的关闭问题逐条列出', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ status: 'pending', flags: ['new'] }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], title: '缺推荐字段' }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', status: 'retired', retiredReason: 'protocol_changed', flags: ['protocol_changed'] }),
      ],
      events: [
        ev(),
        ev({ id: 'iev_obs_run_1_iss_2', issueId: 'iss_2', fromStatus: 'executed_awaiting', toStatus: 'retired', hit: false, flags: ['rule_changed'], note: 'rule_changed' }),
        ev({ id: 'iev_obs_run_1_iss_3', issueId: 'iss_3', fromStatus: 'pending', toStatus: 'retired', hit: false, flags: ['protocol_changed'], note: 'protocol_changed' }),
      ],
    })
    const s = await repo.getRunIssueSummary('run_1')
    expect(s.total).toBe(3)
    expect(s.byStatus).toEqual({ pending: 1, retired: 2 })
    expect(s.newCount).toBe(1)
    expect(s.closed).toEqual({
      protocolChanged: 1,
      ruleChanged: 1,
      committed: [{ issueId: 'iss_2', title: '缺推荐字段', reason: 'rule_changed', executed: true }],
    })
  })

  it('getProjectIssueTodos：待处理（其中新出现 / 变严重）与改了没生效', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ flags: ['new'] }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', flags: ['worse'] }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'not_effective', flags: [] }),
        issue({ id: 'iss_4', fingerprint: 'fp_4', decision: 'included', status: 'to_execute', flags: [] }),
      ],
      events: [],
    })
    expect(await repo.getProjectIssueTodos('proj_1')).toEqual({ pending: 2, pendingNew: 1, pendingWorse: 1, notEffective: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/repositories/issues.repo.test.ts`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现**

Create `lib/repositories/issues.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { checkResults, issueEvents, issues, projects } from '@/db/schema'
import type { LedgerRow } from '@/lib/diagnosis/check-ledger'
import type { IssueEventDraft, IssueRecord, IssueStatus, RetiredReason } from '@/lib/issues/types'

// 问题台账读写（spec 2026-10-09 §6）。经 lib/repositories/index.ts 的 export * 暴露。

export const RETEST_WINDOW_DAYS = 28

// 行 → 领域记录：CHECK 约束保证枚举取值合法，这里只做类型收窄。
const toRecord = (row: typeof issues.$inferSelect): IssueRecord => row as unknown as IssueRecord

export const getProjectIssues = async (projectId: string): Promise<IssueRecord[]> =>
  (await db.select().from(issues).where(eq(issues.projectId, projectId))).map(toRecord)

export const getIssue = async (id: string): Promise<IssueRecord | undefined> => {
  const row = await db.query.issues.findFirst({ where: eq(issues.id, id) })
  return row ? toRecord(row) : undefined
}

export const getIssueByFingerprint = async (projectId: string, fingerprint: string): Promise<IssueRecord | undefined> => {
  const row = await db.query.issues.findFirst({ where: and(eq(issues.projectId, projectId), eq(issues.fingerprint, fingerprint)) })
  return row ? toRecord(row) : undefined
}

// 单事务写入：对账或人工动作的结果要么全部落库，要么一条都不落（失败由 Inngest 重试）。
export async function saveIssueChanges(changes: { issues: IssueRecord[]; events: IssueEventDraft[] }): Promise<void> {
  if (!changes.issues.length && !changes.events.length) return
  await db.transaction(async (tx) => {
    for (const row of changes.issues) {
      const { id: _id, ...rest } = row
      await tx.insert(issues).values(row).onConflictDoUpdate({ target: issues.id, set: rest })
    }
    for (const row of changes.events) {
      const { id: _id, ...rest } = row
      await tx.insert(issueEvents).values(row).onConflictDoUpdate({ target: issueEvents.id, set: rest })
    }
  })
}

export const hasObservedEvents = async (runId: string): Promise<boolean> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(issueEvents)
    .where(and(eq(issueEvents.runId, runId), eq(issueEvents.kind, 'observed')))
  return (row?.n ?? 0) > 0
}

export async function saveCheckLedger(runId: string, rows: LedgerRow[]): Promise<void> {
  if (!rows.length) return
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(checkResults)
        .values({ id: `chk_${crypto.randomUUID()}`, runId, ...r })
        .onConflictDoUpdate({
          target: [checkResults.runId, checkResults.ruleId],
          set: { ruleVersion: r.ruleVersion, outcome: r.outcome, reasonKind: r.reasonKind, reason: r.reason, hitCount: r.hitCount },
        })
    }
  })
}

export const getRunCheckLedger = (runId: string) => db.select().from(checkResults).where(eq(checkResults.runId, runId))

// 复查提醒（spec §5.4-2）：最早一条「已执行，待复查」的执行时间 + 28 天；没有则清空。
export async function recomputeRetestDue(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ earliest: sql<string | null>`min(${issues.executedAt})` })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, 'executed_awaiting')))
  const due = row?.earliest ? new Date(Date.parse(row.earliest) + RETEST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString() : null
  await db.update(projects).set({ nextRetestDueAt: due }).where(eq(projects.id, projectId))
  return due
}

export interface RunIssueSummary {
  total: number
  byStatus: Partial<Record<IssueStatus, number>>
  newCount: number
  worseCount: number
  relapseCount: number
  partialCount: number
  unverifiedCount: number
  closed: {
    protocolChanged: number
    ruleChanged: number
    // 曾经已纳入（可能已向站主承诺）的关闭问题逐条列出（spec §5.2）。
    committed: { issueId: string; title: string; reason: RetiredReason; executed: boolean }[]
  }
}

// 体检变化摘要（spec §5.2）：由该体检的 observed 变化记录汇总。
export async function getRunIssueSummary(runId: string): Promise<RunIssueSummary> {
  const rows = await db
    .select({ event: issueEvents, issue: issues })
    .from(issueEvents)
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .where(and(eq(issueEvents.runId, runId), eq(issueEvents.kind, 'observed')))
  const s: RunIssueSummary = {
    total: rows.length,
    byStatus: {},
    newCount: 0,
    worseCount: 0,
    relapseCount: 0,
    partialCount: 0,
    unverifiedCount: 0,
    closed: { protocolChanged: 0, ruleChanged: 0, committed: [] },
  }
  for (const { event, issue } of rows) {
    const to = event.toStatus as IssueStatus
    s.byStatus[to] = (s.byStatus[to] ?? 0) + 1
    const flags = event.flags ?? []
    if (flags.includes('new')) s.newCount += 1
    if (flags.includes('worse')) s.worseCount += 1
    if (flags.includes('relapse')) s.relapseCount += 1
    if (flags.includes('partial')) s.partialCount += 1
    if (flags.includes('unverified')) s.unverifiedCount += 1
    if (to === 'retired' && event.fromStatus !== 'retired') {
      const reason = event.note as RetiredReason
      if (reason === 'protocol_changed') s.closed.protocolChanged += 1
      if (reason === 'rule_changed') s.closed.ruleChanged += 1
      if (issue.decision === 'included') {
        s.closed.committed.push({ issueId: issue.id, title: issue.title, reason, executed: issue.executedAt !== null })
      }
    }
  }
  return s
}

export interface IssueTodos {
  pending: number
  pendingNew: number
  pendingWorse: number
  notEffective: number
}

// 你需要处理的（spec §5.2）：待处理（其中新出现、变严重）与改了没生效。
export async function getProjectIssueTodos(projectId: string): Promise<IssueTodos> {
  const rows = await getProjectIssues(projectId)
  const pending = rows.filter((r) => r.status === 'pending')
  return {
    pending: pending.length,
    pendingNew: pending.filter((r) => r.flags.includes('new')).length,
    pendingWorse: pending.filter((r) => r.flags.includes('worse')).length,
    notEffective: rows.filter((r) => r.status === 'not_effective').length,
  }
}
```

`lib/repositories/index.ts` 末尾加 `export * from './issues'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/repositories/issues.repo.test.ts lib/repositories/issues-schema.repo.test.ts && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add lib/repositories/issues.ts lib/repositories/issues.repo.test.ts lib/repositories/index.ts
git commit -m "feat(repositories): 问题台账读写、复查提醒重算、体检变化摘要与待办查询"
```

---

### Task 10: 接入诊断流水线——写台账、对账，停用旧回测对比

**Files:**
- Modify: `lib/issues/reconcile.ts`（新增 `toObservedHit`）、`lib/issues/reconcile.test.ts`
- Modify: `lib/inngest/generate-findings.ts`
- Modify: `lib/inngest/generate-findings.test.ts`

**Interfaces:**
- Consumes: Task 2 `availableSources`、`protocolBoundRuleIds`；Task 3 `evaluateRulesWithLedger`；Task 4 `FindingRow.detail`；Task 8 `reconcileIssues`；Task 9 仓储函数。
- Produces: `toObservedHit(f: { id: string; fingerprint: string | null; ruleId: string | null; title: string; pillar: string | null; side: string; severity: string; detail?: { scale: { affected: number | null } } | null }): ObservedHit | null`

流水线顺序（spec §5.1）：`run-rules`（求值 + 台账）→ `persist-keyword-gaps` → `create-findings` → `create-recommendations` → `write-check-ledger` → `reconcile-issues` → `mark-reviewing`。对账放在标记完成之前：对账失败时 Inngest 重试，耗尽后 `onFailure` 把体检标为失败，不会留下「诊断完成但问题表没更新」的状态。

- [ ] **Step 1: toObservedHit 的失败测试**

在 `lib/issues/reconcile.test.ts` 末尾加：

```ts
describe('toObservedHit', () => {
  it('发现行 → 本次命中；受影响数取明细的 scale.affected', () => {
    expect(toObservedHit({ id: 'find_1', fingerprint: 'fp_1', ruleId: 'C05c', title: 't', pillar: 'P2', side: 'seo', severity: 'mid', detail: { scale: { affected: 3 } } }))
      .toEqual({ findingId: 'find_1', fingerprint: 'fp_1', ruleId: 'C05c', title: 't', pillar: 'P2', side: 'seo', severity: 'mid', affectedCount: 3 })
  })
  it('没有指纹或规则编号的旧发现 → null；没有明细 → 受影响数为 null', () => {
    expect(toObservedHit({ id: 'f', fingerprint: null, ruleId: 'X', title: 't', pillar: null, side: 'seo', severity: 'mid' })).toBeNull()
    expect(toObservedHit({ id: 'f', fingerprint: 'fp', ruleId: 'X', title: 't', pillar: null, side: 'seo', severity: 'ok', detail: null })?.affectedCount).toBeNull()
  })
})
```

（import 里加 `toObservedHit`。）Run: `pnpm vitest run lib/issues/reconcile.test.ts`，Expected: FAIL。

- [ ] **Step 2: 实现 toObservedHit**

`lib/issues/reconcile.ts` 末尾加：

```ts
// 发现行（buildFindingRows 产出或 DB 行）→ 本次命中。没有指纹 / 规则编号的旧发现没有跨次身份，跳过。
export function toObservedHit(f: {
  id: string
  fingerprint: string | null
  ruleId: string | null
  title: string
  pillar: string | null
  side: string
  severity: string
  detail?: { scale: { affected: number | null } } | null
}): ObservedHit | null {
  if (!f.fingerprint || !f.ruleId) return null
  return {
    findingId: f.id,
    fingerprint: f.fingerprint,
    ruleId: f.ruleId,
    title: f.title,
    pillar: f.pillar,
    side: f.side,
    severity: f.severity as IssueSeverity,
    affectedCount: f.detail?.scale.affected ?? null,
  }
}
```

Run: `pnpm vitest run lib/issues/reconcile.test.ts`，Expected: PASS。

- [ ] **Step 3: 改写流水线测试（先删旧行为，再写新行为，看它失败）**

`lib/inngest/generate-findings.test.ts`：

(a) 删除「回测收尾」整组用例：从 `const baselineFindings = [` 起，到用例 `'无 baselineRunId 时不触发回测 delta（保持原行为）'` 结束为止（含 `makeRetestDeps`、`gscEv`、10-08 新增的「没执行的基线建议…」用例），以及顶部不再使用的 `aggregateRuleStats`、`aggregateAioExposure` import。旧回测对比由对账取代（spec §5.4-4），这些用例断言的行为已不存在。

(b) `makeDeps` 中：
- 删除 `getFindings`、`getRecommendations`、`createRetestSnapshots`、`setRecommendationOutcome`、`getRunSerpAioResults`、`aggregateAioExposure` 的默认值（若 Step 5 后仍有用到再补回）；
- 把 `evaluateRules: vi.fn(() => [makeHit(), makeHit({ ruleId: 'C01', ... })])` 替换为

```ts
    evaluateRulesWithLedger: vi.fn(() => ({
      hits: [makeHit(), makeHit({ ruleId: 'C01', side: 'seo', claimType: 'inferred', title: '标题缺失', evidenceRefs: ['ev_1'], fingerprint: 'fp_2' })],
      ledger: [
        { ruleId: 'T01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
        { ruleId: 'C01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
        { ruleId: 'K01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：gsc', hitCount: 0 },
      ],
    })),
```

  文件里其他用例中对 `evaluateRules:` 的覆盖，同样改成 `evaluateRulesWithLedger: vi.fn(() => ({ hits: <原数组>, ledger: [] }))`；断言 `deps.evaluateRules` 的地方改为断言 `deps.evaluateRulesWithLedger`。
- 加入新依赖的默认值：

```ts
    getRunDataSourceStatuses: vi.fn(async () => [{ sourceKey: 'crawl', status: 'collected', capturedEvidenceCount: 21 }]),
    getRun: vi.fn(async (id: string) => ({ id, startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' })),
    saveCheckLedger: vi.fn(async () => undefined),
    getProjectIssues: vi.fn(async () => []),
    saveIssueChanges: vi.fn(async () => undefined),
    hasObservedEvents: vi.fn(async () => false),
    recomputeRetestDue: vi.fn(async () => null),
```

(c) 新增用例：

```ts
describe('问题台账接入（spec 2026-10-09 §5.1）', () => {
  it('按本次数据源状态求值：入口页恒可用，collected 的数据源可用', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    const available = deps.evaluateRulesWithLedger.mock.calls[0][2] as Set<string>
    expect([...available].sort()).toEqual(['crawl', 'entry'])
  })

  it('台账整份落库', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalledWith('run_1', expect.arrayContaining([expect.objectContaining({ ruleId: 'K01', outcome: 'not_checked' })]))
  })

  it('对账：两条命中各建一个待处理问题，并重算复查提醒；在标记完成之前', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    const saved = deps.saveIssueChanges.mock.calls[0][0] as { issues: { fingerprint: string; status: string; firstSeenRunId: string; lastCheckedAt: string; protocolHash: string }[]; events: unknown[] }
    expect(saved.issues.map((i) => i.fingerprint).sort()).toEqual(['fp_1', 'fp_2'])
    expect(saved.issues.every((i) => i.status === 'pending' && i.firstSeenRunId === 'run_1')).toBe(true)
    expect(saved.issues[0].lastCheckedAt).toBe('2026-11-01T00:00:00.000Z')
    expect(saved.issues[0].protocolHash).toBe('P1')
    expect(saved.events).toHaveLength(2)
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
    const reviewingCall = deps.markRunStatus.mock.calls.findIndex((c: unknown[]) => c[1] === 'reviewing')
    expect(deps.saveIssueChanges.mock.invocationCallOrder[0]).toBeLessThan(deps.markRunStatus.mock.invocationCallOrder[reviewingCall])
  })

  it('本次体检已对账过（步骤提交后重放）→ 不再写', async () => {
    const deps = makeDeps({ hasObservedEvents: vi.fn(async () => true) })
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
  })

  it('对账失败 → 抛出（交给 Inngest 重试与 onFailure），不标记完成', async () => {
    const deps = makeDeps({ saveIssueChanges: vi.fn(async () => { throw new Error('db locked') }) })
    await expect(generateFindingsHandler(makeArgs().args, asDeps(deps))).rejects.toThrow('db locked')
    expect(deps.markRunStatus.mock.calls.some((c: unknown[]) => c[1] === 'reviewing')).toBe(false)
  })

  it('带 baselineRunId 也不再读基线建议或写回测快照（旧回测对比已停用）', async () => {
    const deps = makeDeps({ getRecommendations: vi.fn(async () => []) })
    await generateFindingsHandler(makeArgs({ baselineRunId: 'run_base' }).args, asDeps(deps))
    expect(deps.getRecommendations).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm vitest run lib/inngest/generate-findings.test.ts`
Expected: 新用例 FAIL（依赖未接线）。

- [ ] **Step 4: 改流水线**

`lib/inngest/generate-findings.ts`：

(a) 删除 `computeRetestDelta` 函数及只被它用到的 `toFindingRefs`、`toHealthFindings`、`FindingRow` 类型别名，删除 `// —— 回测收尾` 那段 `if (baselineRunId) { ... compute-retest-delta ... }`；删掉因此不再使用的 import（`retest-delta`、`retest-metrics`、`health-score`、`ValidationSpec`、`aggregateAioExposure`、`getRunSerpAioResults` 等，以 `pnpm exec tsc --noEmit` 与 `pnpm exec eslint lib/inngest/generate-findings.ts` 的「未使用」提示为准），并从 `GenerateFindingsDeps` / `defaultDeps` 删除 `getFindings`、`getRecommendations`、`createRetestSnapshots`、`setRecommendationOutcome`、`getRunSerpAioResults`、`aggregateAioExposure`、`evaluateRules`。`event.data` 解构里的 `baselineRunId` 若不再使用一并去掉。

(b) `GenerateFindingsDeps` 加：

```ts
  // 问题台账（spec 2026-10-09 §5.1）
  evaluateRulesWithLedger: typeof evaluateRulesWithLedger
  getRunDataSourceStatuses: typeof getRunDataSourceStatuses
  getRun: typeof getRun
  saveCheckLedger: typeof saveCheckLedger
  getProjectIssues: typeof getProjectIssues
  saveIssueChanges: typeof saveIssueChanges
  hasObservedEvents: typeof hasObservedEvents
  recomputeRetestDue: typeof recomputeRetestDue
```

并在 `defaultDeps()` 里补上同名实现（仓储函数从 `@/lib/repositories` 导入，`evaluateRulesWithLedger` 从 `@/lib/diagnosis/check-ledger` 导入）。

(c) `run-rules` step：`Promise.all` 里加 `deps.getRunDataSourceStatuses(runId)`（与 Task 6 加的 `getConfirmedCompetitors` 并列）；把 `const hits = deps.evaluateRules(ctx, rules)` 替换为

```ts
    const available = availableSources(sourceStatuses, { confirmedCompetitorCount: confirmed.length })
    const { hits, ledger } = deps.evaluateRulesWithLedger(ctx, rules, available)
```

返回值加 `ledger` 与 `protocolBound: [...protocolBoundRuleIds(rules)]`（数组，便于 step 结果 JSON 回放）。外层解构同步加上 `ledger`、`protocolBound`。

(d) 在 `create-recommendations` step 之后、`mark-reviewing` 之前加：

```ts
  // —— 问题台账（spec 2026-10-09 §5.1）——：台账落库 → 对账。对账失败交给 Inngest 重试，耗尽后 onFailure 标失败。
  await step.run('write-check-ledger', () => deps.saveCheckLedger(runId, ledger))
  await step.run('reconcile-issues', async () => {
    // 已对账过（步骤提交后被重放）→ 跳过，避免把「新出现 / 复发」标记冲掉（Review Focus 3）。
    if (await deps.hasObservedEvents(runId)) return { skipped: true }
    const [run, projectIssues] = await Promise.all([deps.getRun(runId), deps.getProjectIssues(projectId)])
    const now = new Date().toISOString()
    const out = reconcileIssues({
      projectId,
      run: { id: runId, startedAt: run?.startedAt ?? run?.finishedAt ?? now, protocolHash: run?.protocolHash ?? null },
      issues: projectIssues,
      hits: findingRows.map(toObservedHit).filter((h): h is ObservedHit => h !== null),
      ledger,
      protocolBoundRuleIds: new Set(protocolBound),
      missingLedger: 'retire',
      newIssueId: () => `iss_${crypto.randomUUID()}`,
      now,
    })
    await deps.saveIssueChanges(out)
    await deps.recomputeRetestDue(projectId)
    return { issues: out.issues.length }
  })
```

（import `reconcileIssues`、`toObservedHit`、`type ObservedHit` 自 `@/lib/issues/reconcile`，`availableSources`、`protocolBoundRuleIds` 自 `@/lib/diagnosis/sources`。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run lib/inngest lib/issues lib/diagnosis && pnpm exec tsc --noEmit && pnpm exec eslint lib/inngest/generate-findings.ts`
Expected: 全部 PASS；tsc、eslint 无输出。

- [ ] **Step 6: 提交**

```bash
git add lib/issues/reconcile.ts lib/issues/reconcile.test.ts lib/inngest/generate-findings.ts lib/inngest/generate-findings.test.ts
git commit -m "feat(inngest): 诊断流水线写检查台账并对账问题表，停用旧回测对比"
```

---

### Task 11: 竞品确认后的局部对账

**Files:**
- Modify: `lib/issues/reconcile.ts`（新增 `latestCompletedRunId`）、`lib/issues/reconcile.test.ts`
- Modify: `lib/inngest/reevaluate-competitors.ts`、`lib/inngest/reevaluate-competitors.test.ts`

**Interfaces:**
- Produces: `latestCompletedRunId(runs: { id: string; status: string; startedAt: string | null; finishedAt: string | null }[]): string | null`

背景：首轮诊断时若还没有已确认竞品，竞品类规则在台账里是「没查（缺已确认竞品）」，对应问题标未复查。你在竞品页确认后，再评估会重跑全部规则并补落新发现；这里把台账里结果变了的规则改写，并只对这些规则做一次局部对账。只对项目最近一次完成的体检做（Review Focus 4）。

- [ ] **Step 1: latestCompletedRunId 的失败测试**

在 `lib/issues/reconcile.test.ts` 末尾加：

```ts
describe('latestCompletedRunId', () => {
  it('取已完成（reviewing / output）里开始时间最晚的一次；开始时间为空回落完成时间', () => {
    expect(latestCompletedRunId([
      { id: 'a', status: 'output', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null },
      { id: 'b', status: 'reviewing', startedAt: null, finishedAt: '2026-10-05T00:00:00.000Z' },
      { id: 'c', status: 'collecting', startedAt: '2026-10-09T00:00:00.000Z', finishedAt: null },
    ])).toBe('b')
    expect(latestCompletedRunId([{ id: 'x', status: 'failed', startedAt: null, finishedAt: null }])).toBeNull()
  })
})
```

Run: `pnpm vitest run lib/issues/reconcile.test.ts`，Expected: FAIL。

- [ ] **Step 2: 实现**

`lib/issues/reconcile.ts` 末尾加：

```ts
const COMPLETED = new Set(['reviewing', 'output'])
const when = (r: { startedAt: string | null; finishedAt: string | null }) => Date.parse(r.startedAt ?? r.finishedAt ?? '') || 0

// 项目最近一次完成的体检：局部对账只允许作用于它，旧体检上的竞品确认不能用旧观测覆盖新状态。
export function latestCompletedRunId(runs: { id: string; status: string; startedAt: string | null; finishedAt: string | null }[]): string | null {
  const done = runs.filter((r) => COMPLETED.has(r.status)).sort((a, b) => when(b) - when(a))
  return done[0]?.id ?? null
}
```

Run: `pnpm vitest run lib/issues/reconcile.test.ts`，Expected: PASS。

- [ ] **Step 3: 再评估的失败测试**

在 `lib/inngest/reevaluate-competitors.test.ts` 的 `makeDeps` 里：把 `evaluateRules: vi.fn(...)` 换成 `evaluateRulesWithLedger: vi.fn(() => ({ hits: <原 hits 数组>, ledger: [{ ruleId: 'Q01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 }, { ruleId: 'T02', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 }] }))`（文件里对 `evaluateRules` 的其他引用同样改名），并加默认依赖：

```ts
    getRunDataSourceStatuses: vi.fn(async () => [{ sourceKey: 'dataforseo:seed_serp', status: 'collected', capturedEvidenceCount: 1 }]),
    getRunCheckLedger: vi.fn(async () => [
      { ruleId: 'Q01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：confirmed_competitors', hitCount: 0 },
      { ruleId: 'T02', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 },
    ]),
    saveCheckLedger: vi.fn(async () => undefined),
    getProjectRuns: vi.fn(async () => [{ id: 'run_1', status: 'reviewing', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' }]),
    getProjectIssues: vi.fn(async () => []),
    saveIssueChanges: vi.fn(async () => undefined),
    recomputeRetestDue: vi.fn(async () => null),
```

（`getFindings` 已在既有 `makeDeps` 中；确保它返回的发现行带 `fingerprint`、`ruleId`、`title`、`pillar`、`side`、`severity`。）

新增用例：

```ts
describe('竞品确认后的局部对账（spec 2026-10-09 §5.1）', () => {
  it('只改写台账里结果变了的规则，并只对这些规则对账', async () => {
    const deps = makeDeps()
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalledWith('run_1', [expect.objectContaining({ ruleId: 'Q01', outcome: 'hit' })])
    expect(deps.saveIssueChanges).toHaveBeenCalledTimes(1)
    const saved = deps.saveIssueChanges.mock.calls[0][0] as { issues: { ruleId: string }[] }
    expect(saved.issues.every((i) => i.ruleId === 'Q01')).toBe(true)
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
  })

  it('台账没有变化 → 不写台账、不对账', async () => {
    const deps = makeDeps({ getRunCheckLedger: vi.fn(async () => [
      { ruleId: 'Q01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
      { ruleId: 'T02', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 },
    ]) })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).not.toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
  })

  it('不是项目最近一次完成的体检 → 台账照写，但不对账（Review Focus 4）', async () => {
    const deps = makeDeps({ getProjectRuns: vi.fn(async () => [
      { id: 'run_1', status: 'output', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' },
      { id: 'run_newer', status: 'reviewing', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' },
    ]) })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
  })
})
```

（`makeArgs` 用该测试文件已有的构造函数；事件里的 runId 若不是 `run_1`，把上面断言里的 `run_1` 换成该文件的值。）

Run: `pnpm vitest run lib/inngest/reevaluate-competitors.test.ts`，Expected: 新用例 FAIL。

- [ ] **Step 4: 改再评估**

`lib/inngest/reevaluate-competitors.ts`：
- `ReevaluateDeps` 把 `evaluateRules` 换成 `evaluateRulesWithLedger: typeof evaluateRulesWithLedger`，并加 `getRunDataSourceStatuses`、`getRunCheckLedger`、`saveCheckLedger`、`getProjectRuns`、`getProjectIssues`、`saveIssueChanges`、`recomputeRetestDue`（类型均为 `typeof` 同名仓储函数），`defaultDeps()` 补齐。
- `reeval-rules` step：`Promise.all` 加 `deps.getRunDataSourceStatuses(runId)`；把 `const hits = deps.evaluateRules(ctx, rules)` 改为

```ts
    const available = availableSources(sourceStatuses, { confirmedCompetitorCount: confirmed.length })
    const { hits, ledger } = deps.evaluateRulesWithLedger(ctx, rules, available)
```

  返回值加 `ledger`、`protocolBound: [...protocolBoundRuleIds(rules)]`。
- 在 `reeval-create-recommendations` 之后加：

```ts
  // —— 局部对账（spec 2026-10-09 §5.1）——：台账结果变了的规则才改写并对账；只作用于项目最近一次完成的体检。
  await step.run('reeval-reconcile', async () => {
    const before = new Map((await deps.getRunCheckLedger(runId)).map((r) => [r.ruleId, r]))
    const changed = ledger.filter((r) => {
      const b = before.get(r.ruleId)
      return !b || b.outcome !== r.outcome || b.ruleVersion !== r.ruleVersion || b.hitCount !== r.hitCount || b.reasonKind !== r.reasonKind
    })
    if (!changed.length) return { changed: 0 }
    await deps.saveCheckLedger(runId, changed)
    const runs = await deps.getProjectRuns(projectId)
    if (latestCompletedRunId(runs) !== runId) return { changed: changed.length, reconciled: false }
    const run = runs.find((r) => r.id === runId)
    const [projectIssues, runFindings] = await Promise.all([deps.getProjectIssues(projectId), deps.getFindings(runId)])
    const now = new Date().toISOString()
    const out = reconcileIssues({
      projectId,
      run: { id: runId, startedAt: run?.startedAt ?? run?.finishedAt ?? now, protocolHash: run?.protocolHash ?? null },
      issues: projectIssues,
      hits: runFindings.map(toObservedHit).filter((h): h is ObservedHit => h !== null),
      ledger: changed,
      protocolBoundRuleIds: new Set(protocolBound),
      missingLedger: 'retire',
      onlyRuleIds: new Set(changed.map((r) => r.ruleId)),
      newIssueId: () => `iss_${crypto.randomUUID()}`,
      now,
    })
    await deps.saveIssueChanges(out)
    await deps.recomputeRetestDue(projectId)
    return { changed: changed.length, reconciled: true }
  })
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run lib/inngest lib/issues && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add lib/issues/reconcile.ts lib/issues/reconcile.test.ts lib/inngest/reevaluate-competitors.ts lib/inngest/reevaluate-competitors.test.ts
git commit -m "feat(inngest): 竞品确认后改写台账并局部对账，只作用于最近一次完成的体检"
```

---

### Task 12: 问题动作——纳入 / 暂不处理 / 误报 / 撤销排除 / 执行 / 撤销执行

**Files:**
- Create: `lib/issues/actions.ts`、`lib/issues/actions.test.ts`
- Modify: `lib/repositories/issues.ts`（加 `runIssueAction`、`includeRemaining`）、`lib/repositories/issues.repo.test.ts`
- Modify: `lib/repositories/validators.ts`（加 `assertIssueIncluded`）、`lib/repositories/validators.test.ts`

**Interfaces:**
- Produces:
  - `type IssueAction = { kind: 'include' } | { kind: 'defer'; reason: string } | { kind: 'false_positive'; reason: string } | { kind: 'reopen' } | { kind: 'execute'; note?: string } | { kind: 'undo_execute' }`
  - `applyIssueAction(issue: IssueRecord, action: IssueAction, ctx: { actor: HumanActor; now: string; eventId: string; note?: string }): { issue: IssueRecord; event: IssueEventDraft }`（失败抛 `reason_required` / `not_excluded` / `not_included` / `not_executed`）
  - `runIssueAction(issueId: string, action: IssueAction, actor?: HumanActor, note?: string): Promise<IssueRecord>`（抛 `not_found`）
  - `includeRemaining(projectId: string, actor?: HumanActor): Promise<number>`
  - `assertIssueIncluded(decision: string): void`

本子项目不做界面，这些函数供 Task 13 的旧界面桥接与子项目 2 的新界面调用。

- [ ] **Step 1: 写失败测试**

Create `lib/issues/actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyIssueAction } from './actions'
import type { IssueRecord } from './types'

const NOW = '2026-11-02T00:00:00.000Z'
const ctx = { actor: 'operator' as const, now: NOW, eventId: 'iev_x' }
const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo', title: 't',
  severity: 'mid', affectedCount: 2, latestFindingId: null, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null, detection: 'present', status: 'pending', flags: ['new'],
  unverifiedReason: null, retiredReason: null, protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
})

describe('applyIssueAction', () => {
  it('纳入 → 待执行；记决定时间与人；变化记录为 decision', () => {
    const { issue: i, event } = applyIssueAction(issue(), { kind: 'include' }, ctx)
    expect(i).toMatchObject({ decision: 'included', decidedAt: NOW, decidedBy: 'operator', status: 'to_execute', updatedAt: NOW })
    expect(event).toMatchObject({ id: 'iev_x', kind: 'decision', runId: null, fromStatus: 'pending', toStatus: 'to_execute', actor: 'operator' })
  })

  it('暂不处理 / 误报必须写理由，理由进变化记录；会清掉执行记录', () => {
    expect(() => applyIssueAction(issue(), { kind: 'defer', reason: '  ' }, ctx)).toThrow('reason_required')
    const executed = issue({ decision: 'included', executedAt: '2026-11-01T12:00:00.000Z', status: 'executed_awaiting' })
    const { issue: i, event } = applyIssueAction(executed, { kind: 'false_positive', reason: '品牌站首页可以这样写' }, ctx)
    expect(i).toMatchObject({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', executedAt: null, status: 'excluded' })
    expect(event.note).toBe('品牌站首页可以这样写')
  })

  it('撤销排除 → 回到待处理；对未排除的问题撤销 → 报错', () => {
    expect(applyIssueAction(issue({ decision: 'deferred', decisionReason: 'x', status: 'excluded' }), { kind: 'reopen' }, ctx).issue).toMatchObject({ decision: 'pending', decisionReason: null, status: 'pending' })
    expect(() => applyIssueAction(issue(), { kind: 'reopen' }, ctx)).toThrow('not_excluded')
  })

  it('执行：只有已纳入的问题能执行 → 已执行待复查；备注去空白；变化记录为 execution', () => {
    expect(() => applyIssueAction(issue(), { kind: 'execute' }, ctx)).toThrow('not_included')
    const { issue: i, event } = applyIssueAction(issue({ decision: 'included', status: 'to_execute' }), { kind: 'execute', note: ' 已补 aggregateRating ' }, ctx)
    expect(i).toMatchObject({ executedAt: NOW, executedNote: '已补 aggregateRating', executedBy: 'operator', status: 'executed_awaiting' })
    expect(event).toMatchObject({ kind: 'execution', toStatus: 'executed_awaiting', note: '已补 aggregateRating' })
  })

  it('改了没生效后再标一次执行 → 新的执行时间，回到已执行待复查', () => {
    const ne = issue({ decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'not_effective' })
    expect(applyIssueAction(ne, { kind: 'execute' }, ctx).issue).toMatchObject({ executedAt: NOW, status: 'executed_awaiting' })
  })

  it('撤销执行 → 回到待执行；没执行过 → 报错', () => {
    const ex = issue({ decision: 'included', executedAt: '2026-11-01T12:00:00.000Z', executedNote: 'n', executedBy: 'operator', status: 'executed_awaiting' })
    expect(applyIssueAction(ex, { kind: 'undo_execute' }, ctx).issue).toMatchObject({ executedAt: null, executedNote: null, executedBy: null, status: 'to_execute' })
    expect(() => applyIssueAction(issue({ decision: 'included' }), { kind: 'undo_execute' }, ctx)).toThrow('not_executed')
  })
})
```

在 `lib/repositories/issues.repo.test.ts` 末尾的 describe 内加：

```ts
  it('runIssueAction：写问题与变化记录并重算复查提醒；不存在 → not_found', async () => {
    await repo.saveIssueChanges({ issues: [issue({ decision: 'included', status: 'to_execute', flags: [] })], events: [] })
    const next = await repo.runIssueAction('iss_1', { kind: 'execute', note: '改好了' })
    expect(next.status).toBe('executed_awaiting')
    const events = await db.select().from(issueEvents)
    expect(events.map((e) => e.kind)).toEqual(['execution'])
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).not.toBeNull()
    await expect(repo.runIssueAction('iss_nope', { kind: 'include' })).rejects.toThrow('not_found')
  })

  it('includeRemaining：只纳入状态为待处理的问题，返回数量', async () => {
    await repo.saveIssueChanges({
      issues: [issue(), issue({ id: 'iss_2', fingerprint: 'fp_2' }), issue({ id: 'iss_3', fingerprint: 'fp_3', decision: 'false_positive', decisionReason: 'x', status: 'excluded' })],
      events: [],
    })
    expect(await repo.includeRemaining('proj_1')).toBe(2)
    const byId = Object.fromEntries((await repo.getProjectIssues('proj_1')).map((i) => [i.id, i.decision]))
    expect(byId).toEqual({ iss_1: 'included', iss_2: 'included', iss_3: 'false_positive' })
  })
```

在 `lib/repositories/validators.test.ts` 加：

```ts
describe('assertIssueIncluded', () => {
  it('只有已纳入的问题能生成执行提示词', () => {
    expect(() => assertIssueIncluded('included')).not.toThrow()
    for (const d of ['pending', 'deferred', 'false_positive']) expect(() => assertIssueIncluded(d)).toThrow()
  })
})
```

（import 加 `assertIssueIncluded`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/actions.test.ts lib/repositories/issues.repo.test.ts lib/repositories/validators.test.ts`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现**

Create `lib/issues/actions.ts`:

```ts
import { deriveStatus } from './status'
import type { HumanActor, IssueEventDraft, IssueRecord } from './types'

export type IssueAction =
  | { kind: 'include' }
  | { kind: 'defer'; reason: string }
  | { kind: 'false_positive'; reason: string }
  | { kind: 'reopen' }
  | { kind: 'execute'; note?: string }
  | { kind: 'undo_execute' }

// 人对问题的动作（spec 2026-10-09 §4.2「可做的动作」）。纯函数：返回新问题与一条变化记录，非法动作抛 snake_case 错误。
export function applyIssueAction(
  issue: IssueRecord,
  action: IssueAction,
  ctx: { actor: HumanActor; now: string; eventId: string; note?: string },
): { issue: IssueRecord; event: IssueEventDraft } {
  let next: IssueRecord = { ...issue, updatedAt: ctx.now }
  let kind: IssueEventDraft['kind'] = 'decision'
  let note: string | null = ctx.note ?? null
  const clearExecution = { executedAt: null, executedNote: null, executedBy: null }

  switch (action.kind) {
    case 'include':
      next = { ...next, decision: 'included', decisionReason: null, decidedAt: ctx.now, decidedBy: ctx.actor }
      break
    case 'defer':
    case 'false_positive': {
      const reason = action.reason.trim()
      if (!reason) throw new Error('reason_required')
      next = {
        ...next,
        ...clearExecution,
        decision: action.kind === 'defer' ? 'deferred' : 'false_positive',
        decisionReason: reason,
        decidedAt: ctx.now,
        decidedBy: ctx.actor,
      }
      note = note ?? reason
      break
    }
    case 'reopen':
      if (issue.decision !== 'deferred' && issue.decision !== 'false_positive') throw new Error('not_excluded')
      next = { ...next, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null }
      break
    case 'execute': {
      if (issue.decision !== 'included') throw new Error('not_included')
      const executedNote = action.note?.trim() || null
      next = { ...next, executedAt: ctx.now, executedNote, executedBy: ctx.actor }
      kind = 'execution'
      note = note ?? executedNote
      break
    }
    case 'undo_execute':
      if (!issue.executedAt) throw new Error('not_executed')
      next = { ...next, ...clearExecution }
      kind = 'execution'
      break
  }

  next = { ...next, status: deriveStatus(next) }
  return {
    issue: next,
    event: {
      id: ctx.eventId,
      issueId: issue.id,
      runId: null,
      kind,
      checked: null,
      hit: null,
      severity: null,
      affectedCount: null,
      fromStatus: issue.status,
      toStatus: next.status,
      flags: next.flags,
      note,
      actor: ctx.actor,
      createdAt: ctx.now,
    },
  }
}
```

`lib/repositories/issues.ts` 加（import `applyIssueAction`、`type IssueAction` 自 `@/lib/issues/actions`，`type HumanActor` 自 `@/lib/issues/types`）：

```ts
// 单个问题的人工动作：写问题 + 变化记录（同一事务），再重算复查提醒。
export async function runIssueAction(issueId: string, action: IssueAction, actor: HumanActor = 'operator', note?: string): Promise<IssueRecord> {
  const issue = await getIssue(issueId)
  if (!issue) throw new Error('not_found')
  const { issue: next, event } = applyIssueAction(issue, action, { actor, now: new Date().toISOString(), eventId: `iev_${crypto.randomUUID()}`, note })
  await saveIssueChanges({ issues: [next], events: [event] })
  await recomputeRetestDue(issue.projectId)
  return next
}

// 「剩下的全部纳入」（spec D5）：只处理状态为待处理的问题。
export async function includeRemaining(projectId: string, actor: HumanActor = 'operator'): Promise<number> {
  const pending = (await getProjectIssues(projectId)).filter((i) => i.status === 'pending')
  if (!pending.length) return 0
  const now = new Date().toISOString()
  const changes = pending.map((i) =>
    applyIssueAction(i, { kind: 'include' }, { actor, now, eventId: `iev_${crypto.randomUUID()}`, note: '剩下的全部纳入' }),
  )
  await saveIssueChanges({ issues: changes.map((c) => c.issue), events: changes.map((c) => c.event) })
  await recomputeRetestDue(projectId)
  return changes.length
}
```

`lib/repositories/validators.ts` 加：

```ts
// 问题闸门（spec 2026-10-09 §6.4）：只有已纳入的问题能生成执行提示词。子项目 2 起提示词路由改用它。
export function assertIssueIncluded(decision: string): void {
  if (decision !== 'included') throw new Error(`issue decision "${decision}" cannot generate prompt (need included)`)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/issues lib/repositories && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add lib/issues/actions.ts lib/issues/actions.test.ts lib/repositories/issues.ts lib/repositories/issues.repo.test.ts lib/repositories/validators.ts lib/repositories/validators.test.ts
git commit -m "feat(issues): 问题动作（纳入/暂不处理/误报/撤销/执行）与提示词问题闸门断言"
```

---

### Task 13: 旧界面桥接——建议页 / 执行清单 / 问题页的操作同步写进问题表

**Files:**
- Create: `lib/issues/bridge.ts`、`lib/issues/bridge.test.ts`
- Modify: `app/api/recommendations/[id]/route.ts`、`app/api/recommendations/[id]/route.test.ts`
- Modify: `app/api/findings/[id]/route.ts`
- Modify: `app/api/recommendations/[id]/prompt/route.ts`、`app/api/recommendations/[id]/prompt/route.test.ts`

**Interfaces:**
- Consumes: Task 9 `getIssueByFingerprint`；Task 12 `runIssueAction`。
- Produces:
  - `issueForRecommendation(recId: string, deps?: BridgeDeps): Promise<IssueRecord | undefined>`
  - `mirrorRecommendationStatus(recId: string, status: 'draft' | 'accepted' | 'edited' | 'rejected', deps?): Promise<void>`
  - `mirrorRecommendationApplied(recId: string, applied: boolean, note?: string, deps?): Promise<void>`
  - `mirrorFindingStatus(findingId: string, status: 'open' | 'dismissed' | 'converted', reason?: string, deps?): Promise<void>`

映射：建议「接受 / 编辑」→ 问题纳入；「否决」→ 暂不处理（理由「旧界面否决（未记录理由）」）；「改回待确认」→ 问题决定不变；「标记已执行」→ 先确保纳入再执行；「撤销执行」→ 撤销执行；发现「忽略」→ 误报（理由用忽略原因）；发现改回 open → 撤销排除。复查提醒改由问题表重算（取代原来每次 +28 天）。找不到对应问题（例如尚未回填的旧体检）时什么都不做。子项目 2 换界面后删除本桥接。

- [ ] **Step 1: 写失败测试**

Create `lib/issues/bridge.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mirrorRecommendationStatus, mirrorRecommendationApplied, mirrorFindingStatus, type BridgeDeps } from './bridge'
import type { IssueRecord } from './types'

const baseIssue = { id: 'iss_1', decision: 'pending', executedAt: null } as unknown as IssueRecord
function makeDeps(issue: Partial<IssueRecord> | null = {}): BridgeDeps & { runIssueAction: ReturnType<typeof vi.fn> } {
  return {
    getRecommendation: vi.fn(async () => ({ id: 'rec_1', runId: 'run_1', findingId: 'find_1' })),
    getFinding: vi.fn(async () => ({ id: 'find_1', runId: 'run_1', fingerprint: 'fp_1' })),
    getRun: vi.fn(async () => ({ id: 'run_1', projectId: 'proj_1' })),
    getIssueByFingerprint: vi.fn(async () => (issue === null ? undefined : ({ ...baseIssue, ...issue } as IssueRecord))),
    runIssueAction: vi.fn(async () => ({}) as IssueRecord),
  } as never
}

describe('旧界面桥接', () => {
  it('接受 / 编辑 → 纳入；已纳入则不重复', async () => {
    const d = makeDeps()
    await mirrorRecommendationStatus('rec_1', 'accepted', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'include' }, 'operator', '旧界面：接受建议')
    const d2 = makeDeps({ decision: 'included' })
    await mirrorRecommendationStatus('rec_1', 'edited', d2)
    expect(d2.runIssueAction).not.toHaveBeenCalled()
  })

  it('否决 → 暂不处理（固定理由）；已排除不重复；改回待确认 → 不动', async () => {
    const d = makeDeps()
    await mirrorRecommendationStatus('rec_1', 'rejected', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'defer', reason: '旧界面否决（未记录理由）' }, 'operator', undefined)
    const d2 = makeDeps({ decision: 'false_positive' })
    await mirrorRecommendationStatus('rec_1', 'rejected', d2)
    await mirrorRecommendationStatus('rec_1', 'draft', d2)
    expect(d2.runIssueAction).not.toHaveBeenCalled()
  })

  it('标记已执行：未纳入的先纳入再执行；撤销执行只在执行过时调用', async () => {
    const d = makeDeps()
    await mirrorRecommendationApplied('rec_1', true, '改好了', d)
    expect(d.runIssueAction.mock.calls.map((c) => c[1])).toEqual([{ kind: 'include' }, { kind: 'execute', note: '改好了' }])
    const d2 = makeDeps({ decision: 'included', executedAt: '2026-11-01T00:00:00.000Z' })
    await mirrorRecommendationApplied('rec_1', false, undefined, d2)
    expect(d2.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'undo_execute' }, 'operator', undefined)
  })

  it('发现忽略 → 误报（理由用忽略原因）；改回 open → 撤销排除', async () => {
    const d = makeDeps()
    await mirrorFindingStatus('find_1', 'dismissed', '品牌站首页可以这样写', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'false_positive', reason: '品牌站首页可以这样写' }, 'operator', undefined)
    const d2 = makeDeps({ decision: 'false_positive' })
    await mirrorFindingStatus('find_1', 'open', undefined, d2)
    expect(d2.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'reopen' }, 'operator', undefined)
  })

  it('找不到对应问题（未回填的旧体检）→ 什么都不做', async () => {
    const d = makeDeps(null)
    await mirrorRecommendationStatus('rec_1', 'accepted', d)
    await mirrorRecommendationApplied('rec_1', true, undefined, d)
    expect(d.runIssueAction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/bridge.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现桥接**

Create `lib/issues/bridge.ts`:

```ts
import { getFinding, getIssueByFingerprint, getRecommendation, getRun, runIssueAction } from '@/lib/repositories'
import type { IssueRecord } from './types'

// 旧界面桥接（计划 Task 13）：建议页 / 执行清单 / 问题页仍按建议与发现操作，这里把这些操作同步成问题动作。
// 子项目 2 换成问题清单界面后删除本文件。
export interface BridgeDeps {
  getRecommendation: (id: string) => Promise<{ id: string; runId: string; findingId: string } | undefined>
  getFinding: (id: string) => Promise<{ id: string; runId: string; fingerprint: string | null } | undefined>
  getRun: (id: string) => Promise<{ id: string; projectId: string } | undefined>
  getIssueByFingerprint: typeof getIssueByFingerprint
  runIssueAction: typeof runIssueAction
}

const defaultDeps = (): BridgeDeps => ({ getRecommendation, getFinding, getRun, getIssueByFingerprint, runIssueAction })

async function issueForFinding(findingId: string, deps: BridgeDeps): Promise<IssueRecord | undefined> {
  const finding = await deps.getFinding(findingId)
  if (!finding?.fingerprint) return undefined
  const run = await deps.getRun(finding.runId)
  return run ? deps.getIssueByFingerprint(run.projectId, finding.fingerprint) : undefined
}

export async function issueForRecommendation(recId: string, deps: BridgeDeps = defaultDeps()): Promise<IssueRecord | undefined> {
  const rec = await deps.getRecommendation(recId)
  return rec ? issueForFinding(rec.findingId, deps) : undefined
}

const excluded = (i: IssueRecord) => i.decision === 'deferred' || i.decision === 'false_positive'

export async function mirrorRecommendationStatus(
  recId: string,
  status: 'draft' | 'accepted' | 'edited' | 'rejected',
  deps: BridgeDeps = defaultDeps(),
): Promise<void> {
  const issue = await issueForRecommendation(recId, deps)
  if (!issue) return
  if ((status === 'accepted' || status === 'edited') && issue.decision !== 'included') {
    await deps.runIssueAction(issue.id, { kind: 'include' }, 'operator', '旧界面：接受建议')
  } else if (status === 'rejected' && !excluded(issue)) {
    await deps.runIssueAction(issue.id, { kind: 'defer', reason: '旧界面否决（未记录理由）' }, 'operator', undefined)
  }
  // draft：旧界面把建议改回待确认，问题上的决定不变。
}

export async function mirrorRecommendationApplied(recId: string, applied: boolean, note?: string, deps: BridgeDeps = defaultDeps()): Promise<void> {
  const issue = await issueForRecommendation(recId, deps)
  if (!issue) return
  if (applied) {
    if (issue.decision !== 'included') await deps.runIssueAction(issue.id, { kind: 'include' }, 'operator', '旧界面：接受建议')
    await deps.runIssueAction(issue.id, { kind: 'execute', note }, 'operator', undefined)
  } else if (issue.executedAt) {
    await deps.runIssueAction(issue.id, { kind: 'undo_execute' }, 'operator', undefined)
  }
}

export async function mirrorFindingStatus(
  findingId: string,
  status: 'open' | 'dismissed' | 'converted',
  reason?: string,
  deps: BridgeDeps = defaultDeps(),
): Promise<void> {
  const issue = await issueForFinding(findingId, deps)
  if (!issue) return
  if (status === 'dismissed' && issue.decision !== 'false_positive') {
    await deps.runIssueAction(issue.id, { kind: 'false_positive', reason: reason ?? '旧界面忽略（未记录理由）' }, 'operator', undefined)
  } else if (status === 'open' && excluded(issue)) {
    await deps.runIssueAction(issue.id, { kind: 'reopen' }, 'operator', undefined)
  }
}
```

（测试里 `mirrorRecommendationApplied` 的第一条断言要求先 include 再 execute：`d.runIssueAction.mock.calls.map((c) => c[1])` 依次为两个动作。）

Run: `pnpm vitest run lib/issues/bridge.test.ts`，Expected: PASS。

- [ ] **Step 4: 路由接线（每处先改路由测试看失败，再改路由）**

(a) `app/api/recommendations/[id]/route.test.ts`：顶部加

```ts
const mirrorStatusMock = vi.fn(async () => undefined)
const mirrorAppliedMock = vi.fn(async () => undefined)
vi.mock('@/lib/issues/bridge', () => ({
  mirrorRecommendationStatus: (...a: unknown[]) => mirrorStatusMock(...(a as [])),
  mirrorRecommendationApplied: (...a: unknown[]) => mirrorAppliedMock(...(a as [])),
}))
```

把用例 `'success: marks applied and pushes project nextRetestDueAt to +28 days from now'` 改名为 `'success: marks applied and mirrors execution to the issue (retest due recomputed from issues)'`，删掉其中对 `setProjectNextRetestDueMock` 的期望，改为 `expect(mirrorAppliedMock).toHaveBeenCalledWith('rec_1', true, <该用例传入的 appliedNote>)` 与 `expect(setProjectNextRetestDueMock).not.toHaveBeenCalled()`；撤销用例加 `expect(mirrorAppliedMock).toHaveBeenCalledWith('rec_1', false)`；新增一条 status 分支用例：PATCH `{ status: 'accepted' }` 后 `expect(mirrorStatusMock).toHaveBeenCalledWith('rec_1', 'accepted')`。（`rec_1` 换成该测试文件里 `store.rec` 的实际 id。）Run 该测试文件，Expected: FAIL。

`app/api/recommendations/[id]/route.ts`：
- import `{ mirrorRecommendationApplied, mirrorRecommendationStatus } from '@/lib/issues/bridge'`；删掉 `setProjectNextRetestDue`、`RETEST_WINDOW_DAYS` 及其注释。
- `applied === true` 分支：把 `const run = await getRun(rec.runId)` 到 `setProjectNextRetestDue(...)` 那段替换为 `await mirrorRecommendationApplied(id, true, body.appliedNote ?? '')`（注释：`// 复查提醒改由问题表重算（spec 2026-10-09 §5.4-2），不再每次 +28 天。`）。
- `applied === false` 分支：在清空字段之后加 `await mirrorRecommendationApplied(id, false)`，并删除「不回滚 nextRetestDueAt」那段过期注释。
- status 分支：在 `const [updated] = ...returning()` 之后加 `await mirrorRecommendationStatus(id, status as 'draft' | 'accepted' | 'edited' | 'rejected')`。

Run 该测试文件，Expected: PASS。

(b) `app/api/findings/[id]/route.ts`：import `{ mirrorFindingStatus } from '@/lib/issues/bridge'`；`dismissFinding(id, reason)` 之后加 `await mirrorFindingStatus(id, 'dismissed', reason)`；通用 status 更新之后加 `await mirrorFindingStatus(id, status as 'open' | 'dismissed' | 'converted')`。（该路由没有既有测试；行为由 `bridge.test.ts` 覆盖。）

(c) `app/api/recommendations/[id]/prompt/route.ts`：import `{ issueForRecommendation } from '@/lib/issues/bridge'`；在 `const primaryId = ...` 之前加 `const issue = await issueForRecommendation(id)`，两处 `createGeneratedPrompt({...})`（主提示词与 brief）都加 `issueId: issue?.id ?? null,`。`route.test.ts` 顶部加 `vi.mock('@/lib/issues/bridge', () => ({ issueForRecommendation: async () => ({ id: 'iss_1' }) }))`，并在断言 `createGeneratedPrompt` 入参的用例里加 `expect.objectContaining({ issueId: 'iss_1' })`。Run 该测试文件，先 FAIL 后改路由再 PASS。

- [ ] **Step 5: 跑测试与类型检查**

Run: `pnpm vitest run lib/issues app/api/recommendations app/api/findings && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add lib/issues/bridge.ts lib/issues/bridge.test.ts app/api/recommendations app/api/findings
git commit -m "feat(issues): 旧界面操作同步写进问题表，复查提醒改由问题表重算"
```

---

### Task 14: 历史回填——把已有体检按时间顺序重放进问题表

**Files:**
- Create: `lib/issues/backfill.ts`、`lib/issues/backfill.test.ts`
- Create: `scripts/backfill-issues.ts`
- Modify: `package.json`（加脚本 `"issues:backfill": "tsx scripts/backfill-issues.ts"`）

**Interfaces:**
- Consumes: Task 8 `reconcileIssues`、`toObservedHit`；Task 12 `applyIssueAction`。
- Produces: `replayHistory(input: ReplayInput): { issues: IssueRecord[]; events: IssueEventDraft[] }`

规则（spec §6.5-2）：只重放已完成（`reviewing` / `output`）的体检，按 `startedAt ?? finishedAt` 升序；旧体检没有台账，未命中一律 `history_no_ledger`；旧体检协议指纹为空。每次体检对账之后，按该体检里的人工记录补决定：建议 `accepted` / `edited` → 纳入；`rejected` → 暂不处理（理由「历史数据：否决时未记录理由」）；发现 `dismissed` → 误报（理由取忽略原因）；`applied_at` 非空且已纳入 → 执行。`draft` 不算决定。决定的时间取该体检的完成时间，执行时间取 `applied_at`。

- [ ] **Step 1: 写失败测试**

Create `lib/issues/backfill.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { replayHistory, type ReplayInput } from './backfill'

const f = (id: string, runId: string, fp: string, over: Record<string, unknown> = {}) => ({
  id, runId, fingerprint: fp, ruleId: `R_${fp}`, title: fp, pillar: 'P2', side: 'seo', severity: 'mid', status: 'open', dismissReason: null, detail: null, ...over,
})
const input = (over: Partial<ReplayInput> = {}): ReplayInput => {
  let i = 0
  let e = 0
  return {
    projectId: 'proj_1',
    runs: [
      { id: 'run_a', status: 'reviewing', startedAt: null, finishedAt: '2026-07-12T00:00:00.000Z' },
      { id: 'run_b', status: 'output', startedAt: null, finishedAt: '2026-07-18T00:00:00.000Z' },
      { id: 'run_c', status: 'reviewing', startedAt: '2026-10-06T00:00:00.000Z', finishedAt: '2026-10-06T00:10:00.000Z' },
      { id: 'run_x', status: 'failed', startedAt: '2026-10-07T00:00:00.000Z', finishedAt: null },
    ],
    findings: [f('a1', 'run_a', 'fp_1'), f('a2', 'run_a', 'fp_2'), f('b1', 'run_b', 'fp_1'), f('c1', 'run_c', 'fp_1'), f('c3', 'run_c', 'fp_3')],
    recommendations: [{ id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'accepted', appliedAt: null, appliedNote: null }],
    newIssueId: () => `iss_${++i}`,
    newEventId: () => `iev_${++e}`,
    ...over,
  }
}

describe('replayHistory', () => {
  it('每个指纹一个问题；失败的体检不重放', () => {
    const out = replayHistory(input())
    expect(out.issues.map((x) => x.fingerprint).sort()).toEqual(['fp_1', 'fp_2', 'fp_3'])
    expect(out.events.every((ev) => ev.runId !== 'run_x')).toBe(true)
  })

  it('旧体检没台账：没再出现的问题记未复查（history_no_ledger），不会判已修复', () => {
    const fp2 = replayHistory(input()).issues.find((x) => x.fingerprint === 'fp_2')!
    expect(fp2).toMatchObject({ status: 'pending', detection: 'present', flags: ['unverified'], unverifiedReason: 'history_no_ledger' })
    expect(replayHistory(input()).issues.some((x) => x.status === 'fixed')).toBe(false)
  })

  it('7 月接受过的建议 → 问题已纳入，之后体检里的待确认不撤销它', () => {
    const fp1 = replayHistory(input()).issues.find((x) => x.fingerprint === 'fp_1')!
    expect(fp1).toMatchObject({ decision: 'included', decidedAt: '2026-07-18T00:00:00.000Z', decidedBy: 'operator', status: 'to_execute' })
  })

  it('否决 → 暂不处理（固定理由）；忽略的发现 → 误报（理由取忽略原因），误报优先', () => {
    const out = replayHistory(input({
      findings: [f('a1', 'run_a', 'fp_1', { status: 'dismissed', dismissReason: '品牌站首页可以这样写' }), f('a2', 'run_a', 'fp_2')],
      recommendations: [
        { id: 'ra1', runId: 'run_a', findingId: 'a1', status: 'rejected', appliedAt: null, appliedNote: null },
        { id: 'ra2', runId: 'run_a', findingId: 'a2', status: 'rejected', appliedAt: null, appliedNote: null },
      ],
    }))
    const by = Object.fromEntries(out.issues.map((x) => [x.fingerprint, x]))
    expect(by.fp_1).toMatchObject({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', status: 'excluded' })
    expect(by.fp_2).toMatchObject({ decision: 'deferred', decisionReason: '历史数据：否决时未记录理由' })
  })

  it('已纳入且标过执行 → 执行时间取 applied_at', () => {
    const out = replayHistory(input({
      recommendations: [{ id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'accepted', appliedAt: '2026-07-20T00:00:00.000Z', appliedNote: '已改' }],
    }))
    expect(out.issues.find((x) => x.fingerprint === 'fp_1')).toMatchObject({ executedAt: '2026-07-20T00:00:00.000Z', executedNote: '已改', status: 'not_effective' })
  })

  it('回放结果确定：两次回放结构相同', () => {
    const strip = (o: ReturnType<typeof replayHistory>) => o.issues.map((x) => [x.fingerprint, x.status, x.decision, x.flags.join(',')]).sort()
    expect(strip(replayHistory(input()))).toEqual(strip(replayHistory(input())))
  })
})
```

（「已纳入且标过执行」：7-20 执行，之后 10-06 体检仍命中 fp_1 → 改了没生效。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/backfill.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `lib/issues/backfill.ts`:

```ts
import { applyIssueAction, type IssueAction } from './actions'
import { reconcileIssues, toObservedHit, type ObservedHit } from './reconcile'
import type { IssueEventDraft, IssueRecord } from './types'

// 历史回填（spec 2026-10-09 §6.5-2）：按时间顺序重放已完成体检，并补上当时的人工决定。纯函数。
export interface ReplayInput {
  projectId: string
  runs: { id: string; status: string; startedAt: string | null; finishedAt: string | null }[]
  findings: {
    id: string
    runId: string
    fingerprint: string | null
    ruleId: string | null
    title: string
    pillar: string | null
    side: string
    severity: string
    status: string
    dismissReason: string | null
    detail?: { scale: { affected: number | null } } | null
  }[]
  recommendations: { id: string; runId: string; findingId: string; status: string; appliedAt: string | null; appliedNote: string | null }[]
  newIssueId: () => string
  newEventId: () => string
}

const COMPLETED = new Set(['reviewing', 'output'])
const timeOf = (r: { startedAt: string | null; finishedAt: string | null }) => r.startedAt ?? r.finishedAt ?? ''

export function replayHistory(input: ReplayInput): { issues: IssueRecord[]; events: IssueEventDraft[] } {
  const runs = input.runs.filter((r) => COMPLETED.has(r.status) && timeOf(r)).sort((a, b) => Date.parse(timeOf(a)) - Date.parse(timeOf(b)))
  const issues = new Map<string, IssueRecord>()
  const events: IssueEventDraft[] = []
  const byFp = () => new Map([...issues.values()].map((i) => [i.fingerprint, i]))

  const act = (issue: IssueRecord, action: IssueAction, now: string) => {
    const { issue: next, event } = applyIssueAction(issue, action, { actor: 'operator', now, eventId: input.newEventId(), note: '历史回填' })
    issues.set(next.id, next)
    events.push(event)
  }

  for (const run of runs) {
    const at = timeOf(run)
    const runFindings = input.findings.filter((f) => f.runId === run.id)
    const out = reconcileIssues({
      projectId: input.projectId,
      run: { id: run.id, startedAt: at, protocolHash: null },
      issues: [...issues.values()],
      hits: runFindings.map(toObservedHit).filter((h): h is ObservedHit => h !== null),
      ledger: [],
      protocolBoundRuleIds: new Set(),
      missingLedger: 'history',
      newIssueId: input.newIssueId,
      now: run.finishedAt ?? at,
    })
    for (const i of out.issues) issues.set(i.id, i)
    events.push(...out.events)

    const decidedAt = run.finishedAt ?? at
    const fpOfFinding = new Map(runFindings.map((f) => [f.id, f.fingerprint]))
    // 先补建议上的决定，再补发现上的「忽略」——误报优先于否决。
    for (const rec of input.recommendations.filter((r) => r.runId === run.id)) {
      const fp = fpOfFinding.get(rec.findingId)
      const issue = fp ? byFp().get(fp) : undefined
      if (!issue) continue
      if ((rec.status === 'accepted' || rec.status === 'edited') && issue.decision !== 'included') act(issue, { kind: 'include' }, decidedAt)
      if (rec.status === 'rejected' && issue.decision !== 'deferred' && issue.decision !== 'false_positive') {
        act(issue, { kind: 'defer', reason: '历史数据：否决时未记录理由' }, decidedAt)
      }
      const current = byFp().get(fp as string)!
      if (rec.appliedAt && current.decision === 'included') act(current, { kind: 'execute', note: rec.appliedNote ?? undefined }, rec.appliedAt)
    }
    for (const f of runFindings.filter((x) => x.status === 'dismissed')) {
      const issue = f.fingerprint ? byFp().get(f.fingerprint) : undefined
      if (issue && issue.decision !== 'false_positive') {
        act(issue, { kind: 'false_positive', reason: f.dismissReason?.trim() || '历史数据：忽略时未记录理由' }, decidedAt)
      }
    }
  }
  return { issues: [...issues.values()], events }
}
```

> 「已纳入且标过执行」用例：7-18 体检之后补纳入，执行时间 7-20；`applyIssueAction` 以 `now = 7-20` 写执行，状态为「已执行，待复查」。10-06 体检对账时命中 fp_1，检查时间晚于执行 → 改了没生效。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/issues/backfill.test.ts`
Expected: PASS

- [ ] **Step 5: 写回填脚本**

Create `scripts/backfill-issues.ts`:

```ts
// 历史回填（spec 2026-10-09 §6.5）：把已有体检按时间顺序重放进问题表。
// 用法（在仓库根目录）：
//   LIBSQL_URL=file:./veris.db pnpm issues:backfill --dry-run          # 只打印，不写
//   LIBSQL_URL=file:./veris.db pnpm issues:backfill                    # 只处理还没有问题的项目（可重复执行）
//   LIBSQL_URL=file:<副本>.db pnpm issues:backfill --rebuild           # 仅限副本演练：先删该项目问题再重放
//   可加 --project <id> 只处理一个项目。
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { findings, issues, projects, recommendations, runs } from '@/db/schema'
import { getProjectIssues, recomputeRetestDue, saveIssueChanges } from '@/lib/repositories'
import { replayHistory } from '@/lib/issues/backfill'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const valueOf = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function main(): Promise<void> {
  const dryRun = flag('--dry-run')
  const rebuild = flag('--rebuild')
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
      newEventId: () => `iev_${crypto.randomUUID()}`,
    })
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
```

`package.json` 的 `scripts` 里加 `"issues:backfill": "tsx scripts/backfill-issues.ts",`。

- [ ] **Step 6: 在数据库副本上演练并独立核对**

先用 SQL 从源表算出期望值（与回填代码是两条独立路径）：

```bash
cp veris.db /private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db
node scripts/apply-local-migrations.mjs /private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db 0019 --record
```

用 libsql 只读查询副本，记下：
- `select p.domain, count(distinct f.fingerprint) from findings f join runs r on r.id=f.run_id join projects p on p.id=r.project_id where r.status in ('reviewing','output') and f.fingerprint is not null group by 1` → 期望问题数（metadocu 应为 19）；
- `select count(distinct f.fingerprint) from recommendations rc join findings f on f.id=rc.finding_id join runs r on r.id=rc.run_id where rc.status in ('accepted','edited') and r.status in ('reviewing','output')` → 期望「已纳入」数；
- `select f.fingerprint, count(distinct f.run_id) n from findings f join runs r on r.id=f.run_id where r.status in ('reviewing','output') group by 1 having n = 5` → 出现 5 次的指纹数（应为 6）。

然后：

```bash
LIBSQL_URL=file:/private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db pnpm issues:backfill --dry-run
LIBSQL_URL=file:/private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db pnpm issues:backfill
LIBSQL_URL=file:/private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db pnpm issues:backfill
```

Expected：
- 第 2 次输出的问题数、已纳入数与上面 SQL 一致；第 3 次全部「已有 N 个问题，跳过」。
- 副本里 `select count(*) from issues where status='fixed'` 为 0；`select count(*) from issue_events where kind='observed' group by issue_id having count(*)=5` 的行数为 6。
- 再执行一次 `--rebuild`，问题数、各状态计数与第 2 次一致（确定性）。

不一致时停止，不在正式库执行，回到 Step 3 排查。

- [ ] **Step 7: 提交**

```bash
git add lib/issues/backfill.ts lib/issues/backfill.test.ts scripts/backfill-issues.ts package.json
git commit -m "feat(issues): 历史回填——按时间重放已有体检并补上当时的人工决定"
```

---

### Task 15: 问题清单文档（验收交付物）

**Files:**
- Create: `lib/issues/report-markdown.ts`、`lib/issues/report-markdown.test.ts`
- Create: `scripts/issue-report.ts`
- Modify: `package.json`（加 `"issues:report": "tsx scripts/issue-report.ts"`）

**Interfaces:**
- Produces: `renderIssueReport(input: { domain: string; issues: IssueRecord[]; events: IssueEventDraft[] }): string`

文档给你核对用：每个项目一节，先按状态计数，再逐个问题列出当前状态、决定、标记，以及从第一次出现到现在的完整经过。

- [ ] **Step 1: 写失败测试**

Create `lib/issues/report-markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderIssueReport } from './report-markdown'
import type { IssueEventDraft, IssueRecord } from './types'

const issue = { id: 'iss_1', title: '不符合 Google 富媒体结果要求', ruleId: 'C05c', status: 'to_execute', decision: 'included', flags: ['unverified'], unverifiedReason: 'history_no_ledger', severity: 'mid' } as unknown as IssueRecord
const ev = (over: Partial<IssueEventDraft>): IssueEventDraft => ({
  id: 'e', issueId: 'iss_1', runId: 'run_1', kind: 'observed', checked: true, hit: true, severity: 'mid', affectedCount: 2,
  fromStatus: null, toStatus: 'pending', flags: ['new'], note: null, actor: 'system', createdAt: '2026-07-12T00:00:00.000Z', ...over,
})

describe('renderIssueReport', () => {
  it('计数 + 每个问题的当前状态与经过（按时间）', () => {
    const md = renderIssueReport({
      domain: 'metadocu.com',
      issues: [issue],
      events: [
        ev({ kind: 'decision', fromStatus: 'pending', toStatus: 'to_execute', actor: 'operator', note: '历史回填', createdAt: '2026-07-18T00:00:00.000Z', checked: null, hit: null }),
        ev({}),
      ],
    })
    expect(md).toContain('## metadocu.com')
    expect(md).toContain('待执行 1')
    expect(md).toContain('### 不符合 Google 富媒体结果要求（C05c）')
    expect(md).toContain('当前：待执行 · 决定：已纳入 · 标记：未复查（历史数据没有台账）')
    const first = md.indexOf('2026-07-12')
    const second = md.indexOf('2026-07-18')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(md).toContain('2026-07-12 体检：查出（受影响 2）→ 待处理 [新出现]')
    expect(md).toContain('2026-07-18 决定：待处理 → 待执行（历史回填）')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/issues/report-markdown.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `lib/issues/report-markdown.ts`:

```ts
import type { IssueEventDraft, IssueFlag, IssueRecord, IssueStatus } from './types'

// 问题清单文档（计划 Task 15）：验收时给你逐条核对每个问题的当前状态与经过。
const STATUS: Record<IssueStatus, string> = {
  pending: '待处理', to_execute: '待执行', executed_awaiting: '已执行，待复查', fixed: '已修复',
  not_effective: '改了没生效', self_resolved: '自行消失', excluded: '已排除', retired: '已关闭（不可比）',
}
const DECISION: Record<string, string> = { pending: '未决定', included: '已纳入', deferred: '暂不处理', false_positive: '误报' }
const FLAG: Record<IssueFlag, string> = {
  new: '新出现', worse: '变严重', relapse: '复发', partial: '部分改善', unverified: '未复查', protocol_changed: '协议已变', rule_changed: '规则已更新',
}
const REASON: Record<string, string> = {
  data_gap: '缺数据源', site_condition: '网站条件不满足', unsupported: '工具暂不支持', error: '规则出错', history_no_ledger: '历史数据没有台账',
  protocol_changed: '考题已换', rule_changed: '规则已更新',
}
const day = (iso: string) => iso.slice(0, 10)

function flagText(i: IssueRecord): string {
  if (!i.flags.length) return '无'
  return i.flags.map((f) => (f === 'unverified' && i.unverifiedReason ? `${FLAG[f]}（${REASON[i.unverifiedReason]}）` : FLAG[f])).join('、')
}

function eventLine(e: IssueEventDraft): string {
  const from = e.fromStatus ? STATUS[e.fromStatus] : null
  const to = STATUS[e.toStatus]
  const flags = e.flags.length ? ` [${e.flags.map((f) => FLAG[f]).join('、')}]` : ''
  if (e.kind === 'observed') {
    const seen = !e.checked ? `没查（${REASON[e.note ?? ''] ?? e.note ?? '原因未记录'}）` : e.hit ? `查出（受影响 ${e.affectedCount ?? '?'}）` : '查过，没查出'
    return `- ${day(e.createdAt)} 体检：${seen}→ ${to}${flags}`
  }
  const label = e.kind === 'decision' ? '决定' : '执行'
  return `- ${day(e.createdAt)} ${label}：${from ?? '—'} → ${to}${e.note ? `（${e.note}）` : ''}`
}

export function renderIssueReport(input: { domain: string; issues: IssueRecord[]; events: IssueEventDraft[] }): string {
  const counts = new Map<IssueStatus, number>()
  for (const i of input.issues) counts.set(i.status, (counts.get(i.status) ?? 0) + 1)
  const lines = [`## ${input.domain}`, '', `共 ${input.issues.length} 个问题：${[...counts].map(([s, n]) => `${STATUS[s]} ${n}`).join('，')}`, '']
  for (const i of input.issues) {
    lines.push(`### ${i.title}（${i.ruleId}）`, '', `当前：${STATUS[i.status]} · 决定：${DECISION[i.decision]} · 标记：${flagText(i)}`, '')
    const history = input.events.filter((e) => e.issueId === i.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    lines.push(...history.map(eventLine), '')
  }
  return lines.join('\n')
}
```

> 注：「体检」行里 `seen` 与箭头之间没有空格（`查出（受影响 2）→ 待处理`），与测试断言一致。

- [ ] **Step 4: 写脚本**

Create `scripts/issue-report.ts`:

```ts
// 问题清单文档（验收交付物）。用法：LIBSQL_URL=file:./veris.db pnpm issues:report > <输出文件>.md
import { eq, inArray } from 'drizzle-orm'
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
```

（`eq` 若未使用则从 import 删除。）`package.json` 加 `"issues:report": "tsx scripts/issue-report.ts",`。

- [ ] **Step 5: 跑测试并在演练副本上生成一次**

Run: `pnpm vitest run lib/issues/report-markdown.test.ts && LIBSQL_URL=file:/private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/veris-backfill-rehearsal.db pnpm issues:report | head -40`
Expected: 测试 PASS；输出以 `# 问题清单` 开头，含 `## metadocu.com` 一节。

- [ ] **Step 6: 提交**

```bash
git add lib/issues/report-markdown.ts lib/issues/report-markdown.test.ts scripts/issue-report.ts package.json
git commit -m "feat(issues): 问题清单文档脚本（验收交付物）"
```

---

### Task 16: 收口——全量验证、本地库迁移与回填、真实体检验收

**Files:**
- Modify: `docs/runbooks/local-env.md`（加 0019 迁移与回填步骤）

- [ ] **Step 1: 全量验证**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: 全部通过。机器负载高时可能有超时假失败：先核对测试文件数与 `find app components lib db scripts -name '*.test.ts' -o -name '*.test.tsx' | wc -l` 一致，再单独重跑失败文件，重跑全绿才算过；任何真失败按名字记录并修复。

- [ ] **Step 2: 收口检查**

Run:
```bash
grep -rnE "\`https://\\$\{|'https://' *\+" lib --include='*.ts' --exclude='*.test.*'
git status --short
```
Expected: 第一条无输出；第二条只有本计划提到的文件（没有 `veris-test-*.db` 残留、没有误生成的文件）。

- [ ] **Step 3: 更新本地运行手册**

`docs/runbooks/local-env.md` 第 2 节「本地库迁移」末尾加：

```markdown
### 2026-10 问题台账（0019）

1. 备份：`cp veris.db veris.<日期>-pre-0019.db`
2. 迁移：`node scripts/apply-local-migrations.mjs "$PWD/veris.db" 0019 --record`
3. 回填（先 dry-run 看数字，再正式执行；可重复执行，已有问题的项目会跳过）：
   `LIBSQL_URL=file:./veris.db pnpm issues:backfill --dry-run`，确认后去掉 `--dry-run` 再跑一次。
4. 核对：`LIBSQL_URL=file:./veris.db pnpm issues:report > /tmp/issues.md`，逐条看一遍。
线上库如已部署，同样执行 2、3。
```

- [ ] **Step 4: 正式库迁移与回填（先停止本地 `next start` 与 Inngest dev server，避免写冲突）**

```bash
cp veris.db veris.$(date +%Y-%m-%d)-pre-0019.db
node scripts/apply-local-migrations.mjs "$PWD/veris.db" 0019 --record
LIBSQL_URL=file:./veris.db pnpm issues:backfill --dry-run
LIBSQL_URL=file:./veris.db pnpm issues:backfill
LIBSQL_URL=file:./veris.db pnpm issues:report > /private/tmp/claude-501/-Users-gongchunming-Public-website-seo-tools/issues-after-backfill.md
```

Expected：dry-run 与正式执行的数字和 Task 14 Step 6 的演练结果一致。把 `issues-after-backfill.md` 交给用户核对。

- [ ] **Step 5: 提交**

```bash
git add docs/runbooks/local-env.md
git commit -m "docs: 问题台账 0019 迁移与回填手册"
```

- [ ] **Step 6: 真实体检验收（会产生接口费用，每轮约 $0.8–8；开跑前必须再次征得用户同意）**

按规格 §8.3 执行，并把每轮的 `pnpm issues:report` 输出与体检变化摘要（`getRunIssueSummary`）交给用户：
1. 第 1 轮：在界面「新建分析」对 metadocu 发起体检；完成后核对台账 87 行、问题表与回填结果衔接（历史问题被本轮观测到）。
2. 第 2 轮：先在旧执行清单把一个问题标「已执行」，再在设置里断开一个数据源（例如清除 DataForSEO 凭据），发起体检；核对依赖该数据源的问题为「未复查（缺数据源）」而非「已修复」，做过决定的问题不在待处理里，两轮协议指纹相同（runType 为 retest）。
3. 第 3 轮（可选）：改品类后发起体检；核对 G05/G06 等抽样类问题未命中时为「已关闭（考题已换）」，抓取类照常比较。

验收结束后恢复断开的数据源。
