# 回测 outcome 接真标量指标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把回测建议 outcome 从「只用 finding 四态兜底」升级为「接 probe 品牌级 + GSC 按 finding 关键词精确聚合的真标量对比」。

**Architecture:** 新增纯逻辑模块 `retest-metrics.ts`（指标提取/配对/快照行）；新增 `findings.metric_target` 列持久化 K 组 finding 关键词集（migration）；从 `context.ts` 抽出共享 GSC 解析；回测执行器 `computeRetestDelta` 为 baseline/retest 两轮各构建 `RunMetrics{probe,gscKeywords}`，喂给**已支持标量**的 `computeOutcome`（其判定逻辑不改）。

**Tech Stack:** TypeScript、Vitest、Drizzle（libSQL/Turso）、Inngest、既有 `lib/diagnosis` 诊断引擎。

## Global Constraints

- 上游真源：`docs/superpowers/specs/2026-07-07-retest-outcome-real-metrics-design.md`；Phase E `docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §5/§9。
- 编码前必读 `veris-coding` skill（React 19 + Next.js 16、Next 全栈、libSQL/Drizzle、Vercel 铁律）。
- **outcome 恒 `inferred`**：真标量只让方向判定更有据，claim 等级不升；不改 `computeOutcome` 判定逻辑、不改 `PILLAR_DEFAULT`、不改探针协议。
- **本切片只接 probe（brand_sov/brand_presence）+ GSC（impressions，按 finding 关键词聚合）**；crawl 保持四态兜底；不做 position/CTR、不加 K02/K06 validationSpec override。
- **migration 纪律**：改 `db/schema.ts` 后用 `npx drizzle-kit generate` 生成迁移文件，**不手写 ALTER**；旧数据该列为 null。
- 无 probe / 无目标关键词 / 该轮无对应关键词 → 自动回退四态（`buildMetricPair` 返回 null，`computeOutcome` 已处理 null）。
- UI/用户可见文案（快照 interpretation）用中文；变量/函数/字段英文。
- 验收门槛（每 Task 完成时）：`npx tsc --noEmit` 0 error / `npm run lint` 0 error / `npm test` 全绿（baseline 606）/ Task 3、4 另跑 `npm run build` ✓。
- Commit message 用中文，结尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 现有结构锚点（实现者必读）

- `computeOutcome(spec: ValidationSpec | null, metric: MetricPair | null, findingState: FindingDeltaState | null): RecommendationOutcome`（`lib/diagnosis/retest-delta.ts`）——**已实现**：有 `metric`（`{baseline:number,retest:number}`）且两值有限 → 按 `spec.direction` 判 effective/ineffective/regressed；否则退化 finding 四态。本切片只负责把真 `MetricPair` 传进去，不改此函数。
- `MetricPair`、`RetestSnapshotRow` 均从 `lib/diagnosis/retest-delta.ts` 导出。
- `ValidationSpec = { metricSource: 'gsc'|'probe'|'crawl'|'psi'; metric: string; scope: string; direction: 'increase'|'decrease'; windowDays: number }`（`lib/diagnosis/validation-spec.ts`）。`PILLAR_DEFAULT`：P3→gsc/impressions/increase、P4→probe/brand_sov/increase、P5→probe/brand_presence/increase。
- `ProbeSummary`（`lib/probes/summary.ts`）：`{ promptsTotal, promptsPresent, sov: {name,pct,you}[], ... }`。本品牌 SoV = `sov.find(s=>s.you)?.pct`；presence = `promptsPresent/promptsTotal`。
- `RuleHit extends RuleHitDraft` → 含 `detail?: Record<string, unknown>`（engine 保留，recommend.ts 已在用）。K01 `detail.keywords: [{text,...}]`、K06 `detail.queries: [{query,...}]`。
- `buildFindingRows(runId, hits: RuleHit[]): FindingRow[]`（`lib/diagnosis/finding-rows.ts`）——两条链（generate-findings / reevaluate-competitors）共用，改此处两链同时获益。`createFindings(rows: (typeof findings.$inferInsert)[])` 整行插入。
- `computeRetestDelta(deps, projectId, baselineRunId, retestRunId)`（`lib/inngest/generate-findings.ts`）当前对每条 baseline 建议传 `computeOutcome(spec, null, state)`——本切片把中间 `null` 换成真 `MetricPair`。
- `GenerateFindingsDeps` 已含 `getRunEvidence`/`getRunPrompts`/`getRunProbeResults`/`aggregateProbeSummary`/`getFindings`/`getRecommendations`/`setRecommendationOutcome`/`createRetestSnapshots`——**无需新增 dep**。
- 测试 helper：`generate-findings.test.ts` 有 `makeDeps(overrides)`/`makeRetestDeps()`/`makeArgs({baselineRunId})`/`asDeps()`；回测测试用 `baselineFindings`/`retestFindings`/`baseRecs` 常量。

---

### Task 1: `retest-metrics.ts` 纯逻辑模块

**Files:**
- Create: `lib/diagnosis/retest-metrics.ts`
- Test: `lib/diagnosis/retest-metrics.test.ts`

**Interfaces:**
- Consumes: `ValidationSpec`（`./validation-spec`）、`MetricPair`/`RetestSnapshotRow`（`./retest-delta`）、`ProbeSummary`（`@/lib/probes/summary`）。
- Produces（Task 3/4 依赖）：`export interface MetricTarget { keywords: string[] }`；`export interface RunMetrics { probe: ProbeSummary | null; gscKeywords: { keyText: string; impressions: number; position: number }[] }`；`extractMetricTarget(detail?): MetricTarget | null`；`extractRunMetric(spec, run, target): number | null`；`buildMetricPair(spec, target, baseline, retest): MetricPair | null`；`buildProbeMetricRows(baseline, retest): RetestSnapshotRow[]`。

- [ ] **Step 1: 写失败测试**

创建 `lib/diagnosis/retest-metrics.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { ValidationSpec } from './validation-spec'
import type { ProbeSummary } from '@/lib/probes/summary'
import {
  extractMetricTarget,
  extractRunMetric,
  buildMetricPair,
  buildProbeMetricRows,
  type RunMetrics,
} from './retest-metrics'

