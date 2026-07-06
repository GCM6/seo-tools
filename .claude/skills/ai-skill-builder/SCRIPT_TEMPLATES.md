# Script 模板库

本文档定义 `ai-skill-builder` 在新增、重构或迁移 skill 脚本时使用的统一模板骨架、职责分层和派生规则。

## 何时读取

- 主触发关键词：脚本模板、脚本治理、脚本派生、路由脚本、校验脚本、strict gate、reference_rules
- 必读时机：新增或修改任意 skill 的 `scripts/*.py`、`scripts/config/*.json`、`reference_rules.json`、脚本命名或脚本回归用例时

---

## 路径归属

- `ai-skill-builder` 自身保留 4 个主入口文件：`SKILL.md`、`QUICK_REFERENCE.md`、`REFERENCE_WRITING.md`、`SCRIPT_TEMPLATES.md`，1 个 builder 全局检查清单真源 `.meta/GLOBAL_CHECKLIST.md`，并提供 `GOVERNANCE_PROFILE_TEMPLATE.md`、`TARGET_CHECKLIST_TEMPLATE.md` 两个 target 模板与 `scripts/` 下的治理审计工具层。
- 本文中出现的 `scripts/*.py`、`scripts/config/*.json`、`reference_rules.json`、`references/*`、`templates/*`，以及目标 skill 的 `.meta/*`，默认都指向被治理对象，而不是 builder 自身目录；其中 `.meta/GOVERNANCE_PROFILE.md` 负责声明该 skill 的 archetype、默认脚本族、联动关系与例外项，`.meta/CHECKLIST.md` 负责声明该 skill 的专属红线与局部门禁。
- 若脚本、规则文件或 Markdown 引用中出现 `skill://{path}`，统一按仓库根目录下的 `skills/{path}` 解析；脚本输出、文档说明与 LLM 解释必须共享同一映射。
- builder 自身保存“脚本模板真源 + 治理配置模板 + 审计脚本”，但不保存被治理对象的运行时脚本副本；目标 skill 若存在 `scripts/config/*.json`，它也属于脚本治理真源的一部分。

> [!NOTE]
> 当前 `SCRIPT_TEMPLATES.md` 作为工作流聚合文件保留单文件形态：`推荐脚本族`、`archetype 选型矩阵`、`统一分层骨架`、`reference_rules.json` 结构、`strongest 模板组合` 与 `CLI 契约表` 在同轮脚本治理中经常联动阅读。已评估暂不拆分；若后续超过 `800` 行、出现 3 个以上相对独立的维护热点，或 `SKILL.md` / 其他入口开始稳定按专题分别引用，则再拆为多个专题文件。

---

## 1. 目标定位

脚本模板的目标不是把所有 skill 的脚本做成完全相同的一份实现，而是统一以下四件事：

1. 文件族结构一致：选择器 / 校验器 / 查询器 / 执行器 / 规则文件 / utils 的职责边界一致。
2. CLI 契约一致：参数命名、输出格式、`run_validation` 入口和退出码语义一致。
3. 共享行为下沉：路径归一化、文本读取、doc-map 解析、公共正则提取优先进入 utils，而不是散落在各脚本。
4. 派生方式一致：新 skill 默认从本模板裁剪，不再从 sibling skill 随手复制一份再各自演化。

---

## 2. 推荐脚本族

### 2.1 最小可执行脚本族

适用于大多数 skill：

| 文件 | 必需 | 职责 |
|------|------|------|
| `reference_rules.json` | 是 | 路由规则与回归样例真源 |
| `reference_rules.source.md` | 可选 | 路由规则生成源；适合人工维护说明、分组、规则与回归样例 |
| `select_references.py` | 是 | 根据请求文本选择 references |
| `validate_reference_triggers.py` | 是 | 回归验证路由规则、样例、模式和重定向行为 |
| `validate_reference_rules_schema.py` | 推荐 | 校验 `reference_rules.json` 结构、字段、唯一性与引用合法性 |
| `run_generate_reference_rules.py` | 可选 | 从 `reference_rules.source.md` 生成 `reference_rules.json` 与 `reference_rules.report.md`，便于固化用户自定义规则并沉淀覆盖、分组、边缘文件与规则展开报告；该脚本只允许写 machine-generated 派生产物，不得直接改写人工维护正文；生成后 LLM 需主动读报告并给出建议 |
| `validate_output_templates.py` | 是 | 校验 doc/task 是否满足模板契约 |
| `validate_solution_consistency.py` | 是 | 校验 doc/task/R-ID/路径/任务映射的一致性 |
| `validate_script_contracts.py` | 推荐 | 校验脚本族命名、入口函数、CLI 契约与分层是否符合模板，并检查 `SKILL.md` 是否保留“## 可执行脚本”最小入口区块 |
| `skill_script_utils.py` | 推荐 | 共享工具层：读文件、路径归一化、提取器、doc-map 解析 |

### 2.2 文档绑定型脚本族

适用于有目录真源 `docs/_index/module-doc-map/`（兼容聚合 `docs/_index/module-doc-map.yaml` 可选保留）的 skill：

| 文件 | 必需 | 职责 |
|------|------|------|
| `query_doc_map.py` | 推荐 | 按代码路径或功能描述反查文档映射；仅负责查询落点，不等价于目录真源或代码绑定闭环 |
| `validate_module_doc_map.py` | 推荐 | 校验 `docs/_index/module-doc-map/` 分片真源与兼容聚合文件的结构、唯一性与路径冲突 |
| `validate_code_references.py` | 推荐 | 校验主文档 / 任务单 / doc-map / 代码锚点绑定 |

### 2.3 执行门禁型脚本族

适用于存在“多步门禁串联”的 skill；可按 archetype 分为轻量编排与重型编排：

