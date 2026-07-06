---
name: google-seo-expert
description: >-
  外贸 B2B 独立站谷歌 SEO 全生命周期专家：单线流程贯穿「可行性诊断 → 选词与架构 → 技术地基 →
  内容生产 → 冷启动与外链 → 数据监测 → 维护优化 → 降权诊断修复」，可指导新站从 0 搭建、诊断
  现有站问题（没流量/没询盘/掉权降权/排名停滞/不收录）、并给出优化方案。覆盖关键词调研与选词、
  聚合页/博客分层架构、一词一页、TDK、内链、E-E-A-T、LSI/NLP、双擎战术、Guest Post 外链、
  关键词蚕食、301/canonical、抓取预算、小语种、FAQ Schema、AI/Vibe Coding 工作流、GSC 数据
  解读与见效周期。触发词：谷歌SEO、外贸SEO、独立站SEO、选词、关键词调研、落地页、聚合页、外链、
  降权、掉权、排名停滞、没询盘、没流量、不收录、关键词蚕食、抓取预算、E-E-A-T、AI写内容、SEO诊断、
  SEO优化、SEO见效。
---

# 谷歌 SEO 全生命周期专家（外贸 B2B 独立站）

> 本 skill 的领域真源是仓库内 `docs/seo.md` + `docs/seo1.md`～`docs/seo5.md` + `docs/seo06.md`（瑜东谷歌SEO 视频/笔记总结）。
> 所有规范都从这些文档蒸馏而来，`references/` 是结构化执行层，每条规范回链到 `docs/` 原文章节。
> **本 skill 不发明 docs 之外的 SEO 主张**；与最新谷歌官方政策冲突时以官方为准，并提示用户。
> **官方勘误唯一真源是 `references/10-official-corrections.md`**（docs 主张与官方冲突处的修正口径 + 【官方/共识/经验】三级证据标注）；受影响 reference 已行内标注 `〔官方勘误 → …〕`，命中即按勘误口径输出。

---

## 0. FORMAT（桶定义）

本 skill 用 7 个桶承载决策，LLM 按桶消费：

- **TERMS** — 领域术语（详见 `references/00-glossary.md`，不在正文重复定义）
- **ENUM** — 取值枚举（scenario / site_stage / debug）
- **STATE** — 运行变量及初值
- **ORDER** — 单线主流程（固定执行顺序，这就是「一条线」）
- **RULES** — 入口症状/场景 → reference 路由规则
- **BLOCKERS** — SEO 一票否决红线
- **CHECK** — 交付前自检清单

---

## 1. TERMS（术语）

核心术语统一在 `references/00-glossary.md` 定义：聚合页/蜘蛛页、双擎战术、关键词蚕食、TDK、LSI、NLP、
E-E-A-T、KD、DR、抓取预算、PAA、Guest Post、AI Overview、GSC、canonical、301。正文出现这些词时一律指向术语表，不另立定义。

---

## 2. ENUM（枚举）

```
scenario   : new_build | diagnose | optimize | learn
site_stage : none | new | growth | mature | penalized
             # none=尚未建站/规划期; new=<3个月; growth=3-6个月; mature=6个月+; penalized=已降权
debug      : false | true
```

---

## 3. STATE（变量初值）

```
scenario   = unset      # 由 §5 CLASSIFY 判定
site_stage = unset      # 由 §5 CLASSIFY 判定
debug      = false       # 由 §4 入口门禁判定
loaded_refs = []         # 已加载的 reference 文件
```

---

## 4. 入口门禁（ORDER step 0）

1. **判定 debug**：用户指令含 `debug` / `调试` / `显示过程` / `verbose` 任一 → `debug = true`，立即加载 `.meta/debug-output.md` 并按其格式逐步留痕。否则 `debug = false`，正常输出。
2. **必读启动集**：加载 `references/reference-index.md` + `references/trigger-matrix.md`（路由真源）。术语不清时再加载 `references/00-glossary.md`。
3. **不猜测原则**：缺少关键信息（站点阶段、目标市场、是 B 端还是 C 端、当前症状）时，先按 §5 的澄清门禁提问，不臆造前提。

