# SP-A2 #6 分引擎 SoV 拆分 + 确认竞品重解析 设计

> 「A 档」backlog 第 6 项（见 `2026-07-07-sp-a1-backend-backlog-batch-design.md` §开头）。大型：确认竞品的 mention 在探针期被**冻结**（只按探针期 `project.competitors` 名字解析），确认竞品的 SoV 因此系统性偏低（近乎 0）；需**对确认竞品集重解析原始回答** + **bump `PROBE_PARSER_VERSION`** + 扩 `ProbeSummary`（分引擎 SoV）+ 改 Q02 + UI。

## 背景与真源

- 上游：`2026-07-03-diagnosis-v3-methodology-design.md` §7.3（G05/G06 分引擎，引擎间引用重叠仅 ~11-13.7%、不可互推）；两段式诊断（探针先跑 → 人工确认竞品 → reevaluate）。
- 编码前必读 `veris-coding` skill。

## 问题

1. **冻结的竞品匹配**：`parseProbeAnswer`（探针期）用**当时的** `project.competitors` 算 `competitorsMentioned`，冻结进 `ai_probe_results`。但竞品候选由 DataForSEO 在探针**之后**发现、经人工确认才进入竞品集（`reevaluate-competitors.ts:190` union confirmedDomains）。`aggregateProbeSummary` 却仍读 `r.competitorsMentioned`（summary.ts:56）→ 确认竞品不在冻结列表里 → SoV=0。Q02 注释（competitors.ts:71）与描述已自认此局限。
2. **SoV 未分引擎**：`ProbeSummary.sov` 是跨引擎合并值。品牌可见度已有 `perEngine`，但竞品 SoV 无分引擎口径。§7.3 明确引擎不可互推，合并 SoV 有误导性。

原始回答文本一直存在（`run-probes.ts:173` evidence payload `answerText` + `rawText`），故可在聚合时对**当前竞品集**重解析，无需改动不可变原始证据。

## 设计：聚合时重解析 + 分引擎 SoV（旧证据回退，忠实优先）

### 1. 竞品匹配下沉为共享纯函数（`lib/probes/parse.ts`）

抽出 `export function competitorsInText(answerText: string, competitors: string[]): string[]`，复用既有 `mentions()`（拉丁词边界 / CJK 子串）。`parseProbeAnswer` 内部改用它（行为不变，纯重构）。

### 2. `aggregateProbeSummary` 重解析 + 分引擎（`lib/probes/summary.ts`）

- `ProbeSummaryInput.results` 加**可选** `answerText?: string`。
- 每结果的竞品集 `compsOf(r) = r.answerText != null ? competitorsInText(r.answerText, competitors) : r.competitorsMentioned`——带原文即忠实重解析（对确认竞品集），否则回退冻结值（历史/无原文调用方不回归）。
- 全站 `sov` 改用 `compsOf(r)`（品牌与情感口径不变——`brandPresent`/`sentiment` 与竞品集无关，仍用冻结值，故 `brand_sov` 回测口径不变、可比）。
- 新增**可选** `sovByEngine?: { engine; samples; sov: {name,pct,you}[] }[]`：按 `provider` 分桶，桶内同 `pctOf` 逻辑各算一份 SoV（品牌 + 各竞品）。引擎排序同 `perEngine`（present 降序、名字字典序）。可选=手构 `ProbeSummary` 的测试与其它消费者不改即通过。

### 3. 三处聚合调用方补 `answerText`

`generate-findings.ts` / `reevaluate-competitors.ts` / `app/[locale]/runs/[id]/page.tsx` 均已加载证据行；各建 `Map<evidenceId, answerText>`（`(e.payload as {answerText?}).answerText`），聚合时 `answerText: answerByEvidence.get(r.evidenceId)`。`reevaluate` 的竞品 union 改为并入**确认竞品名**（`c.name || c.domain`，优先可被答案文本匹配的品牌名，非纯域名），使确认竞品真正可被重解析命中，Q02 按 `s.name===c.name` 匹配到位。

### 4. Q02 消费分引擎（`lib/diagnosis/rules/competitors.ts`）

保留全站 SoV 作头条 `comparison`（单 finding、不炸裂成 N 条）；`detail` 增 `perEngine`：对 `probe.sovByEngine` 每引擎给出「本站 vs 各确认竞品」对比。描述去掉「分引擎拆分待后续」的自认局限、改为「已分引擎（引擎不可互推，分列）」。恒 `measured_sample`、方向性 n=5、不作硬指标断言。

### 5. `PROBE_PARSER_VERSION` v2 → v3（`lib/probes/parse.ts`）

聚合层竞品匹配语义变更（对确认竞品集重解析 + 分引擎），跨版回测不可比 → 升 v3、注释留痕。`brand_sov` 回测标量不受影响（品牌口径未变），但 SoV/竞品口径按协议须同版本方可前后比。不改 release 的 `RULES_VERSION` 常量流程（手动部署）。

## 测试（TDD）

- `summary.test.ts`：
  - 重解析：给 `answerText` 含确认竞品名（不在 `competitorsMentioned` 冻结列表）→ 该竞品 SoV>0（忠实）；无 `answerText` → 回退冻结值（**现有用例即回归守卫**）。
  - 分引擎：两 provider 各命中不同竞品 → `sovByEngine` 分列正确、samples 正确。
- `parse.test.ts`：`competitorsInText` 词边界 / CJK / 空集用例（从 `parseProbeAnswer` 现有断言平移/补充）。
- `competitors.test.ts`（Q02）：`sovByEngine` 存在 → `detail.perEngine` 分引擎对比；不存在 → 仅全站（回退）。
- `reevaluate-competitors.test.ts` / `generate-findings.test.ts`：补 `answerByEvidence` 接线断言（确认竞品经重解析进入 SoV）。
- 验收（全绿）：`npx tsc --noEmit` 0 / `pnpm lint` 0 / `pnpm test` / `pnpm build` ✓。

## 不做（YAGNI / 边界）

- 不重写竞品身份模型（name↔domain 归一沿用现状）；不做别名/同义词扩展匹配。
- Q02 不炸裂为「每引擎一条 finding」（保持单条 + detail 分引擎），避免噪声。
- 不回写/迁移历史 `ai_probe_results` 的 `competitorsMentioned`（原样保留；聚合按现集重解析）。
- 不动 `perEngine`（品牌可见度）既有结构、不动 `sentiment`。
- 不 bump `RULES_VERSION` 代码常量（手动部署）。
