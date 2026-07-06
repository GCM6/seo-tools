# Phase C 落地计划 — DataForSEO 接入 / 竞品识别 / 缺口 / 权威

日期：2026-07-06
真源：`docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §4(P3/P4/P5)、§5、§8(Phase C)、§7.4-4
前置：Phase A + Phase B(wiring) 已落地（工作区，未提交）。规则总数 38。
范围：严格 Phase C（Phase B 的 UI ——设置页/关键词 tab/avgRank—— 仍留后续单独做）。
约束：DataForSEO 是 BYOK/付费，环境无 key → 全部按「未配置优雅 no-op + mocked 单测」实现；口径同 PSI/GSC/probe。

## 交付判据（spec §8）
配 key 后自动出候选竞品、缺口词表与外链画像；确认竞品不阻塞主诊断流。无 key 时整块跳过、既有诊断不受影响。

---

## 0. 契约（集成者先钉，其余波次遵循）

### 0.1 EvidenceType（`lib/types.ts`）
`EvidenceType` 增：`dataforseo_serp | dataforseo_labs | dataforseo_backlinks`
（DB check 约束已含这些 + ua_probe/third_party_presence；本期只用前三种）。
`channels.ts` 的 `evidence_created.evidenceType` 同步增这三种。

### 0.2 DataForSEO 证据 payload（权威形状，provider 产出 = context 解析）
所有 payload 用 `kind` 判别；rank 用 rankAbsolute（1..N）。
```
type dataforseo_serp payload =
 | { kind:'seed_serp'; engine:'google'; locationCode:number; languageCode:string;
     results: { keyword:string; items:{ domain:string; url:string; rank:number; title:string; type:string }[] }[] }
 | { kind:'bing_index'; engine:'bing'; domain:string; totalCount:number|null; itemCount:number }   // G04
 | { kind:'brand_serp'; engine:'google'; brandQuery:string; hasKnowledgePanel:boolean;
     ownDomainPresent:boolean; items:{ domain:string; url:string; rank:number }[] }                // E02

type dataforseo_labs payload =
 | { kind:'keyword_data'; keywords:{ keyword:string; searchVolume:number|null; difficulty:number|null;
     cpc:number|null; intent:string|null }[] }                                                     // K03/K04/E03

type dataforseo_backlinks payload =
 | { kind:'summary'; target:string; referringDomains:number; backlinks:number; rank:number|null;
     anchors:{ anchor:string; count:number; dofollow:boolean }[];
     newLost:{ new:number; lost:number; windowDays:number }|null }                                 // A01/A02/A03（own + 每个确认竞品各一条）