| 文件 | 必需 | 职责 |
|------|------|------|
| `run_strict_delivery_gate.py` | 推荐 | 串联模板校验、一致性校验、绑定校验，并按 archetype 追加红线门禁、领域真源校验、生成型产物预检与可选构建/测试 |
| `run_script_smoke_tests.py` | 推荐 | 统一执行脚本族的 CLI 冒烟验证，防止“模板写对但入口跑不通” |
| `run_output_template_case_tests.py` | 按需 | 固定回归模板契约校验的正反样例，防止模板字段、strict gate 必填项或模板报告格式漂移 |
| `run_strict_delivery_gate_case_tests.py` | 按需 | 固定回归 strict gate 的失败摘要、定向修法提示与子检查编排摘要，避免门禁输出语义漂移 |

> [!NOTE]
> `run_strict_delivery_gate.py` 的共同底线是“只编排，不复制子校验器内部逻辑”。桥接 / 轻编排型 skill 可保持薄编排；`ai-backend-expert` 这类后端真源 skill 则允许把异常链路红线、日志红线、`model + sql truth` 与 SQL 语法预检等子检查接成重型 gate。

> [!NOTE]
> 若某个 validator / gate 已经沉淀了稳定的失败摘要、建议修法、字段契约或正反样例，优先补对应的 `run_*_case_tests.py` 回归执行器，而不是只依赖一次性人工 spot check。

### 2.4 领域真源校验型脚本族

只在 skill 确实拥有独立真源时新增；若该 skill 还承担 DDL / patch / SQL 片段预检，可把生成型产物校验脚本一起纳入这一稳定脚本组：

| 文件 | 必需 | 职责 |
|------|------|------|
| `validate_gorm_model.py` | 按需 | GORM Model 真源校验 |
| `validate_mysql_index_truth.py` | 按需 | MySQL DDL / 索引真源校验 |
| `validate_model_sql_truth.py` | 按需 | 聚合多个领域校验器 |
| `prepare_mysql_patch_context.py` | 按需 | 为 SQL patch / syntax 校验准备 bootstrap 输入与上下文快照 |
| `mysql_schema_tools.py` | 按需 | 提供 schema 对比、DDL 辅助与 patch 前置处理能力 |
| `validate_mysql_sql_syntax.py` | 按需 | 预检 LLM 生成 SQL / patch / `ALTER TABLE` 片段的语法正确性 |

> [!NOTE]
> 领域真源校验脚本默认只应出现在真正维护该真源的 skill 中。下游 skill 若只是复用真源，不应复制一套同名领域校验器；即使上游已经把 DDL / patch / SQL 预检做成 blocker，下游也应通过 route / guidance 升级，而不是本地再复制一套。

### 2.5 跨 skill 同步与专项回归脚本族

适用于 skill 同时承担“上游真源变更后要把下游复用方一起扫一遍”或“某类红线 / 失败摘要已经需要稳定 case 回归”的场景：

| 文件 | 必需 | 职责 |
|------|------|------|
| `validate_package_file_naming_sync.py` | 按需 | 只读审计后端目录 / 包结构 / 命名真源是否已同步到下游 skill 的入口、路由、触发矩阵与回归样例 |
| `run_logging_redlines_case_tests.py` | 按需 | 固定回归日志红线门禁的正反样例、豁免配置与输出语义，避免日志约束只停留在 validator 文案层 |

> [!NOTE]
> 这类脚本属于“真源变更后的同步治理”和“稳定规则的专项 case 回归”，不等价于最小可执行脚本族；只有当 skill 真的维护上游目录 / 命名真源，或已经把某类红线 / 失败摘要提升为 blocker 时，才补这组脚本。

---

## 3. archetype 选型矩阵

新 skill 派生脚本时，不应从 0 开始猜“该配哪几件”，默认按 archetype 选择：

| archetype | 默认脚本族 | 说明 |
|-----------|------------|------|
| `backend-source`（后端真源型） | 最小可执行 + 文档绑定 + 执行门禁 + 领域真源校验；必要时追加跨 skill 同步与专项回归脚本族 | 如 `ai-backend-expert` |
| `fullstack-orchestrator`（全栈编排型） | 最小可执行 + 文档绑定 + 执行门禁 | 适用于需要统一编排前后端实现与交付门禁的场景；默认不复制后端领域真源校验器 |
| `frontend-specialist`（前端专题型） | 最小可执行；文档绑定按需；执行门禁轻量化 | 如 `ai-admin-frontend-expert` |
| `lightweight-routing`（轻量引用型） | `select_references.py` + `validate_reference_triggers.py` + `reference_rules.json` | 只做路由和入口，不承载完整 doc/task 闭环 |
| `builder-audit`（治理审计型） | `validate_reference_rules_schema.py` + `validate_script_contracts.py` + `run_script_template_audit.py` + `suggest_script_bundle.py` + `run_generate_core_skill_snapshot.py` + `validate_core_skill_snapshot_drift.py` + `validate_builder_archetype_consistency.py` + `validate_builder_entrypoints.py` | 如 `ai-skill-builder`；自身不维护下游运行时脚本副本，也不默认要求 `validate_reference_triggers.py`，除非该 skill 自己维护 Markdown 引用校验能力 |

判定原则：

1. 只要维护目录真源 `docs/_index/module-doc-map/` 或要求代码反查文档，就加文档绑定型脚本族。
2. 只要存在多步交付门禁串联，就加执行门禁型脚本族。
3. 只有真正维护底层领域真源时，才允许增加领域真源校验器。
4. 若 skill 只是引用上游真源，不得复制上游的领域校验脚本作为本地默认资产。
5. archetype 真源至少保持 3 处一致：`skill_script_utils.py` 的 `ARCHETYPE_CHOICES / ARCHETYPE_BUNDLES`、本节矩阵、`GOVERNANCE_PROFILE_TEMPLATE.md` 的 archetype 模板行；修改其中任意一处后，必须执行 `validate_builder_archetype_consistency.py`。

### 3.1 `GOVERNANCE_PROFILE` 绑定规则

