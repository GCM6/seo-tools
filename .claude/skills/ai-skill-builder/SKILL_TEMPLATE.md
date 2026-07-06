# Skill 执行骨架模板

> 用途：新建任意领域 skill 时，复制此骨架，仅替换 `{DOMAIN_*}` 占位符。
> 原则：**通用规则直接固化，领域内容占位替换。** 标记"固定"的段落一字不改。

---

## 流程总览（固定）

```
{SKILL_NAME} 触发
  ↓
[ENTRY] 判定 debug → 加载 debug 文件 → 执行 CLASSIFY
  ↓ (decision=continue)
[PLAN] 生成执行计划
  ↓ (IF M/L implement THEN 实现前澄清门禁 §6.3)
[EXECUTE] 按场景路由执行
  ↓
[VALIDATE] {DOMAIN_VALIDATE_SUMMARY}
  ↓
[FINAL] 交付结果
```

BLOCKERS:
- NEVER 在 CLASSIFY 输出完成前进入 PLAN/EXECUTE
- NEVER 跳过阶段直接干活

---

## 0. FORMAT（固定，直接复制）

RULES:
- IF 内容=术语含义 THEN 放入 `TERMS`
- IF 内容=可选值 THEN 放入 `ENUM`
- IF 内容=初始状态 THEN 放入 `STATE`
- IF 内容=读取动作 THEN 放入 `READ`
- IF 内容=条件判断 THEN 放入 `RULES`
- IF 内容=禁止事项 THEN 放入 `BLOCKERS`
- IF 内容=允许例外 THEN 放入 `EXCEPTION`
- IF 内容=执行步骤 THEN 放入 `ORDER`
- IF 内容=检查项 THEN 放入 `CHECK`
- IF 内容=输出字段 THEN 放入 `OUTPUT`
- IF 内容=解释说明 THEN 放入 `NOTE`

BLOCKERS:
- NEVER 用叙事段落承载核心规则
- NEVER 用 Markdown 表格承载核心决策
- NEVER 把解释混入 `RULES`
- NEVER 同一约束在 RULES 和 BLOCKERS 中重复出现
- NEVER 同一检查项在 RULES 和 CHECK 中重复出现

### 消歧规则（固定，直接复制）

RULES:
- IF 同一语义同时符合 RULES + BLOCKERS THEN 用 RULES（IF-THEN 正向描述），BLOCKERS 仅放无法用 IF-THEN 表达的绝对禁令
- IF 同一语义同时符合 RULES + CHECK THEN 用 RULES（规范定义），CHECK 仅放 VALIDATE/REVIEW 阶段的核查清单
- IF 同一语义同时符合 NOTE + RULES THEN 用 RULES（可执行规则），NOTE 仅放背景/动机/为什么
- IF 同一语义同时符合 ENUM + STATE THEN 用 ENUM（定义可选值域），STATE 仅放当前会话初始值
- IF 分类不确定 THEN 优先级: RULES > BLOCKERS > CHECK > NOTE > ENUM > STATE

---

## 1. TERMS（领域变量自定义，通用变量固定）

TERMS:
- task_size = 任务规模
- risk = 风险等级
- mode = 执行模式
- decision = 流程决策
- affected_files = 受影响文件数
- affected_layers = 受影响分层列表
- contract_change = 接口契约是否变更
- db_change = {DOMAIN_DB_CHANGE_DESC}
  <!-- 后端示例: "数据库结构是否变更"。前端可改为 state_schema_change = "状态/Props 结构是否变更" 或直接 N/A -->
- destructive_change = 是否包含删除/下线
- breaking_change = 是否影响下游兼容
- cross_domain = 是否跨业务域
- test_strategy = 测试策略
- scope_controlled = 是否控制住改动范围
- remaining_risk = 剩余风险
- scenario = 用户意图场景
- reference_set = 需加载的 reference 文件集合
- debug = 调试模式开关
- uncertainty = 不确定性等级
- interrupt = 是否需要打断用户确认
- implement_type = 实现类型：新增功能 or 修改已有代码
- worktree = 是否使用隔离工作区
- doc_strategy = 文档更新策略
- validation = 验证结果
<!-- 深度增强变量（固定，所有 skill 通用） -->
- call_chain_depth = 调用链追踪深度（直接调用方 or 传递闭包）
- transitive_affected_files = 传递闭包后的真实受影响文件数
- scope_snapshot_files = CLASSIFY 阶段一轮 grep 快照的文件数
- scope_delta_pct = EXECUTE 阶段新发现文件数占快照的百分比
- history_check = 是否执行了 git log 历史风险检查
- tx_boundary_analysis = 事务/数据边界分析是否完成
- full_repo_import_check = 全仓 import 引用检查是否完成
- code_surface_risk = 代码表面积风险（调用方数量/调用频率/历史 bug 密度）
- reclassify_triggered = EXECUTE 阶段是否触发了重新分类

VALUE_TERMS:
- S = 单文件或少量文件修复
- M = 多层协同新增接口
- L = 删除/迁移/Breaking Change/跨域
- low = 低风险
- medium = 中风险
- high = 高风险
- quick = 快速模式（≤3 步）
- standard = 标准模式（≤6 步）
- strict = 严格模式（L 级任务，≤6 步，决策需确认）
- continue = 继续执行
- ask_user = 询问用户
- stop = 停止
- PASS = 校验通过
- FAIL = 校验失败
- NOT_RUN = 未执行校验
- targeted_test = 定向补测（需测试）
- mechanical_no_tdd = 机械改动免测（不需测试）
<!-- 以下为领域分层枚举，替换为你的分层模型 -->
- {DOMAIN_LAYER_VALUES}
  <!-- 后端示例: controller = 控制器层 / service = 服务层 / repository = 仓库层 / model = 模型层 / dto = 传输对象层 / router = 路由层 -->
  <!-- 前端示例: component = 组件层 / hook = 状态逻辑层 / store = 数据 store 层 / page = 页面层 / util = 工具层 -->

---

## 2. ENUM（固定框架，补充领域枚举）

ENUM:
- task_size: S | M | L
- risk: low | medium | high
- mode: quick | standard | strict
- decision: continue | ask_user | stop
- validation: PASS | FAIL | NOT_RUN
- test_strategy: targeted_test | mechanical_no_tdd | N/A
- worktree: required | not_needed
- doc_strategy: light | none | existing_update
- scenario: troubleshoot | design | implement | review
- debug: false | true
- uncertainty: low | medium | high
- interrupt: true | false
- implement_type: new | modify
- call_chain_depth: direct | transitive
- history_check: performed | skipped
- code_surface_risk: low | medium | high
<!-- 领域专属枚举（按需添加） -->
<!-- 后端示例: layer: controller | service | repository | model | dto | router -->
<!-- 前端示例: layer: component | hook | store | page | util -->

---

## 3. STATE（固定，直接复制。补充领域变量初始值）

STATE:
- task_size = S
- risk = low
- mode = quick
- decision = continue
- validation = NOT_RUN
- affected_files = 0
- affected_layers = []
- contract_change = false
- db_change = false
- destructive_change = false
- breaking_change = false
- cross_domain = false
- scenario = implement
- reference_set = []
- debug = false
- uncertainty = low
- interrupt = false
- implement_type = new
- test_strategy = N/A
- worktree = not_needed
- doc_strategy = none
- call_chain_depth = direct
- transitive_affected_files = 0
- scope_snapshot_files = 0
- scope_delta_pct = 0
- history_check = skipped
- tx_boundary_analysis = false
- full_repo_import_check = false
- code_surface_risk = low
- reclassify_triggered = false
<!-- 领域变量初始值（按需添加） -->

NOTE:
- STATE 中的值均为**会话初始默认值**，仅表示"尚未判定时的占位"。进入 CLASSIFY 后必须通过实测（grep/代码搜索）覆盖，不可将默认值当作判定结果使用。特别是 affected_files=0 在 implement/design 场景下必须重新实测。

---

## 4. 全局行为准则 + 上下文加载（固定）

### 4.0 思维链（固定，直接复制）

每一步行动前必须完成"分析缺口 → 收集信息 → 验证结果 → 决定下一步"的闭环。不是单向的"声明→执行"，而是有分支判断的思维过程。

**行动前（强制输出 4 要素）：**

RULES:
- IF 即将执行命令或修改代码 THEN 先输出:
    现在要做: {具体动作 — 读什么文件 / grep 什么关键词 / 改什么函数}
    信息缺口: {我现在不知道什么？这个动作要填补什么 gap？}
    已知上下文: {从用户消息、已读代码、上一步结果中已掌握的事实}
    预期与分支:
      · 如果看到 {预期结果 A} → 意味着 {结论} → 下一步 {动作}
      · 如果看到 {预期结果 B} → 意味着 {结论} → 下一步 {动作}
      · 如果与 A/B 都不同 → 暂停，重新评估假设
- IF 多步操作 THEN 先列步骤清单及每步要验证的假设，再逐步执行

**行动后（强制输出验证结论）：**

RULES:
- IF 命令执行完毕 THEN 先输出:
    实际结果: {看到了什么 — 具体数字/文件名/代码行，不是"符合预期"}
    假设验证: {与哪个预期分支匹配？还是都不匹配？}
    下一步决定: {继续原计划 / 调整方向 / 暂停确认}

BLOCKERS:
- NEVER 无分析直接动手改代码
- NEVER 无分析直接跑可能有副作用的命令
- NEVER 在 debug = true 时先跑命令后补思维链输出 — 声明在命令前，不是命令后
- NEVER 跳过"行动后验证"直接进入下一步 — 必须先验证结果再决定下一步
- NEVER 用"符合预期"四个字替代实际验证 — 必须列出实际看到的具体数据

> 此模式覆盖所有场景，区别仅在于「预期与分支」的内容：
> - **排查**：预期 A = 某假设成立（看到特定日志/状态） → 确认根因；预期 B = 假设不成立 → 排除该假设
> - **设计**：预期 A = 有可复用接口/表 → 扩展而非新建；预期 B = 无可复用 → 从零设计
> - **实现**：预期 A = 改动只影响直接调用方 → 继续；预期 B = 传递闭包扩散 → 重新评估 task_size

---

### 4.1 入口门禁（固定，直接复制）

本 skill 激活后，必须严格按以下 ORDER 执行。跳过任一步骤 → 后续阶段阻断。

