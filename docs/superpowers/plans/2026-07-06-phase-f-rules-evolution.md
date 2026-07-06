# Phase F 能力保鲜自动化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让规则库每月自动产出「带一手来源的变更提案」，经人工审批后打包发版（changelog + 版本号），使平台能力（AI 爬虫 UA、富摘要弃用、CWV 阈值等参考资产）不与外部世界脱节——第四道人工闸门。

**Architecture:** 确定性巡检（Inngest cron，零 LLM、零抓取正文）复用 Phase E 的 `checkArtifactFreshness` 把「超期资产」变成 `rule_change_proposals` 队列；纯逻辑模块（`rule-proposals.ts` / `rule-stats.ts`）负责版本推导、资产更新计算、evidence 非空校验、changelog 分组、按 `rule_id` 聚合 dismiss/ineffective + Wilson 下限；仓库层新增提案 CRUD + 打包发版（自动落地 `update_artifact` 类到 `reference_artifacts`）；全局作用域审阅 UI + API 路由做 approve/reject/手动建/发版。

**Tech Stack:** TypeScript · Next.js 16 App Router（async `params` 为 Promise）· React 19 · libSQL(Turso) + Drizzle ORM · Inngest（cron）· next-intl · Vitest。

## Global Constraints

以下为项目级铁律与本 Phase 已确认决策，**每个 Task 隐含遵守**：

- **编码前必读**：写/改任何 `.ts`/`.tsx` 前先调用 `veris-coding` skill（钉死 React 19 + Next 16 写法：async `cookies()`、`params: Promise<…>`、无 `forwardRef`）。
- **自动发现、人工放行**：自动化止步于「生成带一手来源的提案」；发布永远经人工审批。Phase F **不自动改写代码规则**。
- **提案无一手来源不入库**：`createRuleChangeProposal` 应用层强校验 `evidence_refs` 非空（至少一个去空白后非空的字符串），空则 `throw`。前后端双校验。
- **RULES_VERSION 是代码真源（已确认决策）**：`RULES_VERSION`（`lib/diagnosis/types.ts` 常量）是规则库版本单一真源。发版动作只写提案 `released_in_rules_version` 标签并落地数据资产，**不自动改代码常量**；常量由开发在部署时手动同步。UI 发版后显示「待部署：请将 RULES_VERSION 更新为 `<newVersion>` 并部署」。**不采用**把发布版本数据化的备选。
- **RULES_VERSION 单调递增不可变**：回滚 = 发内容等同旧版的新版本。版本格式恒 `rules_v<N>`。
- **run 创建时用当前 RULES_VERSION 现场打标**：baseline 与 retest **都**写入当前 `RULES_VERSION`（retest **不**从 baseline 复制，否则跨版本横幅永不触发）。
- **数据资产版本格式**：`reference_artifacts.version` 为 `v<N>`（seed 为 `v1`）。
- **语言规范**：所有 UI 文案、报错、Git commit message 用中文；代码标识符/路由/字段用英文。
- **验证门槛**：`npx tsc --noEmit` 0 错 · `npm run lint` 0 error · `npm run test`（vitest）全绿 · `npm run build` 通过。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `db/schema.ts` | 改 | `findings` 加 `rule_id`、`runs` 加 `rules_version`（均 nullable） |
| `lib/diagnosis/finding-rows.ts` | 改 | `FindingRow` 加 `ruleId`，`buildFindingRows` 映射 `hit.ruleId` |
| `app/api/runs/route.ts`、`app/api/runs/[id]/retest/route.ts` | 改 | run 创建写 `rulesVersion: RULES_VERSION` |
| `lib/diagnosis/rule-proposals.ts` (+ `.test.ts`) | 建 | evidence 校验、版本推导、资产更新计算、changelog 分组、跨版本 delta——纯函数 |
| `lib/diagnosis/rule-stats.ts` (+ `.test.ts`) | 建 | `wilsonLowerBound` + 按 `rule_id` 聚合 dismiss/ineffective → 提案草稿——纯函数 |
| `lib/repositories/index.ts` | 改 | 提案 CRUD、打包发版、changelog 查询、F3 统计 join 查询 |
| `lib/inngest/rules-evolution.ts` (+ `.test.ts`) | 建 | Inngest cron：freshness 巡检 + stats 聚合 → 幂等入队（DI 可测） |
| `app/api/inngest/route.ts` | 改 | 注册 `rulesEvolutionScan` |
| `app/api/rules/proposals/route.ts` | 建 | GET 列表 + POST 手动建提案 |
| `app/api/rules/proposals/[id]/route.ts` | 建 | PATCH approve/reject |
| `app/api/rules/release/route.ts` | 建 | POST 打包发版 |
| `app/[locale]/rules/page.tsx` + `RulesAdminClient.tsx` | 建 | 提案队列 + 审批 + 手动建 + 发版 + changelog（全局，非 per-project） |
| `app/[locale]/runs/[id]/report/page.tsx` | 改 | §11.3 跨版本横幅接入 |
| `messages/en.json`、`messages/zh.json` | 改 | `rulesAdmin` + `report` 横幅文案 |

---

## Task 1: 契约层 — schema 两列 + finding-rows / run 创建穿线

**Files:**
- Modify: `db/schema.ts:51-63`（runs）、`db/schema.ts:160-184`（findings）
- Modify: `lib/diagnosis/finding-rows.ts:37-70`
- Modify: `app/api/runs/route.ts:27-30`
- Modify: `app/api/runs/[id]/retest/route.ts:22-32`
- Test: `lib/diagnosis/finding-rows.test.ts`（新建或追加）

**Interfaces:**
- Produces: `FindingRow` 新增必填字段 `ruleId: string`；`findings` 表新增列 `rule_id: text`（nullable）；`runs` 表新增列 `rules_version: text`（nullable）。下游 Task 4 的 F3 统计查询依赖 `findings.rule_id`；Task 8 横幅依赖 `runs.rules_version`。

- [ ] **Step 1: 追加 finding-rows 失败测试**

写入 `lib/diagnosis/finding-rows.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildFindingRows } from './finding-rows'
import type { RuleHit } from './types'

const hit: RuleHit = {
  ruleId: 'C05a',
  pillar: 'P3',
  side: 'technical',
  severity: 'high',
  claimType: 'inferred',
  fingerprint: 'abc',
  scope: 'https://example.com/',
  title: 'JSON-LD 缺失',
  description: '',
  evidenceRefs: ['ev_1'],
}

describe('buildFindingRows', () => {
  it('把 hit.ruleId 写进 FindingRow.ruleId', () => {
    const [row] = buildFindingRows('run_1', [hit])
    expect(row.ruleId).toBe('C05a')
    expect(row.runId).toBe('run_1')
    expect(row.fingerprint).toBe('abc')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/diagnosis/finding-rows.test.ts`
Expected: FAIL — `Property 'ruleId' does not exist on type 'FindingRow'`（或断言 `undefined !== 'C05a'`）。

- [ ] **Step 3: schema 加两列**

`db/schema.ts` — `runs` 表在 `protocolVersion` 行后加：

```ts
  protocolVersion: text('protocol_version').notNull().default('v2'),
  // 规则库版本快照：创建时写入当前 RULES_VERSION，跨版本回测可比横幅据此（spec §11.3）。
  rulesVersion: text('rules_version'),
```

`findings` 表在 `pillar` 行后加：

```ts
  pillar: text('pillar'),
  // 规则命中时写入原始 rule_id（fingerprint 已是其哈希，此处存原值供 F3 按规则聚合 dismiss/effectiveness）。
  ruleId: text('rule_id'),
```

- [ ] **Step 4: FindingRow 加字段并映射**

`lib/diagnosis/finding-rows.ts` — `FindingRow` 接口在 `pillar` 后加 `ruleId: string`；`buildFindingRows` 的 `.map` 返回对象里加 `ruleId: hit.ruleId,`（`hit` 已是 `RuleHit`，`ruleId` 见 `types.ts:143`）：