```
证据分级：SERP/Labs/Backlinks 均 `L3`（第三方估算，claimType 上限 measured_sample）；brand_serp 里 GSC 品牌展示量另走 gsc L4（E03 组合）。

### 0.3 RuleContext 扩展（`lib/diagnosis/types.ts` + `context.ts`）
新增字段（context 从 evidence 解析；confirmedCompetitors/keywordGaps 由编排层传入）：
```
dataforseo: {
  configured: boolean                    // 有任一 dataforseo 证据即 true
  serpByKeyword: { keyword:string; items:{domain:string;url:string;rank:number}[]; evidenceId:string }[]
  keywordData:   { keyword:string; searchVolume:number|null; difficulty:number|null; cpc:number|null; intent:string|null; evidenceId:string }[]
  backlinks:     { target:string; referringDomains:number; backlinks:number; rank:number|null; anchors:{anchor:string;count:number;dofollow:boolean}[]; newLost:{new:number;lost:number;windowDays:number}|null; evidenceId:string }[]
  bingIndex:     { domain:string; totalCount:number|null; itemCount:number; evidenceId:string } | null
  brandSerp:     { brandQuery:string; hasKnowledgePanel:boolean; ownDomainPresent:boolean; items:{domain:string;url:string;rank:number}[]; evidenceId:string } | null
}
confirmedCompetitors: { domain:string; name:string }[]   // 编排层从 competitors 表(status=confirmed)加载；首轮为空
keywordGaps: { keyword:string; gapType:'missing'|'weak'|'winning'; ourPosition:number|null; opportunityScore:number|null; searchVolume:number|null; evidenceId:string }[]  // reeval 计算后传入；首轮为空
```
`buildRuleContext` 入参新增 `confirmedCompetitors?`、`keywordGaps?`（默认 []）。首轮（无确认竞品/无 gap）→ 依赖确认竞品的规则自然 no-op。

### 0.4 事件 / 编排
- 新事件 `veris/run.competitors.confirmed`（`{runId, projectId}`）。
- 新 Inngest 函数 `reevaluate-competitors`：load 证据+确认竞品→算 gap 落 keyword_gaps→buildRuleContext(含确认竞品+gap)→evaluateRules(全量)→按 fingerprint 过滤已存在 findings→只落新增 findings+recommendations；**不改 run 状态**（保持 reviewing）。
- collect-evidence：`isDataforseoConfigured()` 门控下采集 seed_serp→候选竞品 upsert(status=candidate)→labs→backlinks(own)→bing_index→brand_serp。种子词 = GSC top query ∪ 探针检索式（去品牌），上限 seedKeywordLimit。
- 需要新增 repo：`getRunFindings(runId)`（取 fingerprint 去重）；`getConfirmedCompetitors` 已存在。

### 0.5 模板（`templates.ts`，集成者补）
为 K03/K04/K05/K07、Q01/Q03、A01/A02/A03、G04、E02、E03 补 RecommendationTemplate（Q02/机会类无 fix 用 generic 兜底也可）。缺失项由 `genericTemplate(side)` 兜底，不阻塞。

---

## 1. 波次与文件归属（不相交，除集成者文件）

- **契约（集成者，串行先行）**：`lib/types.ts`、`lib/dataforseo/types.ts`、`lib/diagnosis/types.ts`、`lib/diagnosis/context.ts`、`lib/inngest/events.ts`、`lib/inngest/channels.ts`、`lib/diagnosis/templates.ts`。
- **Wave 1（agent）**：`lib/dataforseo/{client,serp,labs,backlinks,provider,index}.ts` + 各 `.test.ts`。只依赖 0.2 的结果型。
- **Wave 2（agent）**：`lib/diagnosis/{competitor-identify,keyword-gap}.ts` + `.test.ts`。纯函数，输入 = SERP 结果型 + 确认竞品。
- **Wave 3（agent）**：`lib/diagnosis/rules/{competitors,authority}.ts`（新）+ 扩 `keywords.ts`(K03-05/K07) + 改 `rules/index.ts`（加两组导入）。只依赖 0.3 的 RuleContext。
- **Wave 4（集成者，串行）**：`collect-evidence.ts`、新 `reevaluate-competitors.ts`、`generate-findings.ts`、`app/api/inngest/route.ts`、`lib/repositories/index.ts`(+getRunFindings)。
- **Wave 5（agent）**：`app/[locale]/runs/[id]/competitors/page.tsx` + `components/CompetitorCard.tsx` + server action + `components/Stepper.tsx` 子 tab + `messages/{en,zh}.json`。

## 2. 铁律自检（每波）
证据先于结论（每 finding 带 evidenceRefs，引擎已强制过滤空引用）；claim ≤ measured_sample（第三方估算）；LLM 不介入 Phase C（纯规则）；人在环——竞品 candidate→confirmed 人工闸门后才进 gap/对比；证据原样存 + hash。
验证门槛：每波 `tsc --noEmit` clean + `eslint` 0 error + 相关单测全绿；全部并入后跑全量 vitest + `next build`。

## 3. 已确认取舍（用户离开，按 spec 代拍板，可推翻）
1. 严格 Phase C，不含 Phase B UI 收尾。
2. DataForSEO v3 端点、basic auth（`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` env，V0 不做 key 存储 UI）。
3. 两段式：首轮不等竞品确认，出全部非竞品依赖 findings + 候选；确认后增量再评估并入当前 run。
4. Q02/G05/G06 竞品 SoV 比较复用既有 probe 聚合，reeval 时把确认竞品域并入 SoV 竞品集。
