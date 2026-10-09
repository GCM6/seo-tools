# 以问题为中心的闭环 · 子项目 1「问题台账」设计规格

> 日期：2026-10-09。分支：`feat/issue-centric-loop`。
> 前置分析：`docs/plans/2026-10-08-product-flow-closure-analysis.md`（现状、断点与证据）。
> 本规格并入原「子项目 B 检查台账」的数据部分（B 的拍板记录只存在于会话记忆中，本文把用到的结论写实）。
> 状态：设计已逐段与用户确认（10-08 ~ 10-09），待用户审阅本文后进入实施计划。

## 0. 背景与目标

现状以「单次诊断（run）」为中心：每次诊断重新生成一整套待确认建议，决定不跨次继承，回测结果只在报告折叠章节里，问题、建议、执行清单、报告四处重复且口径不一。真实数据（metadocu）：5 次诊断 63 条发现只对应 19 个问题，47 条建议停在待确认，0 条执行。

目标：让「问题」成为项目级、跨体检持续存在的对象，决定只做一次，体检后自动对账，状态可以被重复核验。

### 成功标准（用户确认）

1. 同一个问题在项目里只出现一次，带着它的历史。
2. 你的决定（纳入 / 暂不处理 / 误报 / 已执行）在下次体检时自动继承，不用重审。
3. 体检后能直接看到每个问题变成了什么（已修复 / 仍存在 / 未复查 / 新出现）。
4. 报告只有一份，结论与问题清单一致（子项目 3 验收）。

## 1. 已拍板的决定

| # | 决定 | 日期 |
|---|---|---|
| D1 | 产品终点两个都要：交付优化方案报告 + 跟踪执行与复查 | 10-08 |
| D2 | 先做代跑（你操作），数据模型给站主自助预留位置，本轮不做站主界面 | 10-08 |
| D3 | 「基线诊断」与「回测」合成一种「体检」：默认沿用项目当前检测协议；改了市场、品类、关键词或竞品才生成新协议 | 10-08 |
| D4 | 粒度：一条规则在一个范围内算一个问题（即现有问题指纹），受影响页面作为明细 | 10-08 |
| D5 | 人工把关：只有新出现的问题需要处理（纳入 / 暂不处理并写理由 / 误报并写理由），可「剩下的全部纳入」；决定跨次继承；报告与执行跟踪只收「已纳入」 | 10-08 |
| D6 | 方案 A：新增项目级问题表作为唯一来源，配变化记录 | 10-09 |
| D7 | 状态只看「规则还查不查得出」；指标变化（曝光、AI 召回率等）作为附加信息，标「推断」，不决定状态 | 10-09 |
| D8 | 解决方案卡：所有问题精确到页面 / 字段 / 现在的值 / 应改的值；「怎么改」先重写改页面、改代码类，写内容与站外类沿用现有模板并补「谁来改」「怎么验收」 | 10-09 |
| D9 | 规则库、知识库标为「待定」，本设计不纳入、不改动 | 10-08 |
| D10 | 判断与文字全部确定性生成，不引入大模型（沿用 10-04 决定） | 10-04 |

## 2. 范围与拆分

整体拆为 4 个子项目，在同一分支依次完成后一起合并到 main：

1. **问题台账（本规格）**：项目级问题、状态流转、决定继承、体检对账、检查台账、项目检测协议、发现明细、历史回填。只做数据与后端，不做界面。
2. **问题清单界面**：「问题」「建议」「执行清单」三页合一，项目页成为主入口，解决方案卡的展示。
3. **方案报告重做**：只留一份报告，从问题清单生成；检查台账在报告上的展示、健康分口径（原子项目 B 的展示部分）。`retired` 的问题在报告里写「检查口径已更新，此项不再适用」，不得写成「已修复」。
4. **导航收尾**：去掉重复入口，「从一个问题开始」的去留。

**本规格不做**：站主登录与自助界面；自动定时体检；规则库、知识库及规则效果统计的数据来源；任何界面改动；「怎么改」文字的重写（属于子项目 2 的内容工作，本规格只提供明细数据）。

