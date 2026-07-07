# 回测 outcome 接真标量指标设计（Phase E 收口）

**日期**：2026-07-07
**范围**：把回测（retest）建议 outcome 判定从「只用 finding 四态兜底」升级为「接 probe 品牌级真标量指标对比」。这是 Phase E 已知局限①的收口切片。
**上游**：Phase E spec `docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §5（建议生命周期）/§9（outcome 恒 inferred）；既有实现 `lib/diagnosis/retest-delta.ts`（`computeOutcome` 已支持 `MetricPair`）、`lib/diagnosis/validation-spec.ts`、`lib/inngest/generate-findings.ts`（`computeRetestDelta` 编排）。

## 1. 现状与缺口

`computeOutcome(spec, metric, findingState)` 已能吃标量指标对（`MetricPair`）：有可比标量时按 `validation_spec.direction` 判 effective/ineffective/regressed，无标量时退化到 finding 四态（resolved→effective 等）。**缺口**：回测执行器 `computeRetestDelta` 目前对每条 baseline 建议一律传 `metric: null`（`generate-findings.ts` 现址），从不取真标量，所以 outcome 永远只由四态兜底。

## 2. 关键约束发现（决定本切片边界）

盘查数据模型后确认两点，直接框定范围：

1. **findings / recommendations 均不持久化 `detail`**（RuleHitDraft.detail 在生成建议时被 `recommend.ts` 消费后即丢弃，未落库）。因此**无法在回测时读回 P3 关键词类 finding 自带的关键词集合**来对 GSC impressions 做「按 finding 精确聚合」。要做需新增 finding 目标列 + migration。
2. **probe 品牌级指标无此依赖**：`brand_sov`（本品牌 SoV 百分比）、`brand_presence`（品牌出现的 prompt 占比）天然是整个品牌/站点的属性，可从每轮 run 的 `ProbeSummary` 直取，**无需任何 finding 明细、无需 schema 改动**。

`validation-spec.ts` 的 `PILLAR_DEFAULT` 现状：P3→`gsc/impressions`、P4→`probe/brand_sov`、P5→`probe/brand_presence`、P1/P2→`crawl/affected_pages`；当前**无任何模板覆盖** `validationSpec`，故全部走支柱默认。

## 3. 决策（已代拍板，可推翻）

**本切片只接 probe 品牌级真标量（P4 `brand_sov` / P5 `brand_presence`）。GSC（P3）与 crawl（P1/P2）保持 finding 四态兜底不变。**

- **为何不含 GSC**：① per-keyword 精确聚合需持久化 finding 目标（schema + migration），而 migration 是本项目风险最高区（历史 veris.db 污染踩坑）；② 站级 GSC impressions 对「针对某关键词的建议」是粗聚合、有归因噪声，与「不作虚假因果」原则相悖；③ probe 品牌级指标本就是三源中最可辩护的一档。GSC 接入留作**独立后续切片**（先持久化 finding 目标，再按目标聚合）。
- **为何不含 crawl**：`crawl/affected_pages` 与 finding 四态高度冗余（四态已用 fingerprint 跨 run 做了「问题页是否消解」的同一件事），额外重算回报低。
- **outcome 恒 `inferred` 不变**：probe n=5 只是方向性样本；报告已明示「复合变更不归因单项」。真标量只是让方向判定更有据，claim 等级不升。

## 4. 组件设计

### 4.1 `lib/diagnosis/retest-metrics.ts`（新增，纯逻辑）

一轮 run 的可比标量来源与提取器，全部可单测、无 I/O：

```ts
import type { ValidationSpec } from './validation-spec'
import type { MetricPair, RetestSnapshotRow } from './retest-delta'
import type { ProbeSummary } from '@/lib/probes/summary'

// 一轮 run 的标量来源。V0 只含 probe；GSC/crawl 待 finding 目标持久化后扩展（预留位）。
export interface RunMetrics {
  probe: ProbeSummary | null
}

// 按 validation_spec 从一轮取标量；取不到（非 probe 源 / 无 probe / 未知 metric / 无本品牌 SoV）→ null。
export function extractRunMetric(spec: ValidationSpec, run: RunMetrics): number | null

// 两轮 → MetricPair；两侧都取到才算可比，任一 null → null（回退四态）。
export function buildMetricPair(spec: ValidationSpec, baseline: RunMetrics, retest: RunMetrics): MetricPair | null