ORDER:
1. 解析用户指令中的 debug 关键词 → 判定 debug（见 §4.5 Debug 模式）
2. IF debug = true THEN 立即加载 `.meta/debug-output.md` + `references/variable-guide.md`
3. 执行 §5 CLASSIFY → 判定 scenario / implement_type / task_size / risk / mode / decision（IF debug = true THEN 同步输出逐步追踪，格式见 `.meta/debug-output.md`）
4. **打断门禁**：逐条对照 §4.2 的 5 问检查 → IF 任一触发 THEN interrupt（IF debug = true THEN 输出每问检查结果）
5. CLASSIFY 完成、decision = continue、interrupt = false 三者同时满足后，进入 §6 PLAN

BLOCKERS:
- NEVER 在 CLASSIFY 输出完成前读取目标代码文件 — §5.4 范围探查所需的 grep 除外
- NEVER 在 CLASSIFY 输出完成前执行 Read/Edit/Write/Bash — §5.4 范围探查 grep 除外
- NEVER 在 CLASSIFY 输出完成前进入 §6 PLAN 或 §7 EXECUTE
- NEVER 跳过 debug 判定直接进入 CLASSIFY
- NEVER 在未执行打断门禁（step 4）的情况下进入 PLAN
- NEVER 在 interrupt = true 时继续执行 — 必须先打断获取用户确认

RULES:
- IF CLASSIFY 阶段未完成（输出中不含 scenario / task_size / risk / mode / decision） THEN 后续阶段禁止执行，先回到 §5 补完
- IF 用户指令含 `@文件路径` 或 `debug模式` THEN 仍需先走 §4.1 ENTRY GATE，不可因为看到了具体文件路径就跳过 CLASSIFY 直接读代码

---

### 4.2 不猜测原则 + 中断门禁（固定，直接复制）

当一个决策无法从已有规则+当前上下文中推出唯一确定答案时，**打断并让用户选择**。不猜测。

**中断门禁（§4.1 step 4 强制执行，不可跳过）：**

以下 5 问必须在 CLASSIFY 完成后逐条回答。禁止自我判定"差不多够确定"就跳过。

RULES:
- IF scenario / implement_type 无法唯一确定（含多 skill 同时命中、复合请求"设计并实现"、同一请求匹配 ≥2 个 scenario） THEN interrupt（意图歧义）
- IF grep 探查后仍无法确定受影响文件/接口/下游边界 THEN interrupt（范围不确定）
- IF 涉及删除/DDL/Breaking Change AND 用户未提供兼容策略 THEN interrupt（安全不可逆）
- IF 存在 ≥2 种合理做法 AND 规则未明确指定用哪种（含同项目两种模式并存、规则存在解释空间） THEN interrupt（方法不唯一）
- IF scenario = troubleshoot AND 关键信息缺失（无错误日志/无 trace_id/无请求参数/无复现步骤/无发生时间段中的任一项） THEN interrupt（信息不足 — 使用信息缺失类格式）
- IF 5 问全部确定（答案均为明确的是/否） THEN uncertainty = low, interrupt = false, 直接执行
- IF 纯查询（grep/读文件/搜索） THEN 自行执行不打断
- IF 任一问不确定 BUT 所有可选方案后果均可逆 THEN 选最安全方案继续，uncertainty = medium，在 FINAL 中标注假设
- IF 任一问不确定 AND 任一可选方案后果不可逆 THEN interrupt, uncertainty = high

BLOCKERS:
- NEVER 跳过 §4.1 step 4 的 5 问逐条检查直接进入 PLAN
- NEVER 在 5 问任一不确定且后果不可逆时继续 — 必须先 interrupt
- NEVER 以"我觉得差不多""应该没问题"替代逐条检查
- NEVER 跳过兼容性声明就开始修改

---

### 4.3 上下文读取清单（READ，框架固定，补充领域读取规则）

READ:
- SKILL.md（本文件，获取流程规则）
- 用户原始需求
- 目标代码文件（使用 rg/grep 探查实际代码，不凭记忆猜测）→ package comment 随代码一起读入，零额外 IO
<!-- 领域专属 READ 规则 -->
<!-- 后端示例: IF db_change = true OR 涉及状态流转 OR scenario = design THEN 按需读完整文档 -->
<!-- 后端示例: IF 改参数/修 Bug/加校验等常规改动 THEN 不强制读完整文档 -->
<!-- 后端示例: IF 用户提及模块名 THEN 检查 docs/{domain}/{group}/{module}_task.md 是否存在 -->
{DOMAIN_READ_RULES}
- IF debug = true THEN 进入 CLASSIFY 前输出 READ 检查清单（按 `.meta/debug-output.md` §READ）

RULES:
- IF 目标文件已有未提交改动 THEN 先读懂再改，不回滚用户改动
- IF 任务明显命中高风险条件 THEN 先说明风险原因并确认
- IF 存在相关业务文档 THEN 读取并按变更同步最小内容
- IF 目标文件路径不确定 THEN 先用 rg/grep 定位，不猜测
- IF 目标文件确定 THEN 先读该文件的 package comment 获取业务上下文
- IF task 文件存在 AND 有 pending 任务 THEN 从第一个 pending 任务继续（断点恢复）

---

### 4.4 加载 References（框架固定，按领域填入文件名）

RULES:
- IF scenario = troubleshoot THEN reference_set = [{DOMAIN_REF_TROUBLESHOOT}]
  <!-- 后端示例: [observability.md] -->
- IF scenario = design THEN reference_set = [{DOMAIN_REF_DESIGN}]
  <!-- 后端示例: [development-baseline.md, code-quality.md, templates.md] -->
- IF scenario = implement THEN reference_set = [{DOMAIN_REF_IMPLEMENT}]
  <!-- 后端示例: [development-baseline.md, observability.md, code-quality.md, testing.md] -->
- IF scenario = implement AND task_size = L THEN 追加 [{DOMAIN_REF_L_ADDON}]
  <!-- 后端示例: 追加 templates.md -->
- IF scenario = review THEN reference_set = [{DOMAIN_REF_REVIEW}]
  <!-- 后端示例: [development-baseline.md, observability.md, code-quality.md] -->
- IF db_change = true THEN 追加 {DOMAIN_REF_DB_CHANGE}
  <!-- 后端示例: 追加 observability.md -->
- IF 领域涉及特定分层 THEN 确保 {DOMAIN_REF_FOUNDATION} 已加载
  <!-- 后端示例: 确保 development-baseline.md 已加载 -->

ORDER:
1. 从 §5 CLASSIFY 的输出中获取 scenario 和 reference_set
2. 按 reference_set 加载对应的 references/ 文件
3. 加载后在输出中声明：`已加载 references: [...]`
4. IF debug = true THEN 输出 reference 加载清单 + 消费证据（按 `.meta/debug-output.md` §Reference 加载）

---

### 4.5 Debug 模式（固定，直接复制）

RULES:
- IF 用户说"debug"/"调试"/"显示过程"/"逐步追踪"/"每步都打"/"trace"/"verbose" THEN debug = true
- IF debug = true THEN 加载 `.meta/debug-output.md` + `references/variable-guide.md`，**每个决策点**同步输出人类可读的逐步追踪（格式见 `.meta/debug-output.md`）
- IF debug = false THEN 不加载上述文件，不输出调试摘要

NOTE:
- 只有一个档位：开或关。开了就输出规则评估轨迹，人类可读。
- 追踪输出边执行边打印，不事后汇总。

---

## 5. CLASSIFY

> 进入 CLASSIFY 前，确认遵守 §4.0 思维链原则。

### 5.1 场景判定（固定，直接复制）

RULES:
- IF 用户描述了现象/错误信息 AND 用户未明确要求修改代码/修复/新增功能 THEN scenario = troubleshoot
- IF 用户要求排查运行时问题/诊断报错原因/定位异常行为 THEN scenario = troubleshoot
- IF 用户需要方案/规划/架构设计/技术选型 THEN scenario = design
- IF 用户明确要求修改代码/新增功能/修复 Bug THEN scenario = implement（优先于 troubleshoot，即使用户同时描述了错误现象）
- IF 用户要求审查代码质量/安全/性能/规范/代码评审 THEN scenario = review
- IF 边界模糊（同一请求可合理归入 ≥2 个 scenario）THEN interrupt（列出候选 scenario，让用户选择，不替用户决定）
- IF scenario = implement OR design THEN 必须先执行 §5.4 范围探查（grep 实测 affected_files），再继续后续判定。不可跳过 grep 直接使用 STATE 默认值。
- IF scenario = implement AND 用户要修改已有文件/接口/函数（且不涉及新建文件） THEN implement_type = modify
- IF scenario = implement AND 用户要从零新建文件/接口/模块（且不涉及修改已有文件） THEN implement_type = new
- IF 同时涉及新建和修改已有文件 THEN implement_type = modify（修改已有文件是更危险的操作，需走兼容性声明）
- IF 不确定 THEN implement_type = modify（更安全：先读后改）

OUTPUT:
- scenario: troubleshoot | design | implement | review
- implement_type: new | modify | N/A
- reference_set: [...]

---

### 5.2 规模判定（框架固定，领域 bool 自定义）

RULES:
- IF affected_files ≤ 2 AND contract_change = false AND {DOMAIN_BOOL_NO_DB} AND destructive_change = false THEN task_size = S
- IF affected_files ≤ 2 AND contract_change = true AND destructive_change = false THEN task_size = M（契约变更至少 M，即使文件数少）
- IF affected_files ≥ 3 AND affected_files ≤ 6 AND destructive_change = false THEN task_size = M
- IF affected_files ≥ 7 THEN task_size = L
<!-- 领域 L 级触发条件 -->
{DOMAIN_L_TRIGGERS}
  <!-- 后端示例: IF db_change = true THEN task_size = L -->
  <!-- 后端示例: IF destructive_change = true THEN task_size = L -->
  <!-- 后端示例: IF breaking_change = true THEN task_size = L -->
  <!-- 后端示例: IF cross_domain = true THEN task_size = L -->
- IF task_size = S THEN risk = low, mode = quick
- IF task_size = M THEN risk = medium, mode = standard
- IF task_size = L THEN risk = high, mode = strict, decision = ask_user
- IF mode = strict THEN doc_strategy = existing_update, plan_steps ≤ 6
- IF debug = true THEN 输出所有 bool 推导依据（每个的判断基准和推导过程, 按 `.meta/debug-output.md` §规模判定）