- 每个由 builder 治理的 target skill，推荐在 `.meta/GOVERNANCE_PROFILE.md` 中显式声明自己的 `archetype`
- builder 在审计脚本族时，应优先读取 target skill 的 `.meta/GOVERNANCE_PROFILE.md`，而不是根据 sibling skill 或当前文件清单临时猜测
- 若 target skill 已维护 `.meta/CHECKLIST.md`，脚本路由、模板校验与门禁编排不得与其中声明的局部强制联动相冲突
- `GOVERNANCE_PROFILE` 至少应覆盖：
  - 正文真源入口：`SKILL.md` / 可选 `QUICK_REFERENCE.md` / `modes/*.md` 或旧 `WORKFLOW_STEPS.md` / `references/*`
  - 默认脚本族：最小可执行 / 文档绑定 / 执行门禁 / 领域真源校验
  - 启动期脚本摘要：模型进入 skill 时优先使用哪些脚本、各自的必用时机与不适用说明
  - 强制联动文件：规则改动时必须一起同步的脚本、索引、模板、入口文档
  - 允许例外：暂不拆分、兼容旧命名、尚未补齐的治理资产
- `GOVERNANCE_PROFILE` 负责沉淀脚本“可发现性真源”；`SKILL.md` 只保留最小命令入口，不重复展开长篇脚本手册
- 仓库级 `AGENTS.md` 若需要补充说明，只补“命中 skill 后先读 `.meta/GOVERNANCE_PROFILE.md`、不要根据 `scripts/` 目录猜脚本”这类全局原则；不得再复制 target-specific 脚本清单
- 统一模板见 `GOVERNANCE_PROFILE_TEMPLATE.md`

### 3.2 三个核心 skill 的当前脚本能力快照

以下快照基于当前仓库实况与 builder 审计脚本结果，用于帮助后续治理时快速判断“哪个 skill 自持什么脚本族、哪个能力必须上推或下切”；这是一份现状对照，不替代各自 `.meta/GOVERNANCE_PROFILE.md` 的真源职责。建议以 machine-generated 产物 `scripts/core_skill_script_snapshot.json`、`scripts/core_skill_script_snapshot.report.md` 与 `scripts/core_skill_script_snapshot.previous.json` 作为回写参照，并通过 `validate_core_skill_snapshot_drift.py` 约束本节不漂移。

| skill | archetype | 当前自持脚本能力 | 当前不自持 / 应升级能力 | 审计快照 |
|------|-----------|------------------|--------------------------|----------|
| `ai-backend-expert` | `backend-source` | 最小可执行脚本族齐全；文档绑定脚本族齐全（`query_doc_map.py`、`validate_code_references.py`、`validate_module_doc_map.py`）；执行门禁齐全（`run_strict_delivery_gate.py`、`run_script_smoke_tests.py`）；领域真源校验齐全（`validate_gorm_model.py`、`validate_mysql_index_truth.py`、`validate_model_sql_truth.py`）；额外自持 DDL / patch 上下文准备与 SQL 语法校验（`prepare_mysql_patch_context.py`、`mysql_schema_tools.py`、`validate_mysql_sql_syntax.py`）；红线门禁已扩展到新增异常链路与日志约束（`validate_error_handling_redlines.py`、`validate_logging_redlines.py`）；下游目录 / 命名同步审计已补齐（`validate_package_file_naming_sync.py`）；专项回归样例执行器已补齐（`run_logging_redlines_case_tests.py`、`run_output_template_case_tests.py`、`run_strict_delivery_gate_case_tests.py`） | 无后端基础规范上游；它本身就是后端真源入口 | `validate_reference_triggers.py` 当前回归样例 `28` 条；builder 审计与 smoke 为 PASS |
| `ai-api-handoff-bridge` | `lightweight-routing` | 最小可执行脚本族存在缺口（缺 ``validate_output_templates.py`、`validate_solution_consistency.py``）；脚本契约 / schema / smoke 闭环齐全；聚焦接口交付包、字段映射、mock 切真实与前端验收桥接 | 不自持后端实现、文档绑定与 strict gate；命中实现 / 正式联调 / 真实接口接入 / `Code Paths` / strict gate 时必须切到 `ai-backend-expert`；命中页面 / 组件 / UI 实现时必须切到匹配场景的前端 skill，管理后台场景通常切 `ai-admin-frontend-expert` | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |
| `ai-admin-frontend-expert` | `frontend-specialist` | 最小可执行脚本族齐全；脚本契约 / schema / smoke 闭环齐全；聚焦前端专题模板与一致性校验 | 不自持 `query_doc_map.py`、`run_strict_delivery_gate.py`；不自持领域真源校验器与后端绑定门禁；命中契约冻结 / mock 切真实 / 字段对齐时必须切到 `ai-api-handoff-bridge`；命中联调执行、`Code Paths`、`docs/_index/module-doc-map/`、代码反查文档、strict gate 或后端命名治理时必须切到 `ai-backend-expert` | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |

### 3.3 用这份快照做判断时的规则

1. 若某个能力在快照里标记为“当前不自持 / 应升级能力”，后续治理时不要为了局部方便把同名脚本复制到下游 skill；优先通过 profile、trigger-matrix 与 `route_target` 把升级边界写清。
2. 若某个 skill 当前自持的是“轻量版本”能力，例如桥接 / 编排型 skill 只保留 selector、schema 与 smoke，不能据此推导它已经自持了完整的文档绑定闭环；仍需看它是否同时拥有对应 validator / gate / 真源校验器。
3. 若后续新增或删除了核心脚本、调整了 archetype，必须同步更新这张快照与各目标 skill 的 `.meta/GOVERNANCE_PROFILE.md`，避免 builder 模板矩阵和仓库现状再次漂移。
4. 修改 3 个核心 skill 的脚本清单、`reference_rules.json`、治理画像或 builder 对其能力归类口径后，优先先运行 `run_generate_core_skill_snapshot.py` 刷新 machine-generated 快照，再用 `validate_core_skill_snapshot_drift.py` 检查本节是否需要同步回写。
5. 修改 builder 的 `SKILL.md` / `QUICK_REFERENCE.md` 中与脚本链相关的入口说明后，继续运行 `validate_builder_entrypoints.py`，避免“脚本已存在但入口文档没暴露”的高漂移状态。

