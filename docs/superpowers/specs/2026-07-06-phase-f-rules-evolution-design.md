# Phase F 能力保鲜自动化 — 实现设计

> 上位方法论：`2026-07-03-diagnosis-v3-methodology-design.md` §8-F / §11。本文是 Phase F 的**落地实现设计**，不重述方法论，只钉「怎么建」。Phase A–E 已实现并提交（commit `f0bb701`，556 测试）。
>
> **决策状态（2026-07-06）**：以下 F1–F4 决策在用户离开期间按调研推荐代拍板，**均可推翻**，待用户复审本 spec 后确认。

## 0. 目标与判据

Phase F 让规则库**每月自动产出带一手来源的变更提案**，经人工审批后一键发版（changelog + 版本号），使平台能力（AI 爬虫 UA、富摘要弃用、CWV 阈值、DataForSEO 端点等）不与外部世界脱节。这是第四道人工闸门（与竞品候选、建议、报告摘要并列）。

**交付判据**：
1. 月度 cron 跑完，超期资产自动入队 `scheduled_research` 提案（携官方信源 URL）。
2. 规则库管理页能看提案队列 + approve/reject + 手动建提案 + 版本 changelog。
3. **打包发版**含 `update_artifact` 类提案后 `reference_artifacts` 自动更新、报告陈旧告警随之消除。
4. 建议 outcome / finding dismiss 统计聚合成提案的机制就位（单用户 V0 下多半休眠，随数据激活）。

## 1. 核心原则（继承铁律）

- **自动发现，人工放行**：自动化止步于「生成带一手来源的提案」；发布永远经人工审批。
- **提案无一手来源 URL 不入库**：`rule_change_proposals.evidence_refs` 非空才可创建（应用层校验，约束同「agent 不得造数字」）。
- **规则保持代码，Phase F 不自动改代码**：全自动改写规则会破坏「结论经人核」与「同协议回测可比」两条铁律。审批产出 changelog + 版本号；代码型变更（new_rule/modify_threshold/deprecate）作为**开发工单**由人跟进，发版时手动递增 `RULES_VERSION` 常量。仅 `update_artifact` 类（数据资产）在审批时**自动落地**到 `reference_artifacts`。
- **RULES_VERSION 单调递增不可变**：回滚 = 发布内容等同旧版的新版本，审计链完整。

## 2. F1 · 月度外部监测 cron（确定性巡检，零幻觉）

**决策**：采用**确定性巡检 + 到期入队**，不调 LLM、不抓网页正文。

现状无 web 搜索/研究基建（仅 SSRF 安全的 `safe-fetch` 用于抓页），serverless+BYOK 下 LLM 自主月度网研既脆弱又难保「不造来源」。因此 Phase F 的 cron 只做**确定性可核对**的事：

```
Inngest scheduled function: rules-evolution-scan
触发：{ cron: 'TZ=Asia/Shanghai 0 3 1 * *' }  // 每月 1 号 03:00
handler(step):
  1. artifacts = getReferenceArtifacts()
  2. fresh = checkArtifactFreshness(artifacts, now)   // 复用 Phase E 纯函数
  3. 对每个 fresh.stale 项：
       若不存在「同 target 的 pending scheduled_research 提案」（幂等去重）：
         createRuleChangeProposal({
           source: 'scheduled_research',
           changeType: 'update_artifact',
           target: artifact.artifactKey,
           evidenceRefs: [artifact.sourceUrl],   // 官方信源 URL = 一手来源，满足非空约束
           diff: { reason: '超 refresh_cadence_days 未校验', lastVerifiedAt, cadence },
           status: 'pending',
         })
  4. （F3）statsProposals = aggregateInternalStats()   // 见 §4
       逐条入队（幂等去重）
```

- **不需要 key**：纯 DB 巡检 + 已存的 `sourceUrl`。
- **幂等**：同一 target 已有 pending 提案则跳过，避免每月重复堆积。
- 实际「去官方文档核对 UA/阈值是否变」仍走 Phase E 的人工 runbook（`docs/runbooks/rules-refresh.md`）；cron 只负责**把「该查了」变成队列里的待办**。
- **不做**（记未来项）：LLM 自主抓取官方 changelog 正文并 diff 判定变更（成本/幻觉/serverless 超时风险）。信源清单本身随 RULES_VERSION 版本化，新增信源走手动提案。

## 3. F2 · 提案生命周期 + 版本发布 + changelog

**决策**：代码规则 + 版本登记/changelog（changelog 由已批提案派生，**无需新表**）。

### 3.1 提案状态机（两步：审批闸门 + 打包发版）

分两步以对齐 §11.3「提案批准 → 打包新 RULES_VERSION」——审批是逐条人工闸门，发版是把已批提案**打包**成一个新版本（一次发版可含多条提案）。

