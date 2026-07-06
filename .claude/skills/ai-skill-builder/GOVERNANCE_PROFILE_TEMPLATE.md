# GOVERNANCE_PROFILE 模板

本文档用于给单个 skill 固定“治理配置层”，把该 skill 的 `archetype`、正文真源入口、默认脚本族、启动期脚本摘要、强制联动文件、脚本配置资产入口、允许例外与迁移状态沉淀到 `.meta/GOVERNANCE_PROFILE.md`，避免这些内容长期散落在 builder 审查结论或临时对话里。

## 何时创建或更新

- 新 skill 首次接入 `ai-skill-builder` 治理时
- 某个 skill 的 `archetype`、正文真源入口、默认脚本族、脚本配置资产入口或启动期脚本摘要发生变化时
- 新增了强制联动文件、允许例外或迁移状态时
- 发现 builder 文档里长期保存了某个 target skill 的具体配置值，需要把这些值回收到 target `.meta/` 时

## 使用原则

- 正文真源仍保留在 skill 自己的 `SKILL.md`、可选 `QUICK_REFERENCE.md`、`modes/*.md` 或可选 `WORKFLOW_STEPS.md`、`references/`、`scripts/`、`scripts/config/`
- `.meta/GOVERNANCE_PROFILE.md` 只负责沉淀治理配置，不反向定义业务规范、技术规范或运行时事实
- 若某个 skill 同时面对“目标真源 / 运行时现状 / legacy 链路 / 兼容聚合输入”，profile 应显式声明“真源规范优先、现状只作补充说明”的边界，并说明保留兼容时的窗口与退出条件
- 若某个 skill 需要治理 legacy 路由、旧 helper、旧契约或双轨资产，profile 应显式声明默认采用“渐进式收口 / 渐进式迁移”而非无迁移方案的大爆炸切换
- 若仓库根目录存在 `AGENTS.md`，它只应声明“命中 skill 后先读 `.meta/GOVERNANCE_PROFILE.md`”这类跨 skill 通用读取原则；不要把当前 skill 的具体脚本清单复制到 `AGENTS.md`
- target 专属红线、局部联动与交付闭环要求优先写入 `.meta/CHECKLIST.md`；不要把这类内容混进 profile
- 扫描发现、修复待办、迁移过程记录分别归 `REVIEW.md`、`ISSUES.md`、`MIGRATION.md`；不要把这些动态内容挤进 profile
- 若 `REVIEW.md` / `ISSUES.md` 体量持续膨胀，优先采用“主账本当前态 + `.meta/archive/` 历史归档”模式，并在 profile 或 `CATALOG.md` 标明归档入口
- 若 skill 当前尚未具备完整 `.meta/` 资产，允许先只落 `.meta/GOVERNANCE_PROFILE.md` 作为治理入口，再逐步补 `CATALOG / REVIEW / ISSUES`
- 若 skill 使用 `skill://...` 作为资源定位协议，profile 应明确它映射到仓库根目录下的 `skills/...`，并说明脚本是否必须支持 `skill://`、完整相对路径与单文件名缩写路径解析
- 若 skill 存在 `scripts/config/*.json`，profile 应说明这些配置是按脚本职责分治还是共享配置，并明确关键配置资产入口
- 若 skill 维护 machine-generated 报告或规则产物，profile 应明确这些产物统一使用仓库相对路径或约定资源路径，不把个人系统目录绝对路径写入 repo
- 若 skill 维护 machine-generated 快照，profile 应明确 `current / report / previous` 三件套的文件名、生成器入口、默认推进规则，以及哪些场景允许重置 `previous` 基线

## 推荐骨架

先按 `archetype` 决定模板如何裁剪，再落下面的骨架；不要把示例中的所有段落机械照抄到每个 skill：