### 3.4 快照三件套命名规范

若某个 skill 维护 machine-generated 快照，默认采用 `current / report / previous` 三件套，不再为同一语义发明第二套命名：

| 角色 | 推荐文件名 | 说明 |
|------|------------|------|
| current | `*_snapshot.json` | 当前有效快照真源，供脚本读取、drift 校验与后续回写参照使用 |
| report | `*_snapshot.report.md` | 面向人类的报告，负责展示回写建议、结构摘要与相对上一版的 diff |
| previous | `*_snapshot.previous.json` | 上一版有效快照基线，只用于生成稳定 diff，不作为当前真源输入 |

使用规则：

1. 普通刷新只更新 `current` 与 `report`；只有当旧的 `current` 将被新的有效快照覆盖时，才推进 `previous`。
2. 若 `current` 与最新生成结果完全一致，不推进 `previous`，避免制造伪 diff。
3. 若需要重置 `previous` 基线，必须把“为什么允许重置、当前要以什么状态作为新起点”写进 runbook、`QUICK_REFERENCE.md` 或当轮交付说明，不能静默覆盖。
4. 若某个 target skill 也采用这套三件套，`.meta/GOVERNANCE_PROFILE.md` 应明确：生成器入口、三件套文件名、默认推进规则，以及哪些场景允许重置基线。

---

## 4. 统一分层骨架

推荐统一采用四层：

1. `*_rules.json`
   只保存规则、ref_group、回归样例、模式切换数据，不写执行逻辑。
2. `select_*`
   只负责装载 JSON、匹配规则、输出 refs 与 explain 结果。
3. `validate_*`
   只负责校验；可调用 `select_*` 或其他 `run_validation()`，不要再内嵌一份第二套主逻辑。
4. `run_*`
   只负责编排多个校验器与可选命令，不复制各校验器内部逻辑。

若脚本存在稳定配置资产，默认补一个并列层：

5. `scripts/config/*.json`
   只保存 allowlist / exemption / allowed_* / 允许缺省项 / 轻量脚本配置，不保存 CLI 主逻辑与业务规则判断。

共享辅助层统一进入 `skill_script_utils.py`：

- `read_text(path)`
- `normalize_relative_path(project_dir, raw_path)`
- `project_root()`
- `skills_root()`
- `load_module_doc_map(path=None)`
- `is_skill_uri(value)`
- `resolve_skill_uri(value)`
- `inspect_markdown_doc_reference(doc_path, raw_ref, ...)`
- `resolve_markdown_doc_reference(doc_path, raw_ref, ...)`
- 常用提取器：`extract_line_value`、`extract_first_line_value`、`extract_ids`

---

## 4.1 utils 边界模板

必须进入 `skill_script_utils.py` 的内容：

- 文件读取、UTF-8 解码、路径存在性检查
- 项目根目录 / skill 根目录 / scripts 根目录定位
- 相对路径归一化
- doc-map 解析
- 纯文本提取器与通用正则工具
- `skill://` URI 解析、Markdown 文档引用解析、单文件名缩写路径的多级回退解析

不应进入 `skill_script_utils.py` 的内容：

- `argparse` CLI 入口
- 具体 skill 的业务规则匹配
- `reference_rules.json` 的场景判断逻辑
- gate 编排顺序
- 模板完整性、R-ID 覆盖等带业务语义的检查逻辑

判定标准：

- 若一段逻辑可被 2 个以上脚本复用，且不依赖具体 skill 语义，优先下沉到 utils。
- 若一段逻辑一旦下沉会让 utils 知道“当前 skill 的业务规则是什么”，则不应下沉。

## 4.2 脚本配置文件模式

默认约定：

1. 脚本配置文件集中放在 `scripts/config/*.json`，不要把可执行脚本配置继续散落在多个 `.py` 常量里。
2. 配置文件优先按脚本职责分治，例如 `module_doc_map_exemptions.json`、`error_handling_redlines_exemptions.json`、`script_contracts_config.json`；除非已经证明跨脚本强耦合，否则不要一开始合成单个总 JSON。
3. 适合配置化的内容包括：
   - allowlist / exemption / allowed_* 这类稳定例外清单
   - 明确可枚举、低频变动的允许缺省项
   - 轻量脚本参数映射或稳定名称表
4. 不适合配置化的内容包括：
   - CLI 参数定义与入口契约
   - `reference_rules.json` 的主路由逻辑
   - gate 编排顺序
   - 具体业务语义判断
5. 读取配置时优先懒加载：在函数调用或明确的 loader 中读取，不要在 import 阶段全局硬加载，避免单个坏配置拖死整组脚本。
6. 配置缺失、JSON 非法或字段结构不符时，脚本必须给出清晰失败信息；不要静默回退成“好像还能跑”的隐式默认行为。
7. 若 target skill 依赖某些关键配置文件，`.meta/GOVERNANCE_PROFILE.md` 的启动期脚本摘要或允许例外里应能发现这些配置资产，不要把入口只埋在实现细节里。

判断标准：

- 某段常量如果本质上是“治理例外清单”，优先考虑下沉到 `scripts/config/*.json`。
- 某段常量如果改变会直接改写脚本主逻辑或 CLI 契约，优先继续留在 `.py` 真源中。
- 若一个配置只被单脚本使用，优先保持单文件单职责；只有多个脚本必须共享且生命周期一致时，才评估合并。

## 4.3 Markdown 引用解析模板

涉及 Markdown 引用校验、索引断链检查或引用规范回归时，默认按以下模板实现：

1. 支持 `skill://{path}`，并统一解析到仓库根目录下的 `skills/{path}`。
2. 支持完整相对路径，例如 `references/index/api-reference.md`、`.meta/GOVERNANCE_PROFILE.md`。
3. 支持单文件名缩写路径，例如 `SKILL.md`、`frontend-list-page-spec-template.md`，回退顺序统一为：
   - 当前文档目录
   - 当前 skill 根目录
   - `skill_root()` 与 `skills_root()` 下唯一匹配搜索
