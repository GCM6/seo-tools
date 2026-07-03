# 诊断方法论 v3 — SEO + GEO 专业诊断与报告体系重设计

日期：2026-07-03
状态：待用户评审
范围：SEO 仅针对 Google 与欧美市场（US/UK/CA/AU/DE/FR/ES/IT/NL 等，语言默认英语）；GEO 覆盖 ChatGPT / Perplexity / Gemini（AI Overviews 仍归 SERP 证据，不做探针）。
前置：SP1-SP3 + 全站路由发现已落地；findings/recommendations/prompts 生成层完全未实现（本设计的核心补齐对象）。

> **代替用户拍板的默认决策（用户离开时按调研结论选定，可推翻）**
> 1. **数据源分层：GSC（免费，自站真实数据）+ DataForSEO（BYOK 按量付费，竞品/关键词/SERP/外链）**。未配 DataForSEO key 时优雅降级为仅自站分析，未连 GSC 时降级为第三方估算并降置信度。
> 2. **GSC OAuth 纳入本方案**（原定独立一期），作为 Phase B 落地。
> 3. **报告形态 = 四屏面板增强 + 新增可导出综合报告页**（执行摘要 / 健康分 / 五支柱 / 关键词缺口 / 竞品对比 / 优先级矩阵 / 行动路线图）。

---

## 1. 问题诊断：现状为什么"不够专业"

代码摸底结论（2026-07-03）：

1. **诊断推理层为空**。采集/证据链路完整（页面解析、robots、schema、渲染对比、全站爬取聚类、AI 探针×4、SoV 聚合），但 findings / recommendations / generated_prompts **没有任何生成代码**——表结构、读取 API、展示 UI 齐备，写入侧为零，prompt 生成是 `<stub>`。工具"能采集、能展示，但不会诊断"。
2. **没有具名检查项体系**。site_audit 只有 11 个统计字段 + 5 张指标卡，没有 rule 注册表，无法回答"这个站有哪些问题、各多严重、先修哪个"。
3. **关键词能力为零**。无 keyword 表、无 GSC 拉数（仅占位字段）、无搜索量/难度/排名数据 → 无法回答"有哪些词、缺哪些词"。
4. **竞品仅手填**。无自动识别、无竞品实体、无 gap 对比 → 无法回答"竞品是谁、赢在哪"。
5. **权威度维度缺失**。无外链、无品牌第三方语料存在度 → SEO 四大支柱缺一，GEO 最强相关因子（品牌提及，Spearman 0.664）无测量。
6. **报告无交付物形态**。没有执行摘要、健康分、优先级矩阵、行动路线图——用户拿不到"一份能看、能给人、能执行"的报告。

## 2. 调研依据（摘要）

完整调研含来源 URL，见 §11 参考文献。此处只列直接决定设计的结论：

**SEO（Google / 欧美，2025-2026）**
- 专业审计的支柱划分共识：**Technical / On-Page / Content / Authority（Off-Page）+ AI-Readiness**；技术层永远第一。
- 严重度三级（Error / Warning / Notice，Ahrefs/Semrush 通用）+ **Impact × Effort 四象限**排优先级；按受影响流量排序。
- **关键词缺口的硬约束**：GSC 看不到竞品、无搜索量、无难度、匿名化漏约 50% 长尾——真正的 gap 分析必须有第三方数据。DataForSEO（SERP $0.6/千次、Labs 关键词 $0.0001/条、纯按量无月费）是 BYOK 定位下唯一价格可行的全能源；Ahrefs/Semrush API 门槛 $500-950/月，排除。
- **竞品识别的客观算法**：对目标词集抓 SERP → 统计各域出现频次与关键词重叠度（Search Overlap）→ 重叠高者即 organic competitors。只依赖 SERP 数据，可自建。
- 2024-2026 变化：Helpful Content 并入核心系统（内容质量成生死项）；INP 取代 FID；**FAQ/HowTo 富摘要已弃用**（2026-06 起 FAQ 报告也移除），审计清单须剔除；AIO 压 CTR 有多研究支撑（Pew：有 AI 摘要时点击率 8% vs 无时 15%；Ahrefs：P1 CTR -58%；Amsive：总体 -15.5%），但个体归因必须留在 hypothesis/inferred 级。

