# 后端规范治理全局检查清单 (G-01 ~ G-36)

> **定位**：`ai-skill-builder` 的全局治理检查清单单一真源。
> **使用方式**：builder 入口文件统一引用本文；单个 target skill 的专属口径写入该 skill 的 `.meta/CHECKLIST.md`，不再反向堆回 builder。

---

## 治理边界与真源口径（G-01 ~ G-07）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-01 | builder 与 target 职责边界 | builder 只保存元规则、模板、审计方法；target 保存自身真源口径与联动 | builder 长期保存某个 target 的专属规范或例外 |
| G-02 | target-specific 配置归属 | `archetype`、默认脚本族、启动期脚本摘要、强制联动文件、允许例外、迁移状态，以及关键脚本配置资产入口写入 target `.meta/GOVERNANCE_PROFILE.md`；仓库级 `AGENTS.md` 只保留跨 skill 通用路由原则 | 把某个 target 的具体配置值散落在 builder 正文或仓库级 `AGENTS.md` |
| G-03 | target-specific checklist 归属 | 单个 skill 的专属红线写入 target `.meta/CHECKLIST.md` | 把目标 skill 的局部规则继续放在 builder 全局 checklist |
| G-04 | 动态扫描结果归属 | 扫描发现、待办、迁移记录分别写 `REVIEW.md`、`ISSUES.md`、`MIGRATION.md` | 把动态结论写进 checklist 或 profile |
| G-05 | 单一权威来源 | 同一条规范只在一个文件中完整定义，其他文件只保留摘要加引用 | 同一条规范在 2 个以上文件中各写一半 |
| G-06 | 内部引用完整路径 | skill 内部统一写 `references/...`、`.meta/...`、`scripts/...` 完整相对路径 | 使用 `arch/...`、`quality/...` 这类缩写路径 |
| G-07 | `skill://` 资源路径协议 | `skill://{path}` 统一表示仓库根目录下的 `skills/{path}`，文档、脚本与 LLM 解释使用同一映射 | 把 `skill://...` 当成普通展示字符串，或在不同文件里发明不同解析方式 |

## 文档、索引与路由闭环（G-08 ~ G-14）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-08 | 入口职责分离 | builder 的 `QUICK_REFERENCE.md` 放速查，`SKILL.md` 放路由与流程；target 的 `WORKFLOW_STEPS.md` 放执行细则 | 三份入口文档重复堆同类细节 |
| G-09 | 路由声明执行化 | 索引、触发矩阵、脚本路由、回归样例对同一规则结论一致 | 只改手写说明，不改脚本或回归 |
| G-10 | 强制联动不得降级 | 文档写“命中即必须联动”时，脚本输出必须进入已加载 refs | 只把强制联动降成 guidance / recommended hints |
| G-11 | 跨文件重复消解 | 同一结构体、规则、模板字段重复 3 次以上时，收口到单一真源 | 任由同构内容在多文件继续漂移 |
| G-12 | 跨 skill 真源一致性 | 下游 skill 通过引用上游真源或保留场景补充来收口 | 为下游 skill 再复制第二套基础真源 |
| G-13 | 迁移残留清理 | 文件重命名、目录调整、skill 独立后，全量替换旧路径、旧文件名、旧术语 | 新目录已生效，但索引、脚本、模板仍残留旧路径 |
| G-14 | 迁移语义边界保持 | 路径 / URI 替换后，原本的“上游真源 / 当前 skill 场景补充”边界仍清晰存在；运行时现状、legacy 链路、兼容聚合输入只能作为补充说明，不得反写为主真源；若保留兼容，需显式写清窗口与退出条件 | 只改路径就把双边界误改成“只看上游真源”或“本地第二套真源”，或因为现网仍存在旧链路/兼容输入就把它们重新写成默认规范 |