4. 默认跳过占位符、通配符、外链、项目产物路径或明显不是 skill 内资源的目标，例如 `{module}`、`*.md`、`https://...`、`docs/...`、绝对盘符路径。
5. 若某些治理资产属于“允许缺省”的可选文件，应通过 allowlist / exemption 明确豁免；这类清单优先下沉到 `scripts/config/*.json`，而不是长期留在脚本常量里。
6. 路径回归不仅要检查“能否打开”，还要在必要时检查“是否仍指向原本的真源边界”。
7. 若脚本需要区分“真实断链”与“缩写路径歧义”，优先在 utils 暴露 `inspect_markdown_doc_reference(...)` 之类的分类接口，至少显式区分：
   - `resolved`
   - `missing`
   - `ambiguous`
   - `ignored`
8. `validate_reference_triggers.py` 不得只做“文档里所有引用都存在”这种黑盒检查；必须至少覆盖 5 类解析回归：
   - `skill://...` 能稳定命中
   - 完整相对路径能稳定命中
   - 单文件名在当前文档目录能命中
   - 单文件名通过唯一匹配搜索能命中
   - 单文件名断链与歧义会分别报错，而不是被静默跳过

---

## 5. 统一命名模板

### 5.1 新建 skill 时的推荐命名

| 职责 | 推荐命名 | 备注 |
|------|---------|------|
| 路由规则 | `reference_rules.json` | 单一真源 |
| reference 选择器 | `select_references.py` | 默认入口 |
| 路由回归 | `validate_reference_triggers.py` | 与选择器配套 |
| 路由规则 schema 校验 | `validate_reference_rules_schema.py` | 校验 JSON 结构与字段真源 |
| 模板校验 | `validate_output_templates.py` | 校验 doc/task 结构 |
| 一致性校验 | `validate_solution_consistency.py` | 校验路径、R-ID、任务映射 |
| 脚本契约校验 | `validate_script_contracts.py` | 校验命名、入口、CLI 契约、分层，以及 `SKILL.md` 最小脚本入口区块 |
| 文档反查 | `query_doc_map.py` | 新 skill 默认用 `query_*`，不要新增 `find_*` |
| 严格门禁 | `run_strict_delivery_gate.py` | 新 skill 默认用 `run_*`，不要新增 `strict_*` |
| 脚本冒烟 | `run_script_smoke_tests.py` | 统一跑 CLI 冒烟 |
| 共享工具 | `skill_script_utils.py` | 不要把 skill 名硬编码进文件名 |

### 5.2 兼容迁移规则

- 发现 `find_doc_by_code.py`、`strict_delivery_gate.py` 这类旧命名时，应优先迁移到 `query_doc_map.py`、`run_strict_delivery_gate.py`，并在同步更新引用后删除旧入口。
- 若旧 skill 仍存在历史调用方，先完成标准名脚本自持实现，再统一改文档、校验与命令示例，最后删除 legacy 脚本本体。

---

## 6. `reference_rules.json` 标准结构

> [!NOTE]
> 若团队希望把“基础规则 + 用户自定义规则”固化下来，允许额外维护 `reference_rules.source.md`，并用 `run_generate_reference_rules.py` 生成最终的 `reference_rules.json` 与 `reference_rules.report.md`。运行时真源仍然是 `reference_rules.json`，生成源不直接参与 selector 读取；该生成器仅允许写 machine-generated 派生产物，不得直接改写 `SKILL.md`、`references/*.md`、`templates/*.md` 等人工维护正文。报告用于沉淀覆盖率、未覆盖文件、分组覆盖、边缘文件、规则展开矩阵与 schema 摘要。生成完成后，LLM 不得停在“PASS”层面，必须主动读取报告并输出结构判断、风险点和优化建议。

### 6.1 顶层字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `index_ref` | 条件必填 | 若 skill 采用单索引入口，则必须提供 |
| `bootstrap_refs` | 条件必填 | 若 skill 默认有启动即加载的 refs，则必须提供 |
| `full_scope_keywords` | 推荐 | 触发全量加载的关键词 |
| `all_detailed_refs` | 推荐 | full-scope 时追加加载的 refs |
| `ref_groups` | 推荐 | 规则复用的 refs 分组 |
| `rules` | 是 | 路由规则数组 |
| `validation_cases` | 强烈推荐 | 路由回归样例真源 |

约束：

- `index_ref` 与 `bootstrap_refs` 允许并存，但必须在 skill 内定义清楚“默认入口 ref”与“默认 bootstrap refs”各自语义。
- `rules[*].name` 必须唯一。
- `rules[*]` 至少包含 `name`、`keywords`，并通过 `refs` 或 `ref_group` 之一指向加载目标。
- `route_target`、`exclusive`、`recommended_guidance` 仅在 skill 需要跨 skill 编排时出现。

### 6.2 `rules[*]` 标准字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 规则唯一标识 |
| `keywords` | 是 | 命中关键词 |
| `refs` | 条件必填 | 直接引用 refs |
| `ref_group` | 条件必填 | 通过分组引用 refs |
| `min_hits` | 否 | 最少命中关键词数，默认 `1` |
| `route_target` | 否 | 建议切换 skill / route |
| `exclusive` | 否 | 命中后是否独占路由 |
| `recommended_guidance` | 否 | explain 时补充 guidance |

### 6.3 archetype 示例

后端真源型：

```json
{
  "bootstrap_refs": [
    "references/trigger-matrix.md",
    "references/reference-index.md"
  ],
  "full_scope_keywords": ["全量扫描", "全面审查"],
  "all_detailed_refs": ["references/arch/service.md"],
  "ref_groups": {
    "transaction": ["references/data/transaction.md"]
  },
  "rules": [
    {
      "name": "service_transaction",
      "keywords": ["事务", "service"],
      "ref_group": "transaction"
    }
  ],
  "validation_cases": []
}
```