NOTE:
- strict 模式由 §5.2 RULES 自动触发（{DOMAIN_L_CONDITIONS_SUMMARY} → task_size = L → mode = strict）
  <!-- 后端示例: db_change / destructive_change / breaking_change / cross_domain / affected_files ≥ 7 -->

---

### 5.3 不确定性打断（固定，直接复制）

CLASSIFY 完成后由 §4.1 step 4 打断门禁强制执行。判定规则、触发条件与 uncertainty 推导见 §4.2 不猜测原则。

打断格式（决策类 — 意图/范围/安全/方法不确定时使用）：

```
⚠ 需要确认：

问题：{一句话描述不确定的点}
选项：
  A: {方案 A — 简短}
  B: {方案 B — 简短}
  C: {其他 — 让我知道你的想法}
建议：{推荐选项 + 一句话理由}
```

打断格式（信息缺失类 — troubleshoot 专用）：

```
⚠ 信息不足，无法继续定位：

当前缺失:
  - {缺失项 1}
  - {缺失项 2}
已知: {已掌握的信息摘要}
请补充以上信息后我再继续排查。
```

OUTPUT:
- scenario: troubleshoot | design | implement | review
- task_size: S | M | L
- risk: low | medium | high
- mode: quick | standard | strict
- decision: continue | ask_user | stop
- reason: ...
- affected_layers: [...]

CHECK:
- [ ] 已判定 scenario（troubleshoot/design/implement/review）并说明理由
- [ ] 已判定 task_size（S/M/L）并说明理由
- [ ] 已执行 §4.1 step 4 打断门禁：逐条回答 §4.2 的 5 问，任一触发时已 interrupt
- [ ] 命中 L 级条件时，已启用 strict 模式（decision = ask_user）
- [ ] 未为了形式创建大文档；文档只记录本次维护真正需要的信息
- [ ] scenario = implement OR design 时已执行 §5.4 范围探查（grep 实测 affected_files），未使用 STATE 默认值 0

---

### 5.4 范围探查（固定，直接复制）

CLASSIFY 阶段必须先通过 grep/代码搜索实测 affected_files，再进入 §5.2 规模判定。不可跳过。

RULES:
- IF scenario = implement AND 用户指明了具体函数名/文件名/路由路径 THEN 用 rg/grep 搜索该标识符的所有引用，统计去重文件数 → affected_files
- IF scenario = implement AND 用户未指明具体标识符 THEN 搜索同领域现有模块文件数作为参考下限，affected_files 取该数
- IF scenario = design THEN 搜索同领域现有文件数 + 预估新增文件数（至少 4 个核心文件），标注"预估值"
- IF 纯查询（grep/读文件/搜索）THEN affected_files = 0，不进入规模判定

BLOCKERS:
- NEVER 在 implement/design 场景下使用 STATE 默认值 affected_files=0 直接进入规模判定
- NEVER 跳过 grep 凭感觉说"大概 3 个文件"

#### 5.4.1 深度探查（一轮 grep 后 affected_files ≥ 3 时必执行，固定）

一轮 grep 只能抓到直接引用。对 M/L 级任务，必须追踪传递闭包，否则 breaking_change 和 cross_domain 判定不可靠。

RULES:
- IF 一轮 grep 后 affected_files ≥ 3 THEN 执行二度调用方搜索：对每个直接调用方文件，grep 其内部引用的被修改标识符 → 输出间接影响清单 → transitive_affected_files = 直接+间接去重文件数
- IF 一轮 grep 后 affected_files ≥ 7 OR {DOMAIN_DEEP_L_CONDITIONS} THEN 在二度基础上额外执行三轮 grep: {DOMAIN_DEEP_ROUND3_GREP}
  <!-- 后端示例: affected_files ≥ 7 OR db_change = true OR cross_domain = true -->
  <!-- 后端示例 三轮grep: (a) 全仓 grep 被修改包路径的 import 语句 (b) IF db_change = true THEN grep 被修改表名在 repository 层的所有引用 (c) grep 被修改错误码的所有引用 -->
  <!-- 前端示例: affected_files ≥ 7 OR state_schema_change = true OR cross_domain = true -->
  <!-- 前端示例 三轮grep: (a) 全仓 grep 被修改组件/模块的 import 语句 (b) IF state_schema_change THEN grep 被修改 store key 的所有引用 (c) grep 被修改路由路径的所有引用 -->
- IF 二度搜索后 transitive_affected_files > affected_files THEN affected_files = transitive_affected_files（以传递闭包为准），重新进入 §5.2 规模判定
- IF transitive_affected_files ≥ 7 AND 一轮 affected_files < 7 THEN 升级为 L → mode = strict, decision = ask_user，输出 "⚠ 一轮 grep 低估了影响范围（{一轮数}→{传递闭包数}），已升级为 L 级"
- IF call_chain_depth = transitive THEN 在深度探查报告中标注每个间接调用方的调用路径（A→B→C 格式）

ORDER:
1. 一轮 grep: 直接引用 → scope_snapshot_files = affected_files
2. IF scope_snapshot_files ≥ 3 THEN 二轮 grep: 调用方的调用方 → transitive_affected_files
3. IF scope_snapshot_files ≥ 7 OR {DOMAIN_DEEP_ROUND3_TRIGGER} THEN 三轮 grep: {DOMAIN_DEEP_ROUND3_SUMMARY}
  <!-- 后端示例: scope_snapshot_files ≥ 7 OR db_change = true OR cross_domain = true → 全仓 import / 表引用 / 错误码引用 -->
  <!-- 前端示例: scope_snapshot_files ≥ 7 OR state_schema_change = true OR cross_domain = true → 全仓 import / store引用 / 路由引用 -->

BLOCKERS:
- NEVER 在 scope_snapshot_files ≥ 3 时只做一轮 grep 就结束范围探查
- NEVER 在 L 级条件触发时跳过三轮 grep
- NEVER 在 transitive_affected_files > affected_files 时使用旧值进入规模判定

---

## 6. PLAN（固定，直接复制）

> 进入 PLAN 前，确认遵守 §4.0 思维链原则。

### 6.1 共享规则（所有场景）

RULES:
- IF decision != continue THEN 不生成执行计划
- IF mode = quick THEN plan_steps ≤ 3
- IF mode = standard THEN plan_steps ≤ 6
- IF docs/{domain}/{group}/{module}.md 已存在 THEN doc_strategy = existing_update（最高优先级，覆盖以下 mode 规则）
- IF mode = quick AND contract_change = false THEN doc_strategy = none
- IF mode = standard THEN doc_strategy = light（标准模式至少轻量文档）
- IF mode = quick AND contract_change = true THEN doc_strategy = light

**测试策略选择：**

RULES:
- IF scenario != implement THEN test_strategy = N/A
- IF 纯机械改动（仅 CRUD 透传/常量修改/注释修改/格式化/import 调整 — 非代码逻辑变更） THEN test_strategy = mechanical_no_tdd
- IF NOT 纯机械改动 THEN test_strategy = targeted_test
- IF 不确定是否属于"纯机械改动" THEN test_strategy = targeted_test（安全默认：不确定就测）

**Worktree 策略：**

RULES:
- IF 用户明确说"worktree"/"隔离"/"开分支"/"safe mode" THEN worktree = required
- IF 用户未提及 worktree THEN worktree = not_needed
- IF mode = strict OR destructive_change = true OR git 有未提交改动 THEN 在 PLAN 输出中建议: "建议开 worktree 隔离（输入 /worktree 开启）"

**历史风险检查（implement_modify 必执行，固定）：**

修改已有代码前，先看这段代码的"事故记录"——过去 6 个月被 fix/revert 了多少次，谁在改。这比静态分析更能预测风险。

RULES:
- IF implement_type = modify THEN history_check = performed: 对每个被修改文件执行 `git log --oneline -10 -- <file>`
- IF 被修改文件过去 6 个月有 ≥ 3 次 bug fix 提交（commit message 含 `fix`/`修复`/`revert`/`hotfix` 关键词） THEN code_surface_risk = high — 在 PLAN 中标注 "⚠ 高频修改热点（过去 6 个月 {N} 次 fix），本次变更需额外回归"
- IF 被修改文件曾被 revert 过 THEN code_surface_risk = high — 在 PLAN 中标注 "⚠ 历史 revert 文件（{commit_hash}: {message}），变更需逐行对照原 revert 原因"
- IF 被修改文件最近 3 次改动涉及 ≥ 3 个不同作者 THEN code_surface_risk = medium — 在 PLAN 中标注"多人频繁修改区域，代码理解可能不一致"
- IF history_check = performed THEN 在 PLAN 输出中附带历史风险摘要（最近 5 条改动 message + code_surface_risk 等级 + 关注点）
- IF code_surface_risk = high AND mode != strict THEN 升级为 standard mode 至少（热点文件不快速模式）

**{DOMAIN_BOUNDARY_ANALYSIS_NAME}（{DOMAIN_BOUNDARY_TRIGGER} 必执行，框架固定）：**

RULES:
- IF {DOMAIN_BOUNDARY_TRIGGER} THEN {DOMAIN_BOUNDARY_VAR} = true: {DOMAIN_BOUNDARY_ANALYSIS_STEPS}
  <!-- 后端示例: IF db_change = true THEN tx_boundary_analysis = true: grep 被修改表名在 repository 层的所有方法 → 对每个 repo 方法 grep 其在 service 层的调用位置 → 输出事务拓扑 -->
  <!-- 前端示例: IF state_schema_change = true THEN state_boundary_analysis = true: grep 被修改 store key 在所有组件/hook 中的引用 → 输出状态依赖拓扑 -->
- IF {DOMAIN_BOUNDARY_CROSS_WARNING} THEN 在 PLAN 中标注 "⚠ {DOMAIN_BOUNDARY_WARNING_MSG}"
  <!-- 后端示例: IF 被修改表参与 ≥ 2 个不同 Service 包的事务 THEN 标注 "⚠ 跨 Service 事务边界: 表 {name} 被 {svc_a} 和 {svc_b} 在事务中同时操作" -->

**Plan 子步骤（standard / strict 模式，固定）：**

RULES:
- IF mode = standard OR mode = strict THEN 每个 plan step 可含 ≤ 5 个子步骤（用缩进列表 `  - [ ]` 标注），总 plan_steps 仍 ≤ 6
- 子步骤不增加 plan_steps 计数，但每个子步骤必须在 EXECUTE 阶段逐条完成并打勾
- 子步骤必须可独立验证（编译通过/测试通过/脚本通过），不可写"检查一下""确认一下"等模糊描述