## 脚本契约与收尾闭环（G-15 ~ G-26）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-15 | 脚本族闭环 | selector、validator、rules 真源、必要回归齐全；按 archetype 增减脚本族 | 只有路由脚本，没有 schema / contract / regression 闭环 |
| G-16 | CLI 契约与启动暴露统一 | `select_*`、`validate_*`、`query_*`、`run_*` 的参数、退出码、文本与 JSON 输出风格一致；target `.meta/GOVERNANCE_PROFILE.md` 提供启动期脚本摘要，`SKILL.md` 保留 `## 可执行脚本` 最小命令入口，二者结论一致 | 同类脚本各自发明参数名和输出结构，或脚本明明存在但主入口 / profile 没有稳定暴露 |
| G-17 | utils 下沉边界 | 通用文件读取、路径归一化、提取器、`skill://` / Markdown 引用解析下沉到 `skill_script_utils.py`；配置读取器可下沉，但不把业务规则塞进 utils | 每个脚本重复 helper，或把业务规则塞进 utils |
| G-18 | Markdown 引用解析回归闭环 | 若 skill 存在 Markdown 引用校验，`validate_reference_triggers.py` 或等价脚本必须覆盖 `skill://`、完整相对路径、单文件名命中、单文件名歧义、单文件名断链五类回归，并显式区分 `missing` 与 `ambiguous` | 只校验带 `/` 的路径，或把单文件名缩写路径静默跳过 |
| G-19 | gate / validator 分层 | `validate_*` 暴露 `run_validation()`；`run_*` 只做编排 | gate 里重写校验逻辑，validator 无统一入口 |
| G-20 | 封板同步审查 | 收尾时反查 builder 入口、target profile、target checklist、索引、模板与回归是否同步 | 只改细则正文，不改入口摘要与治理入口 |
| G-21 | 测试发现驱动 skill 进化 | 若测试暴露 skill 规则遗漏/矛盾，同轮回写对应 skill 文件，并在最终答复汇报“本轮 skill 演化结果” | 只修业务代码，不沉淀规则问题 |
| G-22 | 脚本配置资产治理 | `scripts/config/*.json` 与 `scripts/*.py`、`reference_rules.json` 一样属于脚本真源；allowlist / exemption / allowed_* 优先按脚本职责分治下沉，读取时避免 import 阶段全局硬加载，并对缺失/坏配置给出清晰失败信息 | 把治理例外长期埋在脚本常量里、把全部配置糊成总 JSON，或在 import 时硬读配置把整条脚本链拖死 |
| G-23 | 默认启动集口径一致 | 当 `reference_rules.json` 使用 `bootstrap_refs` 且包含索引 + trigger-matrix 时，`SKILL.md`、`.meta/GOVERNANCE_PROFILE.md`、索引页、trigger-matrix 必须统一表述为“共同构成默认启动集 / 默认启动引用”；不得继续写成“默认只先读索引” | 运行时已按 `bootstrap_refs` 启动，但入口文案仍写“先读 api-reference.md”，导致脚本 PASS 但 LLM 被旧话术误导 |
| G-24 | 生成器写入边界 | 官方生成器可写 `scripts/reference_rules.json`、`scripts/reference_rules.report.md` 等 machine-generated 派生产物与临时校验文件；`SKILL.md`、`references/*.md`、`templates/*.md` 等人工维护正文统一使用受控编辑工具 | 把“禁止脚本直写正文”误解成连派生产物也不能生成，或反过来用临时脚本直接覆盖人工维护正文 |
| G-25 | 新增脚本的可发现性扇出 | target 新增或重命名 `scripts/*.py` 后，至少同步检查 `SKILL.md` 的 `## 可执行脚本`、`.meta/GOVERNANCE_PROFILE.md` 的启动期脚本摘要、`references/reference-index.md`、`references/trigger-matrix.md`、`.meta/CATALOG.md` 与 `run_script_smoke_tests.py` | 脚本文件已经存在且能跑，但入口文档、索引、catalog 或冒烟清单没有同步，导致 skill 内不可发现或后续回归漏检 |
| G-26 | 生成型产物校验门禁上移 | 若 target skill 负责生成可执行产物（如 SQL、patch、配置片段、可执行脚本模板）且已存在相应校验器，需把“先校验再纳入真源/评审”提升为 blocker，并同步写入 `QUICK_REFERENCE.md`、`SKILL.md`、`WORKFLOW_STEPS.md` 与 target `.meta/CHECKLIST.md` | 校验器只写在 reference 提示或 README 里，实际流程仍把生成型产物当“建议校验”，导致模型在交付时跳过预检 |
| G-27 | 禁止写入个人系统目录 | 仓库正文、模板、治理台账、脚本配置与审查记录统一使用仓库内相对路径、`skill://` 路径或项目产物路径；桌面端可点击绝对路径仅限对话回复，不写入 repo 文件 | 在 `SKILL.md`、`references/*.md`、`templates/*.md`、`.meta/*.md`、`scripts/*.json` 等仓库资产中写入 `/D:/...`、`C:/Users/...`、`/Users/<name>/...` 等个人系统目录绝对路径 |
| G-28 | skill 能力必须自持 | skill 内声明为“当前生效”的 compare / validate / context prepare / gate 能力，应由该 skill 自身持有并维护 | skill 正文宣称某能力已内聚，但实际仍反向依赖项目目录中的旧脚本或临时实现 |
| G-29 | 目录/命名迁移要做残留回扫 | 调整目录规范、补丁命名、脚本入口名、真源路径后，同轮同步扫描 README、模板、设计文档、下游 skill 与示例命令 | 只改正文真源，不清理旧 `patches` / 旧脚本名 / 旧术语残留 |
| G-30 | 从目录级表述升级到真源级表述时必须全链同步 | 迁移到文件级真源表述时，同时更新正文、示例、脚本参数、校验门禁与任务模板 | 只把一句话改成文件级路径，但示例命令、gate 输入、模板字段仍停留在目录级写法 |
| G-31 | patch 与 git 真源严格分层 | 执行层 patch 始终视为本地执行产物；git 真源仍由 `migrator/.../{domain}/{module}.sql` 承担 | 把 patch 文件、patch 目录或 patch 命名规则误升格成新的 git 真源，形成双真源 |

