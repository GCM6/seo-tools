# Debug 输出模板

> 用途：为 skill 新建 `.meta/debug-output.md` 时直接复制此骨架，填入 skill 专属内容。
> 设计原则：单一 on/off 档位、全量覆盖无盲区、自然语言叙事、审计汇总。

---

## 格式约定

- debug 只有一档：`false | true`。开了就输出逐步追踪，不区分简版/全版。
- 每个阶段用自然语言叙事，不是逐条 `RULE: IF...→ 匹配/不匹配`
- 规则的匹配/跳过信息融入叙事，末尾一行审计汇总
- **全量原则**：每阶段的每条规则/检查项都必须留痕，N/A 的标注 N/A
- 边执行边输出，不事后汇总

---

## 必含阶段（全部 8 个，缺一不可）

### READ — 上下文加载检查
### ENTRY GATE — 入口门禁
### Reference 加载 — 规范文件加载 + 消费证据
### CLASSIFY — 场景判定 + 范围探查 + 规模判定(含 bool 推导) + 打断门禁
### 变量变更链 — STATE → CLASSIFY → PLAN → EXECUTE
### 思维链 — 每次行动前（已知/未知/策略/预期）
### PLAN — 共享规则 + 场景路由 + ORDER
### EXECUTE — 执行纪律(§7.4) + 兼容性声明(§7.5) + 步进 trace + GLOBAL_BLOCKERS 全量
### VALIDATE — §8.0 机械验证 + §8.1 CHECK 逐条
### REVIEW — §9 全量 CHECK 逐条
### FINAL — 变量终值(四列对照) + 审计汇总

---

## 各阶段叙事模板

### READ
```
现在检查该读什么：用户提到了具体模块吗？→ {结果}。有 DB 变更吗？→ {结果}。
有 task 文件吗？→ {结果}。有未提交改动吗？→ {结果}。
— 已检查: §4 READ N 条规则, 全部覆盖
```

### ENTRY GATE
```
用户说了 "{触发词}" → debug = true。加载 .meta/debug-output.md + references/variable-guide.md。
确认：不是 @文件路径 直接跳转，没跳过 debug 判定。
— 已检查: §4.0 ORDER + BLOCKERS, 全部覆盖
```

### Reference 加载
```
场景是 {scenario}，加载 reference_set: [{文件列表}]。
其中 {N} 条规范将在后续步骤中被引用（消费证据见各阶段标注）。
— 已检查: §4.2 加载规则 + ORDER, 全部覆盖
```

### CLASSIFY — 场景判定
```
用户说的是"{原话摘要}"。没有 bug/报错 → 排除 troubleshoot。没有"改代码" → 排除 implement。
关键信号是"{关键词}" — 命中 {scenario}。边界不模糊，不需要打断。
→ scenario = {value}, implement_type = {value}
— 已检查: N 条场景规则 + M 条 implement_type 规则, 全部覆盖
```

### CLASSIFY — 规模判定 + bool 推导
```
affected_files = {N}。逐个判断:
  contract_change: {依据} → {值}
  db_change: {依据} → {值}
  destructive_change: {依据} → {值}
  breaking_change: {依据} → {值}
  cross_domain: {依据} → {值}
套规则链: {依次匹配过程} → task_size = {S|M|L}
→ risk = {值} → mode = {值} → decision = {值}
— 已检查: 8 条规模规则 + 5 bool 推导 + 连锁推导, 全部覆盖
```

### 打断门禁
```
逐条过 5 问:
① 意图: {判定} → {结果}
② 范围: {判定} → {结果}
③ 安全: {判定} → {结果}
④ 方法: {判定} → {结果}
⑤ 信息: {判定} → {结果}
→ {全部通过/第N问触发}
— 已检查: 5 RULE + 3 BLOCKER + 3 推导, 全部覆盖
```

### 思维链（每次行动前）
```
现在要做: {动作}。为什么: {填补什么缺口}。
已知: {已掌握的上下文}。未知: {要搞清楚的问题}。
怎么做: {步骤}。预期: {最可能的结果}。
— §4.1 思维链 RULE + 2 BLOCKERS, 已检查
```

### EXECUTE
```
先过执行纪律: implement_type = {value} → 4 RULE 中 {N} 条触发, {M} 条 N/A。
兼容性声明: {需要/不需要}。
GLOBAL_BLOCKERS 14 条: {N} 条 N/A, {M} 条已确认, 0 违规。

按 {EXEC_*} 逐步:
  step 1: {描述} → {结果}。消费规范: {引用}
  step 2: ...
— EXEC 共 {M} 步, 已执行 {N} 步
```

### VALIDATE
```
§8.0: build → {结果}。vet → {结果}。测试 → {结果} ({N} packages)。脚本 → {结果}。
→ validation = {PASS|FAIL|NOT_RUN}

§8.1 CHECK 15 条逐条:
  Id 非 ID → {✓/✗/N/A}
  Controller _api, Service _svc → {✓/✗/N/A}
  ...(逐条)
— 已检查: 15 CHECK, {N} N/A, {M} ✓, {K} ✗
```

### REVIEW
```
§9 REVIEW 24 条逐条:
  scope_controlled → {✓/✗/N/A}
  no_user_change_reverted → {✓/✗/N/A}
  ...(逐条)
— 已检查: 24 CHECK, {N} N/A, {M} ✓, {K} ✗
```

### FINAL
```
🏁 {一句话总结}

变量终值 (STATE → CLASSIFY → PLAN → EXECUTE):
  scenario: implement → {v} → (不变)
  task_size: S → {v} → (不变)
  ...(仅列出变更过的)

审计汇总:
  已检查 RULE: {N}  BLOCKER: {N}  CHECK: {N}
  ORDER step: {N}/{M}  跳过(N/A): {N}  违规: {N}
  reference 消费: 加载 {N} 文件, 引用 {N} 条规范
```

---

## 接入 SKILL.md 的最小改动

1. **ENUM**: `debug: false | true`
2. **STATE**: `debug = false`
3. **§4.0 ORDER**: step 2 加 `IF debug = true THEN 加载 .meta/debug-output.md`，step 3/4/5 加 debug 门禁
4. **§4.3**: 2 条 RULES（触发词 → debug=true，debug=true → 加载+输出）
5. **§7.1/§8.1/§9**: 各加一条 `IF debug = true THEN 逐条输出...`
6. **§7.4**: BLOCKER `NEVER 在 debug 追踪中用"…"省略规则打印`

## 反模式（不要这样做）

- ❌ 多档位 debug（light/full/trace）— 增加认知负担
- ❌ trace 模板用 "…" 或 "其余规则类似" 省略 — 必须逐条
- ❌ EXECUTE 阶段无 trace — 这是真正动手的地方
- ❌ CHECK/REVIEW 只说"全部通过" — 必须逐条
- ❌ 思维链只写动作描述 — 必须展示已知/未知/策略
- ❌ 打断是 IF-THEN 而非 ORDER step — AI 可自我判定绕过
- ❌ trace 格式是逐条 RULE dump — 应该自然语言叙事