---

### 6.2 场景路由（框架固定，ORDER 步骤可扩展）

RULES:
- IF scenario = troubleshoot THEN ORDER = ORDER_troubleshoot
- IF scenario = design THEN ORDER = ORDER_design
- IF scenario = implement AND implement_type = new THEN ORDER = ORDER_implement_new
- IF scenario = implement AND implement_type = modify THEN ORDER = ORDER_implement_modify
- IF scenario = review THEN ORDER = ORDER_review

ORDER_troubleshoot:
0. **信息充分性门禁**: 检查用户是否提供了定位问题所需的关键信息（至少一项）。IF 一项都没有 THEN interrupt — 列出需要用户补充的信息清单，让用户补全后再继续。不可靠脑补编造排查路径。
1. 收集现象: 错误信息 / 日志片段 / 复现条件 / 影响范围
2. 确定排查入口: 从现象反查涉及的代码路径
3. 读业务上下文: 目标模块的 package comment → 理解核心规则和边界条件
4. 列出假设（每个假设一行: 根因 / 验证方法 / 成立预期 / 排除预期）

   假设验证判定标准:
   - 成立: 验证方法执行后，观察到的现象与预期（成立）一致 → 记录证据
   - 排除: 验证方法执行后，观察到的现象与预期（排除）一致 → 标记已排除
   - 不可验证: 验证方法无法执行（缺日志/代码已变/无复现条件）→ 标记"待补充"，不可强行判定
   - 每个假设验证后必须标注状态：✅成立 / ❌排除 / ❓待补充

5. 按优先级排序（最可能→最不可能），输出排查计划
6. 进入 EXEC 阶段逐项验证，每项验证后输出: 假设{成立/排除/待补充} + 证据

ORDER_design:
> 完整设计管线见 builder 真源 `references/mode-design-patterns.md`（8 阶段管线: 上下文加载 → 问题框定 → 现状诊断 → 业界调研 → 绿场推演 → 方案设计 → 方案精炼 → 文档任务）。
> 以下为最小骨架，领域自定义步骤在此基础上扩展。每个阶段结束必须自问 "这个结论是否改变了前面的假设？"（迭代纪律见 `references/mode-design-patterns.md` §1）。
-1. **上下文加载**: 扫描已有术语库 + 决策记录，加载领域知识
0. **问题框定**: 硬约束 / 软约束 / 非目标 / 可度量成功标准 / 利益相关方
1. **现状诊断**: grep 实测代码 → 定量问题 → 根因追问到底 → 历史上下文 → 最小修补方案评估
2. **业界调研**: 先向外看（≥3 种思路 × 第一性原理 × 规模对标），再向内看（可复用清单）
3. **方案设计**: 候选对比 → 魔鬼代言人 → 演进路径 → 确定影响
4. **方案精炼**: 交互式 BFS 设计树遍历（术语/边界/代码/收口）。S 级跳过，M/L 强制执行。超时 ≥3 轮次无回复则跳过。详细规则见 `references/mode-design-patterns.md` §4
5. **按模板输出设计文档**（章节覆盖见 `references/mode-design-patterns.md` §9）+ 拆解任务文件（每个任务自包含上下文）
6. 准备设计文档 + 任务拆解（暂不写盘，待 EXECUTE 阶段用户确认后写入）

ORDER_implement_new:
1. IF 存在 _task.md THEN 加载 pending 任务 → 按序执行；否则:
2. 查已有相关模块 package comment 参考模式
3. 设计接口: 路由路径 / 数据结构 / Service 签名 / 影响层次
4. IF 需新增数据模型/表结构 THEN 触发 L 级 strict 模式
5. 规划 package comment + 输出执行计划

ORDER_implement_modify:
0. **历史风险门禁**: 执行 `git log --oneline -10 -- <每个被修改文件>` → 输出历史风险摘要（最近改动趋势/高频修改热点/历史 revert/作者分散度）。IF code_surface_risk = high THEN 在后续兼容性声明中加重提醒，并在改动方案中增加回归验证步骤。
1. 读 package comment + 目标代码全文（理解业务上下文和现有逻辑）
2. IF 指向文档 AND 需完整规则 THEN 按需读文档
3. 找所有调用方: grep → 列出受影响文件 → 评估 breaking_change。IF task_size ≥ M THEN 执行 §5.4.1 深度探查（二度调用方搜索）。
4. 确定 test_strategy + 影响层次（只改必须改的层）
5. 确定最小改动方案 → 输出执行计划

ORDER_review:
0. **信息充分性门禁**: 检查是否拿到 git diff 或文件改动清单。IF 无改动清单 AND 用户未提供文件列表 THEN interrupt — 让用户提供要审查的范围。
1. 扫描改动: 改了什么文件 / 函数 / 字段 → 列出完整改动清单
2. 确定审查维度: 分层越界 / 错误处理 / 日志格式 / 安全 / 注释 / 体量 / 向后兼容 / 测试覆盖
3. 输出审查计划: 每维度检查项 + 预期时间分配
4. 逐维度执行审查 → 每个维度产出 findings（EXEC 阶段展开）
5. findings 去重 + severity 校准: error/warning/info 三档 → 输出审查报告

OUTPUT:
- plan: [...]
- scenario: troubleshoot | design | implement | review
- implement_type: new | modify | N/A
- test_strategy: targeted_test | mechanical_no_tdd | N/A
- worktree: required | not_needed
- doc_strategy: light | none | existing_update

---

### 6.3 实现前澄清门禁（M/L implement 强制执行，固定）

> IF scenario = implement AND (task_size = M OR task_size = L) THEN 在 PLAN 完成后、EXECUTE 开始前强制执行。
> 目标：在写代码之前，对模糊描述和不确定术语进行强制澄清，避免"AI 自以为理解了但实际理解歪了"。
> 扩展与定制见 builder 真源 `references/mode-design-patterns.md` §4.6。

**提问铁律（所有澄清场景通用）：**

RULES:
- IF 问题可以通过读代码/grep/已有文档回答 THEN 不提问，直接给出发现并一句确认
- IF 必须提问 THEN 每次一个问题，附带推荐答案（格式: "建议: {推荐选项}，因为 {一句话理由}"）
- IF 用户回答模糊（"差不多""应该可以"） THEN 追问到精确为止
- IF 用户回答一个问题后 THEN 立即检查：这个答案是否改变了 PLAN 中其他步骤的假设？IF 是 THEN 调整后续提问顺序
- IF 用户沉默 ≥3 个提问轮次无回复 THEN 跳过剩余精炼步骤，标注"未完成精炼: 用户未回复"，继续进入 EXECUTE

**M 级精简版（task_size = M）：**

ORDER:
1. 从 PLAN 的执行步骤中提取 ≤3 个关键决策点。关键决策点 = 如果理解错了会导致返工的实现选择（字段语义/校验规则边界/错误码归属/状态流转触发条件等）。标注每个决策点"如果理解错了会怎样"。
2. 按决策影响面从大到小排序，逐决策提问（每次一个问题）:
   a. **术语**: 主动建议精确命名。格式: "建议字段/常量/状态值命名为 {推荐命名}，因为 {一句话理由}。对吗？"（不开放提问"你觉得叫什么？"——AI 必须先给出推荐答案）。grep 已有术语库 + 代码检查冲突 → 有冲突当场打断。
   b. **边界**: 空值/零值/超长/重复提交/并发/权限不足时的预期行为是什么？

RULES:
- IF 决策点 ≤3 个 THEN 全部覆盖
- IF 决策点 > 3 个 THEN 只取影响面最大的 3 个，其余标注"未精炼: 超出 M 级配额"
- IF 某决策点的术语和边界都可以从代码/grep/已有文档中唯一确定 THEN 不提问，直接输出确认句

**L 级完整版（task_size = L）：**

ORDER:
1. 列出方案中的所有关键决策点（至少包含: 数据模型变更 / 接口契约变更 / 错误码变更 / 状态流转 / 兼容策略）
2. 标注决策间的依赖关系: "决策 B 依赖决策 A 的结论"
3. 输出决策树（缩进表示依赖层级）
4. BFS 遍历提问，每决策分支内依次覆盖 4 个维度（每次一个问题）:
   a. **术语**: 同 M 级——主动建议精确命名，grep 检查冲突
   b. **边界**: 构造至少 1 个极端/竞争/踩线场景反问。格式: "观察: {代码/数据现状}。假设 {场景}。问题: {一句话}。建议: {推荐行为}，因为 {理由}"
   c. **代码**: 这个决策依赖的"现状是 X"声明是否与代码一致？grep 验证。矛盾则当场指出: "你的假设是 {声明}，但 {file}:{line} 实际行为是 {代码片段}。以哪个为准？"
   d. **收口**: 这个决策是否值得建 ADR？（过否决条件: 容易逆转/不意外/无备选 → 不建；过触发条件: 不可逆+刻意偏离+有备选/隐式约束/显式No → 提议建。ADR 格式见 builder 真源 `references/mode-design-patterns.md` §8）
5. 输出精炼摘要（术语对齐 {N} / 边界场景 {N} / 代码矛盾 {N} / ADR {N}）

RULES:
- IF 用户答案改变了 PLAN 中的前提假设 THEN 修剪决策树受影响分支，调整后续提问顺序
- IF task_size = L AND 用户未在 §5 CLASSIFY 阶段确认过 decision = ask_user THEN 精炼前先确认
- IF task_size = S THEN 跳过实现前澄清（S 级不展开交互式澄清）
- IF debug = true THEN 输出实现前澄清门禁触发判断（task_size / scenario / 跳过还是执行 / 精简版还是完整版）

BLOCKERS:
- NEVER 在 M 级用完整版协议（不升级复杂度）
- NEVER 在 L 级用精简版协议（不降级深度）
- NEVER 在 M/L implement 任务中跳过实现前澄清直接进入 EXECUTE
- NEVER 批量提问 — 每次一个问题
- NEVER 跳过术语直接问边界 — 模糊的术语会让边界场景测试失去意义
- NEVER 在澄清未完成（所有关键决策点已逐条确认）时开始写代码

---

## 7. EXECUTE

> 进入 EXECUTE 前，确认遵守 §4.0 思维链原则。

### 7.1 场景路由（固定，直接复制）