**GEO（2025-2026）**
- **证据最硬的优化项只有三类**：① 内容加统计数据/权威引述/来源引用（KDD 2024 对照实验，+28%~+41%）；② 保证无 JS 可提取（GPTBot/ClaudeBot/PerplexityBot 不执行 JS，机制性实证）；③ 第三方权威语料存在（Reddit/Wikipedia/YouTube/评测站主导引用，6.8 亿引用分析；品牌网络提及与 AI 可见性相关 0.664，强于外链 0.218）。
- **Schema 属弱证据**（行业推荐但无对照实验，Google 明确称非 AIO 必要条件）；**llms.txt 已被证伪**（97% 从未被读取；Google 官方类比 keywords meta 标签）→ 二者不得作为高权重诊断项。
- **必须区分训练爬虫与搜索爬虫**：屏蔽 GPTBot/ClaudeBot/Google-Extended（训练）合理；屏蔽 OAI-SearchBot / Claude-SearchBot / PerplexityBot 等检索爬虫 = 放弃 AI 引用资格。约 27% 的站在 CDN 层不知情误封（单一来源数字，方向性）。
- **引擎间引用重叠仅 11%~13.7%** → 必须分引擎测量与报告，不可互推。
- **AI 引用与 Google 排名解耦中**（AIO 引用来自 Top-10 的占比 76%→38%）→ 不能用排名代理 AI 可见性。
- **采样方差巨大**（同问题 100 次品牌清单一致概率 <1%；temp=0 仍 5-12% 翻转）→ 单次无意义，聚合出现率可测；20 prompt × n=5 只能是 L3 方向性样本，前后对比须报均值+波动区间。
- ChatGPT 检索主要依赖 **Bing 索引** → Bing 收录是 GEO 硬检查项。

## 3. 总体设计：五支柱诊断模型

一次完整诊断 run 产出五个支柱的证据 → 具名规则引擎生成 findings → 推荐生成器产出 recommendations → 人工闸门 → 执行 prompt + 综合报告。**保持既有铁律：证据先于结论、claim 分级、agent 不造数字、人在环内、同协议回测。**

```
支柱 P1 技术健康   Technical      （既有采集为主 + CWV + 重定向/状态码细化）
支柱 P2 内容与页面 On-Page/Content（轻检字段扩展 + GEO 内容特征）
支柱 P3 关键词     Keywords       （GSC 现状 + DataForSEO 缺口/搜索量/难度）★新
支柱 P4 竞品       Competitors    （SERP 重叠自动识别 + gap + AI SoV 合并视图）★新
支柱 P5 权威与 AI 就绪 Authority & GEO（外链概况 + 第三方语料 + 爬虫可达/可提取/收录 + 分引擎探针）
```

### 3.1 数据源矩阵（BYOK 分层，逐级降级）

| 数据源 | 成本 | 提供 | 缺失时降级行为 |
|---|---|---|---|
| 页面抓取/爬虫（已有） | 免费 | P1/P2 全部硬证据 | 不可缺（核心） |
| Cloudflare 渲染（已有） | 按次 | 可提取性对比 | 已有降级（标注未配置） |
| AI 探针 ×3（已有） | 按 token | P5 分引擎可见性 | 已有降级 |
| **GSC OAuth（新）** | 免费 | P3 自站真实查询/展示/点击/排名（L4） | 关键词现状仅剩 DataForSEO 估算（L3，降置信）或空态指引 |
| **DataForSEO（新）** | 按量（单次全站诊断约 $1-3，见 §8.4） | P3 搜索量/难度/gap、P4 竞品识别、P5 外链概况、Bing SERP | 竞品=手填、无 gap、无搜索量；报告明示"缺口分析未启用" |
| **PageSpeed Insights API（新）** | 免费（可选 key 提配额） | P1 CWV 字段数据（CrUX） | CWV 卡空态 |
| Wikipedia/Reddit 公开 API（新） | 免费 | P5 第三方语料存在度 | 该项标"未检测" |