// probe 品牌指标两轮对比 → 快照行（供报告 §8 展示「品牌 SoV 12%→18% +6」）。无 probe 侧则不产出该行。
export function buildProbeMetricRows(baseline: ProbeSummary | null, retest: ProbeSummary | null): RetestSnapshotRow[]
```

指标口径：
- `brand_sov` = `probe.sov.find(s => s.you)?.pct`（本品牌 SoV 百分比；无本品牌条目→null）。
- `brand_presence` = `probe.promptsTotal > 0 ? probe.promptsPresent / probe.promptsTotal : null`（品牌出现 prompt 占比，0–1）。

`buildMetricPair`/`extractRunMetric` 对 direction 无关——方向判定仍在 `computeOutcome` 内按 `spec.direction` 做（两指标默认 `increase`）。

### 4.2 回测执行器接线（`generate-findings.ts` `computeRetestDelta`）

编排改动（纯 I/O，逻辑委托纯模块）：
1. 为 baseline 与 retest **各构建一份 `RunMetrics`**：对每轮 `getRunPrompts` + `getRunProbeResults` → `aggregateProbeSummary(...)` → `{ probe }`。这三个 dep（`getRunPrompts`/`getRunProbeResults`/`aggregateProbeSummary`）已在 `GenerateFindingsDeps` 中（run-rules 步骤已用），**无需新增 dep**。
2. baseline 建议 outcome 循环里：`const pair = buildMetricPair(spec, baselineMetrics, retestMetrics); const outcome = computeOutcome(spec, pair, state)`。`computeOutcome` 已「有标量优先、无则四态兜底」，无需改其逻辑。
3. `retest_snapshots` 追加 probe 指标行：`rows = [...buildRetestSnapshotRows(summary, health), ...buildProbeMetricRows(baselineProbe, retestProbe)]`。

**边界与降级**：任一轮无 probe（未配 AI key / 未采集）→ `extractRunMetric` 返回 null → `buildMetricPair` 返回 null → outcome 自动回退四态；probe 行不产出。回测 delta 整体仍裹在既有 try/catch 内，失败不污染主诊断（reviewing 已落库）。

## 5. 数据流

```
retest run 完成 diagnose → computeRetestDelta(baselineRunId, retestRunId):
  ├ 四态 delta（不变）
  ├ 为两轮各 aggregateProbeSummary → RunMetrics{probe}
  ├ 每条 baseline 建议：buildMetricPair → computeOutcome(spec, pair, state) → setRecommendationOutcome
  │    P4/P5 有 probe → 用真标量；P3/P1/P2 或无 probe → 四态兜底
  ├ 健康分 delta（不变）
  └ retest_snapshots = 四态行 + 健康分行 + probe 指标行（brand_sov / brand_presence）
```

## 6. 测试

- `lib/diagnosis/retest-metrics.test.ts`（新）：
  - `extractRunMetric`：brand_sov 有本品牌→pct、无本品牌条目→null、brand_presence 比值、非 probe 源（gsc/crawl）→null、未知 metric→null、无 probe→null。
  - `buildMetricPair`：两侧有→pair、任一无→null。
  - `buildProbeMetricRows`：两轮 probe→两行（sov/presence，delta 带符号）、任一 null→空。
- `generate-findings` 回测测试（扩现有）：
  - P5 建议（probe/brand_presence）presence 上升 → outcome `effective`（走真标量，非四态）；下降 → `regressed`。
  - P3 建议（gsc/impressions）→ 仍四态兜底（pair 为 null）。
  - 无 probe 两轮 → 全部四态兜底、无 probe 快照行。
- 门槛：`npx tsc --noEmit` 0 / `npm run lint` 0 error / `npm test` 全绿（baseline 606）/ `npm run build` ✓。

## 7. 明确不做（本切片边界）

- **不加 schema 列 / 不做 migration**（这是选 probe-only 的核心理由）。
- **不接 GSC impressions / position 真标量**——依赖持久化 finding 目标，留独立后续切片。
- 不接 crawl/affected_pages 真标量（与四态冗余）。
- 不改 `computeOutcome` 判定逻辑、不改 `validation-spec.ts` 的 `PILLAR_DEFAULT`、不改探针协议（`PROBE_PARSER_VERSION`）。
- 不改回测触发/同协议约束（既有 buildPromptSetV2 确定性已保证同协议）。

## 8. 已知局限（写入实现后记忆）

1. probe n=5 方向性样本，outcome 恒 inferred；报告明示复合变更不归因单项。
2. brand_sov/brand_presence 为品牌级 → 同轮所有 P4 建议共享 brand_sov 信号、所有 P5 共享 brand_presence 信号（可接受：二者本就是品牌可见性杠杆，非按关键词）。
3. GSC/crawl 建议仍四态兜底——P3 关键词类建议的真 impressions 对比待「finding 目标持久化」切片。
4. 分引擎 SoV 未拆分（沿用 Phase D 局限，probe SoV 跨引擎合并）。