RULES:
- IF debug = true THEN 进入 EXECUTE 时，必须先输出 §7.4 执行纪律检查（所有场景通用 BLOCKER + 当前场景专属 RULE/BLOCKER 逐条状态）+ §7.5 兼容性声明触发情况 + IF mode = strict THEN §7.6 深度增强 CHECK 逐条状态 + GLOBAL_BLOCKERS 抽查结果 + 每个 EXEC step 的执行状态及消费的规范引用（按 `.meta/debug-output.md` §EXECUTE）。不可省略、不可事后补、不可与实质内容合并输出。
- IF scenario = troubleshoot THEN ORDER = EXEC_troubleshoot
- IF scenario = design THEN ORDER = EXEC_design
- IF scenario = implement AND implement_type = new THEN ORDER = EXEC_implement_new
- IF scenario = implement AND implement_type = modify THEN ORDER = EXEC_implement_modify
- IF scenario = review THEN ORDER = EXEC_review

---

### 7.2 执行路径（框架固定，步骤内容按领域扩展）

EXEC_troubleshoot:
0. **信息充分性复查**: 对照 ORDER step 0 检查结果，IF 排查过程中新发现关键信息缺失 THEN interrupt（同 ORDER step 0 格式）。
1. 按排查计划逐项验证假设（对照 package comment 中的核心规则验证是否违反）
2. 每步验证后输出: 假设成立/排除 + 证据
3. 定位根因: root_cause + 涉及的代码路径
4. IF 根因是通用性问题 THEN 在 FINAL 中输出 knowledge 建议 → 用户确认后写入模块文档

EXEC_design:
> 完整设计管线见 builder 真源 `references/mode-design-patterns.md`（8 阶段管线）。每个阶段结束必须迭代检查。
> 以下为最小骨架，领域自定义步骤在此基础上扩展：
-1. **上下文加载**: 扫描已有术语库 + 决策记录
0. **问题框定**: 输出硬约束/软约束/非目标/成功标准/利益相关方
1. **现状诊断**（只读）: grep 建立模块地图 → 定量问题报告 → 根因追问到底
2. **业界调研**: WebSearch ≥3 种方案 → 第一性原理分析 → 对标 → 结论
3. **绿场推演**: 零包袱理想方案 → 差距分析 → 可行性校准
4. **方案设计**: 候选对比 → 魔鬼代言人 → API/数据/流程/评估/安全/上线计划
5. **方案精炼**（M/L 强制执行，S 跳过）: 设计树 BFS 遍历 → 逐决策分支（术语/边界/代码/收口）
6. **按模板输出完整设计文档**（章节覆盖见 `references/mode-design-patterns.md` §9）+ 拆解任务文件
7. IF 用户明确说"可以"/"ok"/"确认" THEN 写入磁盘

EXEC_implement_new:
1. 加载 references + IF task 文件存在 THEN 按 pending 任务执行
2. 加载代码模板，复制对应骨架，填入业务逻辑
3. 按层实现 + {DOMAIN_LAYER_SELFCHECK}
  <!-- 逐层自检: 每层完成后立即对照 reference 规则验证，通过后再进入下一层 -->
  <!-- 后端示例: DTO→basic_type.*/validate/binding / Model→GORM三要素/索引在migrator / Repo→返回Model+error/无业务校验 / Service→事务只在顶层/DTO↔Model转换 / Controller→BindJsonE/Adapter写响应/Swagger6要素 -->
4. IF test_strategy = targeted_test THEN 补测试 → 编译验证
5. IF 存在 task 文件 THEN 写回磁盘标记 done（不可只标记在内存中）

EXEC_implement_modify:
0. **深度门禁（L 级）**: IF mode = strict THEN 执行 §7.6 L 级深度增强全部检查项，全部通过后方可进入 step 1。
1. 加载 references + 确认当前代码状态
2. 最小改动 + {DOMAIN_MODIFY_SELFCHECK}
  <!-- 逐层自检 + 回归检查: 引用兼容/路由兼容/错误码一致/调用方兼容 -->
  c. **范围回环检查**: 每改完一个文件后，重新 grep 被修改标识符 → IF 新发现的引用文件数 > scope_snapshot_files × 1.2 THEN 输出 "⚠ 范围漂移: 快照 {scope_snapshot_files} 文件，当前累计影响 {新总数} 文件（+{delta_pct}%）" → scope_delta_pct = (新总数 - scope_snapshot_files) / scope_snapshot_files × 100 → reclassify_triggered = true → 回退到 §5 CLASSIFY 以新 affected_files 重新评估 task_size/mode/decision
  d. IF reclassify_triggered = true AND 新 task_size 与原判定不同 THEN 必须先获取用户确认再继续
3. IF test_strategy = targeted_test THEN 补测试
4. 跑受影响包的已有测试 → 编译通过

EXEC_review:
0. **审查门禁**: 对照 ORDER step 0 检查结果，IF 审查过程中发现范围不足 THEN interrupt（同 ORDER step 0 格式）
1. 读改动文件全文（非抽样，每个文件标注已读行数）
2. 逐 reference 对照审查（不是抽查，每个 reference 逐条过）:
   a. {DOMAIN_REVIEW_REF_1}
   b. {DOMAIN_REVIEW_REF_2}
   c. {DOMAIN_REVIEW_REF_3}
3. 每个 finding 标注：文件:行号 / severity(error/warning/info) / 违反的规则 / 修复建议
4. severity 校准: IF 有安全/数据/事务/并发隐患 AND severity != error → 升档为 error
5. 输出 findings: severity_summary(error=N/warning=N/info=N) + recommendation(合并/驳回/修改后重审)

---

### 7.3 关键阻断项（框架固定，领域阻断自定义）

GLOBAL_BLOCKERS:
- NEVER 静默吞错（`_ = err` / 漏接返回值）
- NEVER 新增 `panic` / 异常抛出的主路径
<!-- 领域分层阻断 —— 按分层模型列出每层的"禁止操作" -->
{DOMAIN_LAYER_BLOCKERS}
  <!-- 后端示例: -->
  <!--   NEVER 在 Controller 中写业务逻辑 / 操作 DB / 开事务 -->
  <!--   NEVER 在 Service 中返回 HTTP Response / 直写 SQL -->
  <!--   NEVER 在 Repository 中做业务校验 / 组装 DTO / 私开事务 -->
  <!--   NEVER 在 Model / DTO 中写业务方法或 CRUD 方法 -->
  <!--   NEVER 使用 SELECT * / 字符串拼接 SQL / N+1 -->
  <!--   NEVER 使用已弃用 DB API -->
  <!--   NEVER 使用 ctx.JSON 等原生方法替代统一响应方法 -->
  <!-- 前端示例: -->
  <!--   NEVER 在 Component 中直接发 HTTP 请求 / 操作 Store -->
  <!--   NEVER 在 Hook 中写 JSX / 操作 DOM -->
  <!--   NEVER 在 Store 中写 UI 逻辑 / 路由跳转 -->
- NEVER 在未确认兼容策略时删除接口/字段/表/索引/错误码
- NEVER 把 legacy 写法当作新增默认正例（legacy 写法 = 与 `references/` 规范不一致的现有代码模式。新增代码必须遵循 references/，不得因为"旧代码这么写"就照抄。）
- NEVER 扩大任务范围，顺手重构无关模块
- NEVER 回滚用户已有改动
- NEVER 在缺乏日志/错误信息/复现条件的情况下脑补根因或输出猜测性诊断结论（scenario = troubleshoot 时，信息不足必须先让用户补全）

---

### 7.4 执行纪律（固定，直接复制）

以下规则针对 AI 常见违规行为。违反任一条 → 阻断，不得进入 VALIDATE。

**所有场景通用：**

BLOCKERS:
- NEVER 说"看起来没问题"而不给出 grep 结果
- NEVER 加载 debug 文件后跳过逐步追踪直接输出业务结果
- NEVER 在 debug 追踪中用"…"或"其余规则类似"跳过规则打印 — 每条 RULE/BLOCKER/CHECK/ORDER step 都必须单独打印匹配/跳过状态

**implement_modify 专属：**

RULES:
- IF implement_type = modify THEN 必须先输出"影响范围评估"再动手改代码
- IF implement_type = modify THEN 必须在改动前 grep 所有调用方（函数名 + 字段名 + 路由路径），输出调用方清单
- IF 改动涉及数据结构字段 THEN 必须列出所有引用该字段的文件（不可只说"已检查"而不列清单）
- IF 改动涉及已有函数/方法签名 THEN 必须列出所有调用该函数的位置 + 确认每个调用方兼容

RULES:
- IF 改动过程中新发现引用文件数 > scope_snapshot_files × 1.2 THEN reclassify_triggered = true, 回退到 §5 CLASSIFY

BLOCKERS:
- NEVER 在未列出调用方清单的情况下就开始修改代码
- NEVER 只检查本文件、不跨文件检查引用
- NEVER 在 reclassify_triggered = true 且新 task_size 升级时跳过用户确认直接继续

**troubleshoot 专属：**

RULES:
- IF scenario = troubleshoot AND 用户未提供任何关键信息（错误日志/trace_id/请求参数/复现步骤/发生时间段 全缺） THEN interrupt — 列出缺失清单，不可靠脑补编造排查路径
- IF scenario = troubleshoot AND 定位到根因 THEN 必须输出: 根因代码路径 + 触发条件 + 验证证据

BLOCKERS:
- （信息不足 → interrupt 由 §7.3 GLOBAL_BLOCKERS 和 ORDER/EXEC step 0 门禁覆盖，此处不重复）

**design 专属：**

RULES:
- IF scenario = design AND 未执行 §5.4 范围探查 THEN 禁止开始方案写作（先 grep 了解现状）
- IF scenario = design AND 产出设计文档 THEN 必须覆盖: 元信息 / 问题框定 / 现状诊断 / 业界方案参照（含第一性原理）/ 绿场推演 / 候选方案对比 / 魔鬼代言人 / 方案精炼摘要 / 演进路径 / 架构取舍理由 / 业务规则含异常 / API契约含参数范围 / 数据模型含回滚 / 流程图 / 可复用清单 / 风险与缓解 / 门槛用例
- IF task_size = S THEN 可跳过绿场推演和业界方案参照章节（标注"跳过原因: S 级"）
- IF task_size = M THEN 业界方案参照至少 2 方案，绿场推演可精简为一段，魔鬼代言人可精简为 1 个假设
- IF task_size = L THEN 全部章节完整展开，不可精简