全栈编排型：

```json
{
  "bootstrap_refs": [
    "references/index/api-reference.md",
    "references/index/admin-fullstack-trigger-matrix.md"
  ],
  "index_ref": "references/index/api-reference.md",
  "full_scope_keywords": ["完整实现", "全量交付"],
  "all_detailed_refs": ["references/delivery/project-integrity-checklist.md"],
  "rules": [
    {
      "name": "review_redirect",
      "keywords": ["审查", "review"],
      "route_target": "code-review",
      "exclusive": true,
      "refs": []
    }
  ],
  "validation_cases": []
}
```

前端专题型：

```json
{
  "bootstrap_refs": [
    "references/index/api-reference.md",
    "references/index/admin-frontend-trigger-matrix.md"
  ],
  "index_ref": "references/index/api-reference.md",
  "rules": [
    {
      "name": "frontend_list_page",
      "keywords": ["列表页", "table"],
      "refs": ["references/frontend/frontend-list-page-spec-template.md"]
    }
  ],
  "validation_cases": []
}
```

---

## 7. strongest 模板组合

当前最值得作为派生母版的是一种“后端真源内核 + 全栈路由回归强度 + builder 自审能力”的组合：

### 7.1 选择器模板

保留后端版的优点：

- `reference_rules.json` 数据驱动
- `load_rule_config()` + dataclass 装载
- `select_references()` 与 `explain_selection()` 双入口
- `--explain` / `--json` CLI 统一

吸收全栈版的增强点：

- 支持 `route_target`
- 支持 `exclusive`
- 支持 `recommended_guidance`
- `explain_selection()` 返回 `mode / matched_rules / matched_keywords / route_target / route_is_exclusive`

推荐骨架：

```python
@dataclass(frozen=True)
class Rule:
    name: str
    keywords: tuple[str, ...]
    refs: tuple[str, ...]
    min_hits: int = 1
    route_target: str | None = None
    exclusive: bool = False


def select_references(text: str) -> list[str]:
    ...


def explain_selection(text: str) -> dict[str, object]:
    return {
        "mode": ...,
        "matched_rules": ...,
        "matched_keywords": ...,
        "route_target": ...,
        "route_is_exclusive": ...,
        "references": ...,
        "recommended_guidance": ...,
    }
```

### 7.2 路由回归模板

推荐以当前核心 skill 已收敛出的公共超集字段为母版，不再沿用只校验 refs 是否命中的旧式极简回归。

必须覆盖：

- `must_have`
- `must_not_have`
- `must_match_rules`
- `must_not_match_rules`
- `must_have_guidance`
- `expected_mode`
- `expected_route_target`
- `expected_route_is_exclusive`（布尔值，生成到 `reference_rules.json` 后必须保持 JSON boolean）
- 关键 Markdown 引用解析正/反向回归（若当前 `validate_reference_triggers.py` 还承担引用漂移校验）

当前 builder schema 默认白名单字段为：

- `name`
- `request_text`
- `expected_refs`
- `expected_mode`
- `expected_route_target`
- `expected_route_is_exclusive`

推荐骨架：

```python
@dataclass(frozen=True)
class Case:
    name: str
    text: str
    must_have: tuple[str, ...]
    must_not_have: tuple[str, ...] = ()
    must_match_rules: tuple[str, ...] = ()
    must_not_match_rules: tuple[str, ...] = ()
    must_have_guidance: tuple[str, ...] = ()
    expected_mode: str | None = None
    expected_route_target: str | None = None
    expected_route_is_exclusive: bool | None = None
```

补充约束：

- 若 `validate_reference_triggers.py` 同时负责 Markdown 引用解析回归，不要把这部分断链 / 歧义校验拆到额外 shell 脚本里“人工补跑”；应与路由 case 一起 machine-check。
- 回归模板可以按 archetype 扩展字段，但不要退回只看 `references` 数量或只看单关键词命中的弱断言。

### 7.3 路由规则 schema 校验模板

推荐新增 `validate_reference_rules_schema.py`，至少覆盖：

- 顶层字段是否符合 archetype
- `rules[*].name` 是否唯一
- `ref_group` 是否存在
- `validation_cases` 是否为数组
- `route_target` / `exclusive` 是否成对合法
- `recommended_guidance` 是否为字符串数组

推荐骨架：

```python
def run_validation(config_path: Path) -> tuple[bool, str]:
    ...
```

### 7.4 模板校验模板

推荐以“薄校验器 + 场景扩展钩子”为主：

- 通用头部检查进入公共函数
- `validate_doc()` / `validate_task()` 分开
- 输出统一为 `tuple[bool, str]`
- 提供 `run_validation(doc, task)` 供 gate 编排器调用

```python
def validate_doc(doc_path: Path) -> tuple[bool, str]:
    ...


def validate_task(task_path: Path) -> tuple[bool, str]:
    ...


def run_validation(doc: Path | None, task: Path | None) -> tuple[bool, str]:
    ...
```

### 7.5 一致性校验模板

推荐以“公共提取器 + 轻逻辑聚合”为主：

- 路径一致性
- `doc_id` / `feature_id` 一致性
- `R-ID` 完整映射
- 任务标题 ID 完整性
- `关联文档` / `主文档路径` / `任务单路径` 一致

> [!IMPORTANT]
> 一致性校验器不应直接承担模板完整性校验，也不应承担构建 / 测试命令编排；保持职责单一。

### 7.6 脚本契约校验模板

推荐新增 `validate_script_contracts.py`，用于把本模板从“文档约定”升级为“可审计真源”。

至少覆盖：

- 必需脚本是否存在
- 脚本命名是否符合 `select_ / validate_ / query_ / run_`
- `select_references.py` 是否提供 `select_references()` / `explain_selection()`
- `validate_*` 是否暴露 `run_validation()`
- `run_*` 是否只做编排，不内嵌第二套模板 / 一致性逻辑
- `skill_script_utils.py` 是否存在且被复用
- `SKILL.md` 是否保留 `## 可执行脚本` 最小脚本入口区块

