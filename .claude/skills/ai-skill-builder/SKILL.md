---
name: ai-skill-builder
description: 通用 Skill 治理元技能。用于盘点、修复、扩充和重构任意 skill 的规范体系，治理 skill 间的真源边界、迁移与引用一致性；处理跨 skill 的规范冲突、术语漂移、模板与触发规则冲突，支持 reference_rules 路由规则生成、reference_rules.source.md 维护与自定义路由规则固化，推动统一真源、规范去重、skill 迁移与复用一致性。不限领域（后端/前端/全栈/工具），由被治理对象的 .meta/GOVERNANCE_PROFILE.md 声明 archetype。
---

# 通用 Skill 治理元技能 (Skill Builder)

**唯一职责**：构建、审查和完善任意 skill 的规范集合，治理 skill 间的引用一致性与真源归属，确保 skill 体系覆盖目标领域全生命周期。

**治理范围**：

- 维护被治理 skill 的 references / templates / workflow / catalog / scripts。
- 盘点多个 skill 间是否存在重复规范（同一概念被多次定义、第二套规则体系）。
- 治理 skill 间的真源边界：每一条规范必须有且仅有一个权威来源文件，其他 skill 只能引用或保留场景补充。
- 判断重复文档应当”直接删除 / 改为引用真源 / 保留为场景补充 / 演进为独立真源”。
- 处理 skill 迁移时的索引、触发规则、模板、脚手架与校验脚本联动更新。
- **不限领域**：后端、前端、全栈、工具类 skill 均可治理。被治理对象的领域特征通过其 `.meta/GOVERNANCE_PROFILE.md` 的 `archetype` 声明。

**真源边界**：

- 每个 skill 通过 `.meta/GOVERNANCE_PROFILE.md` 声明自己的 archetype（如 `backend-source` / `frontend-specialist` / `fullstack-orchestrator` / `lightweight-routing`）。
- 若多个 skill 出现同一规范的重复定义，优先确定一个权威来源（通常是 archetype 为 `*-source` 的 skill），其他 skill 改为引用。
- 治理下游 skill 时，默认遵循”真源规范优先”：目标真源、运行时现状、legacy 链路、兼容聚合输入必须分层表达；现状只作补充说明，不得反写真源。
- 涉及 legacy 路由、旧 helper、mock 切真实、双轨资产或兼容聚合输入收口时，默认遵循”渐进式收口优先”：优先双轨兼容、灰度切流与明确退出条件，而不是无迁移方案的大爆炸切换。
- builder 自身不持有任何领域的业务规范真源，只持有治理规则、模板与审计方法。

**触发关键词**：完善 skill 规范、skill 治理、规范去重、真源统一、跨 skill 治理、skill 迁移、skill 构建、skill 重构、完善后端规范、维护 `ai-backend-expert`、维护 `ai-api-handoff-bridge`、维护 `ai-admin-frontend-expert`、迁移旧全栈编排层、删除重复 reference、触发规则治理、`reference_rules.json`、`reference_rules.source.md`、路由规则生成、reference 规则生成、规则源转 json、自定义路由规则、固化触发规则、selector 规则维护、md 规则源、生成 references 路由、通用 skill builder。

**启动加载**：

- 每次必读：`QUICK_REFERENCE.md` + `SKILL.md` + `.meta/GLOBAL_CHECKLIST.md`
- **新增或审查被治理对象的 `modes/*.md` 时：必读 `references/mode-design-patterns.md`（Mode 设计通用规范真源）**
- 若当前任务是 builder 自检、交接或 Closing Audit：补读 `scripts/README.md`，先确认默认链路、`--refresh-generated` 用法与 `core_skill_script_snapshot.previous.json` 生命周期
- 若仓库根目录存在 `AGENTS.md` 且其中声明了 skill / route / profile 读取原则：先按其全局原则执行；但 `AGENTS.md` 只负责声明”先读哪里、不要猜什么”，不承载 target-specific 脚本清单
- 若被治理对象存在 `.meta/GOVERNANCE_PROFILE.md`：在读取 `CATALOG / ISSUES / REVIEW` 前优先加载，先确认 `archetype`、正文真源入口、默认脚本族、启动期脚本摘要、强制联动文件、关键脚本配置资产入口与允许例外
- 若被治理对象存在 `.meta/CHECKLIST.md`：在读取 `CATALOG / ISSUES / REVIEW` 前同步加载，确认该 skill 的专属真源口径、局部联动与交付闭环要求
- 新增或修改被治理对象的 `references/` / `templates/` 时：补读 `REFERENCE_WRITING.md`
- 新增或修改被治理对象的 `scripts/*.py` / `scripts/config/*.json` / `reference_rules.json` 时：补读 `SCRIPT_TEMPLATES.md`
- 封板前：执行 `Closing Audit`