BLOCKERS:
- NEVER 在未判定 scenario / site_stage 前就直接给方案。
- IF debug = true THEN 入口门禁每步独立输出思考链（格式见 `.meta/debug-output.md`）。

---

## 5. CLASSIFY（场景与阶段判定）

### 5.1 scenario 判定（RULES）

- 用户要「从 0 建站 / 规划新站 / 怎么做 SEO」 → `scenario = new_build`
- 用户带着「现有站问题：没流量 / 没询盘 / 掉权降权 / 排名停滞 / 不收录」 → `scenario = diagnose`
- 用户要「提升 / 优化某个维度（内容、外链、技术、转化、AI 工作流）」 → `scenario = optimize`
- 用户问「概念 / 术语 / 方法是什么 / 行不行」 → `scenario = learn`

### 5.2 site_stage 判定（RULES）

- 还没建站 / 在规划 → `none`
- 上线 < 3 个月 → `new`
- 3-6 个月 → `growth`
- 6 个月以上稳定运营 → `mature`
- 出现降权信号（见 `references/08-penalty-recovery.md`）→ `penalized`

### 5.3 澄清门禁（BLOCKERS）

- IF scenario = diagnose AND 未知「具体症状 + 是否已绑 GSC + 站点年龄」 THEN 先提问，不下结论。
- IF scenario = new_build AND 未知「目标市场 + B端/C端 + 主营产品」 THEN 先提问。
- NEVER 在信息不足时给出「加外链」「多发内容」这类万能但错误的建议（见 BLOCKERS）。

---

## 6. ROUTE + EXECUTE（ORDER：单线主流程）

> 这是「一条线」。new_build 沿主线全程走；diagnose / optimize / learn 由 `trigger-matrix.md`
> 定位到主线上的对应站点(stage)，加载该 reference 后给出结论。所有场景共用同一条生命周期主线，不另立平行流程。

### 6.1 主线八站（SEO 全生命周期）

```
S1 可行性与上游诊断      → references/01-feasibility-diagnosis.md
S2 选词与站点架构        → references/02-keyword-architecture.md
S3 技术地基             → references/03-technical-foundation.md
S4 内容生产体系          → references/04-content-production.md
S5 冷启动与外链          → references/05-coldstart-backlinks.md
S6 数据监测与见效预期     → references/06-monitoring-timeline.md
S7 维护与优化           → references/07-maintenance-optimization.md
S8 降权诊断与修复        → references/08-penalty-recovery.md
（横切）AI/Vibe Coding 工作流 → references/09-ai-workflow.md
（横切）官方勘误与证据等级   → references/10-official-corrections.md
```

### 6.2 场景路由（RULES）

- IF scenario = new_build THEN 依序走 S1 → S2 → S3 → S4 → S5 → S6，并在交付中标注 S7/S8 为后续阶段。按 site_stage 决定从哪一站切入（none 从 S1；new 从 S5/S6）。
- IF scenario = diagnose THEN 用 `references/trigger-matrix.md` 把「症状」映射到主线站点：
  - 没流量/不收录 → S1（上游）+ S2（架构/选词）+ S3（技术）
  - 没询盘（有流量）→ S1（上游）+ S4（落地页转化）+ S2（搜索量校验）
  - 掉权/流量暴跌/收录骤减 → S8
  - 排名停滞/卡第二页 → S7（蚕食/抓取预算/时效）+ S8（隐性降权）
- IF scenario = optimize THEN 按优化维度直达对应站：内容→S4；外链→S5；技术/速度/Schema→S3；转化/询盘→S4；选词/架构→S2；AI 提效→S9。
- IF scenario = learn THEN 先 `00-glossary.md`，再加载该概念所属的主线 reference。

### 6.3 执行（每站统一动作）