## 治理台账与回归样例质量（G-32 ~ G-36）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-32 | 路由规则源改动必须闭环再生效 | 修改 `scripts/reference_rules.source.md` 或等价规则源后，同轮生成 `scripts/reference_rules.json` 与 `scripts/reference_rules.report.md`，再跑 schema 校验与 trigger 回归；报告中路径统一使用仓库相对路径或约定资源路径 | 只改规则源正文或只手改 JSON，不生成 report、不跑回归，或把个人系统目录绝对路径写进 report |
| G-33 | `validation_cases` 必须覆盖高价值触发面 | 回归样例至少覆盖边界切换场景、辅助资产场景、高风险交付场景、组合场景；新增规则需有能证明“命中/不命中/不误命中”的样例 | 只堆普通单关键词样例，缺少切换、组合、高风险和资产型案例，导致规则看似有量但缺少实战覆盖 |
| G-34 | REVIEW / ISSUES 主账本必须可维护 | 主账本优先保留当前有效态；历史扫描可归档到 `.meta/archive/`，并在 `CATALOG` 或 profile 留出入口，避免主账本无限膨胀 | 所有历史记录持续堆在主账本，导致入口过重、后续审查成本持续抬高 |
| G-35 | 消费侧 API 文档边界示例完整性 | 面向前端 / AI 直接消费的 API 文档，只要存在可空对象、空集合或明显边界成功场景，就补边界成功示例，或补字段可空矩阵 / 前端判空 checklist | 只给主成功示例与失败示例，让调用方自己猜 `null / [] / ""` 分支 |
| G-36 | 空值示例必须符合类型系统真源 | 文档里的 `null / "" / []` 示例必须与目标语言/框架的类型系统实际序列化语义一致；未赋值字段不写成空字符串 | 类型系统明明序列化为 `null`，文档示例却长期写成 `""`，导致消费侧按错分支实现 |

## SKILL.md 自一致性规则（G-37 ~ G-42）

> 以下规则从 `/ai-backend` skill 多轮治理中提炼，适用于所有使用 FORMAT 桶（TERMS/ENUM/STATE/RULES/BLOCKERS/CHECK/ORDER）结构的 skill。

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-37 | **变量活性**：STATE/ENUM 无死变量 | STATE 中每个变量至少被一条 RULE/ORDER 读取或写入；ENUM 中每个枚举值至少被一条 RULE 赋值 | STATE 声明了 `blockers = []` 但全文无 RULE 使用；ENUM 声明了 `worktree: optional` 但所有 RULE 只写 `required` / `not_needed` |
| G-38 | **条件门禁一致**：ORDER step 之间的依赖条件传递 | ORDER step N 消费 step M 条件加载的资源时，step N 必须与 step M 共享同一 `IF condition THEN` 门禁 | step 2 写 `IF debug THEN 加载 debug-output.md`，step 4 却无条件写 `输出 CLASSIFY 调试摘要（格式见 debug-output.md）` — debug=false 时格式文件未加载，step 4 无法执行 |
| G-39 | **副本文档真源一致**：派生文件不得改写 SKILL.md 规则 | variable-guide、QUICK_REFERENCE 等副本文档复述 SKILL.md 规则时，条件/结论/优先级必须与 SKILL.md 逐字一致；只允许精简措辞，不允许自行收紧/放宽/添加条件 | SKILL.md 写 `IF mode = standard THEN doc_strategy = light`（无条件），variable-guide 却写 `mode = standard + contract_change = true → light`（加了 contract_change 前提），两个条件不同 |
| G-40 | **路径解析正确**：自动前缀 + 文件名 → 文件存在 | 若 ORDER/加载规则对文件名自动拼接目录前缀（如 `references/{name}`），则集合中每个文件名解析后必须指向实际存在的文件 | reference_set 包含 `templates/code-template.md`，ORDER 写"加载 references/ 文件"将其解析为 `references/templates/code-template.md`，但文件实际在 skill 根目录的 `templates/code-template.md` |
| G-41 | **脚本用途分层**：内部工具脚本不入项目验证流程 | skill 自身规则检测/治理脚本（如 validate_rule_conflicts.py）属于 skill 内部工具，不得放在"对项目代码执行的验证脚本"流程中（如 §8.2 VALIDATE） | 把检测 SKILL.md 规则冲突的脚本与 validate_log_format.py / validate_error_handling.py 并列，AI 会尝试对项目代码执行它 |
| G-42 | **元项分层**：治理项不入任务 CHECK 列表 | 仅 skill 维护者关心的治理约束写入 NOTE / .meta/ 文件；每次任务执行时逐条检查的 CHECK 列表只含与当前任务质量相关的项 | "未把 ai-backend-expert 的重型脚本复制为本 skill 默认步骤"是 skill 治理元项，却放在 CLASSIFY 阶段的任务 CHECK 列表中 |

