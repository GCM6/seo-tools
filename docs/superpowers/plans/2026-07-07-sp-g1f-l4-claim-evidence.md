# SP-G1f · L4 证据约束接入写路径 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已有但无调用方的 `assertFindingClaimEvidence` 接入 `createFindings` 写路径，让 `measured_hard`（无 L4 证据）/ `measured_sample`（无 L3-L4 证据）的 finding 写入即抛错——落地 plan-ux §6.2 唯一未落地的约束。

**Architecture:** 校验落在**仓库写函数 `createFindings`**（`lib/repositories/index.ts`），而非各调用点——一处接入即同时保护 `generate-findings` 与 `reevaluate-competitors` 两条写链。finding 行只带 `claimType` + `evidenceRefs`（evidence artifact ID），校验器却要 `evidenceLevels`；因 measured 约束需 join `evidence_artifacts` 取 `claimLevel`，SQL `check()` 无法表达（现有 `findings_evidence_nonempty` 只能管非空），故只能在应用写路径反查后逐行 assert。仅当批内存在 `measured_*` 行时才触发这次 DB 读，其余（hypothesis/inferred）零额外开销。

**Tech Stack:** TypeScript 全栈；libSQL (Turso) + Drizzle（`@/db/client` `@/db/schema`）；测试 vitest，仓库级测试用临时文件库灌 migration（照 `lib/repositories/rule-proposals.repo.test.ts`）。包管理器 **pnpm**。

## Global Constraints

- 校验失败**直接 `throw new Error`**（手写 assert 风格）；**本项目没装 Zod**，不得 `import zod`。复用 `lib/repositories/validators.ts` 现成 `assertFindingClaimEvidence`，不新写校验器。
- DB 读写集中在 `lib/repositories/index.ts`；批量插入保持**空数组短路**（drizzle `.values([])` 会抛错）。
- 测试文件与源码**同层共存**（`foo.ts` 旁 `foo.test.ts`），不建 `__tests__/` 目录。
- 注释中文、关键决策标 spec 出处（`// …（spec §6.2）`）。
- 命令一律 pnpm（`pnpm vitest run …` / `pnpm test` / `pnpm lint`），不用 npm/npx/yarn。
- 类型真源：`ClaimType` / `EvidenceLevel` 来自 `@/lib/types`；`EVIDENCE_LEVELS = ['L0','L1','L2','L3','L4']`，但 `evidence_artifacts.claim_level` 的 CHECK 只允许 `L1-L4`。
- **本计划范围仅 L4 claim-evidence 约束**。SP-G1f 的另一半「`gsc_refresh_token` 加密存储」依赖 SP-G1c 的加密模块，**不在本计划内**，待 SP-G1c 落地后单独出计划。

---

## File Structure

- `lib/repositories/index.ts`（Modify）— `createFindings` 从纯插入改为「先反查证据等级 → 逐行 `assertFindingClaimEvidence` → 再插入」；新增对 `assertFindingClaimEvidence` 与 `ClaimType` 的 import。
- `lib/repositories/findings.repo.test.ts`（Create）— 仓库级回归测试：临时文件库灌 migration，构造 project/run/evidence_artifacts 前置行，断言违规 measured finding 写入被拒、合规写入成功、hypothesis/inferred 不受等级约束、空批短路、混批中单行违规则整批被拒。

现有的 `lib/repositories/validators.test.ts`（纯函数单测）保持不变——它已覆盖 `assertFindingClaimEvidence` 的纯逻辑；本计划新增的是**写路径接入**的集成回归。

---

### Task 1: `createFindings` 写路径接入 L4 claim-evidence 约束

**Files:**
- Modify: `lib/repositories/index.ts:20-21`（`createFindings` 定义）、`lib/repositories/index.ts:1-5`（imports）
- Test: `lib/repositories/findings.repo.test.ts`（新建）

**Interfaces:**
- Consumes:
  - `assertFindingClaimEvidence({ claimType: ClaimType; evidenceLevels: EvidenceLevel[] }): void` — 来自 `./validators`，`measured_hard` 无 `L4`、`measured_sample` 无 `L3|L4` 时 `throw`。
  - `evidenceArtifacts`（`@/db/schema`，列 `id` / `claimLevel`）、`inArray`（drizzle-orm）— 两者 `index.ts` 顶部**已 import**，无需新增。
  - `ClaimType` / `EvidenceLevel`（`@/lib/types`）— `EvidenceLevel` 已 import，需**补 import `ClaimType`**。
