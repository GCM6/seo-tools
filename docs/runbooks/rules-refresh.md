# Runbook：规则时效检查（手动巡检）

> 适用范围：Veris 诊断规则库依赖的**外部一手资产**（AI 爬虫 UA 名单、富摘要支持状态、Core Web Vitals 阈值、DataForSEO 端点、Schema.org 词表）。这些资产会随第三方官方变更而失效——本 runbook 是**人工**核对它们是否过期、并在过期时启动更新的标准流程。
>
> 呼应方法论 §11「规则进化：自动发现、人工放行」。**核心原则：宁可在报告里承认「规则库最后校验于 X，以下检查可能滞后」，也不假装最新**——与证据铁律（可验证优先）同构。

## 原则：自动发现、人工放行

- **自动发现**：系统按 `reference_artifacts.refresh_cadence_days` 计算每项资产的陈旧度（`checkArtifactFreshness`，见 `lib/diagnosis/reference-artifacts.ts`），超期即标记 `stale`。这一步是纯逻辑、可自动跑。
- **人工放行**：任何资产内容的实际更新（改 UA 名单、调阈值、换端点、更新词表）**必须经人工去一手信源核对后**，通过 `rule_change_proposals` 提案落地，再由人放行。系统绝不自动改规则内容——避免把第三方页面的噪声/误报直接灌进诊断。

## 陈旧告警如何出现在报告页

- `checkArtifactFreshness(rows, now)` 返回 `FreshnessReport`：
  - `stale[]`：超过各自 `refresh_cadence_days`（或从未校验）的资产，报告「方法与范围」板块逐项列出（含 `label` + `sourceUrl`）。
  - `oldestVerifiedAt`：全部资产里最早一次校验时间，报告顶部呈现「规则库最后校验于 {date}」。
- 因此，只要某项资产超期未在本 runbook 中被复核并更新 `last_verified_at`，用户在报告里就会看到明确的陈旧提示，而不是被误导为「最新」。

## 受管资产清单

清单真源是 `lib/diagnosis/reference-artifacts.ts` 的 `REFERENCE_ARTIFACT_SEEDS`；`db/seed.ts` 会把它们写入 `reference_artifacts` 表（`id = refart_<artifactKey>`，`last_verified_at` 初始化为 seed 当天）。

| artifactKey | 资产（label） | 一手信源 URL | 校验节奏 |
|---|---|---|---|
| `ai_crawler_ua_list` | AI 爬虫 User-Agent 清单（可达性/robots 检查依据） | https://darkvisitors.com/agents | 30 天 |
| `google_rich_result_status` | 富摘要类型支持状态（FAQ/HowTo 弃用等） | https://developers.google.com/search/blog | 90 天 |
| `core_web_vitals_thresholds` | Core Web Vitals 指标与阈值（INP 取代 FID 等） | https://web.dev/articles/vitals | 90 天 |
| `dataforseo_endpoints` | DataForSEO v3 端点与计费（v2 下线等） | https://docs.dataforseo.com/v3/ | 90 天 |
| `schema_org_vocab` | Schema.org 类型与属性词表 | https://schema.org/docs/releases.html | 180 天 |

> 若在此新增/调整资产，改 `REFERENCE_ARTIFACT_SEEDS` 即可（本表随之更新），并重跑 `npm run db:seed` 让新资产入库。

## 巡检步骤（每次触发）

触发时机：报告页出现陈旧告警、月度定期巡检（Phase F 自动化前手动）、或第三方发布已知变更时。逐项资产执行：

1. **去一手信源核对**：打开该资产的 `sourceUrl`，比对当前生效内容与规则库中已固化的内容（UA 名单条目、富摘要支持/弃用状态、CWV 指标与阈值、DataForSEO 端点与计费、Schema.org 类型/属性）。
2. **判定是否变更**：
   - **无变更**：仅更新该资产的 `reference_artifacts.last_verified_at = 今天`（表示「已核对，仍有效」），清除陈旧告警。
   - **有变更**：进入第 3 步，**不要**直接手改诊断规则代码。
3. **起 `rule_change_proposals` 提案**：把「信源变化 → 建议如何改规则/阈值/名单」写成提案（保留信源链接与变更摘要），走人工放行流程。放行后再改对应规则实现与资产 `payload`。
4. **更新 `last_verified_at`**：变更落地后，把该资产的 `reference_artifacts.last_verified_at` 更新为今天，并按需要提升 `version`（如 `v1 → v2`）。
5. **复核报告**：确认报告页「规则库最后校验于 X」与陈旧告警已按新状态刷新。

## 关联

- 逻辑：`lib/diagnosis/reference-artifacts.ts`（`REFERENCE_ARTIFACT_SEEDS` / `checkArtifactFreshness`）
- 落库：`db/seed.ts`（seed 时 upsert）、`lib/repositories`（`getReferenceArtifacts` / `upsertReferenceArtifact`）
- 提案：`rule_change_proposals` 表（人工放行的载体）
- 方法论：`docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §11