BLOCKERS:
- NEVER 在 design 场景闭门造车——必须先读现有代码再写方案
- NEVER 跳过上下文加载——不读已有术语库和决策记录就开始设计，等于无视已有决策
- NEVER 在发现术语冲突时憋到精炼阶段再说——术语警戒线全流程生效，发现冲突当场打断
- NEVER 跳过绿场推演——不知道理想态就无法判断差距
- NEVER 跳过魔鬼代言人——不攻击自己的方案等于没思考边界
- NEVER 跳过方案精炼（M/L 级）——不与人交互对齐术语和边界，方案就是空中楼阁
- NEVER 在方案精炼中批量提问——每次一个问题，等待用户反馈后再继续下一个
- NEVER 在方案精炼的每个决策分支中跳过术语对齐直接进入边界场景
- NEVER 跳过迭代检查——每个阶段结束必须自问"这个结论是否改变了前面的假设？"
- NEVER 跳过 EXEC_design step 6（模板输出 + 任务拆解）直接交付

**review 专属：**

RULES:
- IF scenario = review THEN 审查前必须拿到 git diff 或文件改动清单（不可盲审）
- IF scenario = review AND findings 中有 error THEN 必须在 recommendation 中明确: 驳回/修改后重审

BLOCKERS:
- NEVER 只抽样不读全文 — 每个改动文件必须全文阅读
- NEVER 输出无具体文件:行号的 findings
- NEVER 在 severity 未校准时输出结论 — IF 有安全/数据/事务/并发隐患 AND severity != error → 升档

---

### 7.5 兼容性声明（固定，直接复制）

在动手改代码之前，必须先输出以下结构。不可省略任一行。

```
=== 影响范围评估 ===
改动文件: [列出]
调用方清单:
  - {file}:{line} — {调用方式}
  - {file}:{line} — {调用方式}
兼容性判断:
  - 向后兼容? YES/NO — {理由}
  - 前端受影响? YES/NO — {理由}
  - 下游服务受影响? YES/NO — {理由}
  - 数据库受影响? YES/NO — {理由}
=== 评估结束 ===
```

RULES:
- IF 调用方清单为空 THEN 写"无外部调用方"（不可留空）
- IF 任一判断为 YES AND 未在 PLAN 中体现 THEN 先中断用户确认

BLOCKERS:
- NEVER 跳过兼容性声明直接改代码
- NEVER 兼容性声明的"调用方清单"为空且未说明原因

**全仓 import 检查（M/L 级 + contract_change 必执行，框架固定）：**

调用方 grep 只能抓到直接引用。对 M/L 任务，必须额外搜索全仓 import 关系，因为其他模块可能通过 import 间接依赖被修改的模块/包/组件。

RULES:
- IF mode = standard OR mode = strict THEN 在输出兼容性声明前，必须 grep 全仓对被修改模块路径的 import 引用: `{DOMAIN_IMPORT_GREP_CMD}`
  <!-- 后端示例: rg "internal/service/sku_svc" --type go -l -->
  <!-- 前端示例: rg "from.*components/Button" --type tsx --type ts -l -->
- IF 全仓 import 结果 ≥ 5 个文件 THEN "下游服务受影响?" 必须回答 YES 并列出具体文件路径，即使不在同一业务域
- IF 全仓 import 结果 > 0 AND 原始调用方清单未包含这些文件 THEN 调用方清单需合并全仓 import 结果（标注"import 级依赖"vs"直接调用"）
- IF contract_change = true AND mode = strict THEN 额外 grep 被修改对外接口的引用在 {DOMAIN_CONSUMER_CODE_PATHS} 中的出现 — 输出外部影响面清单
  <!-- 后端示例: 被修改 DTO 字段的 JSON tag 在前端代码（web/ admin/）中的引用 -->
  <!-- 前端示例: 被修改 Props 类型在其他页面/组件中的引用 -->

BLOCKERS:
- NEVER 在 M/L 级任务的兼容性声明中仅凭直接调用方清单判断"下游服务不受影响"
- NEVER 在全仓 import 结果 ≥ 5 时回答"下游服务受影响? NO"

---

### 7.6 L 级深度增强（mode = strict 时，EXECUTE 阶段第一步执行，框架固定）

以下检查在 L 级任务中强制执行，不可跳过。全部通过后方可进入代码修改。这是 strict 模式区别于 standard 的核心深度差异。

ORDER:
1. **{DOMAIN_BOUNDARY_ANALYSIS_NAME}**（{DOMAIN_BOUNDARY_TRIGGER} 时）:
   a. {DOMAIN_DEEP_STEP1_GREP}
   b. {DOMAIN_DEEP_STEP1_TRACE}
   c. 输出边界拓扑: {DOMAIN_DEEP_STEP1_TOPOLOGY_FORMAT}
   d. 标注: {DOMAIN_DEEP_STEP1_ANNOTATIONS}
   <!-- 后端示例: -->
   <!--   1. **事务拓扑分析**（db_change = true 时）: -->
   <!--     a. grep 被修改表名在 repository 层的所有方法签名 -->
   <!--     b. 对每个 repo 方法，grep 其在 service 层的调用位置 -->
   <!--     c. 输出事务拓扑: `表 X → repo 方法 A/B/C → Service 事务入口 1/2/3` -->
   <!--     d. 标注: 跨 Service 共享事务 / 嵌套事务 / 非标准事务入口 -->
   <!-- 前端示例: -->
   <!--   1. **状态依赖拓扑**（state_schema_change = true 时）: -->
   <!--     a. grep 被修改 store key 在所有组件/hook 中的引用 -->
   <!--     b. 对每个引用点，追踪其父组件的消费链 -->
   <!--     c. 输出状态拓扑: `store key X → hook A/B/C → component 1/2/3` -->
   <!--     d. 标注: 跨页面共享状态 / selector 派生 / 持久化依赖 -->

2. **传递依赖闭包**（contract_change = true 时，固定）:
   a. grep 被修改接口/字段名在项目代码中的**所有出现**（含结构体引用 + 序列化 tag 匹配 + 赋值/比较语句）
   b. grep 被修改路由/路径在路由注册和调用方中的引用
   c. 按数据流向输出依赖闭包: `{DOMAIN_DEPENDENCY_CLOSURE_FORMAT}`
     <!-- 后端示例: DTO 字段 X → Service Y 的输入/输出 → Controller Z 的 BindJsonE → (如可查) 前端组件的 API 调用 -->
     <!-- 前端示例: Props 字段 X → Component Y 的渲染 → Page Z 的传参 → API 请求参数 -->
   d. 标注: 每个环节的兼容性（删除→编译失败/新增→默认值行为/类型变更→隐式转换风险）

3. **{DOMAIN_CONFLICT_SCAN_NAME}**（新增/修改 {DOMAIN_CONFLICT_ENTITY} 时，框架固定）:
   a. grep 新标识符前缀在项目中的定义
   b. 输出冲突检查: `新标识符 {id} → 已有定义: {file}:{line} / 无冲突`
   <!-- 后端示例: 错误码冲突扫描 — grep 新错误码前缀（如 "5000"）在 internal/ 和 pkg/cons/ 下的所有定义 -->
   <!-- 前端示例: 路由冲突扫描 — grep 新路由路径在路由表中的所有定义 -->

4. **{DOMAIN_MIGRATION_RISK_NAME}**（{DOMAIN_BOUNDARY_TRIGGER} 时，框架固定）:
   a. {DOMAIN_MIGRATION_RISK_ASSESS}
   b. 输出变更风险: `{DOMAIN_MIGRATION_RISK_FORMAT}`
   c. 输出迁移顺序: `{DOMAIN_MIGRATION_ORDER}`
   <!-- 后端示例: -->
   <!--   4. **迁移风险矩阵**（db_change = true 时）: -->
   <!--     a. 检查被修改表的 Model 定义 → 评估表规模 -->
   <!--     b. 输出 DDL 风险 + 迁移顺序: 1. DDL(无锁) → 2. 代码部署(兼容新旧) → 3. 数据回填 → 4. 切换新逻辑 → 5. 清理旧代码 -->
   <!-- 前端示例: -->
   <!--   4. **状态迁移风险**（state_schema_change = true 时）: -->
   <!--     a. 检查被修改 store 的持久化方式（localStorage/IndexedDB/服务端） -->
   <!--     b. 输出迁移风险 + 顺序: 1. 新增 schema 版本号 → 2. 部署兼容新旧 schema 的读取 → 3. 后台迁移存量数据 → 4. 切换到新 schema → 5. 清理旧兼容代码 -->

5. **回滚兼容窗口**（destructive_change = true OR breaking_change = true 时，固定）:
   a. 确认旧接口/字段是否有双轨过渡期: 标注废弃(T+0) → 双轨运行(T+N) → 下线(T+M)
   b. IF 用户未提供兼容窗口 THEN interrupt — 列出建议时间线供确认，不可自行决定立即删除
   c. 输出兼容策略: `旧标识符 X 保留至 T+{N}d → 新标识符 Y 同步生效 → 消费方切换完成 → 旧标识符下线`

OUTPUT:
- {DOMAIN_DEEP_OUTPUT_FIELDS}
  <!-- 后端示例: tx_topology / dependency_closure / error_code_conflicts / migration_risk_matrix / rollback_compat_window -->
  <!-- 前端示例: state_topology / dependency_closure / route_conflicts / migration_risk_matrix / rollback_compat_window -->

CHECK:
- [ ] {DOMAIN_BOUNDARY_ANALYSIS_NAME}已输出，跨边界依赖已标注
- [ ] 依赖闭包已追踪到所有引用点，每环节兼容性已评估
- [ ] 无 {DOMAIN_CONFLICT_ENTITY} 冲突
- [ ] {DOMAIN_MIGRATION_RISK_NAME}已规划（变更→部署→迁移→切换→清理）
- [ ] 回滚兼容窗口已确认（或已 interrupt 获取用户确认）
- [ ] 范围回环检查: 深度增强过程中是否发现新的影响文件？IF 是 THEN reclassify_triggered = true
- [ ] 所有标注 "⚠" 的风险点已在 PLAN 中对应缓解措施