**建议使用顺序**：先 `Init` 掌握全景，再按 `Scan / Fix / Add / Deduplicate / Update` 推进，最后执行 `Closing Audit` 封板；若本轮重点是 builder 自检链本身，先读 `scripts/README.md` 再跑推荐日常链路。

**路径归属声明**：

- builder 自身保留 4 个主入口文件：`SKILL.md`、`QUICK_REFERENCE.md`、`REFERENCE_WRITING.md`、`SCRIPT_TEMPLATES.md`，1 个 Mode 设计规范真源：`references/mode-design-patterns.md`，1 个全局检查清单真源：`.meta/GLOBAL_CHECKLIST.md`，并提供 `GOVERNANCE_PROFILE_TEMPLATE.md`、`TARGET_CHECKLIST_TEMPLATE.md`、`DEBUG_OUTPUT_TEMPLATE.md`、`SKILL_TEMPLATE.md`、`templates/mode-design.md` 作为目标 skill 的治理与创建模板，以及 `scripts/` 下的治理审计工具层。
- 本文中出现的 `modes/*.md`、可选 `WORKFLOW_STEPS.md`、`references/*`、`templates/*`、`scripts/*`、`scripts/config/*.json`，以及目标 skill 的 `.meta/*`，默认都指向被治理对象，而不是 builder 自身目录；其中 `.meta/GOVERNANCE_PROFILE.md` 负责沉淀治理配置、联动关系、启动期脚本摘要与例外项，`.meta/CHECKLIST.md` 负责沉淀该 skill 的专属红线与局部闭环。
- 若文档或脚本中出现 `skill://{path}`，统一按仓库根目录下的 `skills/{path}` 解析；对 LLM 来说，它表示”可继续读取的本地 skill 资源路径”，不是普通展示字符串。
- 若仓库根目录存在 `AGENTS.md`，它只应保留跨 skill 通用的路由与读取原则，例如”命中 skill 后先读 `.meta/GOVERNANCE_PROFILE.md`”；具体脚本名、默认脚本族、`N/A` 能力与切换边界仍以下沉到 target `.meta/GOVERNANCE_PROFILE.md` 为准。
- builder 不复制同构资产，只负责治理规则、审计方法、模板与收口边界。

**被治理对象参考结构**（以 archetype = `backend-source` 为例，不同 archetype 的 references/ 子目录不同）：

```
<target-skill>/
├── SKILL.md              ← 分类引擎 + 共享规则（场景专属步骤迁入 modes/，不设死线；768 行可接受）
├── QUICK_REFERENCE.md    ← 可选：核心红线速查（短版启动卡）
├── modes/*.md            ← 新架构：按任务模式拆分的执行流程
├── WORKFLOW_STEPS.md     ← 旧架构：聚合式执行细则（若已迁移到 modes，可不存在）
├── scripts/              ← 可执行路由与门禁：reference 选择 / 文档反查 / strict gate
├── .meta/
│   ├── GOVERNANCE_PROFILE.md ← 治理配置层：archetype / 真源入口 / 脚本族 / 启动期脚本摘要 / 联动 / 例外 / 脚本配置资产
│   ├── CHECKLIST.md      ← target 专属清单：本地真源口径 / 局部联动 / 交付闭环
│   ├── CATALOG.md        ← 文件索引与覆盖图
│   ├── REVIEW.md         ← 扫描报告
│   ├── ISSUES.md         ← 问题清单
│   └── MIGRATION.md      ← 迁移进度看板
├── scripts/config/        ← 脚本配置资产：allowlist / exemption / 允许缺省项 / 轻量脚本配置
└── references/
    ├── reference-index.md ← references 完整索引（人类可读）
    ├── trigger-matrix.md  ← references 快速触发矩阵
    └── ...                ← 领域-specific 子目录（由 archetype 决定，如 backend 的 arch/api/data/quality，前端的设计系统/组件/状态管理等）
```