## 3. 术语

| 词 | 含义 |
|---|---|
| 体检 | 一次完整检测（即现在的 run）。不再区分基线 / 回测 |
| 问题 | 一条规则在一个范围内的命中，由「项目 + 问题指纹」唯一确定 |
| 问题指纹 | 现有 `findings.fingerprint` = hash(规则编号 + 归一化范围) |
| 检测协议 | 体检用的「考题」：市场、品类、语言、项目手填竞品、品牌别名、目标关键词、已确认竞品、提问模板版本、探针引擎列表（计划阶段细化：按 `PromptSetInput` 实况补齐语言、手填竞品、别名） |
| 协议指纹 | 上述输入的哈希。指纹相同的两次体检，抽样指标才可比 |
| 抽样类规则 | 结论随检测协议变化的规则：必需数据源含 `ai_probe`、`confirmed_competitors`、`dataforseo:seed_serp` 或 `dataforseo:labs`（计划阶段细化：AI 概览数据源键实为 `aio`，且没有规则读取它；共 12 条规则，见 `lib/diagnosis/rules/rule-meta.ts`） |
| 检查台账 | 每次体检每条规则的检查结果：查出 / 没查出 / 没查（原因）/ 出错 |

## 4. 问题的状态与流转

### 4.1 三个维度

每个问题由三个独立维度描述，展示状态由它们推出：

- **决定**（人）：`pending` 待处理 / `included` 已纳入 / `deferred` 暂不处理 / `false_positive` 误报。
- **执行**（人）：未执行 / 已执行（时间、备注）。只有 `included` 才能执行。
- **检测**（系统，取最近一次体检）：`present` 查出 / `gone` 查过且没查出 / `unverified` 未能下结论。

### 4.2 展示状态（同一时间只有一个）

| 状态 | 代码 | 条件 | 可做的动作 |
|---|---|---|---|
| 待处理 | `pending` | 决定 = pending，检测 = present | 纳入 / 暂不处理 / 误报 / 剩下全部纳入 |
| 待执行 | `to_execute` | 已纳入、未执行、present | 生成执行提示词；标记已执行 |
| 已执行，待复查 | `executed_awaiting` | 已纳入、已执行，且执行之后尚无开始的体检 | 撤销执行 |
| 已修复 | `fixed` | 执行之后开始的体检里，该规则查过且未命中 | — |
| 改了没生效 | `not_effective` | 执行之后开始的体检里仍命中 | 再次标记已执行；改为暂不处理 |
| 自行消失 | `self_resolved` | 未执行（含待处理、待执行），体检查过且未命中 | — |
| 已排除 | `excluded` | 决定 = deferred 或 false_positive | 撤销 |
| 已关闭（不可比） | `retired` | 规则版本或检测协议变了，且新口径下未命中（见 4.4） | — |

### 4.3 提示标记（不改变状态，可叠加）

`new` 新出现 · `worse` 变严重 · `relapse` 复发 · `partial` 部分改善（受影响数下降）· `unverified` 未复查（附原因）· `protocol_changed` 协议已变 · `rule_changed` 规则已更新。

标记在每次对账时重新计算，只反映本次体检相对该问题上一次观测的变化；你的决定与执行动作不清除标记，下次对账时才刷新。

### 4.4 流转规则