推荐骨架：

```python
def run_validation(skill_scripts_dir: Path) -> tuple[bool, str]:
    ...
```

### 7.7 doc-map 查询模板

新 skill 若需要“先命中文档、再决定是否继续实现”，建议额外维护一个轻量 `module-doc-router`，并提供 `query_doc_route.py`，专门负责“用户输入 -> 真实文档”；代码绑定与热点文件深查再交给 `query_doc_map.py`。`query_doc_map.py` 继续负责解析目录真源 / 兼容聚合、路径归一化、输出 JSON，并支持“代码路径 -> 文档落点”和“功能描述 -> 文档 + 热点文件职责”两种查询模式，优先读取 `hotspots`、兼容回退 `hot_paths`。若错误日志是常见输入，再补一个 `query_error_log.py` 或等价 `--from-log` 入口，消费 `log_keywords / entrypoints` 与日志中的 `file / line / func / route / module_hint`。若 skill 维护 `docs/_index/module-doc-map/`，应把 `query_doc_map.py`、`validate_module_doc_map.py`、`validate_code_references.py` 视为一个闭环，而不是只保留查询器：

- `query_doc_map.py` 负责“代码路径 -> 文档落点”和“功能描述 -> 文档 + 热点文件职责”的读侧查询。
- `validate_module_doc_map.py` 负责目录真源结构、唯一性与兼容聚合一致性。
- `validate_code_references.py` 负责主文档 / 任务单 / 代码锚点 / doc-map 的绑定闭环。

```python
def load_doc_map(path: Path) -> list[FeatureEntry]:
    ...


def load_doc_map_dir(path: Path) -> list[FeatureEntry]:
    ...


def normalize_query_path(project_root: Path, raw_path: str) -> str:
    ...


def find_matches(entries: list[FeatureEntry], query_path: str) -> list[dict[str, str]]:
    ...
```

### 7.8 strict gate 模板

基础模板推荐以“薄编排器”模式实现；后端真源型 skill 可以在此之上扩展成“重型 gate”，但仍必须保持“子逻辑在各自 validator 中，gate 只负责编排与失败传播”：

- 本体只做参数解析
- 依次调用各 `run_validation()`
- 可按 archetype 追加 redline / truth / syntax / build / test / lint 子检查
- 不在 gate 里重新实现模板校验、路径提取、doc-map 解析、truth 比对逻辑

```python
checkers = [
    lambda: validate_templates(args.doc, args.task),
    lambda: validate_consistency(args.doc, args.task, args.project_root),
    lambda: validate_code_refs(args.doc, args.task, args.project_root),
]

if args.with_backend_redlines:
    checkers.append(lambda: validate_error_handling(args.project_root))
if args.with_truth_checks:
    checkers.append(lambda: validate_model_sql_truth(args.project_root))
if args.with_sql_syntax:
    checkers.append(lambda: validate_mysql_sql_syntax(args.sql_file, args.bootstrap_sql_file))

for checker in checkers:
    success, report = checker()
```

### 7.9 脚本冒烟模板

推荐新增 `run_script_smoke_tests.py`，统一做运行态验证。

至少覆盖：

- `select_references.py --help`
- `select_references.py "..." --explain`
- `validate_reference_triggers.py`
- `validate_reference_rules_schema.py --help`
- 各 `validate_* --help`
- `query_doc_map.py --help`（若 skill 自持 doc-map 查询）
- `run_generate_reference_rules.py --help`（若 skill 采用 `reference_rules.source.md -> json/report` 生成链路）
- `run_generate_core_skill_snapshot.py --help`（若 archetype 为 `builder-audit` 且需要维护核心 skill 快照）
- `run_strict_delivery_gate.py --help` 或等价门禁脚本
- `suggest_script_bundle.py --help`（若 archetype 为 `builder-audit` 或本 skill 自持脚本族建议器）
- `validate_core_skill_snapshot_drift.py --help`（若 archetype 为 `builder-audit` 且需要约束 `SCRIPT_TEMPLATES.md §3.2` 不漂移）
- `validate_builder_archetype_consistency.py --help`（若 archetype 为 `builder-audit` 且需要约束 archetype 真源不漂移）
- `validate_builder_entrypoints.py --help`（若 archetype 为 `builder-audit` 且需要约束 `SKILL.md` / `QUICK_REFERENCE.md` 入口说明不漂移）

推荐骨架：

```python
def run_check(command: list[str], cwd: Path) -> tuple[bool, str]:
    ...


def main() -> int:
    ...
```

补充约束：

- 新增或重命名任何对外可调用的 `select_*` / `validate_*` / `query_*` / `run_*` 脚本后，必须同步把它接入 `run_script_smoke_tests.py`，不要依赖“通配符自动发现”来碰运气。
- 如果脚本面向 LLM 日常执行路径，还必须同步更新 target skill 的 `SKILL.md`、`.meta/GOVERNANCE_PROFILE.md`、`references/reference-index.md`、`references/trigger-matrix.md` 与 `.meta/CATALOG.md`，确保“脚本存在”“脚本可发现”“脚本可回归”三件事同时成立。
- 若脚本属于“生成型产物校验器”（例如 SQL / patch / 配置片段预检），应推动 target skill 把该校验从提示提升为 blocker，而不是只在 README 或 reference 里留命令示例。

---

## 8. CLI 契约表

### 8.1 `select_references.py`

| 参数 / 输出 | 标准契约 |
|-------------|----------|
| 位置参数 | `request_text` |
| 可选参数 | `--explain`、`--json` |
| 退出码 | 成功 `0` |
| 文本输出 | `匹配模式:`、`命中规则:`、`已加载 references:` |
| JSON 输出 | 至少包含 `references`；`--explain` 时补 `mode / matched_rules / matched_keywords` |

### 8.2 `validate_reference_triggers.py`