## 可执行脚本

- `scripts/run_generate_core_skill_snapshot.py`
  用途：刷新已注册核心 skill 的 machine-generated 脚本能力快照与报告。
  典型时机：修改任一核心 skill 的 `.meta/GOVERNANCE_PROFILE.md`、`scripts/*.py`、`reference_rules.json`，或调整 builder 对其能力归类口径后。
- `scripts/validate_core_skill_snapshot_drift.py`
  用途：校验 `SCRIPT_TEMPLATES.md §3.2` 是否与最新快照一致。
  典型时机：刷新核心 skill 快照后、封板前、批量调整 builder 文档表述后。
- `scripts/validate_builder_archetype_consistency.py`
  用途：校验 `skill_script_utils.py`、`SCRIPT_TEMPLATES.md`、`GOVERNANCE_PROFILE_TEMPLATE.md` 的 archetype 定义是否一致。
  典型时机：新增 archetype、调整 archetype 命名、修改脚本族矩阵或治理模板后。
- `scripts/validate_builder_entrypoints.py`
  用途：校验 builder 的 `SKILL.md` / `QUICK_REFERENCE.md` 是否仍正确暴露日常命令链与关键入口。
  典型时机：修改 builder 入口文档、速查卡、脚本入口说明后。
- `scripts/README.md`
  用途：提供 builder 自检链的短 runbook，集中说明默认链路、`--refresh-generated` 用法与 `core_skill_script_snapshot.previous.json` 生命周期。
  典型时机：接手 builder 治理工作、准备执行 Closing Audit、需要解释何时允许重置基线时。
- `scripts/run_script_template_audit.py`
  用途：串联 builder 自身的脚本契约、快照漂移、archetype 一致性与入口文档检查，并可带 smoke。
  典型时机：Closing Audit 前，或集中治理 builder 脚本族后。
- 推荐日常链路：先读 `scripts/README.md`，再执行 `run_generate_core_skill_snapshot.py` -> `validate_core_skill_snapshot_drift.py` -> `validate_builder_archetype_consistency.py` -> `validate_builder_entrypoints.py` -> `run_script_template_audit.py --skill-root skills/backend/ai-skill-builder --archetype builder-audit --refresh-generated --strict --with-smoke`

---

## Debug 模式

本 skill 只有**一个调试档位**——最详细档位。开启后，每个原子步骤强制打印思考过程和结论。

### 级别

| 值 | 触发词 | 行为 |
|----|--------|------|
| `off`（默认） | — | 正常模式，不输出中间过程 |
| `on` | `debug` / `调试` / `显示过程` / `verbose` / `debug-verbose` / `详细调试` / `显示所有变量` | 加载 `.meta/debug-output.md`，**每个步骤独立输出**思考过程（自然语言三段式：为什么做 → 看到了什么 → 结论） |

> 不走分级。只要命中 debug 关键词，就按最详细档位执行。

### 加载规则

- IF debug = on THEN 立即加载 `.meta/debug-output.md`
- IF debug = off THEN 不加载，不输出调试摘要

### 强制要求

- 启动时必须先输出**思维链启动验证**（格式见 `.meta/debug-output.md` §思维链启动验证）
- 每个操作中的**每个编号步骤**必须独立输出思考链，不得合并/跳过/事后补
- 每次工具调用（Bash/Read/Edit/Write/grep）前必须先输出意图声明（格式见 `.meta/debug-output.md` §意图声明），再执行命令。禁止先执行后补声明。
- 每个阶段结束时自问**防偷懒检查**（格式见 `.meta/debug-output.md` §防偷懒检查）

BLOCKERS:
- NEVER 在 debug = on 时先执行工具调用再补意图声明 — 声明必须在命令之前输出。

---

## 0. 启动清单