```ts
export interface FindingRow {
  id: string
  runId: string
  side: RuleHit['side']
  pillar: Pillar
  ruleId: string
  title: string
  // …其余不变
}
```
```ts
  return hits.map((hit) => ({
    id: `find_${crypto.randomUUID()}`,
    runId,
    side: hit.side,
    pillar: hit.pillar,
    ruleId: hit.ruleId,
    // …其余不变
  }))
```

- [ ] **Step 5: run 创建写 rulesVersion（baseline + retest 都用当前常量）**

`app/api/runs/route.ts` 顶部确保 `import { RULES_VERSION } from '@/lib/diagnosis/types'`，插入值改为：

```ts
    .values({ id: `run_${crypto.randomUUID()}`, projectId, runType, status: 'collecting', rulesVersion: RULES_VERSION })
```

`app/api/runs/[id]/retest/route.ts` 同样 import `RULES_VERSION`，`.values({…})` 加 `rulesVersion: RULES_VERSION,`（**不**从 baseline 复制——现场打当前版本，见 Global Constraints）。

- [ ] **Step 6: 推 schema 到 DB**

Run: `npm run db:push`
Expected: drizzle-kit 提示新增 `runs.rules_version`、`findings.rule_id` 两列，确认应用成功（本地 `veris.db`）。

- [ ] **Step 7: 跑测试 + tsc 确认通过**

Run: `npx vitest run lib/diagnosis/finding-rows.test.ts && npx tsc --noEmit`
Expected: 测试 PASS；tsc 0 错（`createFindings` 接受含 `ruleId` 的行——`FindingRow` 与 `findings.$inferInsert` 对齐）。

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts db/migrations lib/diagnosis/finding-rows.ts lib/diagnosis/finding-rows.test.ts app/api/runs/route.ts "app/api/runs/[id]/retest/route.ts"
git commit -m "feat(rules): Phase F 契约层——findings.rule_id / runs.rules_version 两列 + 穿线"
```

---

## Task 2: `rule-proposals.ts` 纯逻辑

**Files:**
- Create: `lib/diagnosis/rule-proposals.ts`
- Test: `lib/diagnosis/rule-proposals.test.ts`

**Interfaces:**
- Produces:
  - `hasValidEvidence(refs: string[] | null | undefined): boolean`
  - `deriveNextRulesVersion(publishedVersions: string[], currentVersion: string): string`
  - `computeArtifactUpdate(current: { version: string; payload: unknown }, diff: { payload?: unknown } | null | undefined, now: Date): { version: string; lastVerifiedAt: string; payload?: unknown }`
  - `groupChangelog(rows: ChangelogInput[]): ChangelogEntry[]`
  - `rulesVersionDelta(stored: string | null, current: string | null): { from: string; to: string } | null`
  - 类型 `ChangelogInput`、`ChangelogEntry`
- Consumes（下游）：Task 4 仓库层用 `computeArtifactUpdate`；Task 6 release API 用 `deriveNextRulesVersion`、proposals POST 用 `hasValidEvidence`；Task 7 changelog 用 `groupChangelog`；Task 8 横幅用 `rulesVersionDelta`。

- [ ] **Step 1: 写失败测试**

写入 `lib/diagnosis/rule-proposals.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  hasValidEvidence,
  deriveNextRulesVersion,
  computeArtifactUpdate,
  groupChangelog,
  rulesVersionDelta,
} from './rule-proposals'

const now = new Date('2026-08-01T00:00:00Z')

describe('hasValidEvidence', () => {
  it('至少一个非空白字符串才算有效', () => {
    expect(hasValidEvidence(['https://x'])).toBe(true)
    expect(hasValidEvidence([])).toBe(false)
    expect(hasValidEvidence(['  '])).toBe(false)
    expect(hasValidEvidence(null)).toBe(false)
    expect(hasValidEvidence(undefined)).toBe(false)
  })
})

describe('deriveNextRulesVersion', () => {
  it('空发布序列时基于 currentVersion 递增', () => {
    expect(deriveNextRulesVersion([], 'rules_v1')).toBe('rules_v2')
  })
  it('取所有版本最大值 +1', () => {
    expect(deriveNextRulesVersion(['rules_v2', 'rules_v3'], 'rules_v1')).toBe('rules_v4')
  })
  it('忽略非法格式', () => {
    expect(deriveNextRulesVersion(['garbage', 'rules_v5'], 'rules_v1')).toBe('rules_v6')
  })
})

describe('computeArtifactUpdate', () => {
  it('无 payload diff 时仅 bump version + last_verified_at', () => {
    const patch = computeArtifactUpdate({ version: 'v1', payload: { a: 1 } }, null, now)
    expect(patch).toEqual({ version: 'v2', lastVerifiedAt: '2026-08-01T00:00:00.000Z' })
  })
  it('带 payload diff 时覆盖 payload', () => {
    const patch = computeArtifactUpdate({ version: 'v3', payload: null }, { payload: { ua: ['GPTBot'] } }, now)
    expect(patch).toEqual({ version: 'v4', lastVerifiedAt: '2026-08-01T00:00:00.000Z', payload: { ua: ['GPTBot'] } })
  })
  it('非标准 version 兜底为 v2', () => {
    expect(computeArtifactUpdate({ version: 'weird', payload: null }, null, now).version).toBe('v2')
  })
})

describe('groupChangelog', () => {
  it('只收 approved+已发布，按版本降序分组', () => {
    const out = groupChangelog([
      { changeType: 'update_artifact', target: 'ai_crawler_ua_list', evidenceRefs: ['u1'], reviewedAt: 'r1', status: 'approved', releasedInRulesVersion: 'rules_v2' },
      { changeType: 'new_rule', target: 'X01', evidenceRefs: ['u2'], reviewedAt: 'r2', status: 'approved', releasedInRulesVersion: 'rules_v3' },
      { changeType: 'deprecate', target: 'Y', evidenceRefs: ['u3'], reviewedAt: null, status: 'approved', releasedInRulesVersion: null }, // 未发布，剔除
      { changeType: 'new_rule', target: 'Z', evidenceRefs: ['u4'], reviewedAt: null, status: 'rejected', releasedInRulesVersion: 'rules_v2' }, // rejected，剔除
    ])
    expect(out.map((e) => e.version)).toEqual(['rules_v3', 'rules_v2'])
    expect(out[1].proposals).toHaveLength(1)
    expect(out[1].proposals[0].target).toBe('ai_crawler_ua_list')
  })
})