```
pending ──approve──▶ approved（reviewed_at 写入，released_in_rules_version 仍空 = 已批未发布）
        └─reject───▶ rejected（reviewed_at 写入）

approved（未发布）──release 打包──▶ released_in_rules_version 写入
```

- **approve**：`status=approved`、`reviewed_at=now`。仅过闸门，**不立即改任何数据/版本**。
- **reject**：`status=rejected`、`reviewed_at=now`。
- **release（打包发版）**：把当前所有「approved 且 released_in_rules_version 为空」的提案打包：
  - 生成新版本号 `<newVersion>`（由发版者在 UI 输入，或从已发布序列推导下一个，如 `rules_v2`）。
  - 对每条被打包提案写 `released_in_rules_version=<newVersion>`。
  - 其中 `change_type='update_artifact'` 且 target 命中 `reference_artifacts` 行 → **自动应用**：bump `version`、`last_verified_at=now`、按 `diff.payload`（若携带）更新 payload。数据资产立即生效、报告陈旧告警随之消除。
  - 其余类型（new_rule/modify_threshold/deprecate）→ 仅进 changelog，作为**开发工单**；不改代码、不改运行时行为。
  - 产出面向用户的 changelog 条目（见 §3.2）。

**⚠️ 待用户确认的关键子决策 —— 代码 `RULES_VERSION` 常量与发布版本的同步策略**：
`RULES_VERSION`（`lib/diagnosis/types.ts` 常量）是规则库版本的单一真源，也是 run 创建时打在 `runs.rules_version` 上的值（§5）。发版动作只写提案的 `released_in_rules_version` 标签、并应用数据资产变更，**不自动改代码常量**（代码常量由开发在部署时手动同步为同一版本号）。含代码型提案的发版尤其必须走部署同步；纯 `update_artifact` 发版数据即时生效，但为让新 run 打上新版本号、触发 §11.3 横幅，仍需一次常量同步部署。UI 在发版后显示「待部署：请将 RULES_VERSION 更新为 `<newVersion>` 并部署」提示。
> 备选（用户可选）：把「当前发布版本」也存为数据（settings 行/reference_artifact），run 打标时取数据版本，彻底免部署——但会让 RULES_VERSION 真源从代码移到数据，与「规则留代码」张力，故默认取代码真源 + 部署同步。

### 3.2 changelog（派生，无新表）

面向用户的 changelog = 查询 `status=approved` 的提案，按 `released_in_rules_version` 分组渲染。每行：变更类型 + target + 一手来源 URL（evidence_refs）+ 审批时间。例：
> **rules_v2**（2026-08-01）：`update_artifact · ai_crawler_ua_registry` — 依据各引擎官方 crawler 文档 [URL] 更新 UA 清单。

### 3.3 手动提案（§11.2 输入 3）

规则库管理页提供「手动建提案」表单：source=`manual`，必填 `change_type` + `target` + **≥1 个一手来源 URL**（evidence_refs 非空校验，前后端双校验）。用途：google-seo-expert skill 真源更新、新行业研究、用户反馈。

## 4. F3 · 内部效果统计自动入队（§11.2 输入 2）

**决策**：建机制，需给 `findings` 加 `rule_id` 列（现仅存 fingerprint 哈希，不可反解到规则）。单用户 V0 下样本稀疏、多半休眠，随多 run 数据累积激活（同 A02/A03 休眠规则先例）。

```
aggregateInternalStats():
  按 rule_id 聚合：
    dismissal 率 = dismissed findings / 该规则全部 findings
    ineffective 率 = ineffective recommendations / 该规则全部已判 outcome 的建议
  Wilson 下限小样本纪律：样本量 < N_MIN（默认 20）→ 不出提案（区间过宽无信号）
  dismissal 率 Wilson 下限 > 阈值(默认 0.5) → 提案 { source:'dismissal_stats', change_type:'modify_threshold', target:rule_id, diff:{signal:'high_dismiss_rate', ...} }
  ineffective 率 Wilson 下限 > 阈值(默认 0.6) → 提案 { source:'effectiveness_stats', change_type:'modify_threshold', target:rule_id, diff:{signal:'low_effectiveness', ...} }
  evidenceRefs：内部统计提案的「一手来源」= 聚合依据的 run/finding id 列表（数据来源可复核，满足非空约束）
```

- 这些提案同样进 pending 队列，人工审批后作为**开发工单**（调 impact 权重/阈值）。
- 复用 Phase C 已有的 Wilson 下限工具（探针小样本用过）。

## 5. F4 · 回测可比性收尾（§11.3，轻量）