- `backend-source` / `fullstack-orchestrator` / `frontend-specialist`：通常保留“索引入口 + 执行真源 + 可执行真源 + 启动期脚本摘要”完整骨架。
- `lightweight-routing`：允许精简 `modes/*.md` 或旧 `WORKFLOW_STEPS.md`、文档绑定脚本族、执行门禁脚本族等段落；若不存在，统一写 `N/A` 并说明当前只维护 references 路由闭环。
- `builder-audit`：默认不维护 `modes/*.md`、`WORKFLOW_STEPS.md`、`references/index/...`、`scripts/reference_rules.json`、`scripts/select_references.py`、`scripts/validate_reference_triggers.py` 这类 target 运行时路由资产；相关段落统一写 `N/A`，并改写为 builder 自身的治理审计脚本与模板真源，不要为了“套模板完整”虚构不存在的资产。

```markdown
# [skill-name] 治理画像

## 0. 元信息

| 项目 | 内容 |
|------|------|
| skill | `...` |
| archetype | `backend-source` / `fullstack-orchestrator` / `frontend-specialist` / `lightweight-routing` / `builder-audit` |
| 治理定位 | 一句话说明本 skill 在整个 skill 体系中的职责 |
| 当前状态 | 生效中 / 迁移中 / 待补齐 |
| 最后更新 | `YYYY-MM-DD` |

## 1. 正文真源入口

- 必读入口：`SKILL.md`（可选：`QUICK_REFERENCE.md`，若当前 skill 保留速查卡）
- 本地索引与编排真源：`references/index/api-reference.md` + `references/index/*trigger-matrix*.md`（若当前 skill 使用 `bootstrap_refs`，二者应共同构成默认启动集；`builder-audit` 或不维护 route 的 archetype 可写 `N/A`）
- 执行真源：`modes/*.md` 或 `WORKFLOW_STEPS.md`、`references/...`（若当前 archetype 不维护执行骨架，写 `N/A`）
- 可执行真源：`scripts/reference_rules.json`、`scripts/*.py`（若当前 archetype 不维护路由规则文件，可改写为实际持有的审计脚本集合）
- 脚本配置真源：`scripts/config/*.json`
- 资源路径协议：`skill://{path}` -> 仓库根目录 `skills/{path}`

## 2. `.meta` 治理入口

- 本地治理资产：`.meta/GOVERNANCE_PROFILE.md`、`.meta/CHECKLIST.md`、`.meta/CATALOG.md`、`.meta/REVIEW.md` ...
- builder 读取顺序：`GOVERNANCE_PROFILE -> CHECKLIST -> CATALOG -> ISSUES -> REVIEW -> MIGRATION`
- 若当前 skill 采用“索引 + trigger-matrix”双启动资源，builder 读取顺序与正文入口说明也应显式写出这两个启动引用，而不是只留单个 `api-reference.md`

## 3. 默认脚本族

| 脚本族 | 结论 | 说明 |
|--------|------|------|
| 最小可执行脚本族 | ✅ 必需 / 🟡 推荐 / N/A | ... |
| 文档绑定型脚本族 | ✅ 必需 / 🟡 推荐 / N/A | ... |
| 执行门禁型脚本族 | ✅ 必需 / 🟡 推荐 / N/A | ... |
| 领域真源校验型脚本族 | ✅ 必需 / 🟡 推荐 / N/A | ... |
| 治理审计型脚本族 | ✅ 必需 / 🟡 推荐 / N/A | `builder-audit` 默认应在此处标记为 ✅，并说明自身只维护审计脚本、模板与生成器 |

## 3.1 启动期脚本摘要

| 场景 | 首选脚本 | 必用时机 | 备注 |
|------|----------|----------|------|
| reference 路由选择 | `scripts/select_references.py` | 每次进入任务前 | 若 archetype 不维护 references 路由（例如 `builder-audit`），写 `N/A`；若 `reference_rules.json` 存在 `bootstrap_refs`，备注里应写明默认启动集（例如“索引 + trigger-matrix”） |
| 路由规则生成 | `scripts/run_generate_reference_rules.py` / 等价生成器 | 修改 `scripts/reference_rules.source.md` 或等价规则源后 | 若 archetype 不维护规则生成，可写 `N/A`；否则说明生成产物、报告路径与“仅写 machine-generated 派生产物”的边界 |
| 路由规则回归 | `scripts/validate_reference_triggers.py` | 修改 `reference_rules.json`、触发矩阵或路由脚本后 | 若 archetype 不维护 references 路由，可写 `N/A`；若维护则与选择器成对维护 |
| 下游命名同步审计 | `scripts/validate_package_file_naming_sync.py` | 修改目录真源、命名规范或下游 skill 对这些真源的复用边界后 | 若当前 skill 不持有这类上游真源可写 `N/A`；若维护则说明它审计哪些下游入口、路由与回归样例 |
| 脚本配置加载 | `scripts/config/*.json` + 对应 loader | 修改 allowlist / exemption / allowed_* 等稳定例外后 | 说明配置路径、读取入口与失败处理策略 |
| machine-generated 快照刷新 | `scripts/run_generate_*_snapshot.py` / 等价生成器 | 修改脚本能力清单、archetype 画像、脚本回归规模或能力归类口径后 | 若当前 skill 不维护快照则写 `N/A`；若维护则说明 `current / report / previous` 三件套文件名、默认推进规则与允许重置基线的场景 |
| Markdown 引用解析边界 | `scripts/skill_script_utils.py::inspect_markdown_doc_reference` / `resolve_markdown_doc_reference` | 维护索引 / 触发矩阵 / 模板互引或审查引用断链风险时 | 至少说明是否支持 `skill://`、完整相对路径、单文件名缩写路径，以及歧义/断链如何处理 |
| 模板校验 | `scripts/validate_output_templates.py` | 输出 doc/task 后 | 若 archetype 无此脚本族则写 `N/A` |
| 专项回归样例执行器 | `scripts/run_*_case_tests.py` | 修改对应 validator / gate、稳定失败摘要、模板契约字段、红线豁免配置或回归样例集后 | 若当前 skill 不维护稳定 case runner 可写 `N/A`；若维护则写清分别覆盖哪些 validator / gate |
| 一致性校验 | `scripts/validate_solution_consistency.py` | 输出 doc/task 后 | 若 archetype 无此脚本族则写 `N/A` |
| 文档反查 | `scripts/query_doc_map.py` | 需要从代码反查业务文档时 | 若当前 skill 不维护 doc-map 能力则写 `N/A` |
| 严格门禁 | `scripts/run_strict_delivery_gate.py` | 交付前 | 若当前 skill 不维护执行门禁则写 `N/A` |
| 脚本契约审计 | `scripts/validate_script_contracts.py` | 修改脚本族、命名、CLI 契约或 archetype 画像后 | `builder-audit` 默认必填 |
| 脚本模板审计 | `scripts/run_script_template_audit.py` | 封板前或批量治理脚本族后 | `builder-audit` 默认必填，可按需带 `--with-smoke` |
| 脚本族建议 | `scripts/suggest_script_bundle.py` | 新 skill 接入治理、补 profile 或评估 archetype 时 | `builder-audit` 默认推荐填写 |

## 4. 强制联动文件

| 变更类型 | 必须同步 |
|----------|----------|
| reference 路由规则 | `references/index/...`、`scripts/reference_rules.json`、`scripts/select_references.py`、`scripts/validate_reference_triggers.py` |
| 模板契约 | `references/templates/...`、`scripts/validate_output_templates.py`、`scripts/validate_solution_consistency.py` |
| 脚本配置资产 | `scripts/config/*.json`、对应 loader、`scripts/validate_script_contracts.py`，以及引用这些配置的 profile / 命令示例 |
| 治理审计脚本 | `scripts/validate_script_contracts.py`、`scripts/run_script_template_audit.py`、`scripts/suggest_script_bundle.py`，以及 profile 中的 archetype / 启动期脚本摘要 / 允许例外 |

## 5. 真源复用与边界

- 上游真源：...
- 下游复用方：...
- 本地持有能力：...
- 上游复用能力：...
- 必须切换场景：...
- 禁止重复定义：...
- 真源规范优先：目标真源 / 运行时现状 / 遗留兼容边界如何区分
- 渐进式收口原则：哪些场景默认双轨兼容 / 双注册 / 灰度切流，哪些场景允许一次性切换

## 6. 允许例外

| 项目 | 例外说明 | 留档位置 |
|------|----------|----------|
| ... | ... | ... |

## 7. 暂不治理项

- ...

## 8. 迁移状态

- 当前阶段：...
- 下一步：...
```

## 填写建议

- `archetype` 只写一种主 archetype，避免一个 profile 同时扛两套脚本族决策
- `lightweight-routing` 是轻量路由 archetype 的唯一命名；不要再写 `lightweight-reference` 之类的旧口径
- `启动期脚本摘要` 只保留“场景 -> 首选脚本 -> 必用时机 -> 备注”这类决策级信息，不要把完整 CLI 手册整段复制进 profile
- 若 `reference_rules.json` 使用 `bootstrap_refs` 且包含 trigger-matrix，profile 与 `SKILL.md` 不要再写成“先读索引再决定”；应统一写成“索引 + trigger-matrix 共同构成默认启动集，再由 selector 扩展”
- 若存在 `scripts/config/*.json`，优先在 profile 中说明“配置资产入口 + loader + 失败处理”，不要只把配置文件名埋在脚本实现里
- `SKILL.md` 应保留最小命令入口；`GOVERNANCE_PROFILE.md` 负责沉淀脚本发现规则，二者内容要一致但职责不要重叠
- 若仓库级 `AGENTS.md` 需要补说明，只补“先读 profile、不要猜脚本”这类全局原则，不把 profile 的脚本细节再复制一遍
- 若 archetype 为 `builder-audit`，优先填写“治理审计型脚本族 + 审计脚本摘要 + 模板/生成器真源”；对 `modes/*.md`、`WORKFLOW_STEPS.md`、route index、`reference_rules.json`、`select_references.py`、`validate_reference_triggers.py` 等不适用项显式写 `N/A`，不要为了模板完整性补假入口
- 若 skill 维护 machine-generated 快照，优先按 `*_snapshot.json` / `*_snapshot.report.md` / `*_snapshot.previous.json` 三件套命名，并在 profile 中写清：谁负责刷新、何时推进 `previous`、什么情况下允许重置基线
- 若当前 skill 使用 `skill://...` 或支持单文件名缩写路径，优先在 profile 中写清“资源路径协议 / 完整相对路径支持 / 缩写路径支持边界 / 歧义与断链处理方式 / 可选治理资产豁免”，避免这些启动期规则散落在脚本实现里
- 若 skill 维护 `reference_rules` 路由体系，回归样例设计优先覆盖边界切换场景、辅助资产场景、高风险交付场景与组合场景，不要只追求 case 数量
- `强制联动文件` 优先写真正会造成漂移的联动，不要把所有相关文件都抄成超长清单
- `允许例外` 必须可解释、可回收，最好附上未来收口条件；若已经把稳定例外下沉到 `scripts/config/*.json`，此处优先记录入口与收口条件，而不是重复抄整份名单
- 若 skill 同时维护“目标真源”和“遗留兼容说明”，优先在 `真源复用与边界` 或 `允许例外` 中显式写出：何者是默认正例、何者只是迁移补充，以及兼容窗口 / 去兼容触发条件
- 若某条规则只对当前 target skill 生效，优先放进该 skill 的 `.meta/CHECKLIST.md`，不要回灌到 builder 全局 checklist
- 若某条规则属于全 skill 通用元规则，应回写 builder，而不是塞进某个 target skill 的 profile