1. **决定只做一次**：同一问题再出现，沿用上次决定。
2. **只认执行之后开始的体检**：体检 `startedAt` 晚于 `executedAt` 才能判 `fixed` / `not_effective`；执行晚于体检开始的，这次体检对它只更新检测值，状态保持 `executed_awaiting`。与 10-08 回测修复（`isRetestAttributable`）同口径。
3. **判 `gone` 的前提是这次真的查过**：检查台账记为「没查」或「出错」的规则，其问题检测 = `unverified`，状态不变，加 `unverified` 标记与原因。
4. **暂不处理的问题变严重 → 决定退回 `pending`**（加 `worse`）；误报不退回。
5. **已修复或自行消失的问题再次命中 → 加 `relapse`**：已纳入的回到 `to_execute`（执行记录清空，历史留在变化记录）；未纳入的回到 `pending`。
6. **抽样类规则换了协议**：问题上次被观测时的协议指纹 ≠ 本次，且本次未命中 → 状态 `retired`，标 `protocol_changed`，不算修复。本次命中 → 正常更新为 present（记录新协议指纹）。
7. **规则版本变了**：问题记录的规则版本 ≠ 本次台账中的规则版本，且本次未命中 → `retired`，标 `rule_changed`，不算修复。命中 → 正常更新并记录新版本。
8. `retired` 的问题若之后在新口径下再次命中，按新出现处理（决定沿用：已纳入的回到 `to_execute`）。
9. **排除优先**：决定为暂不处理或误报的问题，状态始终是 `excluded`（规则 4 的退回除外）；规则版本、协议变化或未复查只加标记，不改状态。
10. **部分改善**：仍命中但受影响数下降 → 状态按规则 2 判定（通常为 `not_effective`），加 `partial`，变化记录写「5 → 2」。
11. **变严重**：严重度上升 → 加 `worse`。

> 说明：规则 6、7 是对 10-09 第 1 段讨论的细化。讨论时写的是「状态不变，标不可比」，但那样问题会永远卡在旧口径里。改为「新口径下未命中即关闭为 `retired`」，同样不算修复，但能收尾。

### 4.5 指标信息（D7）

问题详情可附带指标对比（GSC 曝光、AI 召回率、AI 概览引用率），一律标「推断」，只在协议指纹相同时显示对比值，不参与状态判定。

## 5. 体检对账（每次体检完成后自动执行）

### 5.1 四步

1. **写检查台账**：每条规则一行。
   - 规则声明的必需数据源（`requiredSources`）本次不可用 → `not_checked`，原因类别 `data_gap`（界面给「去连接」）。
   - 规则自身门槛不满足（例：文章少于 3 篇）→ 规则显式返回「未检查」，类别 `site_condition`。
   - 工具暂不支持的检查 → `not_checked`，类别 `unsupported`。
   - 规则执行抛错 → `error`（引擎目前吞掉异常，需改为记录）。
   - 其余：有命中 `hit`，无命中 `clear`。命中但证据引用为空、被丢弃的，记 `error`。
2. **本次命中逐条对上问题表**：没有 → 新建（`pending` + `new`）；已有 → 更新严重度、受影响数、明细引用、最近出现的体检，按 4.4 转状态。
3. **问题表有、本次未命中的问题**：依次判断——台账没查 / 出错 → `unverified`；抽样类且协议变了 → 规则 6；规则版本变了 → 规则 7；否则 `gone`，再按决定与执行情况转为 `fixed` / `self_resolved` / 保持 `excluded`。
4. **写变化记录**：每个问题每次体检一行（查没查、命中否、严重度、受影响数、状态前后、标记）。

### 5.2 你需要处理的

体检后只需看三类：新出现的、从暂不处理退回待处理的、改了没生效的。首页待办列这三类数量（界面属于子项目 2/4，本规格提供查询）。

**关闭只告知、不进待办（10-09 用户确认）**：规则 6、7 由系统自动关闭（`retired`），不需要你确认。每次体检生成一份变化摘要（由变化记录汇总），单独列出本次关闭的数量与原因，例如「本次关闭 3 条：考题已换 2 条，规则已更新 1 条」；其中曾经「已纳入」或「已执行」的问题要逐条列出，因为你可能已向站主承诺过。本规格提供摘要查询，展示属于子项目 2。

### 5.3 体检的启动（统一入口）