0. **判定 debug**：解析用户指令中的 debug 关键词 → IF 命中任一 debug 关键词 THEN debug = on，立即加载 `.meta/debug-output.md` 并输出思维链启动验证。
1. 先读 `.meta/GLOBAL_CHECKLIST.md`，对 builder 全局治理红线逐条排雷。
2. 若仓库根目录存在 `AGENTS.md` 且其中声明了 skill 读取顺序，先遵守其全局路由原则；若它要求先读 `.meta/GOVERNANCE_PROFILE.md`，不得绕过。
3. 若被治理对象存在 `.meta/GOVERNANCE_PROFILE.md`，优先读取，先确认它的 `archetype`、正文真源入口、默认脚本族、启动期脚本摘要、关键脚本配置资产入口与允许例外。
4. 若被治理对象存在 `.meta/CHECKLIST.md`，继续读取，确认该 skill 的专属真源口径、局部联动与交付闭环。
5. 再按本文件选择动作：`Scan / Fix / Add / Deduplicate / Update`。
6. 涉及新增或修改被治理对象的 `references/` / `templates/` 时，强制加载 `REFERENCE_WRITING.md`。
7. 涉及新增或修改被治理对象的 `scripts/*.py` / `scripts/config/*.json` / `reference_rules.json` 时，强制加载 `SCRIPT_TEMPLATES.md`。
8. IF debug = on THEN 启动清单每个步骤输出思考链（格式见 `.meta/debug-output.md` §启动清单）。

## 1. 治理检查清单

**每次新增或修改规范文件，必须逐条排雷。**

详见 builder `.meta/GLOBAL_CHECKLIST.md`；若被治理对象维护 `.meta/CHECKLIST.md`，也必须同步对照。

---

## 2. 强制工作流

### 2.0 Scan — 全量健康扫描

> 触发词：「扫描」「重新审查」「全量检查」
>
> IF debug = on THEN 扫描的 15 个步骤每个独立输出思考链 + 扫描完成后输出防偷懒检查（格式见 `.meta/debug-output.md` §Scan + §防偷懒检查）。

1. 逐一加载所有 references 文件
2. 用 `rg` / `Get-Content` / 等价只读查看工具抽查实际代码，与文档示例比对
3. 对照 builder `.meta/GLOBAL_CHECKLIST.md` 与 target `.meta/CHECKLIST.md`（若存在）逐条排雷
4. 套用**扫描评估维度表**，按 🔴/🟠/🟡 归类
5. 若被治理对象维护 `.meta/CATALOG.md`，核查其中的 SDLC 覆盖完整性；若当前仅有 `.meta/GOVERNANCE_PROFILE.md`，先确认 profile 是否已说明治理入口与缺失资产
6. **error 处理链专项扫描**：`rg` 所有 reference 代码示例中的 `_ =`、`_, _ :=`、未接收 error 返回值
7. **跨 skill 规范重复扫描**：盘点 `skills/**` 中是否有同一概念被多处定义、多套规则体系并存，识别”可删 / 改引用 / 保留补充 / 独立拆分”
8. **声明执行化扫描**：核查索引、触发矩阵、脚本路由、回归用例是否一致；文档里写明的切换规则、强制联动 ref、升档规则必须能在脚本输出中体现
9. **迁移残留扫描**：文件重命名、reference 拆分、skill 独立后，核查旧路径、旧文件名、旧术语是否仍残留在索引、脚本、模板与回归中
10. **资产路由化扫描**：若 `assets/` 中的文件会影响实际交付或决策，必须确认它已经进入索引、触发规则与回归断言，而不是仅静态存在
11. **同构脚本并行扫描**：修改某个 skill 的 `scripts/*.py`、`scripts/config/*.json` 或 `reference_rules.json` 时，优先检查 sibling skill 是否存在结构相同或职责相近的脚本；若存在，默认同轮同步评估并尽量一起修改
12. **规范分层扫描**：检查文档是否把“目标规范 / 运行时事实 / 待治理现状 / 真实兼容链路”混写；若混写，必须在 REVIEW / ISSUES 中拆分归类
13. **风格规范归因扫描**：命名、类型系统、分页、响应结构等风格规范，默认先归类为”规范偏离”而不是”兼容”；只有存在真实运行时约束时才允许进入兼容分类
14. **SKILL.md 自一致性扫描**：若目标 skill 采用 FORMAT 桶结构（TERMS/ENUM/STATE/RULES/BLOCKERS/CHECK/ORDER），对照 `GLOBAL_CHECKLIST.md` G-37 ~ G-42 逐项检查：
   a. `STATE` / `ENUM` 中无死变量或死枚举值（grep 每个变量名确认被至少一条 RULE 引用）
   b. `ORDER` 中无条件 step 未引用仅在条件分支中加载的资源（检查 step 间的依赖-条件传递链）
   c. variable-guide / QUICK_REFERENCE 等副本文档的规则条件与 SKILL.md 真源逐字对齐（grep 同一变量名对比条件）
   d. 所有带目录前缀拼接的文件引用可解析到实际文件（`ls` 验证每个拼接后路径）
   e. `scripts/` 中内部治理脚本未混入项目代码验证流程（检查 §8.2 或等价 VALIDATE 节的脚本列表）
   f. CHECK 列表中无 skill 维护元项（元项移至 NOTE / .meta/）