describe('rulesVersionDelta', () => {
  it('相同或缺失返回 null', () => {
    expect(rulesVersionDelta('rules_v1', 'rules_v1')).toBeNull()
    expect(rulesVersionDelta(null, 'rules_v2')).toBeNull()
    expect(rulesVersionDelta('rules_v1', null)).toBeNull()
  })
  it('不同返回 from/to', () => {
    expect(rulesVersionDelta('rules_v1', 'rules_v2')).toEqual({ from: 'rules_v1', to: 'rules_v2' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/diagnosis/rule-proposals.test.ts`
Expected: FAIL — `Cannot find module './rule-proposals'`。

- [ ] **Step 3: 实现 `rule-proposals.ts`**

写入 `lib/diagnosis/rule-proposals.ts`：

```ts
// Phase F 提案纯逻辑：evidence 校验 / 版本推导 / 资产更新计算 / changelog 分组 / 跨版本 delta。
// 全部纯函数（now 显式注入），供仓库层、API、UI 复用。

/** evidence_refs 非空校验：至少一个去空白后非空的字符串（对齐「无一手来源不入库」铁律）。 */
export function hasValidEvidence(refs: string[] | null | undefined): boolean {
  return Array.isArray(refs) && refs.some((r) => typeof r === 'string' && r.trim().length > 0)
}

/** 从已发布版本序列 + 当前代码版本推导下一个 rules_v<N>（取最大值 +1）。 */
export function deriveNextRulesVersion(publishedVersions: string[], currentVersion: string): string {
  const nums = [...publishedVersions, currentVersion]
    .map((v) => /^rules_v(\d+)$/.exec(v ?? ''))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
  const max = nums.length ? Math.max(...nums) : 1
  return `rules_v${max + 1}`
}

function bumpArtifactVersion(v: string): string {
  const m = /^v(\d+)$/.exec(v)
  return m ? `v${Number(m[1]) + 1}` : 'v2'
}

/** update_artifact 类提案发版时对 reference_artifacts 行的更新补丁。 */
export function computeArtifactUpdate(
  current: { version: string; payload: unknown },
  diff: { payload?: unknown } | null | undefined,
  now: Date,
): { version: string; lastVerifiedAt: string; payload?: unknown } {
  const hasPayload = !!diff && typeof diff === 'object' && 'payload' in diff && diff.payload !== undefined
  return {
    version: bumpArtifactVersion(current.version),
    lastVerifiedAt: now.toISOString(),
    ...(hasPayload ? { payload: (diff as { payload: unknown }).payload } : {}),
  }
}

export interface ChangelogInput {
  changeType: string
  target: string
  evidenceRefs: string[]
  reviewedAt: string | null
  status: string
  releasedInRulesVersion: string | null
}

export interface ChangelogEntry {
  version: string
  proposals: { changeType: string; target: string; evidenceRefs: string[]; reviewedAt: string | null }[]
}

/** 已批且已发布的提案，按 released_in_rules_version 分组，版本号数值降序。 */
export function groupChangelog(rows: ChangelogInput[]): ChangelogEntry[] {
  const byVersion = new Map<string, ChangelogEntry['proposals']>()
  for (const p of rows) {
    if (p.status !== 'approved' || !p.releasedInRulesVersion) continue
    const list = byVersion.get(p.releasedInRulesVersion) ?? []
    list.push({ changeType: p.changeType, target: p.target, evidenceRefs: p.evidenceRefs, reviewedAt: p.reviewedAt })
    byVersion.set(p.releasedInRulesVersion, list)
  }
  return [...byVersion.entries()]
    .map(([version, proposals]) => ({ version, proposals }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

/** 跨版本 delta：stored（run 记录的版本）与 current（当前规则库版本）不同则返回 from/to。 */
export function rulesVersionDelta(
  stored: string | null,
  current: string | null,
): { from: string; to: string } | null {
  if (!stored || !current || stored === current) return null
  return { from: stored, to: current }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/diagnosis/rule-proposals.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/diagnosis/rule-proposals.ts lib/diagnosis/rule-proposals.test.ts
git commit -m "feat(rules): Phase F rule-proposals 纯逻辑（evidence 校验/版本推导/资产更新/changelog/跨版本 delta）"
```

---

## Task 3: `rule-stats.ts` — Wilson 下限 + 按规则聚合

**Files:**
- Create: `lib/diagnosis/rule-stats.ts`
- Test: `lib/diagnosis/rule-stats.test.ts`

**Interfaces:**
- Produces:
  - `wilsonLowerBound(successes: number, total: number, z?: number): number`
  - `aggregateRuleStats(findings: FindingStatRecord[], recs: RecStatRecord[], opts?: RuleStatsOptions): RuleStatsProposalDraft[]`
  - 类型 `FindingStatRecord { id: string; ruleId: string; status: 'open'|'dismissed'|'converted' }`、`RecStatRecord { id: string; ruleId: string; outcome: 'unknown'|'effective'|'ineffective'|'regressed' }`、`RuleStatsOptions`、`RuleStatsProposalDraft`
- Consumes（下游）：Task 5 cron 用 `aggregateRuleStats`。**注意**：Phase C 并无现成 Wilson 工具（spec §4 假设有误），此处从零实现。

- [ ] **Step 1: 写失败测试**

写入 `lib/diagnosis/rule-stats.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { wilsonLowerBound, aggregateRuleStats } from './rule-stats'
import type { FindingStatRecord, RecStatRecord } from './rule-stats'

describe('wilsonLowerBound', () => {
  it('total=0 返回 0', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })
  it('全成功小样本下限被拉低（区间宽）', () => {
    // 3/3 的 Wilson 95% 下限约 0.44，远低于点估计 1
    const lb = wilsonLowerBound(3, 3)
    expect(lb).toBeGreaterThan(0.4)
    expect(lb).toBeLessThan(0.5)
  })
  it('大样本高比例下限逼近点估计', () => {
    const lb = wilsonLowerBound(90, 100)
    expect(lb).toBeGreaterThan(0.82)
    expect(lb).toBeLessThan(0.9)
  })
})

const mkFindings = (ruleId: string, dismissed: number, open: number): FindingStatRecord[] => [
  ...Array.from({ length: dismissed }, (_, i) => ({ id: `f_d_${ruleId}_${i}`, ruleId, status: 'dismissed' as const })),
  ...Array.from({ length: open }, (_, i) => ({ id: `f_o_${ruleId}_${i}`, ruleId, status: 'open' as const })),
]

describe('aggregateRuleStats', () => {
  it('样本量 < N_MIN 不出提案', () => {
    const out = aggregateRuleStats(mkFindings('A01', 10, 0), [])
    expect(out).toEqual([])
  })

  it('高 dismiss 率 + 足够样本 → dismissal_stats 提案（evidence = finding id 列表）', () => {
    const findings = mkFindings('A02', 24, 1) // 24/25 dismissed，Wilson 下限 > 0.5
    const out = aggregateRuleStats(findings, [])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('dismissal_stats')
    expect(out[0].changeType).toBe('modify_threshold')
    expect(out[0].target).toBe('A02')
    expect(out[0].diff.signal).toBe('high_dismiss_rate')
    expect(out[0].evidenceRefs.length).toBe(25) // 全部参与聚合的 finding id
    expect(out[0].evidenceRefs.every((r) => typeof r === 'string')).toBe(true)
  })

  it('低效（ineffective+regressed）率高 + 足够已判样本 → effectiveness_stats 提案', () => {
    const recs: RecStatRecord[] = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `r_i_${i}`, ruleId: 'A03', outcome: 'ineffective' as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `r_r_${i}`, ruleId: 'A03', outcome: 'regressed' as const })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `r_e_${i}`, ruleId: 'A03', outcome: 'effective' as const })),
      { id: 'r_u', ruleId: 'A03', outcome: 'unknown' as const }, // unknown 不计入分母
    ]
    const out = aggregateRuleStats([], recs)
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('effectiveness_stats')
    expect(out[0].target).toBe('A03')
    expect(out[0].diff.signal).toBe('low_effectiveness')
    expect(out[0].evidenceRefs).not.toContain('r_u') // unknown 被排除
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/diagnosis/rule-stats.test.ts`
Expected: FAIL — `Cannot find module './rule-stats'`。

- [ ] **Step 3: 实现 `rule-stats.ts`**

写入 `lib/diagnosis/rule-stats.ts`：

```ts
// Phase F F3 内部效果统计：按 rule_id 聚合 dismiss / ineffective，用 Wilson 下限做小样本纪律，
// 越阈值则产 modify_threshold 提案草稿（作为开发工单）。全部纯函数。
// 注：Phase C 无现成 Wilson 工具，此处自实现（spec §4 的「复用」假设有误）。

/** Wilson score 区间下限（默认 z=1.96 即 95%）。小样本时显著低于点估计，抑制噪声信号。 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0
  const phat = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const centre = phat + z2 / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denom)
}

export interface FindingStatRecord {
  id: string
  ruleId: string
  status: 'open' | 'dismissed' | 'converted'
}

export interface RecStatRecord {
  id: string
  ruleId: string
  outcome: 'unknown' | 'effective' | 'ineffective' | 'regressed'
}

export interface RuleStatsOptions {
  nMin?: number
  dismissThreshold?: number
  ineffectiveThreshold?: number
}

export interface RuleStatsProposalDraft {
  source: 'dismissal_stats' | 'effectiveness_stats'
  changeType: 'modify_threshold'
  target: string
  evidenceRefs: string[]
  diff: { signal: 'high_dismiss_rate' | 'low_effectiveness'; sampleSize: number; rate: number; wilsonLower: number }
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k) ?? []
    list.push(r)
    m.set(k, list)
  }
  return m
}

/** findings/recommendations 按 rule_id 聚合，越 Wilson 下限阈值则产提案草稿。evidence = 参与聚合的 id 列表。 */
export function aggregateRuleStats(
  findings: FindingStatRecord[],
  recs: RecStatRecord[],
  opts: RuleStatsOptions = {},
): RuleStatsProposalDraft[] {
  const nMin = opts.nMin ?? 20
  const dismissThreshold = opts.dismissThreshold ?? 0.5
  const ineffectiveThreshold = opts.ineffectiveThreshold ?? 0.6
  const drafts: RuleStatsProposalDraft[] = []

  // dismissal 率：dismissed / 该规则全部 findings
  for (const [ruleId, rows] of groupBy(findings, (f) => f.ruleId)) {
    const total = rows.length
    if (total < nMin) continue
    const dismissed = rows.filter((r) => r.status === 'dismissed').length
    const lower = wilsonLowerBound(dismissed, total)
    if (lower > dismissThreshold) {
      drafts.push({
        source: 'dismissal_stats',
        changeType: 'modify_threshold',
        target: ruleId,
        evidenceRefs: rows.map((r) => r.id),
        diff: { signal: 'high_dismiss_rate', sampleSize: total, rate: dismissed / total, wilsonLower: lower },
      })
    }
  }

  // ineffective 率：(ineffective + regressed) / 已判 outcome（!= unknown）的建议
  const judged = recs.filter((r) => r.outcome !== 'unknown')
  for (const [ruleId, rows] of groupBy(judged, (r) => r.ruleId)) {
    const total = rows.length
    if (total < nMin) continue
    const ineffective = rows.filter((r) => r.outcome === 'ineffective' || r.outcome === 'regressed').length
    const lower = wilsonLowerBound(ineffective, total)
    if (lower > ineffectiveThreshold) {
      drafts.push({
        source: 'effectiveness_stats',
        changeType: 'modify_threshold',
        target: ruleId,
        evidenceRefs: rows.map((r) => r.id),
        diff: { signal: 'low_effectiveness', sampleSize: total, rate: ineffective / total, wilsonLower: lower },
      })
    }
  }

  return drafts
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/diagnosis/rule-stats.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/diagnosis/rule-stats.ts lib/diagnosis/rule-stats.test.ts
git commit -m "feat(rules): Phase F rule-stats——Wilson 下限 + 按 rule_id 聚合 dismiss/effectiveness 提案草稿"
```

---

## Task 4: 仓库层 — 提案 CRUD / 打包发版 / changelog / F3 查询

**Files:**
- Modify: `lib/repositories/index.ts`（新增 import `ruleChangeProposals`、`recommendations`；drizzle-orm 补 `and`、`isNull`、`isNotNull`、`desc`）
- Test: `lib/repositories/rule-proposals.repo.test.ts`（建；针对纯校验/发版逻辑做集成测试，用真 libSQL 文件库）

**Interfaces:**
- Produces:
  - `createRuleChangeProposal(row): Promise<Row[]>` — 应用层强校验 evidence 非空，空则 `throw new Error('proposal_evidence_required')`
  - `getRuleChangeProposals(status?): Promise<Row[]>`
  - `setProposalStatus(id, status: 'approved'|'rejected'): Promise<Row[]>`
  - `getPendingProposalKeys(): Promise<Set<string>>` — `${source}::${target}` 集合，供 cron 幂等去重
  - `releaseApprovedProposals(newVersion: string): Promise<{ released: number; artifactsUpdated: number }>`
  - `getReleasedProposals(): Promise<Row[]>`（changelog 用）、`getReleasedVersions(): Promise<string[]>`（版本推导用）
  - `getFindingStatRecords(): Promise<{ id; ruleId; status }[]>`、`getRecStatRecords(): Promise<{ id; ruleId; outcome }[]>`（F3 用，已过滤 `rule_id` 非空）
- Consumes: Task 2 的 `hasValidEvidence`、`computeArtifactUpdate`。

- [ ] **Step 1: 写失败测试**

写入 `lib/repositories/rule-proposals.repo.test.ts`（用独立文件库，避免污染 dev 库）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'

// 指向临时文件库；必须在 import 仓库前设置，client.ts 读 env。
process.env.LIBSQL_URL = 'file:./veris-test-rulesrepo.db'

const repo = await import('./index')
const { db } = await import('@/db/client')
const { ruleChangeProposals, referenceArtifacts } = await import('@/db/schema')

async function reset() {
  await db.delete(ruleChangeProposals)
  await db.delete(referenceArtifacts)
}

describe('createRuleChangeProposal', () => {
  beforeEach(reset)
  it('evidence 为空时抛错', async () => {
    await expect(
      repo.createRuleChangeProposal({
        id: 'rcp_1', source: 'manual', changeType: 'new_rule', target: 'X01', evidenceRefs: [], status: 'pending',
      }),
    ).rejects.toThrow('proposal_evidence_required')
  })
  it('evidence 非空时入库', async () => {
    const [row] = await repo.createRuleChangeProposal({
      id: 'rcp_2', source: 'manual', changeType: 'new_rule', target: 'X01', evidenceRefs: ['https://x'], status: 'pending',
    })
    expect(row.id).toBe('rcp_2')
  })
})

describe('releaseApprovedProposals', () => {
  beforeEach(reset)
  it('打包已批未发布提案 + 自动落地 update_artifact', async () => {
    await repo.upsertReferenceArtifact({ id: 'refart_k', artifactKey: 'k', version: 'v1', sourceUrl: 'https://s', refreshCadenceDays: 90 })
    await repo.createRuleChangeProposal({ id: 'rcp_a', source: 'scheduled_research', changeType: 'update_artifact', target: 'k', evidenceRefs: ['https://s'], status: 'pending' })
    await repo.setProposalStatus('rcp_a', 'approved')

    const res = await repo.releaseApprovedProposals('rules_v2')
    expect(res).toEqual({ released: 1, artifactsUpdated: 1 })

    const [art] = await repo.getReferenceArtifacts()
    expect(art.version).toBe('v2')
    expect(art.lastVerifiedAt).not.toBeNull()

    const released = await repo.getReleasedProposals()
    expect(released[0].releasedInRulesVersion).toBe('rules_v2')

    expect(await repo.getReleasedVersions()).toEqual(['rules_v2'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/repositories/rule-proposals.repo.test.ts`
Expected: FAIL — `repo.createRuleChangeProposal is not a function`。

- [ ] **Step 3: 补 imports**

`lib/repositories/index.ts` 顶部：drizzle-orm 的 import 补齐运算符 —

```ts
import { eq, asc, desc, and, isNull, isNotNull } from 'drizzle-orm'
```

schema import 行加入 `ruleChangeProposals`、`recommendations`（若尚未 import）：

```ts
import { /* …现有… */ referenceArtifacts, ruleChangeProposals, recommendations } from '@/db/schema'
```

顶部加纯逻辑 import：

```ts
import { hasValidEvidence, computeArtifactUpdate } from '@/lib/diagnosis/rule-proposals'
```

- [ ] **Step 4: 实现仓库函数**

在 `export * from './validators'` 之前追加：

```ts
// —— Phase F 规则进化：提案 CRUD / 发版 / changelog / F3 统计 ——

export const createRuleChangeProposal = (row: typeof ruleChangeProposals.$inferInsert) => {
  // 无一手来源不入库（应用层强校验，对齐铁律）。
  if (!hasValidEvidence(row.evidenceRefs as string[] | null | undefined)) {
    throw new Error('proposal_evidence_required')
  }
  return db.insert(ruleChangeProposals).values(row).returning()
}

export const getRuleChangeProposals = (status?: 'pending' | 'approved' | 'rejected') =>
  status
    ? db.select().from(ruleChangeProposals).where(eq(ruleChangeProposals.status, status)).orderBy(desc(ruleChangeProposals.createdAt))
    : db.select().from(ruleChangeProposals).orderBy(desc(ruleChangeProposals.createdAt))

export const setProposalStatus = (id: string, status: 'approved' | 'rejected') =>
  db.update(ruleChangeProposals)
    .set({ status, reviewedAt: new Date().toISOString() })
    .where(eq(ruleChangeProposals.id, id))
    .returning()

// cron 幂等去重键：${source}::${target}，仅 pending。
export const getPendingProposalKeys = async (): Promise<Set<string>> => {
  const rows = await db
    .select({ source: ruleChangeProposals.source, target: ruleChangeProposals.target })
    .from(ruleChangeProposals)
    .where(eq(ruleChangeProposals.status, 'pending'))
  return new Set(rows.map((r) => `${r.source}::${r.target}`))
}

// 打包发版：所有 approved 且未发布的提案写版本号；update_artifact 类自动落地到 reference_artifacts。
export const releaseApprovedProposals = async (
  newVersion: string,
): Promise<{ released: number; artifactsUpdated: number }> => {
  const approved = await db
    .select()
    .from(ruleChangeProposals)
    .where(and(eq(ruleChangeProposals.status, 'approved'), isNull(ruleChangeProposals.releasedInRulesVersion)))
  let artifactsUpdated = 0
  const now = new Date()
  for (const p of approved) {
    if (p.changeType === 'update_artifact') {
      const artifact = await db.query.referenceArtifacts.findFirst({
        where: eq(referenceArtifacts.artifactKey, p.target),
      })
      if (artifact) {
        const patch = computeArtifactUpdate(
          { version: artifact.version, payload: artifact.payload },
          p.diff as { payload?: unknown } | null,
          now,
        )
        await db.update(referenceArtifacts).set(patch).where(eq(referenceArtifacts.artifactKey, p.target))
        artifactsUpdated++
      }
    }
    await db.update(ruleChangeProposals).set({ releasedInRulesVersion: newVersion }).where(eq(ruleChangeProposals.id, p.id))
  }
  return { released: approved.length, artifactsUpdated }
}

export const getReleasedProposals = () =>
  db
    .select()
    .from(ruleChangeProposals)
    .where(and(eq(ruleChangeProposals.status, 'approved'), isNotNull(ruleChangeProposals.releasedInRulesVersion)))
    .orderBy(desc(ruleChangeProposals.createdAt))

export const getReleasedVersions = async (): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ v: ruleChangeProposals.releasedInRulesVersion })
    .from(ruleChangeProposals)
    .where(isNotNull(ruleChangeProposals.releasedInRulesVersion))
  return rows.map((r) => r.v).filter((v): v is string => !!v)
}

// F3：按 rule_id 聚合的原料。findings 直取；recommendations 经 finding join 取 rule_id。均过滤 rule_id 非空。
export const getFindingStatRecords = async () => {
  const rows = await db
    .select({ id: findings.id, ruleId: findings.ruleId, status: findings.status })
    .from(findings)
    .where(isNotNull(findings.ruleId))
  return rows as { id: string; ruleId: string; status: 'open' | 'dismissed' | 'converted' }[]
}

export const getRecStatRecords = async () => {
  const rows = await db
    .select({ id: recommendations.id, ruleId: findings.ruleId, outcome: recommendations.outcome })
    .from(recommendations)
    .innerJoin(findings, eq(recommendations.findingId, findings.id))
    .where(isNotNull(findings.ruleId))
  return rows as { id: string; ruleId: string; outcome: 'unknown' | 'effective' | 'ineffective' | 'regressed' }[]
}
```

- [ ] **Step 5: 跑测试确认通过 + tsc**

Run: `npx vitest run lib/repositories/rule-proposals.repo.test.ts && npx tsc --noEmit`
Expected: 测试 PASS；tsc 0 错。（若测试库残留，先 `rm -f veris-test-rulesrepo.db`。）

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/index.ts lib/repositories/rule-proposals.repo.test.ts
git commit -m "feat(rules): Phase F 仓库层——提案 CRUD/打包发版(自动落地资产)/changelog/F3 统计查询"
```

---

## Task 5: Inngest cron — `rules-evolution.ts` + 注册

**Files:**
- Create: `lib/inngest/rules-evolution.ts`
- Test: `lib/inngest/rules-evolution.test.ts`
- Modify: `app/api/inngest/route.ts`

**Interfaces:**
- Produces:
  - `RulesEvolutionDeps`（DI 接口）、`defaultDeps(): RulesEvolutionDeps`
  - `rulesEvolutionScanHandler(args, deps?): Promise<{ enqueued: number }>`
  - `rulesEvolutionScan`（Inngest cron function，注册进 route）
- Consumes: Task 2 `hasValidEvidence`（间接，经仓库校验）、Task 3 `aggregateRuleStats`、Task 4 全部仓库函数、Phase E `checkArtifactFreshness`。

- [ ] **Step 1: 写失败测试**

写入 `lib/inngest/rules-evolution.test.ts`（镜像 `reevaluate-competitors.test.ts` 的 DI + fake step 模式）：

```ts
import { describe, it, expect, vi } from 'vitest'
import { rulesEvolutionScanHandler } from './rules-evolution'
import type { RulesEvolutionDeps } from './rules-evolution'

// fake step：模拟 Inngest 的 JSON 序列化边界（捕获不可序列化返回）。
function makeArgs() {
  return { step: { run: async <T>(_id: string, fn: () => Promise<T>) => JSON.parse(JSON.stringify(await fn())) as T } }
}

const FIXED_NOW = new Date('2026-08-01T00:00:00Z')

function makeDeps(over: Partial<RulesEvolutionDeps> = {}): RulesEvolutionDeps {
  return {
    now: () => FIXED_NOW,
    getReferenceArtifacts: vi.fn(async () => [] as any),
    getPendingProposalKeys: vi.fn(async () => new Set<string>()),
    createRuleChangeProposal: vi.fn(async () => [{}] as any),
    getFindingStatRecords: vi.fn(async () => [] as any),
    getRecStatRecords: vi.fn(async () => [] as any),
    ...over,
  }
}

describe('rulesEvolutionScanHandler', () => {
  it('超期资产入队 scheduled_research 提案', async () => {
    const create = vi.fn(async () => [{}] as any)
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: 'https://ua.doc', lastVerifiedAt: '2026-01-01T00:00:00Z', refreshCadenceDays: 90, payload: null },
      ] as any),
      createRuleChangeProposal: create,
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), deps)
    expect(res.enqueued).toBe(1)
    expect(create).toHaveBeenCalledTimes(1)
    const arg = create.mock.calls[0][0]
    expect(arg.source).toBe('scheduled_research')
    expect(arg.changeType).toBe('update_artifact')
    expect(arg.target).toBe('ua')
    expect(arg.evidenceRefs).toEqual(['https://ua.doc'])
  })

  it('已有同 source::target 的 pending 提案则跳过（幂等）', async () => {
    const create = vi.fn(async () => [{}] as any)
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: 'https://ua.doc', lastVerifiedAt: '2026-01-01T00:00:00Z', refreshCadenceDays: 90, payload: null },
      ] as any),
      getPendingProposalKeys: vi.fn(async () => new Set(['scheduled_research::ua'])),
      createRuleChangeProposal: create,
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), deps)
    expect(res.enqueued).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('超期但 sourceUrl 为空的资产跳过（无一手来源不入库）', async () => {
    const create = vi.fn(async () => [{}] as any)
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: '', lastVerifiedAt: null, refreshCadenceDays: 90, payload: null },
      ] as any),
      createRuleChangeProposal: create,
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), deps)
    expect(res.enqueued).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/inngest/rules-evolution.test.ts`
Expected: FAIL — `Cannot find module './rules-evolution'`。

- [ ] **Step 3: 实现 cron handler**

写入 `lib/inngest/rules-evolution.ts`：

```ts
import { inngest } from './client'
import { checkArtifactFreshness } from '@/lib/diagnosis/reference-artifacts'
import { aggregateRuleStats } from '@/lib/diagnosis/rule-stats'
import {
  getReferenceArtifacts,
  getPendingProposalKeys,
  createRuleChangeProposal,
  getFindingStatRecords,
  getRecStatRecords,
} from '@/lib/repositories'

