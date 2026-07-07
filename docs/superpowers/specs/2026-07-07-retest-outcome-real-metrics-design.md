# 回测 outcome 接真标量指标设计（Phase E 收口）

**日期**：2026-07-07
**范围**：把回测（retest）建议 outcome 判定从「只用 finding 四态兜底」升级为「接真标量指标对比」——**probe 品牌级指标 + GSC 按 finding 关键词精确聚合，一次做全**。这是 Phase E 已知局限①的收口切片。
**上游**：Phase E spec `docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §5（建议生命周期）/§9（outcome 恒 inferred）；既有实现 `lib/diagnosis/retest-delta.ts`（`computeOutcome` 已支持 `MetricPair`）、`lib/diagnosis/validation-spec.ts`、`lib/diagnosis/finding-rows.ts`、`lib/diagnosis/context.ts`、`lib/inngest/generate-findings.ts`（`computeRetestDelta` 编排）。

## 1. 现状与缺口

`computeOutcome(spec, metric, findingState)` 已能吃标量指标对（`MetricPair`）：有可比标量时按 `validation_spec.direction` 判 effective/ineffective/regressed，无标量时退化到 finding 四态。**缺口**：回测执行器 `computeRetestDelta` 目前对每条 baseline 建议一律传 `metric: null`（`generate-findings.ts` 现址），从不取真标量，所以 outcome 永远只由四态兜底。

## 2. 关键约束发现（决定本切片结构）

盘查数据模型确认：

1. **findings / recommendations 均不持久化 `detail`**（RuleHitDraft.detail 在生成建议时被 `recommend.ts` 消费后即丢弃，未落库）。故要对 P3 关键词类 finding 的 GSC impressions 做「按 finding 精确聚合」，**必须新增 finding 目标列**把关键词集持久化下来。
2. **probe 品牌级指标无此依赖**：`brand_sov`（本品牌 SoV 百分比）、`brand_presence`（品牌出现的 prompt 占比）天然是整个品牌/站点的属性，从每轮 `ProbeSummary` 直取即可。
3. **K 组 finding.detail 已带关键词**：K01 `detail.keywords[].text`、K06 `detail.queries[].query`——可在落库时抽出存进目标列。
4. **GSC query 维解析**已存在于 `context.ts`（inline 生成 `keywordMetrics`），可抽为共享纯函数复用。
5. `validation-spec.ts` 的 `PILLAR_DEFAULT`：P3→`gsc/impressions`、P4→`probe/brand_sov`、P5→`probe/brand_presence`、P1/P2→`crawl/affected_pages`；当前无模板覆盖，全走支柱默认。

## 3. 决策（已确认：probe + GSC 一起做）

**本切片接两类真标量：probe 品牌级（P4 `brand_sov`/P5 `brand_presence`）+ GSC impressions（P3，按 finding 自带关键词集精确聚合）。crawl（P1/P2）保持 finding 四态兜底。**

- **GSC 按 finding 精确聚合**（非站级粗聚合）：新增 `findings.metric_target` 列持久化 finding 的关键词集；回测时对 baseline finding 的这组关键词，分别在 baseline/retest 两轮的 GSC 里求 impressions 之和做对比。避免「站级 impressions 涨了就把某关键词建议判有效」的归因噪声。
- **不含 crawl**：`crawl/affected_pages` 与 finding 四态高度冗余（四态已用 fingerprint 跨 run 做了「问题页是否消解」的同一件事）。
- **outcome 恒 `inferred` 不变**：probe n=5 方向性样本、GSC 4-6 周窗口内多因素共变；真标量只让方向判定更有据，claim 等级不升。报告已明示「复合变更不归因单项」。
- **metric 只做 impressions（P3 默认 direction=increase）**：不在本切片加 `position`/CTR 覆盖与 K02/K06 的 validationSpec override（属规则语义微调，另议）。extractor 仅实现 impressions 聚合，保持边界清晰。

## 4. 组件设计

### 4.1 Schema：`findings.metric_target`（新增列 + migration）

`findings` 表加可空 JSON 列 `metric_target`，存该 finding 的可比指标目标：

```ts
// db/schema.ts findings 表内
// 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，供 retest 按此精确取 impressions。
// 非关键词类 finding 为 null（回测走四态兜底或品牌级指标）。
metricTarget: text('metric_target', { mode: 'json' }).$type<MetricTarget>(),
```

`MetricTarget` 形状（定义在 `lib/diagnosis/retest-metrics.ts`，被 schema `$type` 引用）：

```ts
export interface MetricTarget {
  keywords: string[] // GSC 聚合的关键词/查询集（K 组 finding 自带）
}
```

**migration 纪律（吸收 Phase F 教训）**：改 `db/schema.ts` 后用 `npx drizzle-kit generate` 生成 migration 文件（**不手写 ALTER**）；repo/集成测试按 `db/migrations/*.sql` 全量 bootstrap；旧数据该列为 null（Drizzle 可空，无回填）。

### 4.2 目标抽取：`lib/diagnosis/finding-rows.ts`

`FindingRow` 加 `metricTarget: MetricTarget | null`；`buildFindingRows` 从 `hit.detail` 抽取：

```ts
// 从 hit.detail 抽 GSC 聚合关键词集（K 组：detail.keywords[].text 或 detail.queries[].query）。
// 抽不到（无 detail / 非关键词类）→ null。纯函数，导出供单测。
export function extractMetricTarget(detail?: Record<string, unknown>): MetricTarget | null
```

`buildFindingRows` map 内：`metricTarget: extractMetricTarget(hit.detail)`。`hit.detail` 已在 `RuleHit` 上（buildFindingRows 现已能读 hit，只是此前没用 detail）。

### 4.3 GSC 解析复用：`lib/diagnosis/context.ts`

把现有 inline 的 GSC query/page 维解析抽成导出纯函数，`context.ts` 自身改为调用它，回测执行器复用（DRY，行为保持不变）：

```ts
// GSC 证据 → keywordMetrics（query/page 单维）。context 与回测执行器共用。
export function parseGscKeywordMetrics(evidence: DiagnosisEvidenceRow[]): RuleContext['keywordMetrics']
```

### 4.4 标量提取：`lib/diagnosis/retest-metrics.ts`（新增，纯逻辑）

```ts
import type { ValidationSpec } from './validation-spec'
import type { MetricPair, RetestSnapshotRow } from './retest-delta'
import type { ProbeSummary } from '@/lib/probes/summary'

export interface MetricTarget { keywords: string[] }

// 一轮 run 的标量来源（回测执行器为 baseline/retest 各构建一份）。
export interface RunMetrics {
  probe: ProbeSummary | null
  gscKeywords: { keyText: string; impressions: number; position: number }[]
}

// 按 validation_spec（+ GSC 需 finding 目标）从一轮取标量；取不到 → null。
//   probe/brand_sov      → probe.sov 中 you===true 的 pct（无则 null）
//   probe/brand_presence → probe.promptsTotal>0 ? promptsPresent/promptsTotal : null
//   gsc/impressions      → target.keywords 命中的 gscKeywords 的 impressions 之和（target 空/无命中 → null）
//   其它源（crawl/psi）/未知 metric → null
export function extractRunMetric(spec: ValidationSpec, run: RunMetrics, target: MetricTarget | null): number | null

// 两轮 → MetricPair；两侧都取到才可比，任一 null → null（回退四态）。
export function buildMetricPair(spec: ValidationSpec, target: MetricTarget | null, baseline: RunMetrics, retest: RunMetrics): MetricPair | null

// probe 品牌指标两轮对比 → 快照行（报告 §8 展示「品牌 SoV 12%→18% +6」）。任一 null → 空。
export function buildProbeMetricRows(baseline: ProbeSummary | null, retest: ProbeSummary | null): RetestSnapshotRow[]
```

GSC 关键词匹配：`target.keywords` 与 `gscKeywords[].keyText` 按精确文本（trim 小写归一）匹配求和；无命中（该轮 GSC 没这些词）返回 null。

### 4.5 回测执行器接线：`generate-findings.ts` `computeRetestDelta`

1. 为 baseline 与 retest **各构建 `RunMetrics`**：每轮 `getRunEvidence`（→ `parseGscKeywordMetrics` 得 `gscKeywords`）+ `getRunPrompts`/`getRunProbeResults`（→ `aggregateProbeSummary` 得 `probe`）。这些 dep 均已在 `GenerateFindingsDeps`，**无需新增 dep**。
2. baseline 建议 outcome 循环：取该建议对应 baseline finding 的 `metricTarget`，`const pair = buildMetricPair(spec, target, baselineMetrics, retestMetrics); const outcome = computeOutcome(spec, pair, state)`。`computeOutcome` 逻辑不改。
3. `retest_snapshots` 追加 probe 指标行：`[...buildRetestSnapshotRows(summary, health), ...buildProbeMetricRows(baselineProbe, retestProbe)]`。

**降级**：无 probe → probe 指标回退四态、无 probe 快照行；GSC 目标为 null 或该轮无对应关键词 → 该建议回退四态。回测 delta 整体仍裹 try/catch，失败不污染主诊断。

## 5. 数据流

```
落库时（generate-findings / reevaluate-competitors 两链）：
  buildFindingRows → 每 finding 存 metric_target（extractMetricTarget(hit.detail)）

retest run 完成 diagnose → computeRetestDelta(baselineRunId, retestRunId):
  ├ 四态 delta（不变）
  ├ 两轮各：getRunEvidence→parseGscKeywordMetrics；prompts+probeResults→aggregateProbeSummary  ⇒ RunMetrics{probe,gscKeywords}
  ├ 每条 baseline 建议：取其 finding.metric_target → buildMetricPair → computeOutcome(spec, pair, state) → setRecommendationOutcome
  │    P4/P5 有 probe → 真标量；P3 有目标关键词+两轮 GSC → 真标量；否则四态兜底
  ├ 健康分 delta（不变）
  └ retest_snapshots = 四态行 + 健康分行 + probe 指标行
```

## 6. 测试

- `lib/diagnosis/retest-metrics.test.ts`（新）：`extractMetricTarget`（keywords/queries 两形状、无 detail→null）、`extractRunMetric`（probe sov 有/无本品牌、presence 比值、gsc impressions 命中求和/无命中→null/target 为 null→null、非 probe 非 gsc 源→null、未知 metric→null）、`buildMetricPair`（两侧有→pair、任一无→null）、`buildProbeMetricRows`（两轮→两行、任一 null→空）。
- `lib/diagnosis/context.test.ts`（扩）：`parseGscKeywordMetrics` 抽取后行为等价（query/page 维、num 归一）。
- `finding-rows.test.ts`（扩，若无则加）：`extractMetricTarget` 经 buildFindingRows 写入 metricTarget。
- `generate-findings` 回测测试（扩现有）：P5 建议 presence 上升→outcome `effective`（真标量）；P3 建议目标关键词 impressions 上升→`effective`、下降→`regressed`；无目标/无 probe→四态兜底；probe 快照行出现。
- migration/repo：按 Phase F 配方，测试从 `db/migrations/*.sql` bootstrap，确认 `metric_target` 列物理存在。
- 门槛：`npx tsc --noEmit` 0 / `npm run lint` 0 error / `npm test` 全绿（baseline 606）/ `npm run build` ✓。

## 7. 明确不做（本切片边界）

- 不接 crawl/affected_pages 真标量（与四态冗余）。
- 不做 `position`/CTR 指标、不加 K02/K06 的 validationSpec override（规则语义微调另议）。
- 不改 `computeOutcome` 判定逻辑、不改 `PILLAR_DEFAULT`、不改探针协议（`PROBE_PARSER_VERSION`）与回测同协议约束。
- metric_target 只存 keywords（GSC 用）；不存 URL 目标（crawl 不接）。

## 8. 已知局限（写入实现后记忆）

1. probe n=5 方向性样本、GSC 多因素共变，outcome 恒 inferred；报告明示复合变更不归因单项。
2. brand_sov/brand_presence 为品牌级 → 同轮所有 P4 建议共享 brand_sov、所有 P5 共享 brand_presence（可接受：二者本就是品牌可见性杠杆）。
3. GSC 只做 impressions/increase；K02（低 CTR）/K06（蚕食）语义上更宜用 position/CTR，待 validationSpec override 切片。
4. metric_target 依赖 finding.detail 带关键词；仅 K 组 finding 有，其余 P3 finding（若无 detail 关键词）回退四态。
5. 分引擎 SoV 未拆分（沿用 Phase D 局限）。
6. crawl 建议仍四态兜底。
