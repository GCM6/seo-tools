# Reference 文档书写规范

本文档定义 `ai-skill-builder` 在新增或修改被治理对象的 `references/` / `templates/` 时使用的统一写作规范与自检门禁；涉及脚本时改读 `SCRIPT_TEMPLATES.md`。

## 何时读取

- 主触发关键词：新增规范、补齐 reference、修改模板、统一模板元信息
- 必读时机：新增或修改被治理对象的 `references/*.md`、`references/templates/*.md` 时

---

## 路径归属

- `ai-skill-builder` 自身采用“4 个主入口 + 1 个全局 checklist + 2 个模板 + scripts”模型：4 个主入口文件 `SKILL.md`、`QUICK_REFERENCE.md`、`REFERENCE_WRITING.md`、`SCRIPT_TEMPLATES.md`，1 个 builder 全局检查清单真源 `.meta/GLOBAL_CHECKLIST.md`，2 个 target 模板 `GOVERNANCE_PROFILE_TEMPLATE.md`、`TARGET_CHECKLIST_TEMPLATE.md`，以及 `scripts/` 下的治理审计工具层。
- 本文提到的 `references/`、`templates/`、`modes/*.md`、可选 `WORKFLOW_STEPS.md`、`scripts/`、`scripts/config/*.json`，以及目标 skill 的 `.meta/` 内容，默认都指向被治理对象，通常是 `ai-backend-expert/`；其中 `.meta/GOVERNANCE_PROFILE.md` 负责沉淀治理配置、联动关系与允许例外，`.meta/CHECKLIST.md` 负责沉淀该 skill 的专属红线与局部闭环。
- 若文档中出现 `skill://{path}`，统一按仓库根目录下的 `skills/{path}` 解析；对 LLM 来说，它表示“可继续读取的本地 skill 资源路径”，不是普通展示字符串。

---

## 1. 规范文档骨架

```markdown
# [规范名称]
[一句话定位：本文档定义 XXX 的 YYY 约束。]

## 触发条件（由 SKILL 路由）
- 主触发关键词：[...]
- 必读时机：[...]

---
## 1. 核心原则
## 2. 规范定义（含 ✅/❌ 示例）
## 3. 联动影响
## 4. 常见陷阱（表格）
```

必须有：`#` 一级标题、定位描述、`## 触发条件（由 SKILL 路由）`、触发条件后的 `---`、从 `## 1.` 开始的编号章节。

禁止出现：创建时间/版本号、硬编码行号、`适用场景` 引言块。

## 2. 章节组织规则

| 章节类型 | 编号 | 说明 |
|----------|------|------|
| 核心原则 | `## 1.` | 必须，3-5 条不可违反的原则 |
| 规范定义 | `## 2.` ~ `## N.` | 必须，按功能域拆分 |
| 联动影响 | 倒数第 2 节 | 可选 |
| 常见陷阱 | 末尾 | 推荐，表格格式（陷阱/表现/正确做法） |
| 检查清单 | 末尾 | 可选，`- [ ]` 格式 |

## 3. 代码示例要求

- **来源真实**：从 `pkg/`、`internal/` 中挖掘，禁止凭空编造
- **正反对照**：每个规范点至少 1 个 ✅ 正例 + 1 个 ❌ 反例，注释内嵌
- **通用化**：业务名称替换为 `Xxx` 占位符；单个代码块不超过 30 行

## 4. 跨文件引用规则

- 引用用完整相对路径：`详见 references/api/response.md §N`
- 若使用 `skill://{path}`，默认表示仓库根目录下的 `skills/{path}`；只有在需要跨 skill 指向上游真源、下游专题或共享资产时才使用，不要把它混同为普通相对路径
- 同一结构体/规则 3+ 次 → 确定权威来源 → 其他文件只引用
- 用 `> [!NOTE]` 说明文档职责边界
- 若引用业务产物路径，明确写为项目根目录路径；有分组时写 `docs/{domain}/{group}/{module}.md`，无分组时写 `docs/{domain}/{module}.md`
- 导航/聚合索引文档（例如 `*-doc-index.md`、专题阅读索引、目录导航页）不等价于模块主文档；可放在 `docs/{domain}/{group}/` 或 `docs/{domain}/` 下，但默认不要求配套 `_task.md`，也不默认进入目录真源 `docs/_index/module-doc-map/`
- 同一业务域允许混合存在“域根目录主文档”和“分组子目录主文档”；例如可同时存在 `docs/{domain}/{module}.md` 与 `docs/{domain}/{group}/{module}.md`
- 若一句话同时依赖“上游真源 + 当前 skill 场景补充”，必须显式写成“两段式”边界表达，例如“优先遵循 `skill://upstream/...`；涉及 X 场景时，再结合当前 skill 的 `skill://current/...`”，禁止写成含糊的“以 A 及其 B 为准”