const spec = (o: Partial<ValidationSpec>): ValidationSpec => ({
  metricSource: 'gsc', metric: 'impressions', scope: 'site', direction: 'increase', windowDays: 28, ...o,
})
const probe = (o: Partial<ProbeSummary>): ProbeSummary => ({
  promptsTotal: 10, promptsPresent: 3, totalSamples: 50, perPrompt: [], sov: [], perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 }, sampleEvidenceId: null, ...o,
})
const run = (o: Partial<RunMetrics>): RunMetrics => ({ probe: null, gscKeywords: [], ...o })

describe('extractMetricTarget', () => {
  it('从 detail.keywords 抽 text', () => {
    expect(extractMetricTarget({ keywords: [{ text: 'widget' }, { text: 'gadget' }] })).toEqual({ keywords: ['widget', 'gadget'] })
  })
  it('从 detail.queries 抽 query', () => {
    expect(extractMetricTarget({ queries: [{ query: 'buy widget' }] })).toEqual({ keywords: ['buy widget'] })
  })
  it('无 detail / 无关键词 → null', () => {
    expect(extractMetricTarget(undefined)).toBeNull()
    expect(extractMetricTarget({ url: 'https://x' })).toBeNull()
  })
})

describe('extractRunMetric', () => {
  it('probe/brand_sov 取本品牌 pct', () => {
    const r = run({ probe: probe({ sov: [{ name: 'you', pct: 18, you: true }, { name: 'comp', pct: 40, you: false }] }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), r, null)).toBe(18)
  })
  it('probe/brand_sov 无本品牌条目 → null', () => {
    const r = run({ probe: probe({ sov: [{ name: 'comp', pct: 40, you: false }] }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), r, null)).toBeNull()
  })
  it('probe/brand_presence 取比值', () => {
    const r = run({ probe: probe({ promptsTotal: 10, promptsPresent: 4 }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_presence' }), r, null)).toBe(0.4)
  })
  it('probe 源无 probe → null', () => {
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), run({}), null)).toBeNull()
  })
  it('gsc/impressions 按目标关键词求和（大小写/空格归一）', () => {
    const r = run({ gscKeywords: [
      { keyText: 'Widget', impressions: 100, position: 5 },
      { keyText: 'gadget', impressions: 30, position: 8 },
      { keyText: 'other', impressions: 999, position: 2 },
    ] })
    expect(extractRunMetric(spec({}), r, { keywords: [' widget ', 'gadget'] })).toBe(130)
  })
  it('gsc 目标为 null / 无命中 → null', () => {
    const r = run({ gscKeywords: [{ keyText: 'a', impressions: 5, position: 3 }] })
    expect(extractRunMetric(spec({}), r, null)).toBeNull()
    expect(extractRunMetric(spec({}), r, { keywords: ['zzz'] })).toBeNull()
  })
  it('未知 metric / crawl 源 → null', () => {
    expect(extractRunMetric(spec({ metricSource: 'crawl', metric: 'affected_pages' }), run({}), null)).toBeNull()
    expect(extractRunMetric(spec({ metricSource: 'gsc', metric: 'position' }), run({}), { keywords: ['a'] })).toBeNull()
  })
})