### 3.2 市场约束

- 项目 `market` 限定为欧美市场枚举（us/gb/ca/au/de/fr/es/it/nl…），驱动 DataForSEO 的 location/language 参数与探针 prompt 语言（默认英语；德法等市场用当地语言 + 英语双轨）。
- 不做 Bing SEO、不做百度；Bing 仅作为"ChatGPT 可发现性"的收录检查。

## 4. 各支柱检查项（具名规则注册表 v1）

规则是**确定性代码**（非 LLM），每条规则声明：`id / pillar / severity(error|warning|notice) / claimType 上限 / 依赖证据类型 / 触发条件 / 建议模板（what/why/expected_impact/effort/validation_method）`。规则版本随 `RULES_VERSION` 固化，保证同协议回测可比。LLM（受约束 agent）只在两处介入：① 对触发规则的 finding 做**措辞润色与合并**（schema 校验，不得引入数字）；② 起草内容类建议的 brief（引用 verified brand_facts）。

### P1 技术健康（证据：site_audit / page_fetch / robots / sitemap / psi）

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| T01 | 入口/重点页被 robots 屏蔽（Googlebot） | error | measured_hard |
| T02 | 4xx/5xx 页面占比超阈值（>5% warning，>15% error） | e/w | measured_hard |
| T03 | noindex 误用（模板级批量 noindex、重点页 noindex） | error | measured_hard |
| T04 | canonical 指向站外 / 缺失 / 自指不一致 | warning | measured_hard |
| T05 | 孤岛页（sitemap 声明但内链入度 0） | warning | measured_hard |
| T06 | 重定向链/循环（轻检补跟踪 redirect chain，新字段） | warning | measured_hard |
| T07 | sitemap 缺失 / 与实际页面集偏差大 | warning | measured_hard |
| T08 | HTTPS/混合内容（轻检补协议字段） | error | measured_hard |
| T09 | CWV 字段数据不达标（LCP>2.5s / INP>200ms / CLS>0.1，P75，CrUX） | warning | measured_hard |
| T10 | 渲染依赖：初始 HTML 正文占渲染后 <30%（模板级） | error | measured_hard |

### P2 内容与页面（证据：light_check 扩展字段 / page_fetch / schema）

轻检 `fetchLightCheck` 扩展抽取：`metaDescription / h1 / h1Count / titleLength / wordCount / hasAuthorByline / datePublished / outboundCitations（外链引用数）/ statsDensity（数字/数据点密度，启发式）`。

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| C01 | title 缺失/过长(>60字符)/模板级重复 | e/w | measured_hard |
| C02 | meta description 缺失/重复 | warning | measured_hard |
| C03 | H1 缺失/多个/与 title 完全重复 | warning | measured_hard |
| C04 | 薄内容（模板中位正文 < 阈值且该模板承载商业意图词） | warning | inferred |
| C05 | schema 缺失或仍以弃用类型为主（FAQ/HowTo 标"无富摘要收益"，Product/Article/Organization/Breadcrumb 标推荐） | notice | measured_hard |
| C06 | E-E-A-T 代理信号缺失（作者署名、日期、关于/联系页）——**明确标注为代理指标，非排名因子** | notice | inferred |
| C07 | GEO 内容特征：重点页缺统计数据/引述/来源引用（KDD 2024 三强项的启发式检测） | warning | inferred |
| C08 | 答案前置缺失：重点页前 30% 正文不含可独立成答的段落（启发式） | notice | hypothesis |