## 4.1 路由执行化规则

- 文档里声明的切换规则、强制联动 ref、升档条件，必须在脚本与回归中可验证
- 若文档写“命中即必须联动”，脚本输出必须进入已加载 refs，不得只放入 guidance / recommended hints
- 删除 / 重命名 / 拆分 reference 后，索引、触发矩阵、选择脚本、回归用例必须同步更新

## 4.2 独立真源迁移规则

- 当下游 skill（例如 `ai-api-handoff-bridge`、`ai-admin-frontend-expert`，或待退役旧全栈编排层的迁移替代物）从“复用上游真源”演进为“独立真源”时，至少完成：
  - 本地化 reference / template / asset
  - 替换索引与脚本中的旧路径
  - 清理旧文件名与旧术语残留
  - 补齐迁移回归用例
- 迁移时不仅要校验“新路径能访问”，还要校验“原本的真源边界没有被改写”；尤其是同时存在“上游通用真源 + 本地场景补充”时，不能只换 URI 就把双边界改成单边界
- 若独立拆分后仍需复用上游真源，应在文案中显式保留“优先遵循上游真源；当前 skill 只补充 X 场景”的责任划分
- 去重决策不只限于“删除 / 引用 / 场景补充”，必要时允许“独立拆分”
- 独立拆分后的 skill 不得继续把旧 skill 的运行时路径当作主真源

## 4.3 治理配置回写规则

- 若本次修改改变了某个 target skill 的 `archetype`、正文真源入口、默认脚本族、强制联动文件、脚本配置资产入口或允许例外，必须同步更新其 `.meta/GOVERNANCE_PROFILE.md`
- 若本次修改引入了只对某个 target skill 生效的专属红线、局部联动或交付闭环要求，必须同步更新其 `.meta/CHECKLIST.md`
- builder 只保存治理元规则、写作规则与模板，不应在 builder 正文里长期保存某个 target skill 的具体配置值
- `.meta/REVIEW.md` / `.meta/ISSUES.md` 记录的是扫描结论与待办，不替代 `.meta/GOVERNANCE_PROFILE.md` 的稳定配置职责

## 5. 模板文件风格标准

| 元素 | 统一规则 |
|------|---------|
| 头部路由信息 | 模板文件不写 `## 触发条件（由 SKILL 路由）`，统一以 `> **适用场景**：...` 作为入口引言 |
| 头部引言 | `> **适用场景**：...` |
| 使用规则 | `> [!IMPORTANT]` + 编号列表 |
| 章节标题 | `中文名 — 英文副标题` |
| 章节起始 | 从 `## 0. 元信息 — Metadata` 开始 |
| 元信息首行 | `模块/功能名称` |
| 来源声明 | `当前模板: ...` + `已加载规范: [...]` |
| 输出路径 | 设计/契约模板默认写项目根目录 `docs/{domain}/{group}/{module}.md`；任务模板默认写 `docs/{domain}/{group}/{module}_task.md`；规范修订模板写实际目标文件路径 |
| 关联文档 | 优先填写项目根目录 `docs/{domain}/{group}/{module}.md`（无分组时省略 `{group}/`）；如无，再写其他实际设计文档路径或实际目标文件 |
| 表格表头 | `项目 | 内容` |
| 输入描述 | 须提及 `validate 标签` |

## 5.1 命名与术语规范

- 文件名使用稳定 ASCII 命名；标题与章节标题统一使用同一套术语体系
- 标题、章节标题、索引矩阵、脚本引用必须同步演进，禁止文件名已改但正文仍沿用旧术语
- 若使用中英混排，统一采用“中文主标题 + 英文术语括注”或模板既定格式，禁止同一组文档混用多套风格
- `scripts/` 目录中的命名优先使用稳定动词前缀：选择器用 `select_*`，查询器用 `query_*`，执行器用 `run_*`，校验器用 `validate_*`，规则文件用 `*_rules.json`
- 同一职责不得混用 `find_*` / `query_*`、`strict_*` / `run_*`、`check_*` / `validate_*`、`verify_*` / `validate_*` 等并行风格；若迁移命名，必须同步更新引用、命令示例与回归断言