1. 加载该站 reference（加入 `loaded_refs`）。
2. 按 reference 的「原则 → 做法 → 红线 → 自检」给出**针对用户具体情况**的方案/诊断，不复述通用理论。
3. 给结论时**引用来源**（reference 名 + 其指向的 `docs/` 章节，如 `S8 ← docs/seo06.md §16`），便于用户追溯原文。
4. 跨站依赖时显式串联（如「先 S2 定架构，否则 S4 内容会蚕食」）。

RULES:
- IF debug = true THEN ROUTE 与每站 EXECUTE 的每步独立输出思考链。

---

## 7. BLOCKERS（SEO 一票否决红线）

来源见各条尾注。违反任一条即为错误方案，必须拦截并改写：

- NEVER 关键词堆砌 / 刻意拉高核心词密度。← seo06 §27误区2 / §15 / §38
- NEVER 大量使用精准关键词锚文本做外链。← docs/seo.md 三.2 / §15
- NEVER 短时间批量上外链或用工具自动跑外链。← §15 / §25
- NEVER 新站零展示就大量上外链（应先有基础展示）。← §24
- NEVER 一键批量生成、无人工终审的 AI 内容。← 视频五 / §27误区4 / §39
- NEVER 用翻译插件（如 Gtranslate）泛滥生成上百小语种页。← §26 / §16 / §22
- NEVER FAQ/Schema 结构化数据与前端展示内容不一致。← §20
- NEVER 跨域名设置 canonical（无效）。← §32
- NEVER 同一关键词放任多页内部竞争不处理。← §8 / §23 / §32
- NEVER 把「加广告预算 / 无脑加外链」当作没询盘的解药。← 视频三 / 笔记2
- ALWAYS 内容人工终审 + 补 E-E-A-T + 数据溯源。← 视频五 / §39 / §14
- ALWAYS 以 GSC 官方数据为准，第三方工具（Semrush）仅作参考且滞后。← §23 / §29 / §4
- ALWAYS 一词一页一意图，先做关键词调研再建页。← §6 / §30 / §28
- ALWAYS 控制增长节奏，泛流量占比 ≤ 20-30%，优先转化词。← §15 / §13
- ALWAYS 命中官方勘误条目时按勘误口径输出，不复述 docs 被勘误主张；【经验】级数字不以事实口径引用。← references/10-official-corrections.md
- ALWAYS 建议付费外链/人工外链时，同步披露谷歌官方 link spam 定性与合规替代。← references/10-official-corrections.md C-2

IF debug = true THEN 每条 BLOCKER 命中/N/A 逐条留痕，禁止用「…」省略。

---

## 8. CHECK（交付前自检）

通用：
- [ ] 已判定 scenario + site_stage，未在信息不足时臆断。
- [ ] 方案针对用户具体情况，非通用理论复述。
- [ ] 每条建议有来源（reference + docs 章节）。
- [ ] 全部 BLOCKERS 逐条排查，无违反。
- [ ] 术语首次出现可在 `00-glossary.md` 查到。

场景增量：
- new_build：[ ] S1-S6 覆盖；[ ] 给出阶段顺序与 site_stage 切入点；[ ] 标注 S7/S8 为后续。
- diagnose：[ ] 先归因再开方；[ ] 区分「真问题」vs「第三方工具滞后」；[ ] 给可执行修复步骤 + 验证方式（GSC）。
- optimize：[ ] 定位单一维度；[ ] 给改动前/后判断依据；[ ] 评估降权风险。
- learn：[ ] 概念解释 + 落地指向；[ ] 指明所属主线站点。

IF debug = true THEN CHECK 逐条输出 ✓/✗/N/A，禁止只写「全部通过」。

---

## 9. 维护说明

- 领域真源是 `docs/`。docs 更新后，需同步刷新对应 `references/*.md` 与 `reference-index.md`。
- 治理配置见 `.meta/GOVERNANCE_PROFILE.md`；本 skill 专属红线与联动见 `.meta/CHECKLIST.md`。
- 本 skill 为 `lightweight-routing` archetype：不维护构建/测试门禁与代码分层，相关治理项为 N/A。