### P3 关键词（证据：gsc / dataforseo_labs — 新证据类型）

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| K01 | 机会词：GSC 排名 4-20 且展示量高的词（SEO Opportunity Score 排序，公式沿用 §5.3 plan-ux） | — (机会) | measured_hard |
| K02 | 低 CTR 异常：排名 ≤5 但 CTR 低于位置基准 50%+ → "疑似受 SERP 特性影响"（**只能 hypothesis**，配 SERP 证据后升 inferred） | warning | hypothesis→inferred |
| K03 | 缺口词（missing）：≥2 个已识别竞品排 Top10 而本站无排名，按 搜索量×意图×难度可及性 排序 | — (机会) | measured_sample |
| K04 | 弱势词（weak）：本站 11-30 名、竞品 Top10 | — (机会) | measured_sample |
| K05 | 品牌词覆盖：品牌 SERP 首页是否被第三方占位 | warning | measured_sample |
| K06 | 内容蚕食：多页排同一词且互相压制（GSC page×query 交叉） | warning | inferred |

关键词意图分类（informational/commercial/transactional/navigational）用 DataForSEO Labs 的 intent 字段，缺失时用确定性词面规则，不用 LLM 猜。

### P4 竞品（证据：dataforseo_serp / ai_probe）

**识别算法（自建，客观）**：
1. 取种子词集 = GSC Top 展示词（≤100）∪ 20 条探针 prompt 对应的检索式（去品牌词）；
2. DataForSEO 批量抓这批词的 Google Top-10 SERP（目标市场 location）；
3. 对每个出现域名统计：出现词数、加权位置分（1/rank 加和）、**Search Overlap = 共同出现词数 / 种子词数**；
4. 过滤基础设施域（wikipedia/youtube/reddit/amazon 等平台域单列为"平台竞争者"，不算商业竞品）；
5. Top-N（默认 10）候选写入 `competitors` 表（source=serp_overlap，含证据引用），**人工确认/驳回后**才参与 gap 与 SoV——沿用人在环原则。

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| Q01 | 竞品 SERP 份额对比（Share of SERP，本站 vs 确认竞品） | — (对比) | measured_sample |
| Q02 | 竞品 AI SoV 对比（既有探针 SoV，按引擎分列） | — (对比) | measured_sample |
| Q03 | 竞品在缺口词上的内容形态归纳（页面类型/字数/schema，抓竞品代表页轻检） | notice | inferred |

### P5 权威与 AI 就绪（证据：dataforseo_backlinks / robots / ua_probe / bing_serp / third_party — 新）

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| A01 | 外链概况：引荐域数 / 域权重与已确认竞品中位数对比（DataForSEO Backlinks summary，只做概况不做逐链审计） | warning | measured_sample |
| G01 | **搜索型 AI 爬虫被 robots 屏蔽**（OAI-SearchBot / Claude-SearchBot / PerplexityBot / Google-Extended 分列；训练爬虫屏蔽只给 notice 说明，检索爬虫屏蔽给 error） | error | measured_hard |
| G02 | **CDN/WAF 层误封检测**：用各 AI 爬虫 UA 实际请求入口页与代表页，对比状态码（403/429/challenge vs 200） | error | measured_hard |
| G03 | 渲染依赖内容对 AI 不可见（同 T10 证据，GEO 措辞："对不执行 JS 的 AI 抓取链路不可见"） | error | measured_hard |
| G04 | Bing 收录缺失（DataForSEO Bing SERP `site:` 查询；影响 ChatGPT 可发现性） | warning | measured_sample |
| G05 | 分引擎可见性低于确认竞品（既有探针聚合，**分引擎报告，不合并**；n=5 标方向性） | warning | measured_sample |
| G06 | 目标域名零引用而竞品被引用（分引擎） | warning | measured_sample |
| G07 | 第三方语料缺失：无 Wikipedia 条目 / Reddit 近 12 月无自然讨论 / 评测站（G2/Capterra，按行业）无收录 | warning | measured_sample |
| G08 | llms.txt 存在性：**只记录，不建议**（报告注明"当前无证据支持其有效性"） | notice | measured_hard |