## Debug 可探性与执行透明度（G-43 ~ G-48）

> 从 `/ai-backend` skill 多轮 debug 迭代中提炼。适用于任何需要运行时可见性的 skill。

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| G-43 | **Debug 单一档位**：只设 on/off，不设多档位 | `debug: false \| true`。开了就输出人类可读的逐步追踪，不区分"简版/全版/追踪版" | `debug: false \| light \| full \| trace` 四个档位，触发词、加载规则、输出格式各不同，增加认知负担和规则维护成本 |
| G-44 | **Debug 全量覆盖**：所有阶段可审计，无盲区 | 从 READ→ENTRY→CLASSIFY→PLAN→EXECUTE→VALIDATE→REVIEW→FINAL 每个阶段都有 trace 模板。特别是 EXECUTE 阶段（真正"动手"的地方）必须步进追踪每个 step + GLOBAL_BLOCKERS 抽查 + 执行纪律检查；CHECK/REVIEW 的每条检查项必须逐条输出 ✓/✗/N/A | EXECUTE 阶段只输出 "ORDER = EXEC_design" 一行；CHECK/REVIEW 只说"全部通过"而无逐条状态 |
| G-45 | **思维链上下文消化**：每次行动前展示已知/未知/策略 | 每次 grep/读文件/改代码/跑命令前输出: 已知(已掌握的上下文) + 未知(要填补的缺口) + 策略(分几步、为什么这样分) + 预期(最可能的结果及备选)。禁止仅描述动作 | "现在 grep dashboard 代码, 预期找到 repo 文件"——只有动作描述, 没有展示对用户上下文的消化 |
| G-46 | **打断门禁强制执行**：打断是 ORDER 的显式 step，由 BLOCKER 保护 | 打断检查作为 ENTRY GATE 的独立 step（如 §4.0 step 4），在 CLASSIFY 完成后、PLAN 之前执行。配 2+ 条 BLOCKER: "NEVER 跳过打断检查" + "NEVER 在 interrupt=true 时继续"。5 问用 RULES 体定义（每条 IF-THEN 可判定），不依赖 AI 自我评估 | 打断规则散落在 §4.1 和 §5.3 两处，无显式 ORDER step，无 BLOCKER 阻断跳过行为。AI 可自我判定"够确定"绕过 |
| G-47 | **规则体格式优先**：核心决策用 RULES/BLOCKERS/CHECK 桶，不用表格或叙事 | IF-THEN 可判定规则写入 RULES；绝对禁令写入 BLOCKERS（NEVER 开头）；检查清单写入 CHECK。禁止用 Markdown 表格承载"触发条件 vs 动作"的决策映射（AI 读表格像参考资料，读 RULES 像指令） | 打断 5 问用 Markdown 表格描述："\| # \| 问题 \| 不确定的表现 \| 确定的条件 \|"——AI 读过去像查阅手册，不会逐条执行 |
| G-48 | **Debug trace 自然语言化**：叙事推理为主，规则标注为辅 | 每阶段用自然段落描述推理过程（"用户说的是 X，没有 Y，所以排除 Z。关键信号是 W——命中了场景 A"）。规则引用作为括号标注 `(§5.1 R3)`。末尾一行审计汇总 `— 已检查 N 条规则, 全部覆盖` | 逐条 `RULE: IF...→ 匹配/不匹配` 的机器腔 dump，读起来像日志文件而非人类推理过程 |