- 新增服务端函数「发起体检」，现有 `POST /api/runs`、`/runs/[id]/retest`、分析会话的建诊断逻辑都改为调用它（界面文案的统一在子项目 4）。
- 计算项目当前输入的协议指纹：
  - 与最近一次完成体检的协议指纹相同 → 沿用该协议起点体检的提问集与 AI 概览关键词，`runType = 'retest'`，`baselineRunId` = 协议起点；
  - 不同或没有历史 → 新协议，`runType = 'baseline'`，自身为起点。
- 同一项目同时只允许一次进行中的体检（沿用现有 409）。

### 5.4 顺带修复

1. **竞品类规则从不运行**：主诊断构造规则上下文时传入已确认竞品（`competitors.status = 'confirmed'`），竞品纳入协议指纹。
2. **复查提醒**：`projects.nextRetestDueAt` = 状态为 `executed_awaiting` 的问题中最早执行时间 + 28 天；在决定、执行、撤销、对账后重算；没有待复查问题时置空。
3. **失败处理**：体检整体失败不对账；部分数据源失败只影响依赖它的规则（台账 `not_checked` / `data_gap`）。
4. **旧回测对比停用**：`computeRetestDelta` 与 `retest_snapshots` 的写入由对账取代；旧快照保留供历史报告读取，报告章节由子项目 3 重做。

## 6. 数据表与迁移

### 6.1 新表 `issues`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | text pk | `iss_<uuid>` |
| `project_id` | text not null | → projects，ON DELETE CASCADE |
| `fingerprint` | text not null | 问题指纹 |
| `rule_id` | text not null | |
| `rule_version` | integer not null | 最近一次观测时的规则版本 |
| `pillar` / `side` / `title` | text | 取最近一次发现 |
| `severity` | text not null | `high` / `mid` / `ok` |
| `affected_count` | integer | 最近一次受影响数 |
| `latest_finding_id` | text | → findings，ON DELETE SET NULL |
| `decision` | text not null default `pending` | CHECK in (`pending`,`included`,`deferred`,`false_positive`) |
| `decision_reason` | text | |
| `decided_at` / `decided_by` | text | `decided_by` CHECK in (`operator`,`owner`)，现在只写 `operator` |
| `executed_at` / `executed_note` / `executed_by` | text | `executed_by` 同上 |
| `detection` | text not null | CHECK in (`present`,`gone`)。计划阶段细化：「未复查」用 `flags` 的 `unverified` + `unverified_reason` 表达，对账时检测值与检查时间都不动，从而满足 4.4-3「状态不变」 |
| `status` | text not null | CHECK in 4.2 的 8 个代码；由对账与动作统一重算后写入，便于筛选 |
| `flags` | text json not null default `[]` | 4.3 的标记 |
| `unverified_reason` | text | `data_gap` / `site_condition` / `unsupported` / `error` / `history_no_ledger` |
| `protocol_hash` | text | 最近一次观测时的协议指纹 |
| `first_seen_run_id` / `last_seen_run_id` / `last_checked_run_id` | text | → runs，ON DELETE SET NULL |
| `last_checked_at` | text | 计划阶段细化：最近一次真正查过本问题的体检的开始时间，推导「执行之后开始的体检」用 |
| `retired_reason` | text | 计划阶段细化：`protocol_changed` / `rule_changed`，非空即已关闭 |
| `created_at` / `updated_at` | text | |

约束：UNIQUE(`project_id`,`fingerprint`)；CHECK(`decision` in (`deferred`,`false_positive`) → `decision_reason` 非空)；CHECK(`executed_at` 非空 → `decision` = `included`)。

### 6.2 新表 `issue_events`（只追加）

`id`（`iev_`）、`issue_id`（→ issues，CASCADE）、`run_id`（→ runs，SET NULL）、`kind` CHECK in (`observed`,`decision`,`execution`)、`checked`、`hit`、`severity`、`affected_count`、`from_status`、`to_status`、`flags`、`note`、`actor` CHECK in (`system`,`operator`,`owner`)、`created_at`。仓储层只提供插入，不提供更新与删除。

### 6.3 新表 `check_results`