### 4.1 探针 prompt 集 v2（template_v2）

- 从固定 20 条升级为**分层 30 条**（可配 20-50）：品牌 5 / 品类推荐 8 / 对比 6 / 长尾问答 8 / 信任评估 3；意图沿用现有 intent 枚举。
- 默认英语（欧美市场），双语市场生成双轨；模板仍确定性填充（品牌/行业/竞品/市场），版本号 `template_v2`，与 v1 结果不直接对比（协议不同，delta 页明示）。
- n 默认 5 不变；聚合报告必须展示 `均值 + 样本数 + 波动`（每 prompt 的 presence 二项比例 + Wilson 区间下限，样本小则区间宽，UI 如实显示）。

## 5. 诊断推理层架构

```
run 状态机补全：collected → diagnosing → reviewing
Inngest 新增 generateFindings 函数（collectEvidence 完成后触发）：
  1. loadEvidence(runId) → 按支柱分组
  2. rulesEngine.evaluate(evidence, RULES_VERSION)
       每条触发规则 → finding（title/severity/claimType/confidence/evidenceRefs 非空，直接满足 §6.2 约束）
  3. llmRefine(findings)   [可选，受约束 agent]
       合并同类、润色措辞、起草建议 brief；zod schema 校验输出；
       禁止新增数字/新增 finding；失败则原样使用规则产物（规则产物本身已可用）
  4. recommendationGenerator：
       每条 finding → 建议模板实例化（what/why/expected_impact/effort/risk/validation_method）
       Impact×Effort 打分：impact = severity × 受影响页面流量占比（GSC）× 支柱权重
                          effort = 规则声明的固定档位（low/mid/high）
       → priority 四象限（quick_win / strategic / fill_in / low）
  5. 状态 → reviewing，进入既有人工闸门
prompt assembler（补齐 <stub>）：
  accepted/edited 建议 → 按 promptType 模板拼装（注入 verified brand_facts + evidence 摘要 + "不得编造"声明）→ 落 generated_prompts
```

关键点：**规则引擎是主体，LLM 是可摘除的增强**。断网/无 key 时诊断仍能出全量规则型 findings，符合"证据先于结论"。

## 6. 数据模型扩展

```
keywords(
  id, project_id, text, market, language,
  source[gsc|dataforseo|manual], intent,
  search_volume, difficulty, cpc,        -- 第三方估算，标 L3
  created_at
)                                        -- project 级持久，跨 run 复用

keyword_metrics(                          -- run 级快照
  id, run_id, keyword_id, source[gsc|dataforseo],
  impressions, clicks, ctr, position,     -- GSC 为 L4
  serp_features_jsonb,                    -- AIO/featured snippet 出现（DataForSEO）
  evidence_id
)

competitors(
  id, project_id, domain, name,
  source[manual|serp_overlap],
  overlap_score, shared_keywords_count,
  status[candidate|confirmed|dismissed],  -- 人工闸门
  evidence_id, created_at
)

keyword_gaps(                             -- run 级
  id, run_id, keyword_id,
  gap_type[missing|weak|winning],
  our_position, competitor_positions_jsonb,
  opportunity_score, evidence_id
)

evidence type 枚举扩展：
  + gsc（启用）、dataforseo_serp、dataforseo_labs、dataforseo_backlinks、
    psi、ua_probe、third_party_presence

project_settings 扩展：
  + dataforseoConfigured（派生自 env/key 表）、seedKeywordLimit(默认100)、
    competitorSerpTopN(默认10)、promptTemplateVersion
```

既有不变量全部保留；新增约束：`keyword_gaps` 必须引用 dataforseo 证据；`competitors.status=confirmed` 才进入 gap 计算与报告对比；`search_volume/difficulty` 在 UI 恒标"第三方估算"。