BLOCKERS:
- NEVER 在 L 级深度增强 CHECK 未全部打勾前开始修改代码
- NEVER 跳过 {DOMAIN_BOUNDARY_ANALYSIS_NAME}（当 {DOMAIN_BOUNDARY_TRIGGER}）
- NEVER 跳过依赖闭包追踪（当 contract_change = true）
- NEVER 在未确认回滚兼容窗口时执行 destructive_change
- NEVER 在迁移顺序未规划完成时执行 {DOMAIN_BOUNDARY_TRIGGER} 相关操作

---

## 8. VALIDATE

> 进入 VALIDATE 前，确认遵守 §4.0 思维链原则。

### 8.0 机械验证门禁（框架固定，命令按领域替换）

以下 4 步为确定性验证。任一步失败 → 回到 §7 EXECUTE 修复，不可跳过，不可声明"已知问题"后继续。全部通过后进入 §8.1 CHECK。

ORDER:
1. `{DOMAIN_BUILD_CMD}` — 编译/构建必须通过
  <!-- 后端示例: go build ./internal/... -->
  <!-- 前端示例: npm run build -->
2. `{DOMAIN_LINT_CMD}` — 静态分析必须通过
  <!-- 后端示例: go vet ./... -->
  <!-- 前端示例: npm run lint -->
3. 受影响包的测试 — 必须全部通过（不全局执行，只跑影响面）
4. IF 本次改动涉及 {DOMAIN_LOGIC_LAYERS} THEN 执行全部 §8.2 验证脚本 — 必须通过；IF 仅改动 {DOMAIN_DATA_LAYERS} THEN 可跳过 §8.2

RULES:
- IF 任一步失败 THEN 修复后重新执行该步，不跳过
- IF 全部通过 THEN 进入 §8.1 CHECK
- IF 验证脚本报错 AND 涉及本次改动文件 THEN 必须先修复再进入 CHECK

---

### 8.1 CHECK（框架固定，领域检查项自定义）

RULES:
- IF 测试/编译/vet 失败 THEN 先判断是否由本次改动引入
- IF 由本次改动引入 THEN 回到 §7 EXECUTE 修复 → 修复后重新执行 §8.0 机械验证门禁（不可跳过）
- IF 历史遗留失败 THEN 明确说明，不隐瞒
- IF debug = true THEN 逐条输出 CHECK 检查状态（✓/✗/N/A），不可仅说"全部通过"（按 `.meta/debug-output.md` §VALIDATE）

CHECK（与 §7.3 GLOBAL_BLOCKERS 重复的项已移除，此处仅放 BLOCKERS 未覆盖的检查）：

分层/安全红线 → 见 GLOBAL_BLOCKERS §7.3，此处不重复。

<!-- 领域专属检查项 —— 从领域规范和 GLOBAL_BLOCKERS 反推 -->
{DOMAIN_CHECK_ITEMS}
  <!-- 后端示例: -->
  <!--   [ ] 所有 ID 字段使用 `Id` 而非 `ID` -->
  <!--   [ ] Controller 包以 `_api` 结尾，Service 包以 `_svc` 结尾，DTO 文件保留 `_dto.go` 后缀 -->
  <!--   [ ] Model/DTO 字段使用 `basic_type.*` -->
  <!--   [ ] 成功响应使用 `ctx.JsonSuccess/JsonPageSuccess`，成功码 "000000" -->
  <!--   [ ] Swagger 6 要素完整，无 Model 暴露 -->
  <!--   [ ] 索引声明在 migrator SQL 中，不在 GORM tag -->
  <!--   [ ] Router 路径与 Swagger @Router 一致 -->
  <!--   [ ] 未新增 magic value，常量从 pkg/cons / internal/cons 复用 -->
  <!--   [ ] 日志在正确层级（Service/Scheduler/Callback），Repository/Model/DTO 无业务日志 -->
  <!--   [ ] 事务只在顶层 Service 开启，通过 ctx.TenantDBStartTxE() 统揽 -->
  <!-- 前端示例: -->
  <!--   [ ] 组件文件使用 PascalCase 命名 -->
  <!--   [ ] Props 有完整 TypeScript 类型定义 -->
  <!--   [ ] 无 inline style，样式在独立 .css/.module.css 文件中 -->
  <!--   [ ] 所有 useEffect 有依赖数组，无不必要的 re-render -->
  <!--   [ ] API 调用在 custom hook 中，不在 Component 中 -->

<!-- 以下为通用检查项，直接保留 -->
- [ ] 测试范围仅覆盖本次影响面
- [ ] implement_type = modify: 已输出"影响范围评估"（调用方清单 + 兼容性判断四问）
- [ ] 若 test_strategy = mechanical_no_tdd，已说明原因
- [ ] 验证失败时已区分本次问题与历史问题
- [ ] 最终答复按 FINAL 格式输出，写明剩余风险
<!-- 深度增强通用检查项（固定） -->
- [ ] M/L 任务: 深度探查（§5.4.1）已执行，传递闭包已追踪
- [ ] M/L implement: 实现前澄清门禁（§6.3）已执行，关键决策已逐条确认
- [ ] implement_modify: 历史风险门禁已执行，code_surface_risk 已评估
- [ ] L 级任务: §7.6 深度增强全部 CHECK 已打勾
- [ ] {DOMAIN_BOUNDARY_TRIGGER}: {DOMAIN_BOUNDARY_ANALYSIS_NAME}已输出，迁移顺序已规划
- [ ] contract_change = true AND mode ≥ standard: 全仓 import 检查已执行
- [ ] reclassify_triggered = true: 已回退 CLASSIFY 并以新 task_size 获取用户确认

BLOCKERS:
- NEVER 用全局测试替代影响范围验证
- NEVER 在验证失败时声明完成

---

### 8.2 验证脚本（按领域配置）

RULES:
{DOMAIN_VALIDATION_SCRIPTS}
  <!-- 后端示例: -->
  <!--   IF 验证日志格式 THEN python3 scripts/validate_log_format.py -->
  <!--   IF 验证错误处理 THEN python3 scripts/validate_error_handling.py -->
  <!--   IF 验证分层越界 THEN python3 scripts/validate_layers.py -->
  <!-- 前端示例: -->
  <!--   IF 验证组件结构 THEN node scripts/validate_components.js -->
  <!--   IF 验证 import 规范 THEN node scripts/validate_imports.js -->

---

## 9. REVIEW（固定，直接复制。少量领域专属可追加）

CHECK:
- [ ] scope_controlled: 未扩大改动范围
- [ ] no_user_change_reverted: 未回滚用户已有改动
- [ ] error_all_handled: 所有 error 路径已处理，异常分支已梳理
- [ ] layer_boundary_respected: 分层职责未越界
- [ ] response_consistent: 响应结构/错误码/日志/Swagger/文档与改动一致
- [ ] test_scoped: 测试覆盖本次影响面，门槛用例已通过
- [ ] remaining_risk_stated: 剩余风险已说明，故障可恢复性已设计
- [ ] idempotency_designed: 写操作有幂等设计（幂等键+策略+窗口）
- [ ] validation_coverage: 所有字段有校验规则（必填/格式/范围/枚举值）
- [ ] flowchart_present: 设计文档含业务流程图（正常路径+异常分支）
- [ ] architecture_rationale: 设计文档含架构取舍理由
- [ ] reusable_identified: 设计文档含可复用点清单
- [ ] nfr_specified: 非功能需求已量化（性能/可用性/安全指标）
- [ ] metadata_complete: 元信息表已填写（文档ID/代码路径/路由前缀/历史别名）
- [ ] precondition_matrix_present: 前置条件矩阵已梳理（鉴权/角色/状态/数据/外部依赖/并发，逐接口标注不满足时处理+归属层）
- [ ] version_compat_assessed: 版本兼容性已评估（向后兼容/Breaking Change/双轨策略）
- [ ] security_designed: 安全与合规已设计（鉴权方案/数据分级/审计留痕/防护措施）
- [ ] cache_strategy_designed: 如有缓存，策略已明确（Key/TTL/失效/一致性/穿透/雪崩）
- [ ] monitoring_defined: 关键监控项与告警阈值已定义
- [ ] rollout_plan_present: 上线计划已制定（灰度/回滚/版本升级/数据迁移/依赖顺序）
- [ ] no_absolute_path: 未在 repo 文件中写入个人系统目录绝对路径
- [ ] skill_uri_valid: skill://... 只指向仓库根目录下的 skills/...
- [ ] rules_scoped: 稳定规则只写在 SKILL.md 或 QUICK_REFERENCE.md，不散落到临时文件
- [ ] escalation_for_meta: 若后续新增 references 或 scripts，先切换到 ai-skill-builder 治理
- [ ] depth_exploration_done: M/L 任务深度探查（§5.4.1）已执行，传递闭包已追踪
- [ ] clarification_gate_done: M/L implement 实现前澄清门禁（§6.3）已执行，关键决策已逐条确认
- [ ] history_risk_checked: implement_modify 的历史风险门禁已执行，code_surface_risk 已评估
- [ ] {DOMAIN_BOUNDARY_VAR}_checked: {DOMAIN_BOUNDARY_TRIGGER} 时 {DOMAIN_BOUNDARY_ANALYSIS_NAME}已输出，迁移顺序已规划
- [ ] reclassify_handled: 范围漂移（>20%）时已回退 CLASSIFY 并获取确认
- [ ] l_deep_gate_passed: L 级任务 §7.6 深度增强 CHECK 全部打勾
<!-- 领域专属 REVIEW 检查项（按需追加） -->
{DOMAIN_REVIEW_EXTRA}

RULES:
- IF any_check = false AND fixable = true THEN 修复后再输出 FINAL
- IF any_check = false AND fixable = false THEN decision = stop
- IF all_check = true AND validation != FAIL THEN decision = continue
- IF debug = true THEN 逐条输出 REVIEW 检查状态（✓/✗/N/A），不可仅说"全部通过"（按 `.meta/debug-output.md` §REVIEW）

---

### 9.1 Git 指引（固定，直接复制）

RULES:
- IF 所有验证通过 AND 用户明确要求提交 THEN 按以下格式提交
- IF 用户未明确要求 THEN 在 FINAL 中报告"改动已验证，等待提交指令"，不主动提交

**提交消息格式：**
```
<type>(<scope>): <描述>

<body>
```

BLOCKERS:
- NEVER 验证未通过时提交
- NEVER 提交前不跑 git diff 确认改动内容
- NEVER 提交包含 secret/token/password/.env 的变更
- NEVER force push 到 main/master
- NEVER 在用户未确认时提交