## 5.2 资产进入真源的条件

- `assets/` 文件若只做补充阅读材料，可不进入路由，但必须在文档中标明为参考资料
- `assets/` 文件若会影响实际交付、决策或选择分支，必须同时具备：
  - 索引入口
  - 触发规则
  - 回归断言
- 仅复制资产文件但未接入路由，不算完成真源迁移

## 5.3 脚本模板归属规则

- 本文只负责 `references/` / `templates/` 的写作骨架，不负责 `scripts/*.py`、`scripts/config/*.json` 与 `reference_rules.json` 的派生模板
- 只要任务涉及脚本新增、脚本重构、脚本配置资产整理、脚本命名统一、脚本回归补齐，必须切换到 `SCRIPT_TEMPLATES.md`
- 文档里若声明了脚本命令示例，命令名必须与 `SCRIPT_TEMPLATES.md` 中的稳定命名保持一致

## 6. 写完自检门禁

- [ ] 被治理对象的非模板 `references` 文件头部包含 `## 触发条件（由 SKILL 路由）`
- [ ] 被治理对象的 `references/templates/` 头部使用 `> **适用场景**` + `[!IMPORTANT]`，且不混入 `## 触发条件（由 SKILL 路由）`
- [ ] 无创建时间/版本号等冗余元信息
- [ ] 若文档包含代码示例，代码示例来自实际项目，非伪造；纯模板或无代码示例文档写 `N/A`
- [ ] 若文档包含规范性代码示例，至少 1 个 ✅ 正例 + 1 个 ❌ 反例；纯模板或无代码示例文档写 `N/A`
- [ ] 若为 API / DTO / Controller / Service 等代码型 reference，响应字段 code/msg/data 与 `api/response.md` 一致；纯文档模板写 `N/A`
- [ ] 若文档涉及路由规范或接口示例，路由前缀 `/api/v3`；不涉及路由写 `N/A`
- [ ] 若文档涉及 Go 上下文传递，Context 用项目 `*context.Context`；不涉及上下文写 `N/A`
- [ ] 已对照 builder `.meta/GLOBAL_CHECKLIST.md` 排雷；若 target 存在 `.meta/CHECKLIST.md`，也已同步排雷
- [ ] 无硬编码行号
- [ ] 若本次修改涉及文件粒度、模板或工作流口径：已同步写清 `候选文件池 / 热工作集 / 延后文件 / 超长文件处理`，并区分普通业务文件 / `controller-service-repository` / 测试 / 工作流聚合文件阈值；若暂不拆分，已在正文与其 `.meta` 留档
- [ ] 若本次修改影响 target skill 的治理配置、联动关系或允许例外，已同步更新其 `.meta/GOVERNANCE_PROFILE.md`
- [ ] 若本次修改新增或调整了 `scripts/config/*.json`，已确认它属于脚本治理真源，并同步检查 target profile 是否需要暴露该配置资产入口
- [ ] 若本次修改引入或调整了 target 专属红线，已同步更新其 `.meta/CHECKLIST.md`
- [ ] 若被治理对象维护 `.meta/CATALOG.md`，已同步更新；若当前只维护 `.meta/GOVERNANCE_PROFILE.md`，已在 profile 中说明当前治理入口
- [ ] 必要时同步其 `SKILL.md` / `modes/*.md` / 可选 `WORKFLOW_STEPS.md` / 可选 `QUICK_REFERENCE.md`
- [ ] 已完成一次封板同步审查：入口摘要 / 速查卡 / 模板元信息 / catalog 无漂移
- [ ] 若本次涉及下游 skill 去重，已同步更新其索引、触发规则、模板、脚手架与校验回归
- [ ] 若本次出现 `skill://...`，已确认其映射到仓库根目录下的 `skills/...`，且文档中没有把它误写成普通展示字符串
- [ ] 若文档声明了切换规则、强制联动 ref 或升档条件，脚本与回归已可验证
- [ ] 若本次修改了某个 skill 的脚本、`scripts/config/*.json` 或 `reference_rules.json`，已检查 sibling skill 的同构脚本是否需要同轮同步
- [ ] 若本次涉及独立 skill / reference 拆分，已清理旧路径、旧文件名与旧术语残留
- [ ] 若本次替换了旧路径、旧 URI 或上游引用写法，已确认“上游真源 / 当前 skill 场景补充”的语义边界没有被改写
- [ ] 若本次新增 `assets/` 文件，已判断其是“纯参考”还是“可执行真源”，并据此接入索引 / 规则 / 回归