describe('buildMetricPair', () => {
  it('两侧有 → pair', () => {
    const b = run({ gscKeywords: [{ keyText: 'a', impressions: 10, position: 3 }] })
    const r = run({ gscKeywords: [{ keyText: 'a', impressions: 40, position: 2 }] })
    expect(buildMetricPair(spec({}), { keywords: ['a'] }, b, r)).toEqual({ baseline: 10, retest: 40 })
  })
  it('任一侧 null → null', () => {
    const b = run({ gscKeywords: [{ keyText: 'a', impressions: 10, position: 3 }] })
    expect(buildMetricPair(spec({}), { keywords: ['a'] }, b, run({}))).toBeNull()
  })
})

describe('buildProbeMetricRows', () => {
  it('两轮 probe → sov + presence 两行带符号 delta', () => {
    const b = probe({ promptsTotal: 10, promptsPresent: 2, sov: [{ name: 'you', pct: 12, you: true }] })
    const r = probe({ promptsTotal: 10, promptsPresent: 5, sov: [{ name: 'you', pct: 18, you: true }] })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_sov'].delta).toBe('+6')
    expect(byName['probe.brand_presence'].retestValue).toBe('50%')
    expect(byName['probe.brand_presence'].delta).toBe('+30')
  })
  it('任一轮 null → 空', () => {
    expect(buildProbeMetricRows(null, probe({}))).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/retest-metrics.test.ts`
Expected: FAIL —— 模块 `./retest-metrics` 不存在。

- [ ] **Step 3: 实现 retest-metrics.ts**

创建 `lib/diagnosis/retest-metrics.ts`：

```ts
import type { ValidationSpec } from './validation-spec'
import type { MetricPair, RetestSnapshotRow } from './retest-delta'
import type { ProbeSummary } from '@/lib/probes/summary'

// 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，retest 据此精确取 impressions。
export interface MetricTarget {
  keywords: string[]
}

// 一轮 run 的可比标量来源（回测执行器为 baseline/retest 各构建一份）。
export interface RunMetrics {
  probe: ProbeSummary | null
  gscKeywords: { keyText: string; impressions: number; position: number }[]
}

// 关键词归一：trim + 小写。
const normKw = (s: string): string => s.trim().toLowerCase()

// 从 hit.detail 抽 GSC 聚合关键词集：detail.keywords[].text 或 detail.queries[].query。
// 抽不到（无 detail / 非关键词类 / 空集）→ null。
export function extractMetricTarget(detail?: Record<string, unknown>): MetricTarget | null {
  if (!detail) return null
  const pick = (arr: unknown, field: string): string[] =>
    Array.isArray(arr)
      ? (arr as unknown[])
          .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[field] : undefined))
          .filter((v): v is string => typeof v === 'string')
      : []
  const keywords = [...pick(detail.keywords, 'text'), ...pick(detail.queries, 'query')]
  return keywords.length > 0 ? { keywords } : null
}

// 按 validation_spec（GSC 另需 finding 目标）从一轮取标量；取不到 → null。
export function extractRunMetric(spec: ValidationSpec, run: RunMetrics, target: MetricTarget | null): number | null {
  if (spec.metricSource === 'probe') {
    if (!run.probe) return null
    if (spec.metric === 'brand_sov') {
      const you = run.probe.sov.find((s) => s.you)
      return you ? you.pct : null
    }
    if (spec.metric === 'brand_presence') {
      return run.probe.promptsTotal > 0 ? run.probe.promptsPresent / run.probe.promptsTotal : null
    }
    return null
  }
  if (spec.metricSource === 'gsc' && spec.metric === 'impressions') {
    if (!target || target.keywords.length === 0) return null
    const wanted = new Set(target.keywords.map(normKw))
    const matched = run.gscKeywords.filter((k) => wanted.has(normKw(k.keyText)))
    if (matched.length === 0) return null
    return matched.reduce((sum, k) => sum + k.impressions, 0)
  }
  return null
}

// 两轮 → MetricPair；两侧都取到才可比，任一 null → null（回退四态）。
export function buildMetricPair(
  spec: ValidationSpec,
  target: MetricTarget | null,
  baseline: RunMetrics,
  retest: RunMetrics,
): MetricPair | null {
  const b = extractRunMetric(spec, baseline, target)
  const r = extractRunMetric(spec, retest, target)
  if (b === null || r === null) return null
  return { baseline: b, retest: r }
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

// probe 品牌指标两轮对比 → 快照行（报告 §8 展示）。任一 null → 空。
export function buildProbeMetricRows(baseline: ProbeSummary | null, retest: ProbeSummary | null): RetestSnapshotRow[] {
  if (!baseline || !retest) return []
  const rows: RetestSnapshotRow[] = []

  const bSov = baseline.sov.find((s) => s.you)?.pct ?? null
  const rSov = retest.sov.find((s) => s.you)?.pct ?? null
  if (bSov !== null && rSov !== null) {
    const d = Math.round((rSov - bSov) * 10) / 10
    rows.push({
      metricName: 'probe.brand_sov',
      baselineValue: `${bSov}%`,
      retestValue: `${rSov}%`,
      delta: signed(d),
      interpretation: d > 0 ? '品牌 AI 答案占有率上升（推断，n=5 方向性）' : d < 0 ? '品牌 AI 答案占有率下降（推断）' : '品牌 AI 答案占有率持平（推断）',
    })
  }

  const bPres = baseline.promptsTotal > 0 ? Math.round((baseline.promptsPresent / baseline.promptsTotal) * 100) : null
  const rPres = retest.promptsTotal > 0 ? Math.round((retest.promptsPresent / retest.promptsTotal) * 100) : null
  if (bPres !== null && rPres !== null) {
    const d = rPres - bPres
    rows.push({
      metricName: 'probe.brand_presence',
      baselineValue: `${bPres}%`,
      retestValue: `${rPres}%`,
      delta: signed(d),
      interpretation: d > 0 ? '品牌在 AI 回答中出现率上升（推断，n=5 方向性）' : d < 0 ? '品牌在 AI 回答中出现率下降（推断）' : '品牌出现率持平（推断）',
    })
  }

  return rows
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/retest-metrics.test.ts`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 全量门槛**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc 0 / lint 0 / 全绿。

- [ ] **Step 6: Commit**

```bash
git add lib/diagnosis/retest-metrics.ts lib/diagnosis/retest-metrics.test.ts
git commit -m "feat(retest): retest-metrics 纯模块——probe/GSC 标量提取 + 目标抽取 + probe 快照行

extractMetricTarget(从 detail.keywords/queries 抽关键词)、extractRunMetric(probe
brand_sov/brand_presence + gsc impressions 按目标聚合)、buildMetricPair、buildProbeMetricRows。
全纯逻辑，取不到即 null 供回退四态。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 抽出共享 GSC 解析 `parseGscKeywordMetrics`

**Files:**
- Modify: `lib/diagnosis/context.ts`（把 inline GSC query/page 维解析抽为导出纯函数，context 自身改调用它）
- Test: `lib/diagnosis/context.test.ts`（加 `parseGscKeywordMetrics` 等价用例）

**Interfaces:**
- Produces（Task 4 依赖）：`export function parseGscKeywordMetrics(evidence: DiagnosisEvidenceRow[]): RuleContext['keywordMetrics']`（只解析 query/page 单维；queryPage 交叉仍在 context 内联，行为不变）。

- [ ] **Step 1: 写失败测试**

在 `lib/diagnosis/context.test.ts` 末尾追加（文件顶部 import 处加入 `parseGscKeywordMetrics`）：

```ts
import { buildRuleContext, parseGscKeywordMetrics } from './context'
```

```ts
describe('parseGscKeywordMetrics', () => {
  const ev = (id: string, dimension: string, rows: unknown[]) => ({
    id, type: 'gsc' as const, claimLevel: 'L4' as const, source: 'gsc', sitePageId: null, rawText: '',
    payload: { dimension, rows },
  })
  it('解析 query 维行（num 归一）', () => {
    const out = parseGscKeywordMetrics([
      ev('g1', 'query', [{ keys: ['widget'], clicks: 2, impressions: 100, ctr: 0.02, position: 5.4 }]),
    ])
    expect(out).toEqual([
      { evidenceId: 'g1', dimension: 'query', keyText: 'widget', clicks: 2, impressions: 100, ctr: 0.02, position: 5.4 },
    ])
  })
  it('跳过 queryPage 维与无 key 行', () => {
    const out = parseGscKeywordMetrics([
      ev('g2', 'queryPage', [{ keys: ['p', 'q'], impressions: 5 }]),
      ev('g3', 'query', [{ impressions: 9 }]),
    ])
    expect(out).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/context.test.ts`
Expected: FAIL —— `parseGscKeywordMetrics` 未导出。

- [ ] **Step 3: 抽出函数并改 context 调用**

在 `lib/diagnosis/context.ts` 中新增导出函数（放在 `buildRuleContext` 之前，复用文件内已有的 `num` 与 `GscEvidencePayload` 类型）：

```ts
// GSC 证据 → keywordMetrics（query/page 单维）。context 与回测执行器共用（DRY）。
export function parseGscKeywordMetrics(evidence: DiagnosisEvidenceRow[]): RuleContext['keywordMetrics'] {
  const keywordMetrics: RuleContext['keywordMetrics'] = []
  for (const e of evidence.filter((ev) => ev.type === 'gsc')) {
    const payload = (e.payload ?? {}) as GscEvidencePayload
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    if (payload.dimension === 'query' || payload.dimension === 'page') {
      for (const r of rows) {
        const key = r.keys?.[0]
        if (!key) continue
        keywordMetrics.push({
          evidenceId: e.id, dimension: payload.dimension, keyText: key,
          clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position),
        })
      }
    }
  }
  return keywordMetrics
}
```

在 `buildRuleContext` 内，把原来同时构造 keywordMetrics 与 queryPageMetrics 的那段循环，替换为：keywordMetrics 改调新函数，queryPage 交叉单独一遍循环（行为不变）：

```ts
  // —— GSC 关键词（K 组）——：query/page 单维复用共享解析；queryPage 交叉单列。
  const keywordMetrics = parseGscKeywordMetrics(evidence)
  const queryPageMetrics: RuleContext['queryPageMetrics'] = []
  for (const e of evidence.filter((ev) => ev.type === 'gsc')) {
    const payload = (e.payload ?? {}) as GscEvidencePayload
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    if (payload.dimension === 'queryPage') {
      for (const r of rows) {
        const page = r.keys?.[0]
        const query = r.keys?.[1]
        if (!page || !query) continue
        queryPageMetrics.push({
          evidenceId: e.id, page, query,
          clicks: num(r.clicks), impressions: num(r.impressions), position: num(r.position),
        })
      }
    }
  }
```

（`DiagnosisEvidenceRow` 类型若未在 context.ts 顶部导入，从 `./types` 补 import。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/context.test.ts`
Expected: PASS（新用例 + 原 context 用例均绿）。

- [ ] **Step 5: 全量门槛**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全绿（GSC 解析行为等价，K 组规则测试不受影响）。

- [ ] **Step 6: Commit**

```bash
git add lib/diagnosis/context.ts lib/diagnosis/context.test.ts
git commit -m "refactor(context): 抽出 parseGscKeywordMetrics 共享纯函数（为回测复用）

query/page 单维解析抽为导出函数，context 与回测执行器共用；queryPage 交叉保持内联。
行为等价重构。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `findings.metric_target` 列 + migration + buildFindingRows 落目标

**Files:**
- Modify: `db/schema.ts`（findings 加 `metricTarget` 列）
- Create: `db/migrations/0003_*.sql`（drizzle-kit 生成）
- Modify: `lib/diagnosis/finding-rows.ts`（`FindingRow` 加 `metricTarget`，`buildFindingRows` 落 `extractMetricTarget(hit.detail)`）
- Test: `lib/diagnosis/finding-rows.test.ts`（新建或追加 `buildFindingRows` 落目标用例）

**Interfaces:**
- Consumes: `extractMetricTarget`、`MetricTarget`（Task 1，`./retest-metrics`）。
- Produces: `findings.metric_target` 列；`FindingRow.metricTarget: MetricTarget | null`。

- [ ] **Step 1: 写失败测试**

创建/追加 `lib/diagnosis/finding-rows.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildFindingRows } from './finding-rows'
import type { RuleHit } from './types'

const hit = (o: Partial<RuleHit>): RuleHit => ({
  ruleId: 'K01', pillar: 'P3', side: 'seo', severity: 'warning', claimType: 'inferred',
  title: 't', description: 'd', evidenceRefs: ['ev1'], scope: 'keywords:opportunity', fingerprint: 'fp1', ...o,
})

describe('buildFindingRows metricTarget', () => {
  it('K 组 detail.keywords → metricTarget.keywords', () => {
    const rows = buildFindingRows('run1', [hit({ detail: { keywords: [{ text: 'widget' }, { text: 'gadget' }] } })])
    expect(rows[0].metricTarget).toEqual({ keywords: ['widget', 'gadget'] })
  })
  it('无关键词 detail → metricTarget null', () => {
    const rows = buildFindingRows('run1', [hit({ detail: { url: 'https://x' } })])
    expect(rows[0].metricTarget).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/finding-rows.test.ts`
Expected: FAIL —— `rows[0].metricTarget` 为 undefined（FindingRow 无此字段）。

- [ ] **Step 3: 加 schema 列**

在 `db/schema.ts` 的 `findings` 表定义里（`fingerprint` 列之后）加入：

```ts
  // 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，retest 据此精确取 impressions；非关键词类为 null。
  metricTarget: text('metric_target', { mode: 'json' }).$type<{ keywords: string[] }>(),
```

- [ ] **Step 4: 生成 migration**

Run: `npx drizzle-kit generate`
Expected: 生成 `db/migrations/0003_<随机名>.sql`，内容为单条 `ALTER TABLE \`findings\` ADD \`metric_target\` text;`（drizzle 对 JSON 列生成 text 列）。确认只影响 findings、无其他表变更。

- [ ] **Step 5: 实现 buildFindingRows 落目标**

在 `lib/diagnosis/finding-rows.ts`：顶部加 import：

```ts
import { extractMetricTarget, type MetricTarget } from './retest-metrics'
```

`FindingRow` 接口加字段（在 `status: 'open'` 之前）：

```ts
  // 回测标量聚合目标（GSC 类存关键词集，其余 null）。
  metricTarget: MetricTarget | null
```

`buildFindingRows` 的 map 返回对象里加（`fingerprint` 之后）：

```ts
    metricTarget: extractMetricTarget(hit.detail),
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/finding-rows.test.ts`
Expected: PASS。

- [ ] **Step 7: 全量门槛 + 构建**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tsc 0（`FindingRow` 与 `findings.$inferInsert` 对齐，createFindings 整行插入 metric_target）/ lint 0 / 全绿（含从 migrations bootstrap 的 repo 测试自动带新列）/ build ✓。

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts db/migrations/ lib/diagnosis/finding-rows.ts lib/diagnosis/finding-rows.test.ts
git commit -m "feat(schema): findings.metric_target 列 + buildFindingRows 落 GSC 关键词目标

新增可空 JSON 列持久化 K 组 finding 关键词集（migration 0003，drizzle-kit generate）；
buildFindingRows 用 extractMetricTarget(hit.detail) 落库，两条落库链同时获益。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 回测执行器接线（`computeRetestDelta` 传真 MetricPair + probe 快照行）

**Files:**
- Modify: `lib/inngest/generate-findings.ts`（`computeRetestDelta`：为两轮各建 `RunMetrics`，per-rec `buildMetricPair`→`computeOutcome`，追加 probe 快照行）
- Test: `lib/inngest/generate-findings.test.ts`（扩回测测试）

**Interfaces:**
- Consumes: `parseGscKeywordMetrics`（Task 2）、`buildMetricPair`/`buildProbeMetricRows`/`RunMetrics`/`MetricTarget`（Task 1）、既有 `getRunEvidence`/`getRunPrompts`/`getRunProbeResults`/`aggregateProbeSummary` deps。

- [ ] **Step 1: 写失败测试**

在 `lib/inngest/generate-findings.test.ts` 的回测 `describe` 内，给 `baselineFindings` 的 `f_b1` 加 `metricTarget`，给 `baseRecs` 加 `validationSpec`，并扩 `makeRetestDeps` 支持 per-run 证据/探针。**替换**现有 `baselineFindings`/`baseRecs` 常量与 `makeRetestDeps` 为下述版本（其余用例仍适用），并追加新用例：

```ts
  const baselineFindings = [
    { id: 'f_b1', runId: 'run_base', fingerprint: 'fp_1', severity: 'high', pillar: 'P3', title: 'A', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: { keywords: ['widget'] } },
    { id: 'f_b2', runId: 'run_base', fingerprint: 'fp_2', severity: 'high', pillar: 'P5', title: 'B', side: 'geo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
  ]
  const retestFindings = [
    { id: 'f_r2', runId: 'run_1', fingerprint: 'fp_2', severity: 'high', pillar: 'P5', title: 'B', side: 'geo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
    { id: 'f_r3', runId: 'run_1', fingerprint: 'fp_3', severity: 'mid', pillar: 'P2', title: 'C', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
  ]
  // rec_b1(P3/gsc impressions)：目标 widget，baseline 100→retest 300 → effective（真标量压过 fp_1 四态 resolved 也仍 effective）
  // rec_b2(P5/probe brand_presence)：fp_2 persistent（四态=ineffective），但 presence 2/10→5/10 上升 → effective（真标量翻盘）
  const baseRecs = [
    { id: 'rec_b1', runId: 'run_base', findingId: 'f_b1', validationSpec: { metricSource: 'gsc', metric: 'impressions', scope: 'keywords', direction: 'increase', windowDays: 28 } },
    { id: 'rec_b2', runId: 'run_base', findingId: 'f_b2', validationSpec: { metricSource: 'probe', metric: 'brand_presence', scope: 'site', direction: 'increase', windowDays: 28 } },
  ]

  const gscEv = (id: string, impressions: number) => ({
    id, type: 'gsc', claimLevel: 'L4', source: 'gsc', sitePageId: null, rawText: '',
    payload: { dimension: 'query', rows: [{ keys: ['widget'], clicks: 1, impressions, ctr: 0.01, position: 6 }] },
  })

  function makeRetestDeps() {
    return makeDeps({
      getFindings: vi.fn(async (rid: string) => (rid === 'run_base' ? baselineFindings : retestFindings)),
      getRecommendations: vi.fn(async (rid: string) => (rid === 'run_base' ? baseRecs : [])),
      createRetestSnapshots: vi.fn(async (rows: unknown[]) => rows),
      setRecommendationOutcome: vi.fn(async () => undefined),
      // 两轮各自证据（GSC impressions 差异）+ 探针结果（presence 差异）
      getRunEvidence: vi.fn(async (rid: string) => [rid === 'run_base' ? gscEv('g_base', 100) : gscEv('g_retest', 300)]),
      getRunProbeResults: vi.fn(async (rid: string) =>
        (rid === 'run_base' ? [1, 2] : [1, 2, 3, 4, 5]).map((n) => ({
          promptId: `p${n}`, brandPresent: true, competitorsMentioned: [], evidenceId: `pe${n}`, provider: 'openai', sentiment: 'neutral',
        })),
      ),
      // presence = brandPresent 数 / 10（promptsTotal 固定 10）
      aggregateProbeSummary: vi.fn((input: { results: unknown[] }) => ({
        promptsTotal: 10, promptsPresent: input.results.length, totalSamples: input.results.length,
        perPrompt: [], sov: [], perEngine: [], sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 }, sampleEvidenceId: null,
      })),
    })
  }
```

追加新用例：

```ts
  it('P3 建议按 finding 关键词 GSC impressions 上升 → effective（真标量压过四态）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    // rec_b1 目标 widget：100→300 增 → effective
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b1', 'effective')
  })

  it('P5 建议 probe brand_presence 上升 → effective（翻盘 fp_2 persistent 的四态 ineffective）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'effective')
  })

  it('retest_snapshots 含 probe 品牌指标行', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    const snapRows = deps.createRetestSnapshots.mock.calls[0][0] as Array<Record<string, string>>
    const names = snapRows.map((r) => r.metricName)
    expect(names).toContain('probe.brand_presence')
  })
```

注：原「baseline 建议 outcome 按 fingerprint→四态对齐」用例断言的 `rec_b1→effective`/`rec_b2→ineffective` 现由真标量改写——把该旧用例的 deps 改用**不带指标**的场景（`validationSpec: null` + 无 probe/gsc）以继续验证纯四态兜底路径：将该用例内改用 `makeDeps({ getFindings:..., getRecommendations: async(rid)=> rid==='run_base' ? [{id:'rec_b1',runId:'run_base',findingId:'f_b1',validationSpec:null},{id:'rec_b2',runId:'run_base',findingId:'f_b2',validationSpec:null}] : [], setRecommendationOutcome: vi.fn(async()=>undefined), createRetestSnapshots: vi.fn(async(r)=>r) })`，其余断言不变（fp_1 resolved→effective、fp_2 persistent→ineffective）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/inngest/generate-findings.test.ts`
Expected: FAIL —— 新用例期望真标量 outcome，但 `computeRetestDelta` 仍传 `null` MetricPair（rec_b2 会得 ineffective 而非 effective）。

- [ ] **Step 3: 接线 computeRetestDelta**

在 `lib/inngest/generate-findings.ts` 顶部 import 加：

```ts
import { buildMetricPair, buildProbeMetricRows, type RunMetrics, type MetricTarget } from '@/lib/diagnosis/retest-metrics'
import { parseGscKeywordMetrics } from '@/lib/diagnosis/context'
```

在 `computeRetestDelta` 内新增一个 per-run 指标构建 helper（函数内或模块内私有），并改造 outcome 循环与 snapshot 拼装。把 `computeRetestDelta` 相关段改为：

```ts
  // 为一轮 run 构建可比标量来源（probe 品牌级 + GSC query 维关键词）。
  const buildRunMetrics = async (rid: string): Promise<RunMetrics> => {
    const [evidence, prompts, probeResults] = await Promise.all([
      deps.getRunEvidence(rid),
      deps.getRunPrompts(rid),
      deps.getRunProbeResults(rid),
    ])
    const probe = deps.aggregateProbeSummary({
      prompts: prompts.map((p) => ({ id: p.id, text: p.text, priority: p.priority })),
      results: probeResults.map((r) => ({
        promptId: r.promptId, brandPresent: r.brandPresent, competitorsMentioned: r.competitorsMentioned,
        evidenceId: r.evidenceId, provider: r.provider, sentiment: r.sentiment,
      })),
      brand: brandFromDomain((await deps.getProject(projectId))?.domain ?? ''),
      competitors: [],
    })
    const gscKeywords = parseGscKeywordMetrics(
      evidence.map((e) => ({ id: e.id, type: e.type as EvidenceType, claimLevel: e.claimLevel as EvidenceLevel, source: e.source, payload: e.payload, rawText: e.rawText, sitePageId: e.sitePageId })),
    ).map((k) => ({ keyText: k.keyText, impressions: k.impressions, position: k.position }))
    return { probe, gscKeywords }
  }

  const [baselineMetrics, retestMetrics] = await Promise.all([buildRunMetrics(baselineRunId), buildRunMetrics(retestRunId)])
```

（`brandFromDomain`/`EvidenceType`/`EvidenceLevel` 已在本文件 import；若无则从既有 import 处补。`getProject` 已是 dep。）

outcome 循环改为取 finding 的 `metricTarget` 并传真 MetricPair：

```ts
  const idToFinding = new Map(baselineRows.map((r) => [r.id, r]))
  await Promise.all(
    baseRecs.map((rec) => {
      const f = idToFinding.get(rec.findingId)
      const fp = f?.fingerprint ?? null
      const state = (fp ? fpToState.get(fp) : undefined) ?? null
      const spec = (rec.validationSpec as ValidationSpec | null) ?? null
      const target = (f?.metricTarget as MetricTarget | null) ?? null
      const pair = spec ? buildMetricPair(spec, target, baselineMetrics, retestMetrics) : null
      const outcome = computeOutcome(spec, pair, state)
      return deps.setRecommendationOutcome(rec.id, outcome)
    }),
  )
```

snapshot 拼装追加 probe 行（在构造 `rows` 处）：

```ts
  const snapshotRows = [
    ...buildRetestSnapshotRows(summary, { baseline: baseOverall, retest: retestOverall }),
    ...buildProbeMetricRows(baselineMetrics.probe, retestMetrics.probe),
  ]
  const rows = snapshotRows.map((row) => ({
    id: `rts_${crypto.randomUUID()}`,
    projectId, baselineRunId, retestRunId,
    metricName: row.metricName, baselineValue: row.baselineValue, retestValue: row.retestValue,
    delta: row.delta, interpretation: row.interpretation,
  }))
```

（删除原先直接对 `buildRetestSnapshotRows(...)` 调 `.map` 的写法，替换为上面两步。原 `idToFp` map 可删，改用 `idToFinding`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- lib/inngest/generate-findings.test.ts`
Expected: PASS（新 3 用例 + 改写的四态兜底用例 + 原四态/快照用例均绿）。

- [ ] **Step 5: 全量门槛 + 构建**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tsc 0 / lint 0 / 全绿（baseline 606 + 新增）/ build ✓。

- [ ] **Step 6: Commit**

```bash
git add lib/inngest/generate-findings.ts lib/inngest/generate-findings.test.ts
git commit -m "feat(retest): computeRetestDelta 接真标量——probe 品牌级 + GSC 按 finding 关键词聚合

两轮各建 RunMetrics{probe,gscKeywords}，per-rec 取 finding.metricTarget → buildMetricPair
→ computeOutcome（有标量压四态，无则回退）；retest_snapshots 追加 probe 品牌指标行。
outcome 恒 inferred。Phase E 局限①收口。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage：**
- §4.1 schema metric_target 列 + migration → Task 3 ✓。
- §4.2 extractMetricTarget + buildFindingRows 落库 → Task 1（函数）+ Task 3（接线）✓。
- §4.3 parseGscKeywordMetrics 抽取 → Task 2 ✓。
- §4.4 retest-metrics（RunMetrics/extractRunMetric/buildMetricPair/buildProbeMetricRows）→ Task 1 ✓。
- §4.5 computeRetestDelta 接线（两轮 RunMetrics、per-rec MetricPair、probe 快照行）→ Task 4 ✓。
- §6 测试矩阵 → 各 Task Step 1 覆盖 ✓；migration bootstrap → Task 3 Step 7（全量含 repo 测试）✓。
- §7 边界（不接 crawl/不做 position/不改 computeOutcome/PILLAR_DEFAULT）→ 各 Task 均未触碰 ✓。

**2. Placeholder scan：** 无 TBD/TODO；每 code step 含完整代码。Task 3 Step 4 migration 文件名随机（drizzle 生成）已注明，非占位符。

**3. Type consistency：**
- `MetricTarget = { keywords: string[] }`：Task 1 定义、schema `$type<{keywords:string[]}>`（结构等价）、Task 3 FindingRow `MetricTarget | null`、Task 4 `f.metricTarget as MetricTarget | null` 一致 ✓。
- `RunMetrics = { probe: ProbeSummary|null; gscKeywords: {keyText,impressions,position}[] }`：Task 1 定义、Task 4 `buildRunMetrics` 返回一致 ✓。
- `extractRunMetric(spec, run, target)` / `buildMetricPair(spec, target, baseline, retest)`：Task 1 签名、Task 4 调用一致 ✓。
- `parseGscKeywordMetrics(evidence): RuleContext['keywordMetrics']`：Task 2 定义、Task 4 用 `.map` 取 keyText/impressions/position 一致 ✓。
- `computeOutcome(spec, pair, state)` 三参既有签名不变，Task 4 传 `MetricPair|null` ✓。
- `buildProbeMetricRows(baseline, retest): RetestSnapshotRow[]`：Task 1 定义、Task 4 concat 进 snapshotRows 一致 ✓。