15. **Debug 可探性扫描**：若目标 skill 声明了 debug 能力，对照 `GLOBAL_CHECKLIST.md` G-43 ~ G-48 逐项检查：
   a. debug 是否为单一 on/off 档位（ENUM: `debug: false | true`，非多档位）
   b. trace 是否覆盖所有阶段（检查 `.meta/debug-output.md` 是否含 READ/ENTRY/CLASSIFY/PLAN/EXECUTE/VALIDATE/REVIEW/FINAL 全部模板，EXECUTE 是否有步进 trace + GLOBAL_BLOCKERS 抽查 + 执行纪律检查，CHECK/REVIEW 是否逐条而非汇总）
   c. 思维链模板是否要求已知/未知/策略三段上下文消化（非仅动作描述）
   d. 打断检查是否为 ENTRY GATE 的显式 ORDER step，是否有 BLOCKER 保护
   e. 核心决策是否用 RULES/BLOCKERS/CHECK 桶承载（非 Markdown 表格或叙事段落）
   f. trace 输出格式是否为自然语言叙事（非逐条 RULE dump），末尾是否有审计汇总行
16. 输出 → 被治理对象的 `.meta/REVIEW.md` + `.meta/ISSUES.md`

### 2.0b Migration Audit — 迁移残留扫描

> 触发词：「迁移审计」「扫描迁移」「迁移进度」
>
> IF debug = on THEN 审计的 4 个步骤每个独立输出思考链 + 审计完成后输出防偷懒检查（格式见 `.meta/debug-output.md` §Migration Audit + §防偷懒检查）。

1. 从被治理对象的 `.meta/MIGRATION.md` 或 `GOVERNANCE_PROFILE.md` 获取旧的命名/路径/API 模式
2. `rg` 旧模式关键词 → 统计残留引用数
3. 交叉比对索引/脚本/模板中是否仍有旧路径、旧术语
4. 更新被治理对象的 `.meta/MIGRATION.md` 看板状态

### 2.0c Create — 从模板创建新 skill

> 触发词：「创建 skill」「新建 skill」「create skill」「生成 skill」「造一个 skill」
> 此操作**不需要已有 skill 作为被治理对象**——直接使用 builder 的模板体系从零生成。

#### 步骤

1. **收集信息**：向用户确认（若已提供则跳过）:
   - skill 名称（如 `ai-frontend-expert`）
   - archetype（`backend-source` / `frontend-specialist` / `fullstack-orchestrator` / `lightweight-routing`）
   - 一句话描述
   - 目标目录（默认 `skills/{archetype_group}/{skill-name}/`）

2. **加载模板**：
   - 必读：`SKILL_TEMPLATE.md`（执行骨架）
   - 必读：`DEBUG_OUTPUT_TEMPLATE.md`（debug trace 格式）
   - 必读：`GOVERNANCE_PROFILE_TEMPLATE.md`（治理画像）
   - 按需：`REFERENCE_WRITING.md`（如需预生成 references/）

3. **填充占位符**：按 archetype 映射表（见 `SKILL_TEMPLATE.md` 附录）替换所有 `{DOMAIN_*}` 占位符。关键映射:

   | archetype | DOMAIN_LAYER_VALUES | DOMAIN_BOOLS | DOMAIN_BUILD_CMD | DOMAIN_LINT_CMD |
   |-----------|--------------------|-------------|-----------------|-----------------|
   | backend-source | controller/service/repository/model/dto/router | contract_change/db_change/destructive_change/breaking_change/cross_domain | `go build ./...` | `go vet ./...` |
   | frontend-specialist | component/hook/store/page/util | contract_change/breaking_change/visual_regression | `npm run build` | `npm run lint` |
   | fullstack-orchestrator | controller/service/repository/model/dto/router/component/hook | contract_change/db_change/destructive_change/breaking_change/cross_domain | `go build ./... && npm run build` | `go vet ./... && npm run lint` |
   | lightweight-routing | (无分层) | contract_change/breaking_change | N/A | N/A |

   未匹配 archetype 时，逐一向用户确认占位符值。

