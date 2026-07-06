# 诊断方法论 v3 — SEO + GEO 专业诊断与报告体系重设计

日期：2026-07-03
状态：三项关键决策已由用户确认（2026-07-03），可进入 writing-plans；同日完成对平台代码现状的闭环/UI 实施审查，增补 §5.1（六个闭环断点修补）与 §7.4（UI 信息架构与交互闭环），已回填 §6/§8
范围：SEO 仅针对 Google 与欧美市场（US/UK/CA/AU/DE/FR/ES/IT/NL 等，语言默认英语）；GEO 覆盖 ChatGPT / Perplexity / Gemini（AI Overviews 仍归 SERP 证据，不做探针）。
前置：SP1-SP3 + 全站路由发现已落地；findings/recommendations/prompts 生成层完全未实现（本设计的核心补齐对象）。

> **已确认决策（2026-07-03 用户拍板）**
> 1. ✅ **数据源分层：GSC（免费，自站真实数据）+ DataForSEO（BYOK 按量付费，竞品/关键词/SERP/外链）**。未配 DataForSEO key 时优雅降级为仅自站分析，未连 GSC 时降级为第三方估算并降置信度。
> 2. ✅ **GSC OAuth 纳入本方案**（原定独立一期），作为 Phase B 落地。
> 3. ✅ **报告形态 = 四屏面板增强 + 新增可导出综合报告页**（执行摘要含约束定位卡 / 健康分 / 五支柱 / 关键词缺口 / 竞品对比 / 优先级矩阵 / 行动路线图）。

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

完整调研含来源 URL，见 §12 参考文献。此处只列直接决定设计的结论：

**SEO（Google / 欧美，2025-2026）**
- 专业审计的支柱划分共识：**Technical / On-Page / Content / Authority（Off-Page）+ AI-Readiness**；技术层永远第一。
- 严重度三级（Error / Warning / Notice，Ahrefs/Semrush 通用）+ **Impact × Effort 四象限**排优先级；按受影响流量排序。
- **关键词缺口的硬约束**：GSC 看不到竞品、无搜索量、无难度、匿名化漏约 50% 长尾——真正的 gap 分析必须有第三方数据。DataForSEO（SERP $0.6/千次、Labs 关键词 $0.0001/条、纯按量无月费）是 BYOK 定位下唯一价格可行的全能源；Ahrefs/Semrush API 门槛 $500-950/月，排除。
- **竞品识别的客观算法**：对目标词集抓 SERP → 统计各域出现频次与关键词重叠度（Search Overlap）→ 重叠高者即 organic competitors。只依赖 SERP 数据，可自建。
- 2024-2026 变化：Helpful Content 并入核心系统（内容质量成生死项）；INP 取代 FID；**FAQ/HowTo 富摘要已弃用**（官方 changelog：HowTo 2023-09 移除；FAQ 2023-08 起仅限权威政府/健康站、**2026-05-07 起对所有站点停止展示**、2026-06 官方文档移除），审计清单须剔除；AIO 压 CTR 有多研究支撑（Pew：有 AI 摘要时点击率 8% vs 无时 15%；Ahrefs：P1 CTR -58%；Amsive：总体 -15.5%），但个体归因必须留在 hypothesis/inferred 级。

**GEO（2025-2026）**
- **证据最硬的优化项只有三类**：① 内容加统计数据/权威引述/来源引用（KDD 2024 对照实验，+28%~+41%）；② 保证无 JS 可提取（GPTBot/ClaudeBot/PerplexityBot 不执行 JS，机制性实证）；③ 第三方权威语料存在（Reddit/Wikipedia/YouTube/评测站主导引用，6.8 亿引用分析；品牌网络提及与 AI 可见性相关 0.664，强于外链 0.218）。
- **Schema 对 GEO：机制有官方确认、效果量化无对照实验**——Bing 官方（Fabrice Canel，SMX Munich 2025-03）确认 schema 喂给其 LLM/Copilot 用于内容理解与实体消歧（ChatGPT 检索依赖 Bing 索引，链路成立）；但 Google 明确称非 AIO 必要条件，"提升引用率 X 倍"类数字均为营销话术无对照实验。定级：机制 measured 层、效果 hypothesis 层；**llms.txt 已被证伪**（97% 从未被读取；Google 官方类比 keywords meta 标签）→ 二者不得作为高权重诊断项。
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
| **DataForSEO（新，仅 v3 API）** | 按量（单次全站诊断约 $1-3，见 §8.4） | P3 搜索量/难度/gap、P4 竞品识别、P5 外链概况、Bing SERP | 竞品=手填、无 gap、无搜索量；报告明示"缺口分析未启用" |

DataForSEO 版本与计费口径（2026-07-03 核实）：v2 API 已于 2026-05-05 官方下线，实现只允许 v3 端点；SERP 自 2025-09-19 起按页计费（base 价含首页，追加页 0.75×），本方案只取 Top-10（单页）不受影响。网传"2026-07-01 全面调价 +20%/取消 Backlinks $100 月度门槛"**查无官方依据**（官方 update 页无此记录，Backlinks 定价页照旧），成本估算不因此调整。
| **PageSpeed Insights API（新）** | 免费（可选 key 提配额） | P1 性能：CrUX 字段数据（CWV，L4）+ 同次调用带回的 Lighthouse 实验室诊断（修复线索，inferred） | CWV 卡空态；小流量站无 CrUX 数据时降级为仅实验室诊断（见 T09） |
| Wikipedia/Reddit 公开 API（新） | 免费 | P5 第三方语料存在度 | 该项标"未检测" |

### 3.2 市场约束

- 项目 `market` 限定为欧美市场枚举（us/gb/ca/au/de/fr/es/it/nl…），驱动 DataForSEO 的 location/language 参数与探针 prompt 语言（默认英语；德法等市场用当地语言 + 英语双轨）。
- 不做 Bing SEO、不做百度；Bing 仅作为"ChatGPT 可发现性"的收录检查。

## 4. 各支柱检查项（具名规则注册表 v1）