| 参数 / 输出 | 标准契约 |
|-------------|----------|
| 默认参数 | 无必填参数 |
| 退出码 | 通过 `0`，失败非 `0` |
| 文本输出 | 明确 `PASS` / `FAIL`，并打印 case 失败详情 |

附加要求：

- 除路由规则 case 外，默认还应校验关键 Markdown 引用不漂移。
- 若 skill 支持 `skill://...`、完整相对路径或单文件名缩写路径，`validate_reference_triggers.py` 至少要有以下解析回归：
  - 正向：`skill://...`
  - 正向：完整相对路径
  - 正向：当前目录单文件名
  - 正向：唯一匹配搜索单文件名
  - 反向：单文件名歧义
  - 反向：单文件名断链
- 对歧义路径，输出应明确列出冲突候选，而不是退化成普通 missing。
- 对 allowlist / exemption 豁免项，必须在 `scripts/config/*.json`、脚本 loader 或 profile 中显式可读，不允许把治理例外藏进模糊条件分支。

### 8.3 `validate_*`

| 参数 / 输出 | 标准契约 |
|-------------|----------|
| 常见参数 | `--doc`、`--task`、`--project-root`、`--strict`（按需） |
| 代码入口 | 提供 `run_validation(...) -> tuple[bool, str]` |
| 退出码 | 通过 `0`，失败非 `0` |
| 文本输出 | 统一形如 `[validator-name] PASS/FAIL` |

### 8.4 `run_*`

| 参数 / 输出 | 标准契约 |
|-------------|----------|
| 常见参数 | `--doc`、`--task`、`--project-root`、可选 runnable checks |
| 退出码 | 任一子检查失败则非 `0` |
| 文本输出 | 聚合多个校验器报告，不吞掉下游输出 |

---

## 9. 派生规则

其他 skill 从 builder 派生脚本时，默认按以下顺序：

1. 先读取 target skill 的 `.meta/GOVERNANCE_PROFILE.md`，确认 `archetype` 与默认脚本族；若尚不存在，先按 `GOVERNANCE_PROFILE_TEMPLATE.md` 补齐。
2. 再复制脚本族结构，不先复制 sibling skill 的所有实现细节。
3. 先保留统一命名：`select_` / `validate_` / `query_` / `run_`。
4. 先落 `skill_script_utils.py`，把公共函数沉到底层。
5. 再根据 skill 场景增减字段、规则和案例。
6. 最后补齐对应 `.md` 索引、命令示例、回归断言。

### 9.1 允许派生的变体

- 可以增加新的 `Rule` 字段，但不要破坏 `select_references()` / `explain_selection()` 基本契约。
- 可以增加新的 `validate_*` 校验器，但必须提供 `run_validation()` 作为标准编排入口。
- 可以为特定 skill 增加领域真源校验器，但必须先判断该 skill 是否真的是该真源的维护者。
- 可以按 archetype 裁剪脚本族，但必须保留该 archetype 的最小闭环，不得只剩 selector 没有回归。

### 9.2 不允许的派生方式

- 从 sibling skill 直接复制一整套脚本后只改路径，不回收重复 helper
- 在 `run_*` 脚本中再写一份模板校验 / 一致性校验逻辑
- 只新增 `reference_rules.json` 规则，不补 `validate_reference_triggers.py` 回归
- 只改命名不改引用，留下 `find_*` / `query_*`、`strict_*` / `run_*` 并存
- 只新增文档里的脚本说明，不补 schema 校验或脚本契约校验
- 让 `skill_script_utils.py` 承担业务规则判断或 argparse 入口
- 把所有 allowlist / exemption / allowed_* 一股脑塞进一个总配置文件，导致脚本职责边界消失
- 在 import 阶段全局硬加载 `scripts/config/*.json`，让单个坏配置拖死所有脚本
- 工具型脚本（如 `build.sh`、`build.ps1`、专用抽取脚本）误套用 `select_ / validate_ / query_ / run_` 命名规范

---

## 10. 收尾检查

- [ ] 新增或修改脚本时，已对照本模板选择脚本族，而不是只做一次性脚本
- [ ] 选择器与路由回归脚本已形成配对
- [ ] `reference_rules.json` 已有 schema 级校验入口，或已说明为何暂不需要
- [ ] 脚本族已具备 `validate_script_contracts.py` 或等价契约校验能力
- [ ] 脚本共享逻辑已进入 `skill_script_utils.py` 或等价 utils 层
- [ ] 若存在 allowlist / exemption / allowed_* 等稳定例外，已评估是否应下沉到 `scripts/config/*.json`
- [ ] 若已引入 `scripts/config/*.json`，配置按脚本职责分治，且读取方式避免 import 阶段全局硬加载
- [ ] 若涉及 Markdown 引用校验，已将 `skill://` / 完整相对路径 / 单文件名缩写路径解析下沉到 utils，并补齐正向/反向回归
- [ ] 新增 skill 默认使用 `query_*` / `run_*` 标准命名
- [ ] gate 脚本只做编排，不复制各校验器内部逻辑
- [ ] 已明确当前 skill 属于哪一种 archetype，并按矩阵裁剪脚本族
- [ ] target skill 的 `.meta/GOVERNANCE_PROFILE.md` 已声明 `archetype`、默认脚本族、启动期脚本摘要、强制联动文件与允许例外
- [ ] `SKILL.md` 已保留 `## 可执行脚本` 最小脚本入口区块，并与 profile 一致，避免“profile 写了可用脚本，主入口看不见”
- [ ] 已至少跑过一次脚本 CLI 冒烟，避免“文档正确、入口失效”
- [ ] 新增脚本后，`references/reference-index.md`、`references/trigger-matrix.md`、`.meta/CATALOG.md` 与 `run_script_smoke_tests.py` 已同步纳入
- [ ] 若脚本用于校验生成型可执行产物，target skill 已把“先校验再纳入真源/评审”提升为 blocker，而不是停留在提示级命令示例
- [ ] 若本次是从 builder 模板派生到其他 skill，已同步更新命令示例、索引和回归
