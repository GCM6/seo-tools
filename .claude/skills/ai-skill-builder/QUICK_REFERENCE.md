# Skill 治理速查卡

> **定位**：Skill Builder 每次执行前的红线启动卡。
> **必读时机**：执行 `Scan` / `Fix` / `Add` / `Deduplicate` 前。

---

## 路径归属

- `ai-skill-builder` 自身采用“4 个主入口 + 1 个全局 checklist + 2 个模板 + scripts”模型：4 个主入口文件 `SKILL.md`、`QUICK_REFERENCE.md`、`REFERENCE_WRITING.md`、`SCRIPT_TEMPLATES.md`，1 个 builder 全局检查清单真源 `.meta/GLOBAL_CHECKLIST.md`，2 个 target 模板 `GOVERNANCE_PROFILE_TEMPLATE.md`、`TARGET_CHECKLIST_TEMPLATE.md`，以及 `scripts/` 下的治理审计工具层。
- 本文提到的 `modes/*.md`、可选 `WORKFLOW_STEPS.md`、`references/*`、`templates/*`、`scripts/*`、`scripts/config/*.json`，以及目标 skill 的 `.meta/*`，默认都指向被治理对象；其中 `.meta/GOVERNANCE_PROFILE.md` 负责沉淀治理配置与例外项，`.meta/CHECKLIST.md` 负责沉淀该 skill 的专属红线与强制联动检查项。
- 若文档或脚本中出现 `skill://{path}`，统一按仓库根目录下的 `skills/{path}` 解析；对 LLM 来说，它表示“可继续读取的本地 skill 资源路径”。

---

## 开工前 30 秒

0. **判定 debug**：用户说 `debug`/`调试`/`显示过程`/`verbose`/`debug-verbose`/`详细调试`/`显示所有变量` → debug = on → 加载 `.meta/debug-output.md`，每个步骤强制输出思考链。不区分档位，开启即最详细。默认 off。
1. 先读 `.meta/GLOBAL_CHECKLIST.md`，对 builder 全局治理红线逐条排雷。
2. 若仓库根目录存在 `AGENTS.md` 且其中声明了 skill 读取顺序，先遵守其全局路由原则；但 `AGENTS.md` 只负责“先读哪里、不要猜什么”，不承载 target-specific 脚本清单。
3. 若被治理对象存在 `.meta/GOVERNANCE_PROFILE.md`，优先读取，先确认 `archetype`、正文真源入口、默认脚本族、启动期脚本摘要、强制联动文件、允许例外，以及是否存在关键 `scripts/config/*.json` 配置资产。
4. 若被治理对象存在 `.meta/CHECKLIST.md`，继续读取，确认该 skill 的专属红线、局部真源口径与交付闭环要求。
5. 再确认目标：本体治理 / 下游去重 / 迁移残留 / 模板一致性。
6. 再按 `SKILL.md` 选择动作：`Scan` / `Fix` / `Add` / `Deduplicate` / `Update`。
7. 涉及新增或修改被治理对象的 `references/` / `templates/` 时，补读 `REFERENCE_WRITING.md`。
8. 涉及新增或修改被治理对象的 `scripts/*.py` / `scripts/config/*.json` / `reference_rules.json` 时，补读 `SCRIPT_TEMPLATES.md`。
9. 若看到 `skill://...`、上游真源与当前 skill 场景补充同时出现，先确认它们分别指向哪个 skill 目录，再判断责任边界是否被写清。
10. 若要快速判断被治理 skill 当前自持哪些脚本族、哪些能力必须升级，先看 `SCRIPT_TEMPLATES.md §3.2`；若要拿 machine-generated 对照，读取 `scripts/core_skill_script_snapshot.report.md`，重点看 `§1` 建议回写表与 `§2` 变更摘要，并用 `run_generate_core_skill_snapshot.py` + `validate_core_skill_snapshot_drift.py` 刷新与检查快照。
11. 若这轮是 builder 自检或交接，先读 `scripts/README.md`；里面集中写了默认链路、`--refresh-generated` 的一键用法，以及 `core_skill_script_snapshot.previous.json` 的生命周期。
12. 若本轮同时改了 archetype 口径、builder 入口文档或速查卡，继续跑 `validate_builder_archetype_consistency.py`、`validate_builder_entrypoints.py`，最后再收口到 `run_script_template_audit.py --skill-root skills/backend/ai-skill-builder --archetype builder-audit --refresh-generated --strict --with-smoke`。

## 一票否决