- Produces:
  - `createFindings(rows: (typeof findings.$inferInsert)[]): Promise<...>` — 签名对外不变（仍是 `Promise`，`typeof createFindings` 注入点如 `generate-findings.ts` 的 `GenerateFindingsDeps` 不受影响）；行为新增：批内任一 `measured_*` 行的证据等级不达标时 **reject**（在任何插入发生前）。空数组仍返回 `[]`。

- [ ] **Step 1: 写失败测试**

新建 `lib/repositories/findings.repo.test.ts`（临时库引导段照抄 `rule-proposals.repo.test.ts` 的既有模式——必须在 import `@/db/client` 前灌好 migration）：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-findingsrepo.db'
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

// schema 灌好后再 import，@/db/client 才会绑到已建表的临时库。
const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, evidenceArtifacts, findings } = await import('@/db/schema')

// 前置证据：4 档 claim_level 各一条，供 finding 引用。type 取白名单内的 'gsc'/'site_audit'。
async function seed() {
  await db.delete(findings)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
  await db.insert(evidenceArtifacts).values([
    { id: 'ev_l1', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L1', rawHash: 'h1' },
    { id: 'ev_l2', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L2', rawHash: 'h2' },
    { id: 'ev_l3', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L3', rawHash: 'h3' },
    { id: 'ev_l4', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L4', rawHash: 'h4' },
  ])
}

// 构造 finding 插入行：side/title/claimType/evidenceRefs 必填，其余走列默认。
function findingRow(over: { id: string; claimType: string; evidenceRefs: string[] }) {
  return { runId: 'run_1', side: 'seo', title: 't', ...over }
}

describe('createFindings §6.2 claim-evidence 写路径约束', () => {
  beforeEach(seed)

  it('measured_hard 只引用 L2 证据 → 写入被拒', async () => {
    await expect(
      repo.createFindings([findingRow({ id: 'f_bad', claimType: 'measured_hard', evidenceRefs: ['ev_l2'] })]),
    ).rejects.toThrow(/L4/)
    // 拒绝须发生在任何插入之前：库里无该行。
    expect(await repo.getFindings('run_1')).toHaveLength(0)
  })

  it('measured_hard 引用 L4 证据 → 写入成功', async () => {
    const rows = await repo.createFindings([findingRow({ id: 'f_ok', claimType: 'measured_hard', evidenceRefs: ['ev_l4'] })])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('f_ok')
  })

  it('measured_sample 只引用 L1 证据 → 写入被拒', async () => {
    await expect(
      repo.createFindings([findingRow({ id: 'f_s_bad', claimType: 'measured_sample', evidenceRefs: ['ev_l1'] })]),
    ).rejects.toThrow()
  })

  it('measured_sample 引用 L3 证据 → 写入成功', async () => {
    const rows = await repo.createFindings([findingRow({ id: 'f_s_ok', claimType: 'measured_sample', evidenceRefs: ['ev_l3'] })])
    expect(rows).toHaveLength(1)
  })

  it('hypothesis / inferred 不受证据等级约束（引用 L1 亦可入库）', async () => {
    const rows = await repo.createFindings([
      findingRow({ id: 'f_h', claimType: 'hypothesis', evidenceRefs: ['ev_l1'] }),
      findingRow({ id: 'f_i', claimType: 'inferred', evidenceRefs: ['ev_l1'] }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('混批中单行违规 → 整批被拒，无部分写入', async () => {
    await expect(
      repo.createFindings([
        findingRow({ id: 'f_good', claimType: 'measured_hard', evidenceRefs: ['ev_l4'] }),
        findingRow({ id: 'f_evil', claimType: 'measured_hard', evidenceRefs: ['ev_l2'] }),
      ]),
    ).rejects.toThrow()
    expect(await repo.getFindings('run_1')).toHaveLength(0)
  })

  it('空数组短路：返回 [] 且不查库', async () => {
    expect(await repo.createFindings([])).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/repositories/findings.repo.test.ts`
Expected: FAIL —「measured_hard 只引用 L2 证据 → 写入被拒」等用例不抛错（现有 `createFindings` 无校验，违规行会成功写入），断言 `rejects.toThrow` / `toHaveLength(0)` 失败。

- [ ] **Step 3: 实现 —— 给 `createFindings` 接入校验**

在 `lib/repositories/index.ts` 顶部补 import（`inArray` / `evidenceArtifacts` / `EvidenceLevel` 已存在，只需加 `ClaimType` 与 `assertFindingClaimEvidence`）：

```ts
// 第 5 行：EvidenceLevel 已在，追加 ClaimType
import type { EvidenceType, EvidenceLevel, RunStatus, ClaimType } from '@/lib/types'
// 新增一行（放在其它 import 之后、导出之前均可）：
import { assertFindingClaimEvidence } from './validators'
```

把 `createFindings`（现 `index.ts:20-21`）替换为：

```ts
// —— 诊断生成链写入（spec §5：generateFindings → recommendations → prompts）——
// 规则引擎产物批量落库；空数组直接短路（drizzle .values([]) 会抛错）。
// §6.2 写路径闸门：measured_hard 必须有 L4、measured_sample 必须有 L3/L4 证据——
// finding 行只带 evidence_refs（artifact id），故先按 refs 反查 claim_level 再逐行 assert。
// 仅当批内存在 measured_* 行时才触发这次证据读，hypothesis/inferred 零额外开销。
export const createFindings = async (rows: (typeof findings.$inferInsert)[]) => {
  if (!rows.length) return []
  const needsLevelCheck = rows.some(
    (r) => r.claimType === 'measured_hard' || r.claimType === 'measured_sample',
  )
  if (needsLevelCheck) {
    const refIds = [...new Set(rows.flatMap((r) => (r.evidenceRefs as string[] | null) ?? []))]
    const arts = refIds.length
      ? await db
          .select({ id: evidenceArtifacts.id, claimLevel: evidenceArtifacts.claimLevel })
          .from(evidenceArtifacts)
          .where(inArray(evidenceArtifacts.id, refIds))
      : []
    const levelById = new Map(arts.map((a) => [a.id, a.claimLevel as EvidenceLevel]))
    for (const r of rows) {
      const evidenceLevels = ((r.evidenceRefs as string[] | null) ?? [])
        .map((id) => levelById.get(id))
        .filter((l): l is EvidenceLevel => Boolean(l))
      assertFindingClaimEvidence({ claimType: r.claimType as ClaimType, evidenceLevels })
    }
  }
  return db.insert(findings).values(rows).returning()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/repositories/findings.repo.test.ts`
Expected: PASS（7 个用例全绿）。

- [ ] **Step 5: 跑全量测试 + lint，确认无回归**

Run: `pnpm test`
Expected: 全绿。**重点观察**：若任何既有 e2e/集成用例因真实规则产出「measured_* 但引用不到 L3/L4 证据」的 finding 而新失败——这是本约束**正确暴露**的既存 bug，不是本改动的错；记录该 finding 的 `rule_id` 并单独立项修规则，勿放宽约束绕过。
Run: `pnpm lint`
Expected: 无新增告警。

- [ ] **Step 6: 提交**

```bash
git add lib/repositories/index.ts lib/repositories/findings.repo.test.ts docs/superpowers/plans/2026-07-07-sp-g1f-l4-claim-evidence.md
git commit -m "feat(repo): createFindings 接入 §6.2 L4 claim-evidence 写路径闸门

measured_hard 无 L4 / measured_sample 无 L3-L4 证据的 finding 写入即抛错；
按 evidence_refs 反查 claim_level 后逐行 assert，一处接入护住 generate-findings
与 reevaluate-competitors 两条写链。plan-ux §6.2 唯一未落地约束落地。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:** SP-G1f 的 L4 约束部分（roadmap「measured_hard 无 L4 / measured_sample 无 L3-L4 证据时写入即抛错」）→ Task 1 完整覆盖。加密部分已显式排除并说明依赖 SP-G1c。验收「构造违规 finding 写入被拒的回归测试」→ Task 1 Step 1 的「measured_hard 只引用 L2 → 写入被拒」等用例。

**2. Placeholder scan:** 无 TBD/TODO；每个代码步给了完整代码；命令与预期输出均具体。

**3. Type consistency:** `createFindings` 保持 `Promise` 返回（`async` 化不改变注入点 `typeof createFindings` 的兼容性）；`ClaimType` / `EvidenceLevel` 均来自 `@/lib/types`；`assertFindingClaimEvidence` 入参形状 `{ claimType, evidenceLevels }` 与 `validators.ts` 定义一致；测试 seed 的 `evidence_artifacts.type='gsc'`、`claimLevel ∈ L1-L4` 满足 schema CHECK；finding 行 `side='seo'` 满足 `findings_side` CHECK、`evidenceRefs` 非空满足 `findings_evidence_nonempty` CHECK。