`id`（`chk_`）、`run_id`（→ runs，CASCADE）、`rule_id`、`rule_version`、`outcome` CHECK in (`hit`,`clear`,`not_checked`,`error`)、`reason_kind` CHECK in (`data_gap`,`site_condition`,`unsupported`,`error`) 可空、`reason`、`hit_count`。UNIQUE(`run_id`,`rule_id`)；CHECK(`outcome` = `not_checked` → `reason_kind` 非空)。

### 6.4 改动的现有表与代码

| 对象 | 改动 |
|---|---|
| `findings` | 加 `detail`（json，可空）：`{ scale: { affected, total? }, rows: [{ url, field, current, expected }]（≤20）, truncated }`。集中整理函数从规则命中生成，不改规则本身的判定。计划阶段细化：规则没给的值为 null（关键词、平台类没有页面；多数规则没给「应该」）；87 条规则中 70 条有明细、17 条（站级 / 抽样 / 对比类）没有。补齐「现在 / 应该」需要改规则的 detail 产出，归子项目 2 |
| `runs` | 加 `protocol_hash`（text，可空）。`run_type` 约束不改，含义改为「新协议 / 沿用协议」；`baseline_run_id` 指协议起点 |
| `generated_prompts` | 加 `issue_id`（→ issues，CASCADE）。生成条件改为 `issues.decision = 'included'`（`validators.ts` 新增断言）；旧记录的 `recommendation_id` 保留。计划阶段细化：本子项目写入 `issue_id` 并新增断言；旧界面仍按建议状态把关，由桥接保证「建议已接受」与「问题已纳入」同步，闸门整体切换在子项目 2 |
| `recommendations` | 保留为每次体检的「怎么改」文字快照；`status` / `applied_at` / `outcome` 不再作为依据，旧数据保留 |
| `findings.status`（dismissed） | 由 `issues.decision = 'false_positive'` 取代，旧数据保留 |
| 规则定义 `Rule` | 加 `version: number`（默认 1）；之后改哪条规则只升那一条 |
| `lib/inngest/generate-findings.ts` | 写入发现后：写检查台账 → 对账（新 step `reconcile-issues`）；移除 `compute-retest-delta` step |

### 6.5 迁移与回填

1. 迁移 `0019`：建三张新表，给 `findings`、`runs`、`generated_prompts` 加列。drizzle-kit 生成外键列时会丢 `ON DELETE`，生成后人工核对 SQL，并用真库删除父行的测试验证。
2. 回填脚本（可重复执行）：按 `coalesce(started_at, finished_at)` 顺序对每个项目的历史体检重放对账。
   - 旧体检没有台账：未命中的问题一律 `unverified`（`history_no_ledger`），不判 `fixed`。
   - 决定迁移：取时间上最近的明确决定。建议 `accepted` / `edited` → `included`；`rejected` → `deferred`（理由「历史数据：否决时未记录理由」）；发现 `dismissed` → `false_positive`（理由取 `dismiss_reason`）；`draft` 不算决定。`applied_at` → 执行时间（仅当决定为 `included`）。
   - 旧体检的 `protocol_hash` 留空，抽样类问题不做协议比较。
3. 执行顺序：数据库副本演练 → 校验 → 备份正式库 → 正式执行。只用 libsql 执行，不用 sqlite3 命令行。线上库如已部署需同样执行迁移与回填。

## 7. 模块划分