详见 `.meta/GLOBAL_CHECKLIST.md` 与目标 skill 的 `.meta/CHECKLIST.md`：
- `GLOBAL_CHECKLIST` — builder 全局治理边界、路由闭环、脚本契约与收尾审查
- `target/.meta/CHECKLIST.md` — 该 skill 的专属真源口径、局部联动与交付闭环
- 人工维护正文禁止脚本直写；若需固化 `reference_rules.source.md`，只允许官方生成器写 `scripts/reference_rules.json`、`scripts/reference_rules.report.md` 等 machine-generated 派生产物
- 个人系统目录绝对路径禁止写入 repo 文件；仓库正文、模板、治理台账与脚本配置统一使用相对路径、`skill://` 路径或项目产物路径表达
- 修改 `scripts/reference_rules.source.md` 或等价路由规则源后，必须完成“生成 `scripts/reference_rules.json` / `scripts/reference_rules.report.md` -> schema 校验 -> trigger 回归”闭环，不能只改规则源正文
- 不得因为现网仍有 legacy 写法、兼容聚合输入或临时协作链路，就把它们回写成新的默认正例；若短期保留兼容，必须写清兼容窗口与退出条件
- 若 builder 已把文件粒度治理升级到“上下文预算 + 分层阈值”，但 `QUICK_REFERENCE.md` / `REFERENCE_WRITING.md` / 被治理对象入口（如 `SKILL.md`、`modes/*.md` 或旧 `WORKFLOW_STEPS.md`）仍只保留旧 `<500` 行口径，不得封板
- 若某项 compare / validate / patch / gate 能力已经迁入 target skill，自此应以 target skill 为唯一入口；不要继续让项目侧旧脚本和旧文档描述并存
- 目录规范、补丁命名、脚本入口名一旦变更，封板前必须回扫 README、模板、设计文档、下游 skill 与示例命令，清理残留旧口径
- 遇到 DDL / patch / migrator 规范治理时，先区分“git 真源 SQL”与“本地执行层 patch”，再决定规则应写进哪个 skill 或 `AGENTS.md`

## 强建议

- 被治理对象的普通业务文件优先 `150~500` 行；`>500` 先评估拆分；`>700` 默认阻断，除非 task 或正文写明豁免原因。
- 核心分层文件优先控制在 `400` 行内；测试文件 `>600` 优先拆分；工作流聚合文件 `>800` 行或职责混杂时必须拆分、索引化或显式记录豁免。
- 若本轮治理涉及工作流或模板契约，被治理对象应显式写出 `候选文件池 / 热工作集 / 延后文件 / 超长文件处理`，并把热工作集预算控制在 `S<=4 / M<=6 / L 单切片<=8`。
- 目标 skill 的治理配置、联动关系与允许例外，优先下沉到其 `.meta/GOVERNANCE_PROFILE.md`；builder 只保留元规则、模板与审计方法。
- 仓库根目录 `AGENTS.md` 若存在，只保留跨 skill 通用的读取 / 路由原则；具体脚本名、默认脚本族、`N/A` 能力仍以下沉到 target `.meta/GOVERNANCE_PROFILE.md` 为准。
- 若文案同时引用上游真源与当前 skill 场景补充，优先用“两段式”写法显式表达边界，不要用“及其 xxx 为准”这类容易改歪原意的句式。
- target 的 `.meta/REVIEW.md` / `.meta/ISSUES.md` 过重时，优先采用“主账本仅保留当前有效态 + `.meta/archive/` 归档完整历史”的轻量模式，并在 `CATALOG` 或 profile 中补归档入口。
- 修改某个 skill 的 `scripts/*.py`、`scripts/config/*.json` 或 `reference_rules.json` 时，优先同步检查 sibling skill 的同构脚本是否也需要一起修改，尤其是 `select_references.py`、`validate_reference_triggers.py`、模板校验脚本和一致性校验脚本。
- `validation_cases` 不只看数量，至少应覆盖：边界切换场景、辅助资产场景、高风险交付场景、组合场景；避免只堆低价值单关键词样例。
- `scripts/config/*.json` 也是脚本治理真源；allowlist / exemption / allowed_* 这类稳定例外优先下沉到配置，并按脚本职责分治，不要一开始合成总 JSON。
- 配置读取优先懒加载；不要在 import 阶段全局硬读配置，把单个坏配置放大成整组脚本不可用。
- 新增 skill 的脚本默认从 `SCRIPT_TEMPLATES.md` 派生，不再直接从 sibling skill 拷贝整套脚本后各自生长。
- 脚本命名优先使用稳定动词前缀：选择器用 `select_*`，查询器用 `query_*`，执行器用 `run_*`，校验器用 `validate_*`，规则文件用 `*_rules.json`；不要在同一类脚本中混用 `find_*`、`strict_*`、`check_*`、`verify_*`。
- 若目标 skill 尚无 `.meta/GOVERNANCE_PROFILE.md`，本轮治理应优先补齐，再继续扩写具体例外或脚本策略。
- 治理画像优先使用“三段式表达”：`本地持有能力 / 上游复用能力 / 必须切换场景`，避免只写一段“大而全定位”。
- builder 自身若改了核心 skill 快照、archetype 矩阵或入口说明，默认执行 `run_generate_core_skill_snapshot.py -> validate_core_skill_snapshot_drift.py -> validate_builder_archetype_consistency.py -> validate_builder_entrypoints.py -> run_script_template_audit.py --refresh-generated`。
- 涉及 legacy 路由、旧 helper、mock 切真实、字段冻结或双轨资产时，默认采用渐进式收口；除非用户明确要求一次性切换，否则不要直接走大爆炸重写。
- 封板前一定执行 `Closing Audit`，确认 builder 入口、被治理对象的 `.meta/GOVERNANCE_PROFILE.md`、`.meta/CHECKLIST.md`、速查卡、模板与索引已同步；若该 skill 还维护 `.meta/CATALOG.md`，也要一并核对。