export interface RulesEvolutionDeps {
  now: () => Date
  getReferenceArtifacts: typeof getReferenceArtifacts
  getPendingProposalKeys: typeof getPendingProposalKeys
  createRuleChangeProposal: typeof createRuleChangeProposal
  getFindingStatRecords: typeof getFindingStatRecords
  getRecStatRecords: typeof getRecStatRecords
}

export function defaultDeps(): RulesEvolutionDeps {
  return {
    now: () => new Date(),
    getReferenceArtifacts,
    getPendingProposalKeys,
    createRuleChangeProposal,
    getFindingStatRecords,
    getRecStatRecords,
  }
}

interface ScanArgs {
  step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
}

export async function rulesEvolutionScanHandler(
  { step }: ScanArgs,
  deps: RulesEvolutionDeps = defaultDeps(),
): Promise<{ enqueued: number }> {
  const now = deps.now()

  const enqueued = await step.run('rules-evolution-enqueue', async () => {
    const pending = await deps.getPendingProposalKeys()
    let count = 0

    // —— F1 月度外部监测：超期参考资产 → scheduled_research 提案（携官方信源 URL）——
    const artifacts = await deps.getReferenceArtifacts()
    const report = checkArtifactFreshness(
      artifacts.map((a) => ({
        artifactKey: a.artifactKey,
        sourceUrl: a.sourceUrl,
        lastVerifiedAt: a.lastVerifiedAt,
        refreshCadenceDays: a.refreshCadenceDays,
      })),
      now,
    )
    for (const stale of report.stale) {
      const artifact = artifacts.find((a) => a.artifactKey === stale.artifactKey)
      // 无一手来源 URL 无法入库（铁律）——跳过，留人工 runbook 补信源。
      if (!artifact || !artifact.sourceUrl.trim()) continue
      const key = `scheduled_research::${stale.artifactKey}`
      if (pending.has(key)) continue
      await deps.createRuleChangeProposal({
        id: `rcp_${crypto.randomUUID()}`,
        source: 'scheduled_research',
        changeType: 'update_artifact',
        target: stale.artifactKey,
        evidenceRefs: [artifact.sourceUrl],
        diff: {
          reason: '超 refresh_cadence_days 未校验',
          lastVerifiedAt: stale.lastVerifiedAt,
          cadence: artifact.refreshCadenceDays,
        },
        status: 'pending',
      })
      pending.add(key)
      count++
    }

    // —— F3 内部效果统计 → modify_threshold 提案（单用户 V0 下多半休眠）——
    const [findingRecs, recRecs] = await Promise.all([deps.getFindingStatRecords(), deps.getRecStatRecords()])
    const drafts = aggregateRuleStats(findingRecs, recRecs)
    for (const d of drafts) {
      const key = `${d.source}::${d.target}`
      if (pending.has(key)) continue
      await deps.createRuleChangeProposal({ id: `rcp_${crypto.randomUUID()}`, ...d, status: 'pending' })
      pending.add(key)
      count++
    }

    return count
  })

  return { enqueued }
}