| 单元 | 位置 | 职责 | 依赖 |
|---|---|---|---|
| 状态推导 | `lib/issues/status.ts` | 由决定 / 执行 / 检测 / 时间推出展示状态与标记（纯函数） | 无 |
| 对账 | `lib/issues/reconcile.ts` | 输入问题现状 + 本次命中 + 台账 + 协议与规则版本 + 体检开始时间，输出问题 upsert 与变化记录（纯函数） | status |
| 检查台账 | `lib/diagnosis/check-ledger.ts` | 由规则声明与上下文生成台账（纯函数），引擎改为报告出错 | 规则注册表 |
| 发现明细 | `lib/diagnosis/finding-detail.ts` | 规则命中 → `detail` 统一形状 | 无 |
| 协议指纹 | `lib/runs/protocol.ts` | 输入 → 指纹；判断沿用或新建 | 无 |
| 发起体检 | `lib/runs/start-checkup.ts` | 统一入口：闸门、协议、建 run、派发事件 | protocol、repositories |
| 决定与执行 | `lib/issues/actions.ts` + 仓储函数 | 纳入 / 暂不处理 / 误报 / 全部纳入 / 执行 / 撤销，写变化记录、重算状态与复查提醒 | status |
| 回填 | `scripts/backfill-issues.ts` | 历史重放 | reconcile |

## 8. 测试与验收

### 8.1 自动测试（TDD）

1. `reconcile` 表格式测试：4.4 每条规则至少一例（新出现、复发、已修复、执行晚于体检开始不算、自行消失、三类未复查、协议已变、规则已更新、暂不处理变严重退回、误报不退回、部分改善、变严重），外加对称三类：只在问题表、只在本次、两边都有但值不同。
2. 检查台账：缺数据源、网站条件、暂不支持、出错各一例；空上下文测试；逐个剔除数据源测试；证据引用为空被丢弃的命中记 `error`。
3. 数据库层用真实 libsql 临时库：唯一约束、理由必填、只有纳入能执行、删项目级联、删体检时台账级联与变化记录置空。
4. 夹具来自真实生产函数输出或真实库导出的发现，不手写理想数据。
5. 发起体检：协议相同沿用提问集；改品类 / 关键词 / 竞品 / 引擎后新建协议。

### 8.2 回填验收（副本上）

- 跑两遍结果一致。
- metadocu：问题数 = 19（指纹去重数）；6 个问题各有 5 条观测记录；7 月接受过的 15 条对应问题为 `included`；历史未命中全部为 `unverified`，无 `fixed`。

### 8.3 真实体检验收（实跑前另行确认费用，约每轮 $0.8–8）

1. 第 1 轮：对账生成，台账完整。
2. 第 2 轮：事先标记一个问题已执行，并断开一个数据源 → 依赖它的问题 `unverified` 而非 `fixed`；做过决定的问题不再出现在待处理；两轮协议指纹相同。
3. 第 3 轮（可选）：改品类后再跑 → 抽样类问题未命中时为 `retired` + `protocol_changed`，抓取类照常比较。

### 8.4 交付物

问题清单文档（每个问题的当前状态与完整经过），供用户对照核验；全量测试、类型检查、lint、构建通过（高负载下核对测试文件数，重跑全绿才算过）。

## 9. 风险与未决

1. **问题指纹的稳定性**：规则改了范围归一化方式会让同一问题换指纹。由规则版本号兜底（规则 7 关闭旧问题、新指纹按新出现处理），但旧问题上的决定不会自动转到新指纹上。若频繁发生，后续可加「规则迁移映射」。
2. **规则版本号靠人工维护**：改规则忘记升版本，会把规则改动误判为网站变化。实施计划里加一条检查：规则文件有改动而版本号未变时测试失败（实现方式在计划阶段定）。
3. **单用户假设**：`decided_by` / `executed_by` 只预留了取值，没有权限模型；站主自助上线前需另行设计。
4. **报告与界面的过渡期**：子项目 1 完成后、子项目 2/3 完成前，旧报告的回测章节不再有新数据。4 个子项目在分支上完成后一起合并，线上不受影响。
5. **规则效果统计暂无数据来源**：属于规则库「待定」范围，本设计不处理。
6. **范围级复查**：多范围规则（按页 / 按模板）在本次只复查到部分页面时（单页深检失败被跳过、模板代表页每次可能不同、抓取 partial 也算可用），没复查到的范围仍会被判「没了」；修法是按明细页集合判断复查覆盖，未覆盖记「未复查」。在 §8.3 第 2 轮验收之前需处理或明确告知。