**决策**：run 创建时记录 `RULES_VERSION`；跨版本 delta 显「规则库已升级」横幅。V0 只有 `rules_v1`，横幅暂不触发，但捕获版本号使未来发版即生效（前瞻、低成本）。

- `runs` 加 `rules_version` 列（创建时写入当前 `RULES_VERSION`）。
- 回测 delta（Phase E `retest-delta`）比对 baseline 与 retest 的 `rules_version`：不同则报告 §8 顶部显「规则库已从 X 升级到 Y，受影响规则的前后对比不可直接比较」横幅；未受影响规则照常四态对比（V0 粒度：整体横幅提示，不做逐规则受影响判定——记为后续细化）。

## 6. 数据模型增量

沿用 Phase A 一次性补齐的 `rule_change_proposals` / `reference_artifacts` 表（**无需改这两张表**）。新增两列（均 nullable，与 Phase E 加 `findings.pillar` 同构）：

```
findings 增列：rule_id（规则命中时写入；旧数据可空。用于 F3 按规则聚合 dismiss/effectiveness）
runs   增列：rules_version（创建时写入当前 RULES_VERSION；用于 §11.3 跨版本可比横幅）
```

约束保持：`rule_change_proposals.evidence_refs` 非空才可入库（应用层强校验）；`released_in_rules_version` 仅 approve 时写入。

## 7. 组件与文件边界

| 单元 | 文件 | 职责 |
|---|---|---|
| 提案纯逻辑 | `lib/diagnosis/rule-proposals.ts` (+test) | 版本号推导、update_artifact 应用计算、evidence 非空校验、changelog 分组——纯函数 |
| 内部统计聚合 | `lib/diagnosis/rule-stats.ts` (+test) | 按 rule_id 聚合 dismiss/ineffective + Wilson 下限 → 提案草稿，纯函数 |
| 演进 cron | `lib/inngest/rules-evolution.ts` (+test) | Inngest scheduled function：freshness 巡检 + stats 聚合 → 入队（DI 可测） |
| 仓库写入器 | `lib/repositories/index.ts`（集成者独占） | createRuleChangeProposal / getRuleChangeProposals / setProposalStatus（approve/reject）/ releaseApprovedProposals（打包写版本号 + 应用 update_artifact）/ getProposalsByVersion（changelog）/ 统计查询 |
| 审阅 UI | `app/[locale]/rules/page.tsx` + 组件 | 提案队列 + approve/reject + 打包发版 + 手动建 + changelog（全局作用域，非 per-project） |
| 审批/发版动作 | `app/api/rules/proposals/[id]/route.ts` + `app/api/rules/proposals/route.ts` + `app/api/rules/release/route.ts` | PATCH approve/reject、POST 手动建（evidence 非空校验）、POST 打包发版 |
| 契约穿线 | schema（findings.rule_id / runs.rules_version）、buildFindingRows 写 rule_id、run 创建写 rules_version | 集成者独占 |
| i18n | `messages/{en,zh}.json`（集成者 merge，agents 写 scratchpad） | `rules` 命名空间 |
| cron 注册 | `app/api/inngest/route.ts` | 加入 functions 数组 |

## 8. 编排（沿用 A–E 验证过的模式）

集成者先钉共享契约（纯逻辑 + schema 两列 + 仓库写入器 + i18n），再并行子 agent 落不相交文件集：
- **Agent 1**：`rule-proposals.ts` + `rule-stats.ts`（纯逻辑 + 测试）+ `rules-evolution.ts` cron。
- **Agent 2**：审阅 UI 页 + 审批/手动建 API 路由。
契约层（我）：schema 两列 + migration、buildFindingRows/run 创建穿线、repositories 写入器、i18n merge、cron 注册、§11.3 横幅接入报告页。

## 9. 明确不做（Phase F 边界）

- **不做 LLM 自主网研**（抓官方 changelog 正文 + LLM diff 判变更）：成本/幻觉/serverless 超时，记为未来大版本项。cron 只做确定性到期巡检。
- **不自动改写代码规则**：代码型提案（new_rule/modify_threshold/deprecate）仅产 changelog + 开发工单。
- **不做阈值全面数据化**：不把所有规则阈值迁到数据层（重构面大、与回测可比有张力）；仅 `update_artifact` 类数据资产自动生效。
- **不做逐规则受影响判定的跨版本 delta**：V0 只整体横幅提示；细化到「哪些规则受本次升级影响」记后续。
- **不做多租户提案权限**：单用户 V0，审批无角色控制。

## 10. 验证标准

tsc 0 错 / eslint 0 error / 全量 vitest 绿（含 rule-proposals / rule-stats / rules-evolution cron 新测试）/ next build 通过。cron 本地用 `npx inngest-cli dev` 可手动触发验证入队；无 key 亦可跑（纯 DB）。