4. **创建目录结构**：
   ```
   {skill-name}/
   ├── SKILL.md              ← 从 SKILL_TEMPLATE.md 填充后写入
   ├── .meta/
   │   ├── GOVERNANCE_PROFILE.md ← 从 GOVERNANCE_PROFILE_TEMPLATE.md 填充后写入
   │   ├── debug-output.md      ← 从 DEBUG_OUTPUT_TEMPLATE.md 复制的追踪骨架
   │   └── CHECKLIST.md         ← 空模板（用户后续补充领域专属红线）
   ├── references/
   │   └── README.md            ← 索引占位（标注 "TODO: 补充领域规范"）
   ├── scripts/
   │   └── .gitkeep
   └── templates/
       └── .gitkeep
   ```

5. **注册到系统**：
   - 若仓库使用 symlink 机制（如 `.claude/skills/` → `skills/`），创建对应 symlink
   - 若仓库使用 `AGENTS.md` 或 skill registry，提示用户更新路由

6. **收尾**：运行 builder 自身验证脚本确认产出合规 → 提示用户下一步（补充 references/ 领域规范、配置 trigger 关键词、跑首次 Scan）

---

#### 扫描评估维度表

| 维度 | 检查标准 | 🔴🟠🟡 |
|------|---------|--------|
| 代码示例准确性 | 函数名、字段名、类型与目标项目/框架一致 | 🔴 |
| 字段/类型一致性 | string/int 类型、命名与 struct 定义吻合 | 🔴 |
| 废弃模式残留 | 无已标记为废弃的 API/函数/类型/导入路径正例残留（以 target `.meta/GOVERNANCE_PROFILE.md` 声明的废弃清单为准） | 🔴 |
| **代码示例与文字自洽性** | **文字表格说"私有/返回接口"，代码示例也必须如此（AI 依赖示例 > 文字）** | **🔴** |
| 路径/引用正确性 | 交叉引用路径与目录结构吻合；`skill://` 路径可稳定解析；内部引用统一写完整相对路径 `references/...` | 🟠 |
| 路由声明与脚本执行一致性 | 索引 / 触发矩阵 / 选择脚本 / 回归用例对同一条规则结论一致 | 🟠 |
| 规范自洽性 | ctx、code 等核心概念跨文件定义一致 | 🟠 |
| 强制联动真源实加载 | 被定义为“命中即必须联动”的规范进入已加载 refs，而非仅存在于 guidance/建议项 | 🟠 |
| 文档职责边界 | QUICK_REFERENCE / SKILL / WORKFLOW_STEPS 分工清楚，不重复定义同一细则 | 🟠 |
| 入口摘要与细则一致性 | `SKILL.md` 的步骤摘要与 `modes/*.md` 或旧 `WORKFLOW_STEPS.md` 中的 `S/M/L` 细则不冲突 | 🟠 |
| Do/Don't 完整度 | 每个规范点同时有 ✅ 正例和 ❌ 反例 | 🟠 |
| 跨文件重复率 | 同一结构体/规则/JSON 在 3+ 文件中重复 | 🟠 |
| 跨 skill 真源一致性 | 下游 skill 无第二套规范真源，均通过引用或场景补充收口到权威来源 | 🟠 |
| 去重联动完整性 | 删除 / 重命名 reference 后，索引、规则、模板、脚手架、校验脚本全部同步 | 🟠 |
| 迁移残留清理完整性 | 独立 skill / reference 拆分后，无旧路径、旧文件名、旧术语残留 | 🟠 |
| 迁移语义边界稳定性 | 路径 / URI 替换后，“上游真源 / 当前 skill 场景补充”的责任边界保持不变，不能只换路径就改写原意 | 🟠 |
| 辅助资产执行化 | 会影响实际交付的 `assets/` 文件已进入索引、规则与回归；纯静态补充材料有明确边界 | 🟠 |
| 命名与术语一致性 | 文件名、标题、章节名、索引矩阵、脚本引用使用同一套术语体系 | 🟠 |
| LLM 可消费性 | QUICK_REFERENCE 保持短卡定位，SKILL/WORKFLOW 分层明确，R1 有优先级 | 🟠 |
| 速查卡视觉层次 | 一票否决、关键约束、强建议三类信息有明显边界 | 🟠 |
| 模板元信息一致性 | `当前模板` / `已加载规范` / `输出路径` / `关联文档` 在 templates 内统一 | 🟠 |
| **error 处理链完整性** | **代码示例无 `_ = err`、未接收返回值；各层规范文件均有 error 处理说明** | **🟠** |
| **测试复盘闭环** | **builder 入口文件与被治理对象的 `modes/*.md` 或旧 `WORKFLOW_STEPS.md` / `unit-testing.md` 明确要求输出测试问题总结，并定义 skill 规则遗漏/矛盾时的回写动作** | **🟠** |
| 同构脚本同步治理 | 修改一个 skill 的脚本时，已同步检查 sibling skill 的同构脚本是否需要一起更新 | 🟡 |
| SDLC 覆盖完整性 | 若维护 `CATALOG`，其中无 📝 待新增；若尚未建立 `CATALOG`，`GOVERNANCE_PROFILE` 已明确当前治理入口与缺失资产 | 🟡 |
| 文件粒度与上下文预算 | 普通文件、核心分层文件、测试文件、聚合文件阈值明确；热工作集预算可执行；超长文件具备拆分评估或豁免说明 | 🟡 |

