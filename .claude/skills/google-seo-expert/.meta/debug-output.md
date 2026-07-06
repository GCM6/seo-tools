# Debug 输出（google-seo-expert）

> debug = true 时加载。单一档位：开了就逐步留痕。自然语言叙事 + 每阶段末审计汇总行。
> 全量原则：每条规则/检查项都留痕，N/A 标 N/A，不用「…」省略，边执行边输出。

## 阶段（按 SKILL.md 流程，缺一不可）

### READ / ENTRY GATE — 入口门禁（§4）
```
用户说了 "{原话摘要}"。是否含 debug 触发词 → {是/否} → debug = {true/false}。
加载启动集：reference-index.md + trigger-matrix.md → {已加载}。术语是否需要 → {是→加载 00-glossary / 否}。
确认未在判定 scenario/site_stage 前直接给方案。
— 已检查: §4 入口门禁 3 步 + 2 BLOCKER, 全部覆盖
```

### CLASSIFY — 场景与阶段判定（§5）
```
scenario 判定：关键信号 "{关键词}" → 排除 {…} → scenario = {new_build|diagnose|optimize|learn}。
site_stage 判定：依据 "{年龄/症状}" → site_stage = {none|new|growth|mature|penalized}。
澄清门禁：信息是否齐（症状/GSC/年龄 或 市场/B端C端/产品）→ {齐，继续 / 缺，提问：{问题}}。
— 已检查: 4 scenario 规则 + 5 stage 规则 + 澄清 BLOCKERS, 全部覆盖
```

### 思维链 — 每次路由/给方案前
```
现在要做: {动作}。为什么: {填补什么缺口}。
已知: {上下文}。未知: {待澄清}。怎么做: {步骤}。预期: {最可能结果}。
— 思维链, 已检查
```

### ROUTE — 路由到主线站点（§6.2 + trigger-matrix）
```
按 scenario={value} 选路径：{new_build 走 S1→…→S6 / diagnose 用矩阵把"症状"映射到 Sx / optimize 直达 Sx / learn 先 glossary}。
命中 trigger-matrix 行："{症状/诉求}" → 站点 {Sx} → 加载 references/{文件}。loaded_refs += {文件}。
— 已检查: §6.2 路由规则 + 矩阵命中, 全部覆盖
```

### EXECUTE — 每站执行（§6.3）
```
当前站 {Sx}（{reference}）。
  原则→做法→红线→自检 逐项套到用户具体情况：{结论要点}
  消费来源: {reference + docs 章节}
  跨站依赖: {有→串联说明 / 无}
（多站则逐站重复，不合并）
— EXECUTE 共 {M} 站, 已执行 {N} 站
```

### BLOCKERS — 红线全量排查（§7）
```
14 条 BLOCKER 逐条：
  关键词堆砌 → {命中/N/A}
  精准锚文本批量外链 → {…}
  批量上外链/工具跑 → {…}
  新站零展示上外链 → {…}
  无人工终审批量 AI 内容 → {…}
  小语种泛滥 → {…}
  Schema 前后端不一致 → {…}
  跨域名 canonical → {…}
  放任蚕食 → {…}
  加广告/加外链当解药 → {…}
  人工终审+E-E-A-T+溯源(ALWAYS) → {满足/缺}
  以 GSC 为准(ALWAYS) → {满足/缺}
  一词一页一意图(ALWAYS) → {满足/缺}
  泛流量≤30%(ALWAYS) → {满足/缺}
— 已检查: 14 BLOCKER, {N} N/A, {M} 满足, {K} 违规(0 才能交付)
```

### CHECK — 交付自检（§8）
```
通用 5 条逐条：scenario/stage 已定 → {✓/✗}；针对具体情况 → {✓/✗}；有来源 → {✓/✗}；BLOCKER 全过 → {✓/✗}；术语可查 → {✓/✗}。
场景增量（{scenario}）逐条：{…}
— 已检查: {N} CHECK, {M} ✓, {K} ✗, {J} N/A
```

### FINAL — 终值与审计汇总
```
🏁 {一句话结论}
变量终值: scenario={v} · site_stage={v} · loaded_refs={[...]}
审计汇总: 已检查 规则 {N} / BLOCKER 14 / CHECK {N}；ROUTE 命中 {N}；EXECUTE {N} 站；reference 加载 {N} 个；违规 {N}。
```

## 反模式
- ❌ 多档位 debug；❌ 用「…」省略红线；❌ EXECUTE 无逐站 trace；❌ CHECK/BLOCKER 只写「全部通过」；❌ 思维链只写动作不写已知/未知。