---

## 常用指令卡

| # | 指令 | 执行要点 |
|---|------|---------|
| 0 | **Debug** — 调试模式 | 单档位：命中任一 debug 关键词 → on → 加载 `.meta/debug-output.md`。每个步骤独立输出自然语言思考链（为什么做 → 看到了什么 → 结论）。启动时先验证思维链正常开启。每阶段结束做防偷懒检查。 |
| C | **Create** — 创建新 skill | 确认名称+archetype+描述 → 加载 `SKILL_TEMPLATE.md`+`DEBUG_OUTPUT_TEMPLATE.md`+`GOVERNANCE_PROFILE_TEMPLATE.md` → 按 archetype 映射表替换 `{DOMAIN_*}` → 创建完整目录结构 → 注册 symlink |
| 1 | **Scan** — 全量扫描 | 读取被治理对象的 references；若命中路由、脚本、索引、回归规则，再同时读取 scripts → 对照 builder `.meta/GLOBAL_CHECKLIST.md` 与 target `.meta/CHECKLIST.md`（若存在）排雷 → 评估维度表 → 代码比对 → 输出 REVIEW + ISSUES |
| 2 | **Fix** — 修复债务 | 读 ISSUES → 按优先级修复 → 全局搜残留 → 回填状态 |
| 3 | **Add** — 补齐文档 | 读被治理对象的 `.meta/GOVERNANCE_PROFILE.md`；若存在 `.meta/CATALOG.md` 再一起加载 → 定归属目录 → 挖掘源码 → 用模板写三要素文档 → 自检门禁 → 更新索引 |
| 4 | **Cross-Check** — 冲突互查 | 选核心概念 → `rg` 全目录 → 冲突对比表 → 统一修改 |
| 4b | **Deduplicate** — 跨 skill 去重治理 | 扫描 `skills/**` 中重复规范 → 判断删/引/留/独立拆分 → 统一改索引、规则、模板、脚手架、回归 |
| 4c | **Norm Audit** — 规范真源审计 | 固定输出"目标规范 / 当前偏离 / 是否真实兼容 / 应回写的 skill 文件"，禁止把现状直接写成真源 |
| 5 | **Restructure** — 目录重构 | 优先读被治理对象的 `.meta/GOVERNANCE_PROFILE.md`；若存在 `.meta/CATALOG.md` 再结合索引分析合理性 → 移动文件 → 替换路径引用 → 验证无断链 |
| 6 | **AI Audit** — LLM 可读性审查 | builder 的 QUICK_REFERENCE / SKILL 保持轻量入口；被治理对象的 SKILL / modes / references 分层明确 → 重复检测 → R1 有 ★/◇ → 被治理对象存在 `modes/*.md` 或旧 `WORKFLOW_STEPS.md`，且启动清单有强制加载引用 |
| 6b | **Cross-Field Check** — 工作流表格交叉比对 | 工作流表格的「注意事项」列必须与「场景执行骨架 A-G」的「文档模板」行逐列比对，不得孤立评判单元格；发现硬编码单一模板但场景骨架指定多个时，需更新为按场景选模板 |
| 7 | **Polish** — 排版文案整理 | 读 builder 全部入口文件 + 被治理对象改动过的 references → 清理多余空行 → 修正章节编号跳号 → 消除重复内容 → 若存在 `.meta/CATALOG.md` / `.meta/REVIEW.md` 则同步回写 |
| 8 | **Template Audit** — 模板一致性审查 | 联合对比所有 templates → 章节标题格式 → 表头措辞 → 元信息字段名 → 使用规则格式 → 触发条件段 |
| 9 | **Doc Audit** — 覆盖率闭环审查 | 确认工作流中生成/使用覆盖率报告的步骤 → SKILL.md/unit-testing.md/code-review.md 三者表述一致 |
| 10 | **Closing Audit** — 封板同步审查 | 反查 builder 的 `SKILL.md` / `QUICK_REFERENCE.md` / `REFERENCE_WRITING.md` / `.meta/GLOBAL_CHECKLIST.md`，以及被治理对象的 `.meta/GOVERNANCE_PROFILE.md` / `.meta/CHECKLIST.md` / `SKILL.md` / `modes/*.md` / 可选 `WORKFLOW_STEPS.md` / 可选 `QUICK_REFERENCE.md` / templates；若存在 `.meta/CATALOG.md` / `.meta/ISSUES.md` / `.meta/REVIEW.md`，也同步核对：步骤摘要、门禁分层、模板元信息、职责边界、治理配置、测试问题总结、术语体系、`热工作集预算 / 超长文件处理字段` 与 skill 回写闭环是否已同步 |