export const rulesEvolutionScan = inngest.createFunction(
  { id: 'rules-evolution-scan', retries: 3 },
  { cron: 'TZ=Asia/Shanghai 0 3 1 * *' }, // 每月 1 号 03:00
  (ctx) => rulesEvolutionScanHandler(ctx as unknown as ScanArgs),
)
```

- [ ] **Step 4: 注册到 Inngest serve**

`app/api/inngest/route.ts` — 加 import + 进 `functions` 数组：

```ts
import { rulesEvolutionScan } from '@/lib/inngest/rules-evolution'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [collectEvidence, generateFindings, reevaluateCompetitors, rulesEvolutionScan],
})
```

- [ ] **Step 5: 跑测试确认通过 + tsc**

Run: `npx vitest run lib/inngest/rules-evolution.test.ts && npx tsc --noEmit`
Expected: 测试 PASS（含幂等、空 sourceUrl 跳过）；tsc 0 错。

- [ ] **Step 6: Commit**

```bash
git add lib/inngest/rules-evolution.ts lib/inngest/rules-evolution.test.ts app/api/inngest/route.ts
git commit -m "feat(rules): Phase F 演进 cron——月度 freshness 巡检 + F3 统计幂等入队"
```

---

## Task 6: API 路由 — proposals（GET/POST）、[id]（PATCH）、release（POST）

**Files:**
- Create: `app/api/rules/proposals/route.ts`
- Create: `app/api/rules/proposals/[id]/route.ts`
- Create: `app/api/rules/release/route.ts`

**Interfaces:**
- Produces（HTTP 契约，Task 7 客户端消费）：
  - `GET /api/rules/proposals?status=pending|approved|rejected` → `Row[]`
  - `POST /api/rules/proposals` `{ changeType, target, evidenceRefs, diff? }` → 201 `Row` ｜ 422 `{ error }`
  - `PATCH /api/rules/proposals/:id` `{ action: 'approve'|'reject' }` → `Row` ｜ 404/422
  - `POST /api/rules/release` `{ version? }` → `{ version, released, artifactsUpdated }` ｜ 422
- Consumes: Task 2 `hasValidEvidence`、`deriveNextRulesVersion`；Task 4 仓库函数；`RULES_VERSION`。

- [ ] **Step 1: 写 proposals 路由（GET 列表 + POST 手动建）**

写入 `app/api/rules/proposals/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getRuleChangeProposals, createRuleChangeProposal } from '@/lib/repositories'
import { hasValidEvidence } from '@/lib/diagnosis/rule-proposals'