## 7. 报告体系重设计

### 7.1 健康分（透明、标 inferred）

```
pillar_score = 100 × (1 − Σ(issue_weight × affected_ratio) / max_penalty)
  issue_weight: error=3, warning=1, notice=0.25
  affected_ratio: 受影响页数/已检页数（站级问题计 1）
overall = 加权平均（P1 30% / P2 20% / P3 20% / P4 10% / P5 20%）
```

公式在报告页可展开查看（"分数怎么算的"），标签恒为 `推断`——健康分是沟通用汇总，非实测。数据源缺失的支柱显示"未评分"而非 0 分。

### 7.2 综合报告页（`runs/[id]/report`，可导出 Markdown / 打印 PDF）

1. **执行摘要**（≤1 屏）：总分 + 五支柱分、3 个最高影响发现（按 impact 排）、一段白话结论（LLM 起草、人工可编辑、恒标"由规则结果归纳"）。
2. **方法与范围**：采集时间、页面数/截断、数据源清单及各自 claim 等级、探针协议（模型/n/prompt 版本）、**未启用的数据源明示**。
3. **五支柱明细**：各支柱 findings 按严重度分组，每条带证据抽屉（沿用既有 evidence drawer）。
4. **关键词现状与缺口表**：现状（Top 词、机会词 K01/K02）+ 缺口（K03/K04 按 opportunity_score 排序，含搜索量/难度/竞品位次）。
5. **竞品对比**：确认竞品 ×（Share of SERP / AI SoV 分引擎 / 引荐域数）矩阵。
6. **优先级矩阵**：Impact×Effort 四象限散点 + Quick Wins 清单（预期 1 周内可上线项）。
7. **行动路线图**：Quick wins（0-2 周）/ 中期（2-6 周）/ 长期（6 周+），每项挂 validation_method 与回测指标。
8. **回测计划**：4-6 周同协议重跑范围声明（prompt 版本、关键词集、竞品集锁定）。

### 7.3 面板增强

- 屏 2 StatStrip 扩展：+ 关键词机会数、缺口词数、竞品数、健康分（各带 claim 标签与空态指引）。
- 新增 `runs/[id]/keywords`（现状/缺口/机会三 tab）与 `runs/[id]/competitors`（候选确认闸门 + 对比矩阵）。
- FindingList 按支柱分组 + 严重度筛选，不再恒空。

## 8. 分期落地

| Phase | 内容 | 交付判据 |
|---|---|---|
| **A 诊断引擎骨架** | 规则注册表 + generateFindings Inngest 链 + 基于**既有证据**的规则（T01-T05/T07/T10、C01-C05、G01/G03；T06/T08 需轻检补 redirect/协议字段，随本期一并补）+ 推荐生成 + prompt assembler 补 `<stub>` + FindingList/RecCard 通真数据 | 现有采集跑完即出 findings/建议/prompt，四屏不再空 |
| **B GSC 接入** | OAuth readonly + Search Analytics 拉数（query/page 双维）+ keywords/keyword_metrics 落库 + K01/K02/K06 规则 + avgRank 卡通真；附带 PSI 免费采集器 + T09 | 连接 GSC 后关键词现状 tab 有真数据（L4） |
| **C DataForSEO 接入** | provider 适配（SERP/Labs/Backlinks/Bing）+ 竞品识别链 + 人工确认闸门 + K03-K05、Q01-Q03、A01、G04 规则 + keyword_gaps | 配 key 后自动出候选竞品与缺口词表 |
| **D GEO 深化** | G02 UA 探测采集器 + G07 第三方语料采集 + G08 llms.txt 探测 + prompt 集 v2 + 分引擎报告 + C07/C08 内容特征 | GEO findings 覆盖可达/可提取/收录/语料/可见性五层 |
| **E 综合报告** | 健康分 + report 页八板块 + Markdown 导出 + 优先级矩阵 UI + retest delta 扩展（关键词/竞品维度） | 一键导出完整专业报告 |