### 2.1~2.4 常规操作流程

| 操作 | 步骤 |
|------|------|
| **Create** — 从模板创建新 skill | ① 确认 skill 名称 + archetype + 描述 → ② 加载 `SKILL_TEMPLATE.md` + `DEBUG_OUTPUT_TEMPLATE.md` + `GOVERNANCE_PROFILE_TEMPLATE.md` → ③ 按 archetype 映射表替换 `{DOMAIN_*}` 占位符 → ④ 创建目录结构（SKILL.md + .meta/ + references/ + scripts/ + templates/）→ ⑤ 创建 symlink（如需要）→ ⑥ 提示用户下一步 |
| **Init** — 任务前盘点 | ① 优先加载被治理对象的 `.meta/GOVERNANCE_PROFILE.md`，确认 `archetype` / 真源入口 / 例外 → ② 若存在 `.meta/CATALOG.md`，再加载它掌握全景 → ③ 若存在 `.meta/ISSUES.md`，再加载它掌握待办 → ④ 定位目标（填坑 or 造砖） |
| **Add** — 新增规范 | ① 禁止闭门造车：先挖掘 `pkg/`/`internal/` 真实代码 → ② 三要素法则（原则→示例→联动） → ③ 按 `REFERENCE_WRITING.md` 骨架编写 → ④ 用其中自检门禁检查 |
| **Fix** — 修复冲突 | ① 列出受影响文件 → ② 全局搜索一次性处理残留 → ③ 更新被治理对象的 `.meta/ISSUES.md` |
| **Update** — 刷新索引 | ① 更新被治理对象的 `.meta/GOVERNANCE_PROFILE.md`；若存在或本轮新建 `.meta/CATALOG.md`，同步刷新索引 → ② 必要时更新其 `SKILL.md` / `modes/*.md` / 可选 `WORKFLOW_STEPS.md` / 可选 `QUICK_REFERENCE.md` 的职责边界说明 → ③ 若存在 `.meta/ISSUES.md` 或 `.meta/REVIEW.md`，同步回写状态 |
| **Generate Route Report** — 路由报告复盘 | ① 运行 `run_generate_reference_rules.py` 生成 `reference_rules.json` 与 `reference_rules.report.md`（仅允许写 machine-generated 派生产物，不得改写人工维护正文）→ ② 主动读取 `reference_rules.report.md`，确认 full-scope、单次引用文件、规则展开矩阵与 schema 摘要 → ③ 输出结构判断、风险点、优化建议；若发现缺口，同轮回写 `reference_rules.source.md` / 索引 / 回归样例 |
| **Deduplicate** — 跨 skill 真源治理 | ① 盘点下游 skill 重复规范 → ② 分类为”删除 / 引用真源 / 场景补充 / 独立拆分” → ③ 更新索引、触发规则、模板、脚手架、校验脚本 → ④ 跑回归并记录迁移结论 |