const VALID_STATUS = ['pending', 'approved', 'rejected'] as const
const VALID_CHANGE = ['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'] as const

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status')
  const filter = VALID_STATUS.includes(status as never) ? (status as (typeof VALID_STATUS)[number]) : undefined
  const rows = await getRuleChangeProposals(filter)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    changeType?: string
    target?: string
    evidenceRefs?: string[]
    diff?: unknown
  }
  if (!VALID_CHANGE.includes(body.changeType as never)) {
    return NextResponse.json({ error: 'change_type_invalid' }, { status: 422 })
  }
  if (!body.target?.trim()) {
    return NextResponse.json({ error: 'target_required' }, { status: 422 })
  }
  if (!hasValidEvidence(body.evidenceRefs)) {
    return NextResponse.json({ error: 'evidence_required' }, { status: 422 })
  }
  const [created] = await createRuleChangeProposal({
    id: `rcp_${crypto.randomUUID()}`,
    source: 'manual',
    changeType: body.changeType as (typeof VALID_CHANGE)[number],
    target: body.target.trim(),
    evidenceRefs: body.evidenceRefs!.map((r) => r.trim()).filter(Boolean),
    diff: body.diff ?? null,
    status: 'pending',
  })
  return NextResponse.json(created, { status: 201 })
}
```

- [ ] **Step 2: 写 [id] PATCH（approve/reject）**

写入 `app/api/rules/proposals/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { setProposalStatus } from '@/lib/repositories'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action_invalid' }, { status: 422 })
  }
  const [updated] = await setProposalStatus(id, body.action === 'approve' ? 'approved' : 'rejected')
  if (!updated) return NextResponse.json({ error: 'proposal_not_found' }, { status: 404 })
  return NextResponse.json(updated)
}
```

- [ ] **Step 3: 写 release POST（打包发版）**

写入 `app/api/rules/release/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { releaseApprovedProposals, getReleasedVersions } from '@/lib/repositories'
import { deriveNextRulesVersion } from '@/lib/diagnosis/rule-proposals'
import { RULES_VERSION } from '@/lib/diagnosis/types'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { version?: string }
  let version = body.version?.trim()
  if (version) {
    if (!/^rules_v\d+$/.test(version)) {
      return NextResponse.json({ error: 'version_format_invalid' }, { status: 422 })
    }
  } else {
    const published = await getReleasedVersions()
    version = deriveNextRulesVersion(published, RULES_VERSION)
  }
  const result = await releaseApprovedProposals(version)
  // 提示：数据资产已即时生效；代码常量 RULES_VERSION 需开发手动同步为该版本并部署（见 Global Constraints）。
  return NextResponse.json({ version, ...result })
}
```

- [ ] **Step 4: tsc + lint 确认通过**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 错 0 error。（这些路由无独立单测；契约在 Task 4 仓库测试 + Task 7 手动验证覆盖。）

- [ ] **Step 5: Commit**

```bash
git add app/api/rules
git commit -m "feat(rules): Phase F API——提案列表/手动建/审批/打包发版路由"
```

---

## Task 7: 审阅 UI — 规则库管理页 + i18n

**Files:**
- Create: `app/[locale]/rules/page.tsx`（Server Component）
- Create: `app/[locale]/rules/RulesAdminClient.tsx`（Client Component，审批/建/发版交互）
- Modify: `messages/en.json`、`messages/zh.json`（新增 `rulesAdmin` 命名空间）

**Interfaces:**
- Consumes: Task 4 `getRuleChangeProposals`、`getReleasedProposals`；Task 2 `groupChangelog`；Task 6 三个 API 路由。
- Produces: `/[locale]/rules` 页面。

- [ ] **Step 1: 加 i18n `rulesAdmin` 命名空间（en + zh 同步）**

`messages/zh.json` 顶层加：

```json
"rulesAdmin": {
  "title": "规则库管理",
  "subtitle": "自动发现、人工放行——第四道人工闸门",
  "pendingTab": "待审提案",
  "changelogTab": "版本变更记录",
  "empty": "暂无待审提案",
  "source": "来源",
  "changeType": "变更类型",
  "target": "目标",
  "evidence": "一手来源",
  "createdAt": "创建时间",
  "approve": "批准",
  "reject": "驳回",
  "approved": "已批准",
  "rejected": "已驳回",
  "release": "打包发版",
  "releaseHint": "把所有已批未发布提案打包为新版本；update_artifact 类立即生效",
  "releaseVersionLabel": "版本号（留空则自动推导下一个）",
  "releaseDone": "已发版 {version}：{released} 条提案，{artifacts} 个资产更新。待部署：请将 RULES_VERSION 更新为 {version} 并部署。",
  "manualTitle": "手动建提案",
  "manualEvidenceLabel": "一手来源 URL（每行一个，至少一个）",
  "manualTargetLabel": "目标（规则 ID 或资产 key）",
  "manualSubmit": "提交提案",
  "errorEvidence": "至少需要一个一手来源 URL",
  "errorTarget": "目标不能为空",
  "sourceLabels": { "scheduled_research": "定期巡检", "effectiveness_stats": "效果统计", "dismissal_stats": "误报统计", "manual": "手动" },
  "changeLabels": { "new_rule": "新增规则", "modify_threshold": "调整阈值", "deprecate": "弃用", "update_artifact": "更新资产" }
}
```

`messages/en.json` 加同结构英文（键完全一致）：

```json
"rulesAdmin": {
  "title": "Rule Library Admin",
  "subtitle": "Auto-discover, human-release — the fourth human gate",
  "pendingTab": "Pending proposals",
  "changelogTab": "Changelog",
  "empty": "No pending proposals",
  "source": "Source",
  "changeType": "Change type",
  "target": "Target",
  "evidence": "First-party source",
  "createdAt": "Created",
  "approve": "Approve",
  "reject": "Reject",
  "approved": "Approved",
  "rejected": "Rejected",
  "release": "Package & release",
  "releaseHint": "Bundle all approved-unreleased proposals into a new version; update_artifact takes effect immediately",
  "releaseVersionLabel": "Version (blank = auto-derive next)",
  "releaseDone": "Released {version}: {released} proposals, {artifacts} artifacts updated. Pending deploy: set RULES_VERSION to {version} and deploy.",
  "manualTitle": "New manual proposal",
  "manualEvidenceLabel": "First-party source URLs (one per line, at least one)",
  "manualTargetLabel": "Target (rule id or artifact key)",
  "manualSubmit": "Submit proposal",
  "errorEvidence": "At least one first-party source URL is required",
  "errorTarget": "Target is required",
  "sourceLabels": { "scheduled_research": "Scheduled scan", "effectiveness_stats": "Effectiveness stats", "dismissal_stats": "Dismissal stats", "manual": "Manual" },
  "changeLabels": { "new_rule": "New rule", "modify_threshold": "Modify threshold", "deprecate": "Deprecate", "update_artifact": "Update artifact" }
}
```

- [ ] **Step 2: 写 Server Component 页**

写入 `app/[locale]/rules/page.tsx`：

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getRuleChangeProposals, getReleasedProposals } from '@/lib/repositories'
import { groupChangelog, type ChangelogInput } from '@/lib/diagnosis/rule-proposals'
import { RulesAdminClient } from './RulesAdminClient'

export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const [pending, released] = await Promise.all([getRuleChangeProposals('pending'), getReleasedProposals()])
  const changelog = groupChangelog(released as unknown as ChangelogInput[])
  return <RulesAdminClient locale={locale} pending={pending} changelog={changelog} />
}
```