依赖：A 独立可先行；B/C 并行可选；D 依赖 C（Bing/语料走 DataForSEO/公开 API）；E 依赖 A-D 的数据但可随做随显。

### 8.4 单次全站诊断成本估算（配齐 key 后）

- DataForSEO：种子词 100 SERP（$0.06-0.2）+ Labs ranked/gap/volume（约 $0.5-1）+ Backlinks summary × (1+竞品数)（约 $0.1-0.3）+ Bing site: 若干 ≈ **$1-2**
- 探针：30 prompt × 3 provider × n5 = 450 次调用（比现有 300 次 +50%）
- PSI/Wikipedia/Reddit/GSC：免费
- 报告页开始诊断前照旧显示预估成本（沿用 §9.1 plan-ux 原则）。

## 9. 与产品铁律的对齐清单

- 每条规则声明 claimType 上限；第三方估算数据（搜索量/难度/overlap）恒 ≤ measured_sample，UI 标"估算"。
- K02 低 CTR 恒为 hypothesis 起步，SERP features 证据（DataForSEO 返回 AIO 出现）到位才升 inferred——不做确定性 AIO 归因（维持 §8 边界）。
- 竞品候选、建议、报告摘要三处人工闸门；自动识别的竞品不确认不进报告。
- DataForSEO/GSC 原始响应全量落 evidence_artifacts（含 hash/parser_version），可复核。
- 回测锁定：RULES_VERSION + prompt template 版本 + 关键词集 + 确认竞品集 + 市场/语言 + n，写入 run.protocol_version。
- llms.txt/Schema 按证据强度降权，报告中注明证据等级来源。

## 10. 明确不做（本方案边界）

- 不做逐条外链审计/有毒链接（V2；A01 只做概况对比）。
- 不做 AIO 确定性归因、不做 SERP 时序截图（V1 原计划保留）。
- 不做内容自动生成/自动发布（铁律）。
- 不做 Semrush/Ahrefs 式全网关键词库——只围绕"种子词集 + 竞品域"按需拉取。
- 不做多租户/计费/Redis（V0 边界不变）。
- 探针不加 AI Overviews 引擎（是 SERP 特性非 API）。

## 11. 参考文献（调研来源，节选）

- Google：AI features 指南、Search Analytics API、structured data updates（FAQ/HowTo 弃用）、INP（web.dev）、Quality Rater Guidelines 2025-09
- Ahrefs：SEO audit / technical audit 方法论、Health Score 定义、AIO CTR 研究（P1 -58%）、75K 品牌 AI 相关性研究（提及 0.664 vs 外链 0.218）、llms.txt 137K 域名研究、AIO 引用 Top-10 占比 76%→38%
- Semrush：Keyword Gap、Site Audit 检查项与 Total Score、AI Toolkit 指标
- Pew Research 2025-07：AI 摘要下点击 8% vs 15%；Amsive：70 万词 AIO CTR -15.49%
- Aggarwal et al., KDD 2024（arXiv 2311.09735）：GEO-bench，统计+41%/引言+28%/堆词无效
- SparkToro 2025：AI 推荐一致性（<1/100）；arXiv 2604.07585 Don't Measure Once
- Profound 6.8 亿引用分析；Peec AI 3,000 万来源分析（Reddit/Wikipedia/YouTube 主导）；Seer Interactive 547 万查询（被 AIO 引用 CTR +35%）
- Vercel / Passionfruit：AI 爬虫不执行 JS 的日志实证；Anagram/GenRank：训练 vs 搜索爬虫区分
- DataForSEO 定价页（SERP $0.6/千、Labs $0.0001/条）；SerpApi/Serper/ValueSERP 对比；Ahrefs API ≈$949/月、Semrush API $499.95/月起（排除依据）