---

## 10. FINAL（固定，直接复制）

### 10.1 共享 OUTPUT（所有场景）

OUTPUT:
- scenario: ...
- validation: PASS | FAIL | NOT_RUN
- validation_command: ...（跑了什么验证命令）
- reason_if_not_run: ...（未跑验证的原因）
- remaining_risk: ...（说明剩余风险）

RULES:
- IF validation = NOT_RUN THEN 必须说明原因
- IF 发现流程规则缺口 THEN 说明是否需要回写 skill
- IF task_size = L THEN 必须说明采取了哪些风险控制措施，并附带: scope_snapshot_files / transitive_affected_files / scope_delta_pct / reclassify_triggered / code_surface_risk / {DOMAIN_BOUNDARY_VAR} 状态 / full_repo_import_check 状态
- IF task_size = M THEN 必须附带: scope_snapshot_files / transitive_affected_files / code_surface_risk / full_repo_import_check 状态

### 10.2 场景 OUTPUT

OUTPUT_troubleshoot:
- root_cause / evidence / fix / prevention
- knowledge: IF 根因是通用性问题 THEN 写入模块文档的"已知问题"章节

OUTPUT_design:
- design_doc / task_file / metadata / design_summary / nfr / api_changes
- precondition_matrix / version_compat / data_changes / flow
- cache_strategy / idempotency / reusable / security / risks
- monitoring / threshold_tests / rollout_plan / task_count

OUTPUT_implement:
- result / changed / test_result
- IF implement_type = modify THEN compatibility: 调用方清单 + 四问结论

OUTPUT_review:
- findings / severity_summary / recommendation

### 10.3 格式

BLOCKERS:
- NEVER 输出未经验证的绝对结论
- NEVER 隐藏失败验证
- NEVER 省略未完成原因

---

---

## 附录：占位符替换清单

| 占位符 | 含义 | 后端示例 | 前端示例 |
|--------|------|---------|---------|
| `{SKILL_NAME}` | skill 触发名 | `/ai-backend` | `/ai-frontend` |
| `{DOMAIN_VALIDATE_SUMMARY}` | 验证阶段简述 | 编译/vet/测试 | build/lint/test |
| `{DOMAIN_DB_CHANGE_DESC}` | 数据层变更术语 | 数据库结构是否变更 | 状态/Props 结构是否变更 |
| `{DOMAIN_LAYER_VALUES}` | 分层枚举定义 | controller/service/repository/model/dto/router | component/hook/store/page/util |
| `{DOMAIN_READ_RULES}` | 领域读取条件 | IF db_change OR 状态流转 OR design → 读完整文档 | IF state_schema_change → 读状态管理规范 |
| `{DOMAIN_REF_*}` | 各场景 reference 文件 | development-baseline/observability/code-quality/testing | component-guide/styling/state-management/testing |
| `{DOMAIN_BOOL_NO_DB}` | 规模判定的"无DB变更"条件 | db_change = false | state_schema_change = false |
| `{DOMAIN_L_TRIGGERS}` | L 级触发条件 | db_change/destructive_change/breaking_change/cross_domain → L | state_schema_change/breaking_change/visual_regression → L |
| `{DOMAIN_L_CONDITIONS_SUMMARY}` | L 级条件摘要 | db_change / destructive_change / breaking_change / cross_domain / affected_files ≥ 7 | state_schema_change / breaking_change / visual_regression / affected_files ≥ 7 |
| `{DOMAIN_LAYER_BLOCKERS}` | 分层阻断规则 | NEVER 在 Controller 写业务 / NEVER SELECT * / NEVER 使用 ctx.JSON ... | NEVER 在 Component 发请求 / NEVER 在 Hook 写 JSX ... |
| `{DOMAIN_CHECK_ITEMS}` | 领域检查项 | basic_type.* / Swagger / GORM tag / 日志层级 ... | 组件命名 / Props 类型 / 无 inline style / API 调用在 hook ... |
| `{DOMAIN_BUILD_CMD}` | 构建命令 | `go build ./internal/...` | `npm run build` |
| `{DOMAIN_LINT_CMD}` | 静态分析命令 | `go vet ./...` | `npm run lint` |
| `{DOMAIN_VALIDATION_SCRIPTS}` | 验证脚本列表 | validate_log_format / validate_error_handling / validate_layers | validate_components / validate_imports |
| `{DOMAIN_REF_DESC}` | references 目录描述 | 开发规范真源，按触发词加载，定义代码如何写 | 前端规范真源，按触发词加载 |
| `{DOMAIN_LAYER_SELFCHECK}` | 逐层自检清单 | DTO→Model→Repo→Service→Controller 各层检查 | Component→Hook→Store→Page 各层检查 |
| `{DOMAIN_MODIFY_SELFCHECK}` | modify 场景回归检查 | DTO引用/路由兼容/错误码一致/调用方兼容 | Props兼容/路由兼容/状态兼容/import检查 |
| `{DOMAIN_REVIEW_EXTRA}` | 领域额外审查项 | (按需) | 无障碍/A11Y / 响应式适配 / bundle size |
<!-- 深度增强占位符（v2 新增） -->
| `{DOMAIN_DEEP_L_CONDITIONS}` | 三轮 grep 的 L 级触发条件 | `db_change = true OR cross_domain = true` | `state_schema_change = true OR cross_domain = true` |
| `{DOMAIN_DEEP_ROUND3_GREP}` | 三轮 grep 的具体搜索描述 | 全仓 import + 表引用 + 错误码引用 | 全仓 import + store 引用 + 路由引用 |
| `{DOMAIN_DEEP_ROUND3_TRIGGER}` | 三轮 grep 触发条件表达式 | `scope_snapshot_files ≥ 7 OR db_change = true OR cross_domain = true` | `scope_snapshot_files ≥ 7 OR state_schema_change = true OR cross_domain = true` |
| `{DOMAIN_DEEP_ROUND3_SUMMARY}` | 三轮 grep 简短描述 | 全仓 import / 表引用 / 错误码引用 | 全仓 import / store 引用 / 路由引用 |
| `{DOMAIN_BOUNDARY_ANALYSIS_NAME}` | 边界分析的名称 | 事务拓扑分析 | 状态依赖拓扑 |
| `{DOMAIN_BOUNDARY_TRIGGER}` | 边界分析触发条件 | `db_change = true` | `state_schema_change = true` |
| `{DOMAIN_BOUNDARY_VAR}` | 边界分析完成标志变量 | `tx_boundary_analysis` | `state_boundary_analysis` |
| `{DOMAIN_BOUNDARY_ANALYSIS_STEPS}` | 边界分析步骤描述 | grep 表名→追踪 repo 方法→追踪 service 事务入口 | grep store key→追踪 hook 引用→追踪组件消费链 |
| `{DOMAIN_BOUNDARY_CROSS_WARNING}` | 跨边界警告的触发条件 | 被修改表参与 ≥ 2 个不同 Service 包的事务 | 被修改 store key 被 ≥ 2 个不同 Page 消费 |
| `{DOMAIN_BOUNDARY_WARNING_MSG}` | 跨边界警告的消息模板 | 跨 Service 事务边界: 表 {name} 被 {svc_a} 和 {svc_b} 在事务中同时操作 | 跨页面状态依赖: store key {name} 被 {page_a} 和 {page_b} 消费 |
| `{DOMAIN_IMPORT_GREP_CMD}` | 全仓 import grep 命令 | `rg "internal/service/sku_svc" --type go -l` | `rg "from.*components/Button" --type tsx --type ts -l` |
| `{DOMAIN_CONSUMER_CODE_PATHS}` | 外部消费方代码路径模式 | `web/` `admin/` | `pages/` `app/` |
| `{DOMAIN_DEPENDENCY_CLOSURE_FORMAT}` | 依赖闭包输出格式 | `DTO 字段 X → Service Y → Controller Z → 前端组件` | `Props 字段 X → Component Y → Page Z → API 请求` |
| `{DOMAIN_CONFLICT_SCAN_NAME}` | 冲突扫描名称 | 错误码冲突扫描 | 路由冲突扫描 |
| `{DOMAIN_CONFLICT_ENTITY}` | 冲突实体名 | 错误码 | 路由 |
| `{DOMAIN_MIGRATION_RISK_NAME}` | 迁移风险分析名称 | 迁移风险矩阵 | 状态迁移风险 |
| `{DOMAIN_MIGRATION_RISK_ASSESS}` | 迁移风险评估方法 | 检查 Model 定义评估表规模 | 检查 store 持久化方式 |
| `{DOMAIN_MIGRATION_RISK_FORMAT}` | 迁移风险输出格式 | `ALTER TABLE X ADD COLUMN Y — 风险: {锁表/回填/索引}` | `store key X schema 变更 — 风险: {持久化兼容/存量迁移/回滚策略}` |
| `{DOMAIN_MIGRATION_ORDER}` | 迁移顺序 | `1. DDL(无锁) → 2. 代码部署 → 3. 数据回填 → 4. 切换 → 5. 清理` | `1. schema 版本号 → 2. 兼容读取 → 3. 存量迁移 → 4. 切换 → 5. 清理` |
| `{DOMAIN_DEEP_STEP1_GREP}` | L 深度增强 step1 grep 描述 | grep 被修改表名在 repository 层的所有方法签名 | grep 被修改 store key 在所有组件/hook 中的引用 |
| `{DOMAIN_DEEP_STEP1_TRACE}` | L 深度增强 step1 追踪描述 | grep repo 方法在 service 层的调用位置 | 追踪每个引用点的父组件消费链 |
| `{DOMAIN_DEEP_STEP1_TOPOLOGY_FORMAT}` | L 深度增强 step1 拓扑格式 | `表 X → repo 方法 A/B/C → Service 事务入口 1/2/3` | `store key X → hook A/B/C → component 1/2/3` |
| `{DOMAIN_DEEP_STEP1_ANNOTATIONS}` | L 深度增强 step1 标注 | 跨 Service 共享事务 / 嵌套事务 / 非标准事务入口 | 跨页面共享状态 / selector 派生 / 持久化依赖 |
| `{DOMAIN_DEEP_OUTPUT_FIELDS}` | L 深度增强 OUTPUT 字段列表 | tx_topology / dependency_closure / error_code_conflicts / migration_risk_matrix / rollback_compat_window | state_topology / dependency_closure / route_conflicts / migration_risk_matrix / rollback_compat_window |