RULES:
- IF debug = on THEN 每个操作（Create/Init/Add/Fix/Update/Generate Route Report/Deduplicate）的每个步骤独立输出思考链 + 操作完成后输出防偷懒检查（格式见 `.meta/debug-output.md` 对应 § + §防偷懒检查）。

---

## 3. 防爆准则 (Red Lines)

红线速查见 `QUICK_REFERENCE.md` §一票否决 与 §强建议；完整治理检查清单真源见 `.meta/GLOBAL_CHECKLIST.md`（G-01 ~ G-42）。执行时以 GLOBAL_CHECKLIST 为准，QUICK_REFERENCE 为速记入口。

---

## 4. LLM 可读性优化指南

**四层架构**：
```text
层级 1: builder/QUICK_REFERENCE.md         ← builder 自身红线与速查
层级 1b: builder/.meta/GLOBAL_CHECKLIST.md ← builder 全局治理检查清单单一真源
层级 2: builder/SKILL.md                   ← builder 自身路由、工作流与治理规则
层级 3: target/modes/*.md 或 WORKFLOW_STEPS.md + references/ + scripts/ ← 被治理对象的执行细则、真源文档与可执行路由
层级 0: repo/AGENTS.md                        ← 仓库级全局路由原则：先读哪里 / 不要猜什么
层级 4: target/.meta/GOVERNANCE_PROFILE.md ← 被治理对象的治理配置层：archetype / 启动期脚本摘要 / 联动 / 例外 / 迁移状态
层级 4b: target/.meta/CHECKLIST.md         ← 被治理对象的专属清单：本地红线 / 局部联动 / 交付闭环
层级 5: target/.meta/                      ← 被治理对象的维护侧：CATALOG / REVIEW / ISSUES / MIGRATION
```

**R1 触发表**：用 ★/◇ 区分必读与参考，避免一次加载过多文件。

**SKILL.md 禁入内容**：builder 自身不承载被治理对象的架构职责详述、API/Model 规范与执行骨架；这些内容应回到被治理对象的 `references/*.md` 与 `modes/*.md` 或旧 `WORKFLOW_STEPS.md`。

**规范表达分层**：明确区分“目标规范”“运行时事实”“待治理现状”“真实兼容链路”。若某个具体业务例子会让 AI 把现状误抄成规范，优先抽象化或移出基础规范主干。

**重复检测命令**：
```bash
rg --line-number "type Pager struct|type Response struct" references/
rg --line-number '禁止.*DBStartTx|严禁.*开启事务' references/
```

---

## 5. 常用指令卡

指令速查见 `QUICK_REFERENCE.md` §常用指令卡。

---

## 6. Reference / 模板写作入口

新增或修改被治理对象的 `references/` / `templates/` 时，统一读取 `REFERENCE_WRITING.md`。其中包含：

- `REFERENCE_WRITING.md §1`：非模板 `references/*.md` 的正文骨架与必备/禁用元素
- `REFERENCE_WRITING.md §2-§4`：章节组织、代码示例、跨文件引用、路由执行化与迁移边界
- `REFERENCE_WRITING.md §5`：`references/templates/` 统一风格、元信息字段与命名约束
- `REFERENCE_WRITING.md §6`：写完自检门禁、封板同步检查与治理配置回写项

### 6.1 使用边界

- 非模板规范文档：直接按 `REFERENCE_WRITING.md §1-§4` 编写，禁止在本入口重复维护第二套骨架
- 模板文件：直接按 `REFERENCE_WRITING.md §5` 编写，不再在 `SKILL.md` 展开表头与段落格式细则
- 收尾检查：直接执行 `REFERENCE_WRITING.md §6` 的完整 checklist；若 target 还维护 `.meta/CHECKLIST.md`，需同步对照
- IF debug = on THEN Closing Audit 的 ⑩ 项逐条输出思考链 + 完成后输出防偷懒检查（格式见 `.meta/debug-output.md` §Closing Audit + §防偷懒检查）