- [ ] **Step 3: 写 Client Component（审批/建/发版）**

写入 `app/[locale]/rules/RulesAdminClient.tsx`（React 19 客户端组件；`useTranslations` + `useRouter().refresh()`）：

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ChangelogEntry } from '@/lib/diagnosis/rule-proposals'

interface Proposal {
  id: string
  source: string
  changeType: string
  target: string
  evidenceRefs: string[]
  createdAt: string
}

export function RulesAdminClient({
  locale,
  pending,
  changelog,
}: {
  locale: string
  pending: Proposal[]
  changelog: ChangelogEntry[]
}) {
  const t = useTranslations('rulesAdmin')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState('')
  const [manualChange, setManualChange] = useState('update_artifact')
  const [manualEvidence, setManualEvidence] = useState('')

  async function patch(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    await fetch(`/${locale}/../api/rules/proposals/${id}`.replace(`/${locale}/../`, '/'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusy(false)
    router.refresh()
  }

  async function release() {
    setBusy(true)
    const res = await fetch('/api/rules/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const data = (await res.json()) as { version: string; released: number; artifactsUpdated: number }
    setMsg(t('releaseDone', { version: data.version, released: data.released, artifacts: data.artifactsUpdated }))
    setBusy(false)
    router.refresh()
  }

  async function submitManual() {
    const refs = manualEvidence.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!manualTarget.trim()) return setMsg(t('errorTarget'))
    if (refs.length === 0) return setMsg(t('errorEvidence'))
    setBusy(true)
    const res = await fetch('/api/rules/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changeType: manualChange, target: manualTarget.trim(), evidenceRefs: refs }),
    })
    setBusy(false)
    if (res.ok) {
      setManualTarget('')
      setManualEvidence('')
      setMsg(null)
      router.refresh()
    } else {
      const e = (await res.json()) as { error: string }
      setMsg(e.error === 'evidence_required' ? t('errorEvidence') : t('errorTarget'))
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {msg && <p role="status" style={{ color: '#b45309' }}>{msg}</p>}

      <section>
        <h2>{t('pendingTab')}</h2>
        <button onClick={release} disabled={busy}>{t('release')}</button>
        <p style={{ fontSize: 12, color: '#6b7280' }}>{t('releaseHint')}</p>
        {pending.length === 0 ? (
          <p>{t('empty')}</p>
        ) : (
          <ul>
            {pending.map((p) => (
              <li key={p.id} style={{ marginBottom: 12 }}>
                <strong>{t(`changeLabels.${p.changeType}`)}</strong> · {p.target}{' '}
                <em>({t(`sourceLabels.${p.source}`)})</em>
                <div style={{ fontSize: 12 }}>
                  {t('evidence')}: {p.evidenceRefs.join(', ')}
                </div>
                <button onClick={() => patch(p.id, 'approve')} disabled={busy}>{t('approve')}</button>
                <button onClick={() => patch(p.id, 'reject')} disabled={busy}>{t('reject')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t('manualTitle')}</h2>
        <label>
          {t('manualTargetLabel')}
          <input value={manualTarget} onChange={(e) => setManualTarget(e.target.value)} />
        </label>
        <select value={manualChange} onChange={(e) => setManualChange(e.target.value)}>
          {['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'].map((c) => (
            <option key={c} value={c}>{t(`changeLabels.${c}`)}</option>
          ))}
        </select>
        <label>
          {t('manualEvidenceLabel')}
          <textarea value={manualEvidence} onChange={(e) => setManualEvidence(e.target.value)} rows={3} />
        </label>
        <button onClick={submitManual} disabled={busy}>{t('manualSubmit')}</button>
      </section>

      <section>
        <h2>{t('changelogTab')}</h2>
        {changelog.map((e) => (
          <div key={e.version}>
            <h3>{e.version}</h3>
            <ul>
              {e.proposals.map((p, i) => (
                <li key={i}>
                  {t(`changeLabels.${p.changeType}`)} · {p.target} — {p.evidenceRefs.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
```

> 注：`patch` 里的 URL 拼接务必落到 `/api/rules/proposals/:id`（不带 locale 前缀，API 路由在 `app/api` 下无 locale 段）。实现时直接用 `` `/api/rules/proposals/${id}` `` 即可——上例的 replace 仅为演示，落地请简化为 `fetch(`/api/rules/proposals/${id}`, …)`。

- [ ] **Step 4: 构建 + 手动验证**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 错，`/[locale]/rules` 进入路由清单。

手动验证（可选，本地）：`npm run dev`，访问 `http://localhost:3000/zh/rules`，确认页面渲染、changelog/待审区出现。用 `db:seed` 后如无 pending 提案，可先 `POST /api/rules/proposals` 造一条手动提案验证审批/发版闭环。

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/rules messages/en.json messages/zh.json
git commit -m "feat(rules): Phase F 规则库管理页——提案队列/审批/手动建/打包发版/changelog + i18n"
```

---

## Task 8: §11.3 跨版本回测横幅

**Files:**
- Modify: `app/[locale]/runs/[id]/report/page.tsx`
- Modify: `messages/en.json`、`messages/zh.json`（`report` 命名空间加横幅键）

**Interfaces:**
- Consumes: Task 2 `rulesVersionDelta`；`RULES_VERSION`；`runs.rules_version`（Task 1 已加）。
- 说明：V0 只有 `rules_v1`，横幅**暂不触发**（前瞻）。将 run 记录的 `rules_version` 与当前 `RULES_VERSION` 比对——发版并同步常量后，旧报告即显「规则库已升级」提示，无需 baseline↔retest 持久链路。

- [ ] **Step 1: i18n 加横幅键（en + zh）**

`messages/zh.json` 的 `report` 命名空间内加：

```json
"rulesUpgradedBanner": "规则库已从 {from} 升级到 {to}，本报告在旧版规则下生成；受影响规则的前后对比不可直接比较，建议按当前规则重跑。"
```

`messages/en.json` 的 `report` 内加：

```json
"rulesUpgradedBanner": "The rule library upgraded from {from} to {to}. This report was generated under the older ruleset; affected rules are not directly comparable — re-run under the current rules."
```

- [ ] **Step 2: 报告页接入横幅**

`app/[locale]/runs/[id]/report/page.tsx` — 顶部 import：

```ts
import { rulesVersionDelta } from '@/lib/diagnosis/rule-proposals'
import { RULES_VERSION } from '@/lib/diagnosis/types'
```

在已加载 `run`（`getRun(id)` 结果）之后、页面主体渲染处，计算并条件渲染横幅（`t` 为该页已有的 `getTranslations('report')`）：

```tsx
const versionDelta = rulesVersionDelta(run.rulesVersion, RULES_VERSION)
// …在报告主体顶部：
{versionDelta && (
  <div role="alert" style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: 12, marginBottom: 16 }}>
    {t('rulesUpgradedBanner', { from: versionDelta.from, to: versionDelta.to })}
  </div>
)}
```

> `run.rulesVersion` 对旧数据为 `null` → `rulesVersionDelta` 返回 `null` → 不渲染（安全）。V0 新 run 打 `rules_v1` == `RULES_VERSION` → 同样返回 `null`。

- [ ] **Step 3: 构建 + tsc 确认通过**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 错；report 页正常编译。

- [ ] **Step 4: 手动验证横幅逻辑（可选）**

本地把 `RULES_VERSION` 临时改为 `rules_v2`，`npm run dev` 访问一个已有报告页（其 run 记录为 `rules_v1`），确认黄条出现；改回 `rules_v1` 后黄条消失。**改回常量**再提交。

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/runs/[id]/report/page.tsx" messages/en.json messages/zh.json
git commit -m "feat(rules): Phase F §11.3 跨版本回测横幅——run.rules_version 与当前常量比对"
```

---

## 收尾验证（全 Task 完成后）

- [ ] **全量验证门槛**

Run: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
Expected: tsc 0 错 · lint 0 error · vitest 全绿（含 `rule-proposals` / `rule-stats` / `rules-evolution` / 仓库新测试）· build 通过。

- [ ] **cron 本地触发（可选）**

Run: `npx inngest-cli dev`（另开终端 `npm run dev`），在 Inngest Dev UI 手动触发 `rules-evolution-scan`，确认无 key 亦可跑（纯 DB），超期资产入队。

- [ ] **更新 CLAUDE.md / 记忆**：将 Phase F 标记为已实现（commit 范围），提示 `RULES_VERSION` 常量与发版的部署同步约定。

---

## Self-Review 记录

**Spec 覆盖核对（对 `2026-07-06-phase-f-rules-evolution-design.md`）：**
- §2 F1 确定性巡检 cron → Task 5（`checkArtifactFreshness` 复用 + 幂等去重 + 空 sourceUrl 跳过）✅
- §3.1 提案状态机（approve/reject/release 两步）→ Task 4 `setProposalStatus` + `releaseApprovedProposals` ✅
- §3.1 待确认子决策（RULES_VERSION 代码真源 + 部署同步）→ Global Constraints + Task 6 release 提示 + Task 8 ✅（按用户确认取推荐默认，不做数据化备选）
- §3.2 changelog（派生无新表）→ Task 2 `groupChangelog` + Task 7 changelog 区 ✅
- §3.3 手动提案（evidence 非空双校验）→ Task 6 POST + Task 7 表单 ✅
- §4 F3 内部统计 + Wilson + N_MIN/阈值 → Task 3（**修正 spec：Wilson 需自建**）✅
- §5 F4 run 打 rules_version + 跨版本横幅 → Task 1 + Task 8 ✅
- §6 数据模型增量（findings.rule_id / runs.rules_version 两列，nullable）→ Task 1 ✅
- §7 文件边界 → File Structure 表对齐 ✅
- §9 明确不做（无 LLM 网研 / 不自动改代码规则 / 不阈值全数据化 / 不逐规则 delta / 不多租户）→ 计划范围内未越界 ✅

**Placeholder 扫描：** 无 TODO/TBD；所有代码步含完整实现或完整测试。✅

**类型一致性：** `FindingStatRecord`/`RecStatRecord`（Task 3 定义）= 仓库 `getFindingStatRecords`/`getRecStatRecords` 返回形（Task 4）;`ChangelogInput`（Task 2）= `getReleasedProposals` 行形（Task 4 → Task 7 转型）;`RulesEvolutionDeps` 各 `typeof` 与 Task 4 导出签名对齐。✅

**对 spec 的两处修正（已在计划内吸收，需用户知悉）：**
1. spec §4「复用 Phase C 已有 Wilson」有误——Phase C 用裸百分比，Wilson 在 Task 3 从零实现（数学与阈值按 spec）。
2. spec 未言明 retest 的 rules_version 取值——计划定为 **retest 现场打当前 `RULES_VERSION`**（不复制 baseline），否则 §11.3 横幅永不触发。