规则是**确定性代码**（非 LLM），每条规则声明：`id / pillar / severity(error|warning|notice) / claimType 上限 / 依赖证据类型 / 触发条件 / 建议模板（what/why/expected_impact/effort/validation_method/execution_steps 分步执行清单——每步含动作、涉及角色档位[开发/内容/运营]与预计工时档位；技术类另含 fixSnippet 修复片段——如 robots.txt 行、canonical 标签、hreflang 修正示例，模板静态占位填充，非 LLM 生成）`。规则版本随 `RULES_VERSION` 固化，保证同协议回测可比。LLM（受约束 agent）只在两处介入：① 对触发规则的 finding 做**措辞润色与合并**（schema 校验，不得引入数字）；② 起草内容类建议的 brief（引用 verified brand_facts）。

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
| T09a | CWV 字段数据不达标（LCP>2.5s / INP>200ms / CLS>0.1，P75，CrUX；**移动/桌面分列**，origin 级 + 重点页/代表页页面级） | warning | measured_hard |
| T09b | 性能修复线索：代表页 Lighthouse 审计 top 机会（渲染阻塞资源/图片体积/JS 主线程），作为 T09a 建议的修复清单；Lighthouse 0-100 分可展示但**恒标"实验室模拟分，非 Google 排名输入"** | notice | inferred |
| T09c | 服务器响应过慢影响抓取效率（TTFB/响应时间超阈值 + 轻检实测响应耗时；Google 官方：响应速度影响 crawl budget，进而影响收录覆盖与时效，对大站尤甚） | warning | measured_hard |
| T10 | 渲染依赖：初始 HTML 正文占渲染后 <30%（模板级） | error | measured_hard |
| T11 | 重点页/聚合页内链支撑不足（inboundLinkCount 低于阈值，核心转化页应有多篇相关内容内链支撑） | warning | measured_hard |
| T12 | 重点页点击深度 >3 层（爬虫 depth 数据；层级过深权重传递与抓取效率差） | warning | measured_hard |
| T13 | 移动端适配缺失（viewport meta 缺失 + PSI 移动端数据异常；移动优先索引下为必查项） | error | measured_hard |
| T14 | hreflang 检查组：声明缺失/互指不一致/缺 x-default/**canonical 与 hreflang 冲突**（本地化页 canonical 指向他语言版）/**语言-地区代码无效**（如 `en-uk` 应为 `en-gb`，按 ISO 639-1 + ISO 3166-1 白名单校验）/**hreflang 仅存在于渲染后 DOM**（初始 HTML 无、渲染后有，复用既有渲染对比证据）——均为确定性规则；多市场/多语言站必查，单语言站跳过（Ahrefs 2023 研究 374,756 域名：67% 用 hreflang 的域名至少一处错误） | warning | measured_hard |
| T15 | 低价值语言页泛滥（URL 模板聚类发现大量语言路径模板 × GSC 零展示交叉验证；翻译插件批量生成页耗抓取预算、稀释权重） | warning | inferred |
| T16 | 抓取预算浪费（GSC 近 90 天零展示零点击页占比超阈值 + tag/参数/分类页泛滥 + 过长重定向链聚合） | warning | inferred |

性能检查组（T09a-c）的定位说明：Google 排名使用的是 **CrUX 字段数据的 CWV**（轻量级信号，内容相关性主导）；**Lighthouse 分数不是排名因子**，仅作诊断；性能对"收录"的帮助路径是**服务器响应速度 → 抓取预算/抓取速率**（Google crawl budget 官方文档）。降级链：有 CrUX → T09a 定级（L4）；无 CrUX（小流量站常态）→ 仅出 T09b/T09c，finding 上限 inferred，UI 明示"真实用户数据不足，性能对排名的影响无法实测"。

### P2 内容与页面（证据：light_check 扩展字段 / page_fetch / schema）

轻检 `fetchLightCheck` 扩展抽取：`metaDescription / h1 / h1Count / titleLength / wordCount / hasAuthorByline / datePublished / outboundCitations（外链引用数）/ statsDensity（数字/数据点密度，启发式）/ imgCount / imgAltMissingCount / hasViewportMeta / hreflangEntries / responseTimeMs / listCount / tableCount / avgParagraphLen / h2AsQuestionRate（后四项为结构可扫描性组，供 C11）`。page_fetch 证据需保留完整 JSON-LD 原文（现有 schema-extractor 只抽类型清单，需扩展为同时保留原始 JSON-LD 块），供 C05 校验组使用。

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| C01 | title 缺失/过长(>60字符)/模板级重复 | e/w | measured_hard |
| C02 | meta description 缺失/重复 | warning | measured_hard |
| C03 | H1 缺失/多个/与 title 完全重复 | warning | measured_hard |
| C04 | 薄内容（模板中位正文 < 阈值且该模板承载商业意图词） | warning | inferred |
| C05a | JSON-LD 存在性与类型选择：schema 缺失或仍以弃用类型为主（FAQ/HowTo 标"无富摘要收益"，Product/Article/Organization/Breadcrumb 标推荐） | notice | measured_hard |
| C05b | **JSON-LD 语法与 Schema.org 词汇校验**：JSON 解析失败、`@context` 错误、类型/属性不存在于 Schema.org 词汇表（用 schema.org 官方发布的词汇快照做本地离线校验，快照版本随 RULES_VERSION 固化） | error | measured_hard |
| C05c | Google 富摘要必填/推荐字段缺失：按 Google 结构化数据文档的类型规则表校验（如 Product 缺 offers/aggregateRating、Article 缺 datePublished），只校验 2026 年仍产出富摘要的类型 | warning | measured_hard |
| C05d | **结构化数据与前端内容一致性**：JSON-LD 中的文本值（问答/名称/价格）在渲染后正文中不存在 → 违反 Google 规范，有处罚风险 | error | measured_hard |
| C06 | E-E-A-T 代理信号缺失（作者署名、日期、关于/联系页）——**明确标注为代理指标，非排名因子** | notice | inferred |
| C07 | GEO 内容特征：重点页缺统计数据/引述/来源引用（KDD 2024 三强项的启发式检测）；扩展子项：缺原创数据点/第一手实证（"information gain/原创性受核心更新奖励"系行业对 2026 年 3/5 月核心更新的解读，官方仅公布更新日期未公布主题——子项恒标 hypothesis） | warning | inferred |
| C08 | 答案前置缺失：重点页前 30% 正文不含可独立成答的段落（启发式） | notice | hypothesis |
| C09 | 图片 alt 缺失率过高（轻检统计 imgCount / imgAltMissingCount，模板级聚合） | warning | measured_hard |
| C10 | 内容精确重复/高度同质化（contentHash 完全重复为 L4；同模板正文相似度过高为 inferred；批量近似页有内容工厂判定风险） | warning | measured_hard/inferred |
| C11 | 内容结构可扫描性不足：重点页/商业页无列表且无表格、平均段落过长（>150 词，阈值启发式）——AI 引用链路的"检索→重排→取段"机制偏好可快速提取的结构化段落（机制性推断，无对照实验；"40-60 词段落更易被引用"类具体数字为行业经验，不作硬依据） | notice | inferred |
| TA01 | 主题覆盖浅/话题群割裂：URL 模板聚类识别话题群（既有能力）→ 每群页面数、群内内链密度、GSC 聚合展示量三指标交叉 → 标出"有话题无深度"与"话题群间零内链" | notice | inferred |
| TA02 | 话题群缺 Hub 页（Pillar-Cluster 结构缺失）：群内不存在高入度中心页（inboundLinkCount 高且被同群多个子页指向）。**"主题权威"系行业经验框架，非官方排名因子**（官方从不公布核心更新主题），恒作结构性建议不作排名断言 | notice | inferred |

JSON-LD 校验组（C05a-d）实现说明：**不依赖外部验证服务**（Google Rich Results Test 无公开 API），采用三层本地校验——① JSON/`@context` 语法层；② Schema.org 词汇层（官方 releases 的 JSON-LD 词汇文件入库为快照）；③ Google 富摘要字段规则表（从官方结构化数据文档蒸馏，随 RULES_VERSION 版本化）。C05d 一致性校验依赖既有渲染证据（rendered main text），字符串归一化后子串匹配，命中不了的值列入 finding 证据。

### P3 关键词（证据：gsc / dataforseo_labs — 新证据类型）

| ID | 检查 | 严重度 | claim |
|---|---|---|---|
| K01 | 机会词：GSC 排名 4-20 且展示量高的词（SEO Opportunity Score 排序，公式沿用 §5.3 plan-ux） | — (机会) | measured_hard |
| K02 | 低 CTR 异常：排名 ≤5 但 CTR 低于位置基准 50%+ → "疑似受 SERP 特性影响"（**只能 hypothesis**，配 SERP 证据后升 inferred） | warning | hypothesis→inferred |
| K03 | 缺口词（missing）：≥2 个已识别竞品排 Top10 而本站无排名，按 搜索量×意图×难度可及性 排序 | — (机会) | measured_sample |
| K04 | 弱势词（weak）：本站 11-30 名、竞品 Top10 | — (机会) | measured_sample |
| K05 | 品牌词覆盖：品牌 SERP 首页是否被第三方占位 | warning | measured_sample |
| K06 | 关键词蚕食：多页排同一词且互相压制（GSC page×query 交叉；建议模板内置 canonical vs 301 决策表——两页均有独立价值用 canonical，彻底合并用 301，跨域 canonical 无效） | warning | inferred |
| K07 | 搜索意图错位：目标词 SERP 前排页面类型（信息文/产品页/榜单）与本站承接页类型不匹配（DataForSEO SERP 结果 + 本站页面模板比对） | warning | inferred |
| K08 | 疑似降权信号：GSC 时序断崖下跌（环比 >50%）/ 收录骤减 / 品牌词 SERP 首页无官网，多信号并发时提示"疑似算法处罚或质量问题"——**恒为 hypothesis 起步，须人工结合 GSC 人工处罚通知确认，工具不下降权结论**（品牌词 SERP 子信号需 DataForSEO，未配置时仅用 GSC 时序信号） | error | hypothesis→inferred |

| K09 | 内容衰退（content decay）：页面级 GSC 点击/展示滚动趋势**持续缓降**（默认 90 天窗口降幅 >20% 且排名同步下滑，区别于 K08 的断崖式）→ 输出"需刷新/需合并/需下线"三级建议。**阈值为启发式约定**（行业无统一标准，各家窗口/幅度互不相同；参考 Animalz 起源研究的 >20%/90 天口径），随 RULES_VERSION 固化 | warning | inferred |
| K10 | ROT 内容清理（Redundant/Outdated/Trivial）：R = contentHash 重复或 K06 蚕食命中 → 合并（canonical/301 决策表同 K06）；O = datePublished >18 月且 GSC 下滑 → 刷新（兼作内容新鲜度维护提醒）；T = 正文 <300 词且 GSC 近 90 天零展示且零外链零内链 → 下线/noindex。与 K09 共用"刷新/合并/下线"三级建议模板，阈值启发式、随 RULES_VERSION 固化 | notice | inferred |

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
| A02 | 锚文本过度优化：精准关键词锚文本占比过高 / dofollow-nofollow 结构单一（DataForSEO Backlinks anchors 数据；过度优化的外链画像有处罚风险） | warning | measured_sample |
| A03 | 外链增长节奏异常：短窗口内外链激增（Backlinks 历史/new-lost 数据），提示非自然增长风险 | notice | inferred |
| G01 | **搜索型 AI 爬虫被 robots 屏蔽**（OAI-SearchBot / Claude-SearchBot / PerplexityBot / Google-Extended 分列；训练爬虫屏蔽只给 notice 说明，检索爬虫屏蔽给 error） | error | measured_hard |
| G02 | **CDN/WAF 层误封检测**：用各 AI 爬虫 UA 实际请求入口页与代表页，对比状态码（403/429/challenge vs 200） | error | measured_hard |
| G03 | 渲染依赖内容对 AI 不可见（同 T10 证据，GEO 措辞："对不执行 JS 的 AI 抓取链路不可见"） | error | measured_hard |
| G04 | Bing 收录缺失（DataForSEO Bing SERP `site:` 查询；影响 ChatGPT 可发现性） | warning | measured_sample |
| G05 | 分引擎可见性低于确认竞品（既有探针聚合，**分引擎报告，不合并**；n=5 标方向性） | warning | measured_sample |
| G06 | 目标域名零引用而竞品被引用（分引擎） | warning | measured_sample |
| G07 | 第三方语料缺失：无 Wikipedia 条目 / Reddit 近 12 月无自然讨论 / 评测站（G2/Capterra，按行业）无收录 | warning | measured_sample |
| G08 | llms.txt 存在性：**只记录，不建议**（报告注明"当前无证据支持其有效性"） | notice | measured_hard |
| G09 | AI 引用情感方向：对探针原始响应中含品牌名的句子做情感分类（positive/neutral/negative/comparison）——分类器是**测量层解析器**（随 parser_version 版本化，结果可抽查原文，非 agent 生成结论）；负面占比显著时触发建议；n=5 下恒标方向性样本，分引擎报告 | warning | inferred |
| E01 | Organization/品牌 schema 缺 sameAs 或未指向权威消歧节点（Wikidata / LinkedIn / Crunchbase / 官方社媒等）——实体消歧机制层有 Bing 官方确认（见 §2 Schema 定级），效果不做量化断言 | notice | measured_hard |
| E02 | 品牌词 SERP 无 Knowledge Panel（DataForSEO SERP 响应 `knowledge_graph` 字段）：有 → 品牌实体已被 Google 识别（记录为正向事实）；无 → 仅提示实体建设方向，不作处罚性结论 | notice | measured_sample |
| E03 | 品牌搜索量对比（GEO 信任代理指标）：GSC 品牌词总展示量（L4）+ DataForSEO 品牌词月均搜索量 vs 确认竞品（L3）——品牌提及与 AI 可见性相关 0.664（§2），此项只做度量与对比展示，不下因果结论 | —（对比） | measured_sample |

品牌 NAP（名称/地址/电话）跨平台一致性**不做自动检测**（难以可靠自动化），报告在 E01/E02 触发时附人工检查清单提示（见 §10）。

### 4.1 探针 prompt 集 v2（template_v2）

- 从固定 20 条升级为**分层 30 条**（可配 20-50）：品牌 5 / 品类推荐 8 / 对比 6 / 长尾问答 8 / 信任评估 3；意图沿用现有 intent 枚举。
- 默认英语（欧美市场），双语市场生成双轨；模板仍确定性填充（品牌/行业/竞品/市场），版本号 `template_v2`，与 v1 结果不直接对比（协议不同，delta 页明示）。
- n 默认 5 不变；聚合报告必须展示 `均值 + 样本数 + 波动`（每 prompt 的 presence 二项比例 + Wilson 区间下限，样本小则区间宽，UI 如实显示）。

### 4.2 内部方法论蒸馏（google-seo-expert skill）与冲突处理

仓库内 `.claude/skills/google-seo-expert`（真源 `docs/seo*.md`，外贸 B2B 独立站实战方法论）按两条通道进入本设计，**不与外部调研混级**：

**通道一：可自动化检查 → 进规则表**（证据定级照常，来源标"内部方法论 + 可硬测证据"）：
内链支撑不足 T11、点击深度 T12、移动端适配 T13、hreflang T14、小语种泛滥 T15、抓取预算浪费 T16、图片 alt C09、内容同质化 C10、Schema 前端一致性 C05d、关键词蚕食处理决策表 K06、意图错位 K07、降权信号 K08、锚文本过度优化 A02、外链节奏 A03——以上均源自 skill 的 S2/S3/S7/S8 清单，且都能落到可复核证据。

**通道二：经验性策略 → 进建议模板/话术库**（不可硬测，恒标"内部方法论·经验级"，claim ≤ inferred）：
- 内容类 generated_prompts 的 content 模板注入 skill S4 写作 SOP：LSI/NLP 语义覆盖、E-E-A-T 要素（≥1 处实操经验 + ≥1 处权威来源）、B2B 决策导向结构（疑虑解答/应用场景/参数价值）、文末 CTA 与指向聚合页的内链、"AI 初稿必须人工终审"声明。
- 蚕食/合并类建议模板内置 S7 的 canonical vs 301 决策表与"核心内容先并入聚合页再 301"流程。
- 行动路线图的节奏建议引用 S5（新站先看展示量再上外链、外链结构混合、增长节奏自然）——**标注为经验级策略，非测量结论**。
- C06/E-E-A-T 类建议模板增加"补充可验证第一手经验证据"的具体指导（实拍/实操截图、操作步骤、案例数据），标经验级；**不得引用"2026 年 E-E-A-T 权重提升/扩展到所有竞争性查询"类说法**（无官方依据，属行业叙事）。
- skill 的 BLOCKERS 红线（关键词堆砌、精准锚文本批量外链、无人工终审的 AI 内容、Schema 与前端不一致等）作为**建议生成器的否定约束**：任何生成的建议不得违反。

**冲突处理（按 skill 自身规则"与官方政策冲突时以官方为准，并提示用户"）**：
- skill 称"FAQ Schema 性价比高且当前稳定生效"——与 Google 官方冲突（2026-07-03 已抓取官方文档核实）：FAQ 富摘要 2023-08 起仅限权威政府/健康站点，**2026-05-07 起对所有站点停止展示，2026-06 官方文档已删除**（developers.google.com/search/updates changelog）。本设计按官方处理（C05a 标 FAQ"无富摘要收益"），FAQPage 标记本身无害可保留（仍是有效 schema.org 类型，且可能利于 AI 引擎理解问答结构——后者属 GEO 弱证据层）；skill 真源文档建议同步更新。
- skill 称"内容占排名权重 70-80%、外链 20-30%"——无官方依据的经验估计，报告中不得作为事实引用，仅可在建议话术中以"实践经验认为"表述。

## 5. 诊断生成链（findings → recommendations → prompts）

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
       内容类模板注入 google-seo-expert skill 的写作 SOP 与 BLOCKERS 否定约束（§4.2）
       Impact×Effort 打分：impact = severity × 受影响页面流量占比（GSC）× 支柱权重
                          effort = 规则声明的固定档位（low/mid/high）
       → priority 四象限（quick_win / strategic / fill_in / low）
  5. 状态 → reviewing，进入既有人工闸门
prompt assembler（补齐 <stub>）：
  accepted/edited 建议 → 按 promptType 模板拼装（注入 verified brand_facts + evidence 摘要 + "不得编造"声明）→ 落 generated_prompts
  内容类建议另可产出 promptType=content_brief（面向人类作者的结构化写作简报）：
    目标词+意图 / SERP Top-5 内容形态摘要（Q03 竞品轻检）/ 推荐标题骨架 /
    必须覆盖的实体与子话题清单 / E-E-A-T 要求（署名/引用/日期/第一手经验）/
    GEO 格式要求（答案前置、数据引述、列表化）/ "AI 初稿须人工终审"声明
    ——同受人工闸门与 verified brand_facts 约束，与 §4.2 通道二 SOP 同源

建议生命周期（执行-验证闭环，补齐"建议产出后就断线"的缺口）：
  proposed → accepted/edited（人工闸门，既有）→ output_ready（prompt/brief 已产出）
  → applied（用户标记"已执行"，记 applied_at + 执行说明）
  → verifying（自动列入下一次同协议回测的观察名单）
  → effective / ineffective / regressed（回测按该建议声明的 validation_method 判定，
    恒标 inferred；同期执行多项建议时报告明示"复合变更，不归因单项"）

finding 跨 run 身份：fingerprint = hash(rule_id + 归一化作用域[URL 模板/页面集/站级])
  → retest delta 按 fingerprint 对齐，输出 resolved / persistent / new / regressed 四态
```

关键点：**规则引擎是主体，LLM 是可摘除的增强**。断网/无 key 时诊断仍能出全量规则型 findings，符合"证据先于结论"。

### 5.1 闭环断点与修补（2026-07-03 平台实施审查增补）

对照代码现状逐条核实后，本方案原稿存在 6 个"写了环，缺了扣"的断点，修补如下（均已回填到 §6 数据模型与 §8 分期）：

1. **brand_facts 全库无写入路径**（表存在、输出页只读，永远为空）→ Phase A 增加 brand_facts 轻量 CRUD（录入 + 人工标 `verified` 的闸门，沿用既有人在环模式）。不变量细化：**仅 content / brief 类 prompt 强制 `input_fact_refs` 非空**；technical 类（fixSnippet 拼装自证据与规则模板）允许为空——否则 Phase A 的 prompt assembler 会被空 brand_facts 表整体卡死。
2. **validation_method 是自由文本，outcome 无法自动判定**（§5 生命周期"回测按 validation_method 判定"落不了地）→ 建议模板同时声明结构化 `validation_spec`：`{metric_source: gsc|probe|crawl|psi, metric, scope, direction, window_days}`；人话描述照常展示，outcome 计算只吃结构化字段。`validation_spec` 非空才允许进入 `verifying`。
3. **回测执行器缺失**（现 `POST /runs/[id]/retest` 是空壳：只插 draft run，不克隆协议、不触发采集，`retest_snapshots` 永远空）→ 明确"同协议重跑"实现：克隆 prompt 模板版本 + 关键词集 + 确认竞品集 + RULES_VERSION + 市场/语言/n → 触发 collectEvidence → generateFindings → 按 fingerprint 算 finding 四态 + 按 validation_spec 算建议 outcome → 落 retest_snapshots。归 Phase E 交付判据（§7.2 板块 8 依赖它才成立）。
4. **竞品确认是流程阻塞点**（识别→人工确认→gap/SoV 对比，若 run 等确认则永远卡在中间态）→ **两段式诊断**：首轮 run 不等确认，直接产出全部非竞品依赖 findings + 竞品候选，状态到 reviewing；用户在 competitors 页确认/驳回后触发**增量再评估**（只重算 K03-K05 / Q01-Q03 / G05-G06 / A01 / E03，不重跑采集），新 findings 按 fingerprint 并入当前 run。确认动作幂等，可多次调整。
5. **diagnosing 阶段无进度反馈**（现 SSE 只覆盖 collecting，`diagnosing/reviewing` 是死枚举；接入生成链后用户会在"采集完成"与"发现出现"之间面对无反馈黑洞）→ SSE 通道扩展到 generateFindings（按支柱推进度事件），RunProgress 增加"诊断中"阶段；LLM 润色失败时事件里明示"已降级为规则原文产出"，不静默。
6. **findings 有 dismiss 数据列、无 dismiss 交互**（§11.2 的误报校准信号无从产生）；建议 applied 同理 → FindingList 行内加"忽略"按钮 + 必填 dismiss_reason；输出页 PromptCard 侧加"标记已执行"（applied_at + 执行说明）；applied 后在 run/project 上写 `next_retest_due_at`（+28~42 天），到期项目页横幅提醒回测——把"4-6 周回测"从文档约定变成产品行为。

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

reference_artifacts(                      -- §11 规则保鲜资产
  id, artifact_key, version, source_url,
  last_verified_at, refresh_cadence_days, payload_jsonb
)

rule_change_proposals(                    -- §11 进化提案队列
  id, created_at,
  source[scheduled_research|effectiveness_stats|dismissal_stats|manual],
  change_type[new_rule|modify_threshold|deprecate|update_artifact],
  target, evidence_refs_jsonb,            -- 必须含一手来源 URL，空则拒绝入库
  diff_jsonb, status[pending|approved|rejected],
  reviewed_at, released_in_rules_version
)

findings 增列：fingerprint（rule_id+作用域哈希，跨 run 对齐）、
               dismissed_at / dismiss_reason（误报反馈，喂 §11.2 校准）
recommendations 增列：applied_at / applied_note、
               outcome[unknown|effective|ineffective|regressed]、outcome_evidence_id、
               validation_spec_jsonb（结构化验证口径 §5.1-2：
                 metric_source/metric/scope/direction/window_days，outcome 自动判定的唯一输入）
projects 增列：next_retest_due_at（任一建议 applied 后自动排期 +28~42 天，
               到期项目页横幅提醒；重跑或手动 dismiss 后清除）
brand_facts：补写入路径与 verified 人工闸门（§5.1-1；表已存在，仅缺 CRUD）
```

既有不变量全部保留；新增约束：`keyword_gaps` 必须引用 dataforseo 证据；`competitors.status=confirmed` 才进入 gap 计算与报告对比；`search_volume/difficulty` 在 UI 恒标"第三方估算"；`rule_change_proposals.evidence_refs` 非空才可入库；`recommendations.outcome` 只能由回测 delta 计算写入（不可手填 effective），且恒为 inferred 级；`generated_prompts.input_fact_refs` 非空约束**细化为仅 content/brief 类强制**（technical 类允许为空，§5.1-1）；`validation_spec` 非空才可进入 `verifying`（§5.1-2）。

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

1. **执行摘要**（≤1 屏）：顶部**约束定位卡**（确定性决策树，标"推断"）——P1 有 error 级抓取/索引/渲染断裂 → 主约束"系统性基础问题"，先看 P1；关键词现状空/极稀疏 → "可见性数据不足"，引导接 GSC/配 DataForSEO；大量 K03/K04 缺口 + P5 外链/语料弱 → "权威与内容竞争力不足"，先看 P3+P5；否则 → "精细优化阶段"，按 impact 排序。给用户"几十条 finding 先看哪"的分诊入口。其后：总分 + 五支柱分、3 个最高影响发现（按 impact 排）、一段白话结论（LLM 起草、人工可编辑、恒标"由规则结果归纳"）；可选字段"预估流量价值"（缺口词/机会词的估算流量增量 × DataForSEO CPC，恒标"估算/inferred"，未配 DataForSEO 时隐藏）。
2. **方法与范围**：采集时间、页面数/截断、数据源清单及各自 claim 等级、探针协议（模型/n/prompt 版本）、**未启用的数据源明示**。
3. **五支柱明细**：各支柱 findings 按严重度分组，每条带证据抽屉（沿用既有 evidence drawer）。P1 小节下含"性能"子块：CWV 三指标 × 移动/桌面 × 达标状态 + Lighthouse 修复清单（标注实验室数据）。
4. **关键词现状与缺口表**：现状（Top 词、机会词 K01/K02）+ 缺口（K03/K04 按 opportunity_score 排序，含搜索量/难度/竞品位次）。
5. **竞品对比**：确认竞品 ×（Share of SERP / AI SoV 分引擎 / 引荐域数）矩阵。
6. **优先级矩阵**：Impact×Effort 四象限散点 + Quick Wins 清单（预期 1 周内可上线项）。
7. **行动路线图**：Quick wins（0-2 周）/ 中期（2-6 周）/ 长期（6 周+），每项挂 validation_method 与回测指标。
8. **回测计划与闭环结果**：4-6 周同协议重跑范围声明（prompt 版本、关键词集、竞品集、RULES_VERSION 锁定）。回测报告新增两块：① findings 四态清单（resolved / persistent / new / regressed，按 fingerprint 对齐，直接回答"上次的问题修好了几个"）；② 已执行建议的 outcome 判定（按各自 validation_method 计算，恒标 inferred；复合变更不归因单项）。"诊断 → 建议 → 执行 → 验证"到此闭环；ineffective/dismiss 统计回流 §11.2 校准规则。

### 7.3 面板增强

- 屏 2 StatStrip 扩展：+ 关键词机会数、缺口词数、竞品数、健康分（各带 claim 标签与空态指引）。
- 新增 `runs/[id]/keywords`（现状/缺口/机会三 tab）与 `runs/[id]/competitors`（候选确认闸门 + 对比矩阵）。
- FindingList 按支柱分组 + 严重度筛选，不再恒空。

### 7.4 UI 信息架构与交互闭环（2026-07-03 实施审查增补）

现状四步 Stepper（新建→诊断→建议→输出）是线性硬导航，加上 site/keywords/competitors/report 后共 8+ 屏，线性结构会塌。原稿只加页面不改 IA，本节补齐：

**导航结构：保持四步主流程，步内挂子 tab**
```
① 新建分析
② 诊断    ├ 总览（StatStrip/PresenceMap/SoV/FindingList）
          ├ 站点结构（既有 site）
          ├ 关键词（现状/缺口/机会）
          └ 竞品（候选确认闸门 + 对比矩阵）
③ 建议    （四象限分组 + 人工闸门）
④ 输出    ├ 执行资产（prompts/brief + 已执行标记）
          └ 综合报告（§7.2 八板块 + 导出）
```
- 诊断完成（reviewing）后**默认落地综合报告页**，由执行摘要约束定位卡承担分诊，再跳转各子 tab 深挖；四屏面板降级为"工作台视图"而非唯一入口。
- Stepper 状态与 run 状态机对齐：collecting/diagnosing 时 ②③④ 显示进行中/锁定态（现状是有 runId 即全解锁，会让用户在 collecting 时点进恒空的 ③④）。

**交互闭环清单（逐条对应 §5.1 断点）**
1. **诊断进度**：RunProgress 阶段从 5 段扩为"采集 5 段 + 诊断（按支柱推进）"，SSE 事件带当前支柱与已产出 finding 数；LLM 润色降级时进度条明示。
2. **findings 操作**：行内"忽略"（必填理由，喂 §11.2）；模板级 finding 默认聚合展示（一条规则 × 一个 URL 模板 = 一行，展开看受影响页样例），避免几十条同因 finding 刷屏。
3. **建议批量操作**：按四象限分组渲染；Quick Wins 组给"全部接受"批量按钮（逐条 PATCH，失败逐条回滚提示）；保留单条 Accept/Edit/Reject。
4. **竞品确认卡**：候选卡必须展示决策依据——overlap_score、共同词数、Top 共同关键词样例（≤5 个）、SERP 证据抽屉；确认/驳回即时反馈"增量再评估中"（§5.1-4），完成后 toast + 相关 tab 徽标更新。
5. **已执行 → 回测提醒**：执行资产页每条 prompt/brief 旁"标记已执行"（写 applied_at + 说明）；到期后项目页与报告页显示"回测到期"横幅，一键发起同协议重跑（§5.1-3）。
6. **连接与配置状态页**（project settings）：GSC OAuth 连接/断开、DataForSEO / 探针 / 渲染 key 的配置状态检测（V0 仍 env 注入，页面只做状态可视化不做 key 存储）、数据源矩阵视图（每个数据源→影响哪些支柱→当前启用/降级），取代散落在各卡片上的 config hint 作为唯一配置入口。
7. **空态即 CTA**：所有空态从"尚未接入"式说明升级为单一下一步动作按钮（连 GSC / 配 key / 去确认竞品 / 等待诊断），沿用既有 data-sources 降级模式判定该显示哪个 CTA。
8. **报告页可用性**：左侧目录锚点导航（八板块）、打印样式（@media print）、导出 Markdown 落地（替换现 inert Export 按钮）；每个板块标题旁带 claim 等级图例入口。

## 8. 分期落地

| Phase | 内容 | 交付判据 |
|---|---|---|
| **A 诊断引擎骨架** | 规则注册表 + generateFindings Inngest 链 + 基于**既有证据**的规则（T01-T05/T07/T10-T12、C01-C04、C05a-d JSON-LD 校验组、C09/C10/C11、E01、G01/G03；T06/T08/T13/T14/C11 需轻检补 redirect/协议/viewport/hreflang/alt/结构可扫描性字段，schema-extractor 扩展保留原始 JSON-LD 与 sameAs，随本期一并补）+ 建议生成（含 skill 经验级模板、否定约束与技术类 fixSnippet，§4.2）+ prompt assembler 补 `<stub>` + FindingList/RecCard 通真数据 + brand_facts CRUD 与 verified 闸门（§5.1-1）+ findings 忽略交互（必填理由）+ 诊断阶段 SSE 进度（§5.1-5）+ 导航 IA 改造（四步×子 tab，§7.4） | 现有采集跑完即出 findings/建议/prompt，四屏不再空；诊断过程有进度反馈 |
| **B GSC 接入** | OAuth readonly + Search Analytics 拉数（query/page 双维）+ keywords/keyword_metrics 落库 + K01/K02/K06/K08/K09/K10 + T15/T16 + TA01/TA02 规则 + 品牌词展示量子指标（E03 的 GSC 侧）+ avgRank 卡通真；附带 PSI 免费采集器 + 性能检查组 T09a-c（轻检补响应耗时字段）+ 设置页（GSC 连接 UI + 数据源状态矩阵，§7.4-6） | 连接 GSC 后关键词现状 tab 有真数据（L4） |
| **C DataForSEO 接入** | provider 适配（SERP/Labs/Backlinks/Bing）+ 竞品识别链 + 人工确认闸门 + K03-K05/K07、Q01-Q03、A01-A03、G04、E02 规则 + E03 品牌搜索量竞品对比 + keyword_gaps + 竞品确认后增量再评估链（§5.1-4，两段式诊断）+ 竞品确认卡决策依据展示（§7.4-4） | 配 key 后自动出候选竞品、缺口词表与外链画像；确认竞品不阻塞主诊断流 |
| **D GEO 深化** | G02 UA 探测采集器 + G07 第三方语料采集（建议模板细化到平台级动作，标经验级）+ G08 llms.txt 探测 + G09 引用情感分类器 + prompt 集 v2 + 分引擎报告 + C07/C08 内容特征 + Content Brief 生成器（依赖 Q03 竞品轻检） | GEO findings 覆盖可达/可提取/收录/语料/可见性五层 |
| **E 综合报告** | 健康分 + report 页八板块（含执行摘要约束定位卡）+ Markdown 导出 + 优先级矩阵 UI + retest delta 扩展（finding 四态 + 建议 outcome + 关键词/竞品/品牌搜索量/引用情感维度）+ 规则保鲜最小版（reference_artifacts 落库 + 手动"规则时效检查"runbook + 报告陈旧告警）+ 回测执行器（同协议克隆重跑 → delta → retest_snapshots，替换现空壳 retest 端点，§5.1-3）+ 已执行标记与回测到期提醒（§5.1-6）+ 报告导出/打印落地（替换 inert Export，§7.4-8） | 一键导出完整专业报告；回测能回答"修好了几个、建议是否见效"；到期回测由产品主动提醒并可一键发起 |
| **F 能力保鲜自动化** | 月度外部监测 cron（受约束 research job，按 §11.1 信源清单巡检）+ rule_change_proposals 审阅 UI（approve/reject → 发新 RULES_VERSION + changelog）+ 建议 outcome / finding dismiss 统计聚合自动入队提案 | 规则库每月产出带一手来源的变更提案，审批后一键发版，平台能力不脱节 |

依赖：A 独立可先行；B/C 并行可选；D 依赖 C（Bing/语料走 DataForSEO/公开 API）；E 依赖 A-D 的数据但可随做随显；F 依赖 A 的规则注册表与 E 的闭环统计，最小版随 E、自动版收尾。

### 8.4 单次全站诊断成本估算（配齐 key 后）

- DataForSEO：种子词 100 SERP（$0.06-0.2）+ Labs ranked/gap/volume（约 $0.5-1）+ Backlinks summary × (1+竞品数)（约 $0.1-0.3）+ Bing site: 若干 ≈ **$1-2**
- 探针：30 prompt × 3 provider × n5 = 450 次调用（比现有 300 次 +50%）
- PSI/Wikipedia/Reddit/GSC：免费
- 报告页开始诊断前照旧显示预估成本（沿用 §9.1 plan-ux 原则）。
- 计费口径复核（2026-07-03）：全部走 v3 API；SERP 按页计费下只取 Top-10 单页，估算不变；无任何官方调价影响此估算。

## 9. 与产品铁律的对齐清单

- 每条规则声明 claimType 上限；第三方估算数据（搜索量/难度/overlap）恒 ≤ measured_sample，UI 标"估算"。
- K02 低 CTR 恒为 hypothesis 起步，SERP features 证据（DataForSEO 返回 AIO 出现）到位才升 inferred——不做确定性 AIO 归因（维持 §8 边界）。
- 竞品候选、建议、报告摘要三处人工闸门；自动识别的竞品不确认不进报告。
- DataForSEO/GSC 原始响应全量落 evidence_artifacts（含 hash/parser_version），可复核。
- 回测锁定：RULES_VERSION + prompt template 版本 + 关键词集 + 确认竞品集 + 市场/语言 + n，写入 run.protocol_version。
- llms.txt/Schema 按证据强度降权，报告中注明证据等级来源。
- 规则进化"自动发现、人工放行"：提案无一手来源不入库，发布必过人工审批（第四道闸门），RULES_VERSION 单调递增不可变（回滚 = 发布内容等同旧版的新版本，审计链完整）。
- 建议 outcome 恒为 inferred 且只能由回测 delta 计算写入；同期执行多项建议时明示复合变更、不做单项因果归因。

## 10. 明确不做（本方案边界）

- 不做逐条外链审计/有毒链接（V2；A01 只做概况对比）。
- 不做 AIO 确定性归因、不做 SERP 时序截图（V1 原计划保留）。
- 不做内容自动生成/自动发布（铁律）。
- 不做 Semrush/Ahrefs 式全网关键词库——只围绕"种子词集 + 竞品域"按需拉取。
- 不做多租户/计费/Redis（V0 边界不变）。
- 探针不加 AI Overviews 引擎（是 SERP 特性非 API）。
- 不做 GSC Bulk Data Export（BigQuery）集成：Search Analytics API 的 50,000 行/天/搜索类型上限对目标用户（中小站）足够；且官方明确 BigQuery 导出**同样过滤匿名化查询**，不解决长尾缺口——长尾补充靠 DataForSEO。大站场景 V1 再评估。
- 不做 GA4/行为数据（SXO）集成："成功会话/停留时长是排名信号"无官方依据（SXO 属行业叙事，存在 buzzword 争议），行为数据 claim 上限过低；V2 再评估。
- 不做 Bing Webmaster Tools OAuth：其免费 API（GetUrlInfo/GetCrawlIssues/GetCrawlStats 等）是比 `site:` 查询更准的 Bing 收录/抓取数据源，记为 G04 的后续升级项；本期 DataForSEO `site:` 已满足，避免再引入一套 OAuth。
- 不用 DataForSEO AI Optimization 套件（2025-08 上线：LLM Responses / LLM Mentions / AI Keyword Data，覆盖 ChatGPT/Claude/Gemini/Perplexity）替代自建探针：自建探针协议全量可控（provider/model_id/params/raw 落证据），符合同协议回测铁律；第三方抓取的模型版本与采样协议不可控。保留为**未来大采样量（n>5 统计功效）时的备选/校验数据源**。
- 不做服务器日志分析集成：日志是抓取行为的"真相层"（唯一能实测"Googlebot/AI 爬虫实际抓了什么"），但用户提供日志门槛高、格式碎片化，V2 评估；当前 G02 UA 主动探测覆盖"可达性"子集。
- 不做 NLP 语义覆盖对比（本站 vs 竞品的 TF-IDF/实体覆盖差异）：需 LLM/NLP 深度分析，claim 上限低、成本高，V2 方向；Q03 竞品内容形态归纳已覆盖轻量版。
- 不做品牌 NAP 跨平台一致性自动检测：难以可靠自动化，报告以人工检查清单提示（挂在 E01/E02 建议下）。

## 11. 规则进化与能力保鲜（Rules Evolution）

**原则：自动发现，人工放行。** 规则库是随 `RULES_VERSION` 版本化的数据而非硬编码常量。全自动改写规则会同时破坏两条铁律——结论未经人核（证据先于结论）与同协议回测可比性——因此自动化止步于"生成带一手来源的变更提案"，发布永远经人工审批，与竞品候选、建议、报告摘要并列为**第四道人工闸门**。FAQ 富摘要弃用、INP 取代 FID、DataForSEO v2 下线，都是本机制要系统性捕获的事件原型（此前全靠人工碰巧发现）。

### 11.1 需要保鲜的版本化资产（reference_artifacts）

| artifact_key | 内容 | 刷新节奏 | 监测信源 |
|---|---|---|---|
| ai_crawler_ua_registry | G01/G02 的 AI 爬虫 UA 清单（训练/检索分类） | 30 天（全库最易过时项） | **各引擎官方 crawler 文档为准**；社区源 darkvisitors.com（Known Agents）与 GitHub `ai-robots-txt/ai.robots.txt`（2026-07 核实均在活跃维护）作发现层，命中新 UA 后必须回官方文档核实训练/检索分类 |
| schema_org_vocab | C05b 词汇快照 | 随 schema.org release | schema.org releases |
| google_rich_results_rules | C05a/C05c 类型与字段规则表（含弃用清单） | 90 天 | Google 结构化数据文档 changelog |
| cwv_thresholds | T09a 阈值（LCP/INP/CLS 及 P75 口径） | 180 天 | web.dev / Google 官方 |
| probe_engine_list + prompt_templates | 探针引擎清单与 prompt 集 | 90 天 | 引擎产品动态；模板变更即发 template_v(n+1)，旧版不覆盖 |
| dataforseo_api_surface | 端点/计费口径 | 90 天 | DataForSEO 官方 changelog |
| ranking_events | Google 核心更新事件表（供 K08 与 delta 解释"跌幅与官方更新时间重叠"——只记日期事实，不记主题解读） | 30 天 | Google Search Status Dashboard |

每个 artifact 带 `version / source_url / last_verified_at / refresh_cadence_days`；超期未校验 → 诊断报告"方法与范围"板块显示**"规则库最后校验于 X，以下检查可能滞后：…"**——宁可承认滞后，不假装最新（与证据铁律同构）。

### 11.2 三条进化输入 → 统一提案队列（rule_change_proposals）

1. **外部监测**（自动，Phase F 的月度 cron）：受约束 research job 按 §11.1 固定信源清单巡检，产出结构化提案（new_rule / modify_threshold / deprecate / update_artifact）。**每条提案必须携带一手来源 URL**（约束同"agent 不得造数字"）；信源清单本身随 RULES_VERSION 版本化，新增信源也走提案。
2. **内部效果统计**（自动，数据驱动校准）：某规则的建议长期 ineffective 占比高 → 降 impact 权重提案；某规则 finding 被 dismiss 率高 → 阈值调整提案。样本量不足不出提案（沿用 Wilson 下限的小样本纪律）。
3. **人工录入**：运营者手动建提案（如 google-seo-expert skill 真源更新、新行业研究、用户反馈）。

### 11.3 发布与回测可比性

- 提案批准 → 打包新 `RULES_VERSION` + 面向用户的 changelog（如"C05a 弃用清单新增 X，依据 Google 官方 changelog [URL]"）。
- run 永远钉死创建时的 RULES_VERSION；**跨版本 delta 恒显"规则库已升级"横幅**——受影响规则的前后对比单独标注"协议已变，不可直接对比"，未受影响规则照常四态对比。
- 探针 prompt 模板、关键词集、竞品集的版本锁定规则不变（§9），规则进化不豁免任何回测锁定项。

## 12. 参考文献（调研来源，节选）

- Google：AI features 指南、Search Analytics API、structured data updates（FAQ/HowTo 弃用）、INP（web.dev）、Quality Rater Guidelines 2025-09、crawl budget 管理文档（响应速度影响抓取速率）、"page experience 非独立排名系统"澄清（2023）；Web Almanac 2025（移动端仅 48% 全通过 CWV）
- Ahrefs：SEO audit / technical audit 方法论、Health Score 定义、AIO CTR 研究（P1 -58%）、75K 品牌 AI 相关性研究（提及 0.664 vs 外链 0.218）、llms.txt 137K 域名研究、AIO 引用 Top-10 占比 76%→38%
- Semrush：Keyword Gap、Site Audit 检查项与 Total Score、AI Toolkit 指标
- Pew Research 2025-07：AI 摘要下点击 8% vs 15%；Amsive：70 万词 AIO CTR -15.49%
- Aggarwal et al., KDD 2024（arXiv 2311.09735）：GEO-bench，统计+41%/引言+28%/堆词无效
- SparkToro 2025：AI 推荐一致性（<1/100）；arXiv 2604.07585 Don't Measure Once
- Profound 6.8 亿引用分析；Peec AI 3,000 万来源分析（Reddit/Wikipedia/YouTube 主导）；Seer Interactive 547 万查询（被 AIO 引用 CTR +35%）
- Vercel / Passionfruit：AI 爬虫不执行 JS 的日志实证；Anagram/GenRank：训练 vs 搜索爬虫区分
- DataForSEO 定价页（SERP $0.6/千、Labs $0.0001/条）；SerpApi/Serper/ValueSERP 对比；Ahrefs API ≈$949/月、Semrush API $499.95/月起（排除依据）
- Schema.org 官方词汇 releases（C05b 离线校验快照来源）；Google 结构化数据功能文档（C05c 字段规则表来源）
- 内部方法论：`.claude/skills/google-seo-expert`（真源 `docs/seo*.md`），蒸馏映射与冲突处理见 §4.2

**2026-07-03 缺口复核（对外部缺口分析报告 x.md 的逐条核实）新增来源：**
- DataForSEO 官方 update：API v2 于 2026-05-05 正式下线（dataforseo.com/update/dataforseo-api-v2-officially-closed）；AI Optimization API 2025-08-06 发布、LLM Mentions 品牌实体提取 2025-12-15 上线（/update/introducing-ai-optimization-api、/update/fan-out-queries-and-brand-entities）；Organic SERP 按页计费 2025-09-19 生效（/update/organic-serp-api-pricing-changes-now-in-effect）。**"2026-07-01 全面调价 +20%"查无官方依据，已否决。**
- Google Search Status Dashboard：2026-03-27（12 天 4 小时）与 2026-05-21（11 天 21 小时）两次核心更新——官方只列日期/时长，**不列主题**；"Information Gain/原创性"为行业解读（status.search.google.com）
- Google Search Central Blog 2023-02 Bulk data export：BigQuery 导出不受 50k 行/天限制、但**同样过滤匿名化查询**（developers.google.com/search/blog/2023/02/bulk-data-export）
- Microsoft Learn：Bing Webmaster API（GetCrawlIssues / GetUrlInfo / GetChildrenUrlInfo / GetCrawlStats）（learn.microsoft.com/en-us/bingwebmaster/）
- Ahrefs hreflang 研究 2023-08-10（Patrick Stox，374,756 域名）：67% 用 hreflang 的域名至少一处错误——**流传的"75%"系夸大转述**（ahrefs.com/blog/hreflang-study/）
- Ahrefs llms.txt 研究（137,210 域名样本，约 38,000 个有有效 llms.txt，97% 在 2026-05 零请求）（ahrefs.com/blog/llmstxt-study/）——支撑 G08 既有定性
- Animalz content decay 起源研究（2018 AdEspresso 数据，均值 -1.21%/周；>20%/90 天启发阈值）——K09 阈值参考；**"Evergreen -20%/12月、比较页 -30%/6月"类分类阈值行业查无出处**（animalz.co/blog/content-refresh）

**2026-07-03 闭环与能力保鲜（§11）增补来源**：AI 爬虫 UA 社区监测源 darkvisitors.com（Known Agents）与 github.com/ai-robots-txt/ai.robots.txt（2026-07-03 联网核实均在活跃维护；仅作发现层，训练/检索分类以各引擎官方 crawler 文档为准）。

**2026-07-03 前沿对照（docs/c.md）增补说明**：约束定位卡、实体检查组（E01 sameAs / E02 Knowledge Panel / E03 品牌搜索量）、主题权威 TA01-TA02、K10 ROT、C11 可扫描性、G09 引用情感、技术建议 fixSnippet、Content Brief 交付物等增补源自行业实践对照。其中"主题权威/内容深度受核心更新奖励""40-60 词段落更易被引用""成功会话信号"等表述为**行业经验叙事**（无官方或对照实验来源），对应规则一律 notice/inferred 起步、建议话术只作机制性推断表述；日志分析、NLP 语义对比、NAP 自动检测归入 §10 边界。c.md 中"衰退检测缺失、Information Gain 缺失"两条系对照修订前旧版所述，本版已由 K09 与 C07 扩展子项覆盖，未重复添加。
