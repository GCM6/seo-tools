# Veris SEO 能力审计与优化方案

> 日期:2026-10-03 · 规则版本:rules_v9(87 条规则) · 审计对象:工作区当前代码(含未提交改动)+ 本地库 `veris.db`
> 证据标签:**[观测]** 本次读代码 / 跑代码 / 查库 / 查官方文档所得;**[推导]** 由观测事实推出,步骤可复核;**[转述]** 外部资料或常识,本次未核实;**[假设]** 为推进工作而补的空白。

---

## 0. 结论(先读这段)

**你的感觉基本属实。但根因不是"少几条规则",而是下面四层问题,而且它们会互相放大。**

1. **输入错了,测出来的东西本身就是错的。**
   - 两个项目的"行业"都是下拉框默认值"B2B SaaS · 项目协作"。
   - 本次运行 30 条 AI 探针问题里有 25 条在问"项目协作 SaaS",DataForSEO 的种子"关键词"也是这类整句问句。所以 metadocu(文档元数据清除工具)找到的"竞品"是 everhour、proofhub、larksuite。
   - **"AI 可见度 0/23"测的是错误品类,结论无效。** AI 可见度恰恰是本产品的主卖点。
   - 三个市场选项全部被映射到美国英文;GSC 授权失效。[观测]
2. **工具说不清自己查了什么。**
   - 规则只记录"命中"。"查过没问题""不适用""数据不足没运行""门槛不够没运行",在报告里都显示为同一个样子。
   - 健康分把"有证据"等同于"评估过"。本次 86.1 分里,P1 = 100,而 PSI 返回全空;P3 = 91.7,而 GSC 失败。
   - 用户看到高分,却不知道一大半维度根本没有测。[观测 + 推导]
3. **数据面太薄。**
   - title、description、H1 只看入口页 1 页。
   - JSON-LD 只抽入口页和模板代表页,metadocu 的 21 页里只覆盖了 4 页。
   - 没有页型 / 站型模型,所以"每类网站该怎么识别、具体内容是否符合"目前做不了。[观测]
4. **判定内核有专业口径错误和必然误报。** 例如:
   - 把 Article 判为"缺 Google 必填字段、富摘要无法生成",而 Google 官方写明 Article 没有必填属性;
   - WordPress 常见的 `@graph` 结构化数据必然被判为"整体失效";
   - `hreflang="en"` 被判为无效;
   - Reddit 返回 403 时被记成"实测 0 条讨论"。

   专业用户核对一次,就会连带不信任其他结论。[观测]

**建议顺序**(经对抗审查修订,见 §7):
1. **先修输入与数据面**:行业必填并由站点预填、种子词只用真实查询、预检 GSC、数据源状态如实记录、保存原始响应。**1–2 天。**
2. **诚信快修与诚实计分**:按 Google 口径修正词表、修掉 `@graph`/T14/T01/Google-Extended 误报、n=5 改成实际 n、核心数据源失败的支柱不出分。**小时级,逐项可做。**
3. **覆盖台账 + 逐页 on-page**:每条规则输出"命中 / 在范围 X 内未发现 / 未检查(原因)/ 出错",按你提的 7 个维度展示;title、description、H1 改为逐页。**3–5 天。**

之后再做:声明站型 + 按类型清单、结构化数据校验 v2、E-E-A-T 扩展、富结果实况、排名与关键词数据层。

工期均为粗估 [假设]。

---

## 1. 审计方法与可信度

- **范围**:`lib/diagnosis`(87 条规则、引擎、上下文、评分、报告)、`lib/crawl`、`lib/collection`、`lib/dataforseo`、`lib/gsc`、`lib/inngest`、`lib/knowledge`(工作流)、相关页面与组件、本地库。
- **方法**:
  - 4 个只读审计代理按维度并行:E-E-A-T 与内容、结构化数据与站型、排名与关键词、技术与抓取。
  - 1 个对抗代理专门尝试推翻结论,它的有效修正已并入本文。
  - 主循环用独立路径复核每条承重论断(§6 中标 ✔)。
  - 代理用仓库真实代码在合成夹具上实跑,复现了一批误报。
- **真实运行样本**:库内只有 metadocu.com 一个带完整证据的站,最新运行为 `run_d12cceaf…`(rules_v9)。**样本量为 1,结论对其他站型的普遍性属于[推导]。**
- **官方口径**:2026-10-03 抓取了 Google Search Central 的 Article、Product snippet、Search updates 页面(见 §9)。
- **只读证明**:审计前后的 `git status --porcelain`、`git diff` 哈希、未跟踪文件哈希完全一致,`veris.db` 修改时间未变。本次唯一新增的文件是本文。[观测]

---

## 2. 你点名的维度:能力判定总表

| 维度 | 判定 | 现在能做什么 | 关键缺口 | 真实运行(metadocu)表现 |
|---|---|---|---|---|
| **E-E-A-T** | 部分(仅代理信号) | 识别出 ≥3 篇"文章"时检查署名、作者页链接、日期有无、带出处的数据/外链、权威来源(AR01–05);信任页(TR06);社媒/sameAs(SO01/02、E01);Wikipedia/Reddit/评测平台存在性(G07、SP01/02);入口页兜底(C06/C07/C08) | 根路径的指南页不算文章;品牌名署名也算"有作者";不区分个人与机构;不抓作者页;日期只看有无;无 YMYL、编辑政策、第一手经验;Reddit/CSE 失败记为 0 | 21 页只识别出 2 篇文章,**AR 整组没运行**,E-E-A-T 实际只剩"首页有没有关于/联系链接";报告里看不出这一点 |
| **内容** | 弱 | 入口页 title/description/H1;全站图片 alt 比例;字节级完全相同页;可扫描性;URL 模板级话题群 | **title/description/H1 不做逐页检查**(逐页 title 其实已采集);无近重复、可读性、关键词-页面相关性、新鲜度/衰退、SERP 竞品内容对比;对中文系统性失效 | 10/21 页 title 超过 60 字符,7 页品牌后缀重复("\| MetaDocu \| MetaDocu"),**一条都没报** |
| **JSON-LD / 结构化数据** | 部分,且有错 | 初始 HTML 里 JSON-LD 的语法与 @context;13 个类型的"必填"字段;FAQ/HowTo 弃用提示;实体 sameAs | 无 Microdata/RDFa;只查根实体;不查三选一、嵌套属性、值类型;词表与 Google 不符;**`@graph` 必然误报**;与可见内容一致性需要渲染(未配置) | 报"Article 缺必填、富摘要无法生成"——**与 Google 口径冲突**;真正缺 Google 必填项的 SoftwareApplication 不在词表里,没报 |
| **站型/页型识别** | 基本没有 | 已有 14 种角色的 `classifyPageRole`(只给意图规则用)、`isArticle`、`detectEcommerce`(只认英文 CTA)等多套启发式 | 无站型;`industry` 是 4 选 1 下拉框,默认值会污染探针、种子、竞品;页型不持久化,中文页面判为 unknown;无"按类型的符合性"检查(只有电商配送/退货页) | 21 页中 9 页 unknown;简历页被判成 about、条款页被判成 service |
| **富文本/富结果异常** | 几乎没有 | — | 无逐页富结果资格;不核对 SERP/GSC 上真实出现的富结果;正文异常(破图、空标题、层级跳级、占位文本、乱码、隐藏文本)都不查;GBK 站入口页会被工具自己解成乱码 | — |
| **排名** | 部分(真实运行中为空) | GSC 28 天快照(1000 行)、按展示加权的平均排名;DataForSEO 种子词 Top10 | 无趋势(不取日期维度);无国家/设备维度;不提取本站在种子 SERP 中的位次;只看 Top10;无 URL Inspection | GSC 失败(invalid_grant);SERP 用的是错误品类的问句 |
| **关键词** | 部分(建在错误输入上) | GSC 查询词;Labs keyword_overview(只查种子);K01 机会词、K02 低 CTR、K06 蚕食;意图与承接页(IPF) | 种子是模板问句;没有"本站排名词"和关键词扩展;**搜索量/KD/意图从不写入关键词表**;市场映射断裂 | keyword_metrics=0;项目里 11 条历史 GSC 真实词(如 "remove author from word")没被用作种子 |
| 技术(补充) | 链接图强,逐页审计弱 | 点击深度、孤岛、断链、站内 PageRank、锚文本 | 逐 URL 可索引性、跳转链、X-Robots-Tag、canonical 目标、sitemap 一致性均无;抓取 UA 是 `node`;抓取上限不可配;多处误报 | 技术维度 0 条;PSI 全空却记为 collected,P1 拿 100 分 |

---

## 3. 根因

### 3.1 输入与数据面:测量对象本身就错了
- **行业默认值污染**:`industry` 下拉框默认第 0 项"B2B SaaS · 项目协作"(`NewAnalysisForm.tsx:99-102`)。它被拼进 AI 探针问句、Google AIO 采样和 DataForSEO 种子(`lib/probes/prompt-set.ts:87`)。
  - 本地两个项目的 industry 都是这个默认值;本次 30 条探针中 25 条含该品类。
  - 选"其他…"时,"其他…"这个字面量会被当作品类拼进问句。[观测](库 `projects`、`prompts`;对抗代理实跑)
- **种子词**:没有 GSC 时,种子 = 探针问句原文(`seed-keywords.ts`)。项目里已有的 11 条历史 GSC 真实查询没有被使用。[观测]
- **竞品**:由错误种子的 SERP 重叠度算出,结果是 everhour、proofhub、larksuite、forbes 等。[观测](库 `competitors`)
- **市场**:DataForSEO 主阶段的映射表只认 `us`/`gb`/`de` 等国家码。UI 的三个选项"中文 · 中国大陆 / English · Global / 东南亚"全部回落到 US/en;AIO 阶段用另一张表。[观测] `lib/dataforseo/locations.ts:11-29`、`lib/serp/locations.ts`
- **GSC**:本地 refresh token 失效(invalid_grant)。OAuth 回调依赖 3000 端口,而该端口被另一个项目占用。[观测]
- **数据源状态失真**:
  - PSI 证据全 null,状态却是 collected(`psi.ts` 不检查 `res.ok`);
  - DataForSEO 状态无条件写 collected,且不计数(`collect-evidence.ts:836`)。本次它实际采到了 seed_serp(23 个种子,15 个成功、8 个报 40101)、外链、Bing、品牌 SERP,但 Labs 静默无产出;
  - Reddit 非 2xx 时记为 0(`third-party-presence.ts:97`)。[观测]
- **原始响应没有原样保存**:PSI、DataForSEO、第三方语料的 `raw_text` 存的是解析后的摘要(例如 brand_serp 只有 1110 字符)。这违反 CLAUDE.md 的"证据不可变"铁律,也使上面的失败事后无法复核。[观测]
- **本地库约束漂移**:`evidence_type` 的 CHECK 约束里没有 `social_presence`;`__drizzle_migrations` 只记了 11 条,journal 有 15 条。即使配置了 SP01/SP02,本地也存不下它们的证据。[观测]

### 3.2 判定模型:只会说"有问题",说不清"查过了"
- `Rule.evaluate` 只有"命中"或 `null` 两种结果。通过、不适用、数据不足、门槛不够,在报告中同形;抛错被引擎吞掉,也是 `null`。[观测] `types.ts:177-189`、`engine.ts:21-40`
  - 本次 87 条规则里 12 条命中,75 条静默。按原因估算,至少 22 条属于"没能检查"却和"通过"长得一样:GSC 4、渲染 3、PSI 3、文章门槛 5、竞品 3、社媒 2、缺口词 2。[推导](对抗代理)
- **明细只部分落库**:部分规则(如 C03)的受影响 URL 会以文字拼进建议的 `why`,但缺失字段、取值等结构化明细不落库;findings 表没有 detail 列。[观测] `finding-rows.ts:74`、库内 recommendations
  - 例:C05c 只说"1 个实体缺字段(Article)",不说是哪个页面、缺哪个字段。
- **7 条 GEO 规则没有专属建议模板**(G02/05/06/07/08/09、Q02),会落到通用的"该内容问题影响相关性……"。G08 的文案明确说"不据此提出优化建议",实际仍然生成了一条建议。[观测] 库内 recommendations;(对抗代理 probe-templates)
- **健康分把"有证据"当成"评估过"**:
  - 证据行存在,支柱就入分(PSI 全空,P1 照样 100);
  - 有任何一条 finding,支柱也入分(仅 K05 一条,就让 P3 拿 91.7)。
  - 用真实函数复算本次结果:overall 86.1,P1 100,P2 81.3,P3 91.7,P5 64.6。按文档权重手算一致。[观测 + 推导] `pillars-with-data.ts`
- **已有的"覆盖"信息只到数据源粒度**:报告第 8 节的 R0–R5 等级与缺口,而且其中两行状态本身失真。[观测] `report.ts:266-310`
  - 另一个最接近"查过什么"的记录,是工作流步骤产物里的 `evaluatedRuleIds` / `no_issue_detected_in_available_evidence`(`knowledge/repository.ts:740-743`)。但库里的工作流定义只路由了 64/87 条规则,且只在 `/sessions` 以原始 JSON 展示。[观测]
- **UI 预留了"已具备:已核验达标项"标签,但永远不会出现**:ProvenanceTag 有 `ok` 变体,`provenanceForClaim` 却从不返回它。设计上想展示"通过项",引擎产不出来。[观测] `lib/evidence.ts:5-12`

### 3.3 数据面:入口页 + 抽样页,没有页型/站型
- **只看入口页**:C01/C02/C03(title / description / H1)、C06/C07/C08、T09 系列(PSI 只测入口页的移动端)。[观测] `context.ts:244-245`
- **schema 只在抽样页抽取**:入口页 + 每个 URL 模板 1 个代表页 + 人工重点页。metadocu 的 `/{slug}` 模板混着 16 个不同性质的页面,只验了 1 页。[观测]
- **逐页已采字段**:状态码、title、canonical、meta robots、hreflang、图片 alt 计数、链接、viewport、混合内容、文章信号(其中含逐页 JSON-LD 解析,但只用于判断是不是文章)。
- **逐页未采字段**:meta description、H1、H2–H6、X-Robots-Tag、响应时间、页面大小、跳转链。[观测] `light-check.ts:9-36`
- **页型与站型**:有 `classifyPageRole`(14 种角色)等多套启发式,互不相通,也不持久化;没有站型。[观测]

### 3.4 判定内核:与官方口径不符、必然误报
见 §6。最伤可信度的有:
- C05c 的 Article/Product 口径与 Google 冲突;
- C05b 的 `@graph` 误报;
- T14 把 `en` 判为无效;
- T01 只要有一个普通 URL 被禁抓,就报"入口/关键页被屏蔽"(error);
- Google-Extended 被归为"检索型",屏蔽它就报 error,而模板里又称它是"训练型";
- C10 号称"正文重复",实际比的是整页 HTML 哈希。

---

## 4. 真实运行复盘(metadocu.com,run_d12cceaf,rules_v9)

| 类别 | 内容 |
|---|---|
| 报出 12 条 | **6 条警告**:C03(H1=title)、C05c(Article"缺必填",**口径错**)、G04(Bing 未收录)、G05(AI 可见度 0/23,**测错品类、文案写 n=5 实际 n=1**)、G07(第三方语料缺失,**Reddit 失败也会记 0**)、K05(品牌词首页无本站)<br>**6 条提示**:A01、C05a、E01、E02、G08、SO01 |
| 该报没报 | 10 页 title 超长;7 页品牌后缀重复;研究页声称有统计却 0 处出处、署名是品牌、无发布日期;SoftwareApplication 缺 Google 必填的 aggregateRating/review;面包屑第 1、2 项都指向首页 |
| 没运行或没数据 | AR01–05(文章不足 3 篇)、C05d/T10(无渲染)、T09(PSI 全空)、K01/K02/K06/IPF02(GSC 失败)、K03/K04/Q(竞品未确认,且竞品本身是错的) |
| 用户看到的 | 健康分 86.1;"没运行"的部分只在数据源层显示为 `gsc:failed` 这类代码,看不到检查级的状态 |

---

## 5. 分维度要点

### 5.1 E-E-A-T
- AR01–05 需要识别出 ≥3 篇文章(`eeat.ts:12,30-35`)。文章判定依赖 schema、og:article、`<article>` 里的时间标签或博客类路径。根路径下有署名的指南页判为"非文章",同一页放到 /blog/ 下就判为"文章"。[观测](代理 A 探针)
- "有作者"的口径太宽:`<meta name="author">` 写品牌名也算(metadocu 21/21 页都是 "MetaDocu")。不区分 Person 和 Organization,不抓作者页,全仓没有 jobTitle/Person 校验。[观测]
- 日期只看有无,喂 2014 年的文章也不报。[观测](探针)
- 权威来源名单偏窄且有偏差:w3.org、ietf.org、iso.org、MDN 被判为不权威,而任何 `*.org.cn` 都判为权威。[观测] `article-signals.ts:57-61`
- 完全没有:YMYL、编辑政策/事实核查页、第一手经验、评价评分与情感、中文平台口碑(百度百科、知乎、小红书、大众点评)。Wikipedia 判定其实是"站内全文搜索有任意结果",品牌名是常见词时会误判为"有条目"。[观测]

### 5.2 内容
- 逐页 title 已经采集,但只给意图规则(IPF)判断页面角色用;逐页不采 description 和 H1。[观测]
- C10 "正文重复"实际比的是整页 HTML 的 sha256(`light-check.ts:424`)。页面里有 nonce 或时间戳就永远不命中;跳转的源和目标会被各抓一次,造成误报。[观测]
- C04 薄内容:"正文"字符数包含导航和页脚,商业路径只认英文词,metadocu 的模板根本不在评估范围内。[观测]
- 中文失效:C11 按空格分词;IPF01 去掉非 ASCII 字符后,中文词必然误报"缺承接页";意图和页型正则只认英文。[观测](探针)
- K08–K10(衰退、断崖、ROT)只存在于 spec 中。[观测]

### 5.3 结构化数据
- 抽取只认 `script[type="application/ld+json"]` 的精确匹配,带 `; charset=utf-8` 的写法识别不到。无 Microdata/RDFa;JS 注入的 JSON-LD 看不到。[观测] `schema-extractor.ts:41`
- 词表只有 13 个类型,缺 SoftwareApplication、LocalBusiness、ProfilePage、DiscussionForumPosting、商家列表、站点名称等;`recommended` 字段从未被读取。[观测]
- 只查根实体的 required。不查嵌套的 Offer、AggregateRating、Review、ListItem;不做值类型校验(`"$1,299"`、`"dollars"`、相对路径 image、`"yesterday"` 都能通过)。[观测](探针)
- C05d(与可见内容一致)依赖渲染,从未运行过。一旦配置渲染,会因 SEO 标题、logo alt、价格格式等差异大面积误报。[推导](探针)
- 自家建议会被自家规则判错:修复模板 `JSONLD_SNIPPET` 是只有 name + offers 的 Product,按 Google 商品摘要口径是合规的,但词表要求 image 必填,会被 C05c 判为缺字段。问题出在词表。[观测]
- "结构化数据覆盖"统计卡显示的其实是第一条 schema 证据里的类型个数。[观测] `lib/diagnostics.ts:98-105`
- 保鲜资产:`google_rich_result_status` 上次核验于 07-08,周期 90 天,10-06 过期;`ai_crawler_ua_list` 周期 30 天,08-07 已过期。[观测] 库 `reference_artifacts`

### 5.4 站型/页型
- 见 §3.3。电商判定只认英文 CTA,"立即购买""加入购物车"不算。[观测](探针)
- `data-rule` DSL 白名单里有 `project.industry`,但 `evaluateDataRule` 没有生产调用方。[观测]

### 5.5 富结果/富文本
- SERP 结果类型在 context 层被丢弃(只留 domain/url/rank,见 `context.ts:91`);原始响应不落库,事后无法补算;`keyword_metrics.serp_features` 列没有任何写入方。[观测]
- GSC 只取 query 和 page 两个维度,没有 searchAppearance,也没接 URL Inspection。[观测]
- 正文富文本异常的 7 项检查全部缺失(破图、空标题、层级跳级、HTML 结构、占位文本、乱码、隐藏文本)。T08 混合内容口径有误:把 http 的 canonical/alternate 链接也计进去,却漏掉 iframe、video、srcset。[观测]
- **"富文体"有两种可能的含义**:富媒体搜索结果(由结构化数据驱动),或正文富文本(CMS 编辑器产出的 HTML)。本次两种都审了,请确认你指的是哪一种。

### 5.6 排名与关键词
- GSC:28 天窗口、1000 行;没有日期、国家、设备维度,也不分页。[观测] `collect-evidence.ts:142-149,584-591`
- DataForSEO:
  - 只调了 Labs keyword_overview(且只查种子)和 SERP Top10(depth=10);没有 ranked_keywords、ideas、related。
  - 搜索量/KD/意图不写入关键词表,冲突时还会被置空。
  - 设置页里填的凭据,主采集阶段读不到(只读 env)。[观测]
- 竞品链路:
  - K03 比对前不剥协议,本站永远匹配不上,只要有竞品就判"缺口词";[观测]
  - Q02 用域名去匹配 AI 回答,恒为 0%;用品牌名匹配是 22–24/30;[观测](探针)
  - A01 对比分支、A02、A03、E03 是死规则;
  - 用户填的竞品不入库;
  - 回测会把竞品类发现判为"已修复"。[推导]

### 5.7 技术
- 强项:链接图(深度精度、孤岛、仅 nofollow 可达、死胡同、PageRank、锚文本与区域)。[观测]
- 弱项:
  - 200 页 / 3 层不可配;UA 为 `node`;
  - robots 解析有 5 类问题(通配符与 `$`、查询串、连续多行 User-agent、行内注释、Googlebot 专属组),导致 G01 把共用一个 Disallow 的多个 AI 爬虫判为"允许";
  - 中大型站点上,深度视界一旦被拉低,T12/L01 就静默不报(合成站:720 个断链报出 0 个)。[观测](代理 D 探针)

---

## 6. 缺陷清单(只报告,本次未修)

标"✔"的由主循环用独立路径复核,其余为代理用仓库代码探针复现或推导。

| # | 类别 | 缺陷 | 位置 | 修复方向 |
|---|---|---|---|---|
| 1 ✔ | 输入 | 行业默认"B2B SaaS · 项目协作",污染探针/AIO/种子;选"其他…"时字面量进入问句 | `NewAnalysisForm.tsx:99-102`、`prompt-set.ts:87` | 改为必填自由文本,用站点 title/H1/meta 预填、用户确认;默认值或"其他…"禁止启动付费采集 |
| 2 ✔ | 输入 | 无 GSC 时种子 = 探针整句;历史 GSC 词未使用 | `seed-keywords.ts`、`collect-evidence.ts:574,595,817` | 种子优先级:本轮 GSC → 项目历史 GSC(标时间)→ 站点关键短语;永不用问句 |
| 3 ✔ | 输入 | 三个市场选项都回落到 US/en;两张映射表各自为政 | `lib/dataforseo/locations.ts`、`lib/serp/locations.ts` | 合并成一张表;中文市场的数据源待决策(§8) |
| 4 ✔ | 诚信 | PSI 不检查 `res.ok`,全 null 仍记 collected | `psi.ts:69-77` | 非 2xx 或全空记 failed,保存原始响应 |
| 5 ✔ | 诚信 | DataForSEO 状态无条件写 collected、不计数;子阶段 catch 为空 | `collect-evidence.ts:836`、`collect-stage.ts:112-162` | 按子阶段记录计数与失败原因 |
| 6 ✔ | 诚信 | Reddit 非 2xx 返回 0,G07 以 measured_sample 出结论 | `third-party-presence.ts:97` | 失败记 null + 状态码,规则返回"未检查" |
| 7 | 诚信 | SP01/SP02:CSE 报错被吞成 0 结果 | `social-presence.ts:74-76` | 同上 |
| 8 ✔ | 诚信 | 原始响应存的是解析摘要(PSI/DataForSEO/第三方) | `collect-evidence.ts:547` 等 | 原样存原始响应 + hash |
| 9 ✔ | 诚信 | G05/G06/G09/G11 文案写死"n=5",本地实际 n=1 | `geo.ts:111,152,321,407` | 用实际 n |
| 10 ✔ | 假分 | 有证据或有 finding 就算支柱已评分(本次 86.1 分) | `pillars-with-data.ts:16,51` | 核心数据源失败/全空的支柱不出分;按检查完成度评分 |
| 11 ✔ | 口径 | C05c 把 Article 的推荐字段当必填,文案写"富摘要无法生成",标 measured_hard | `schema-vocab.ts:27-40`、`content.ts:378-416` | 按 Google 逐功能文档重建;区分必填缺失和推荐缺失 |
| 12 ✔ | 口径 | Product 把 image 设为必填,却不检查三选一;缺 SoftwareApplication | `schema-vocab.ts:23-26` | 区分商品摘要与商家列表;实现三选一;补 SoftwareApplication |
| 13 ✔ | 误报 | `@graph` 子节点缺 @context,C05b 报 error | `content.ts:278-301` | @context 从块根继承 |
| 14 ✔ | 误报 | T14 把 `en`/`uk`/`eu` 判为无效 | `technical.ts:374-378,470-480` | 按"语言-地区"两段分别用 ISO 639-1 / 3166-1 校验 |
| 15 ✔ | 误报 | T01:任一 URL 被禁抓就报"入口/关键页被屏蔽"(error) | `technical.ts:78-116` | 只在入口/重点页被禁时报 error |
| 16 ✔ | 误报 | Google-Extended 被列入检索型 UA(屏蔽即报 error),模板又称它是训练型 | `geo.ts:28` vs `templates.ts:53` | 移出检索型列表(它是 robots 令牌,不影响 Google 搜索 [转述]) |
| 17 ✔ | 名不副实 | C10 "正文重复"实为整页 HTML 哈希 | `light-check.ts:424` | 改为主体正文哈希 + simhash 近重复,排除跳转行 |
| 18 ✔ | 编码 | 入口页 `res.text()` 强制按 UTF-8 解码,GBK 站乱码 | `page-parser.ts:33` | 复用爬虫路径的 `decodeBody` |
| 19 ✔ | 误报 | K03 域名带协议,本站永远匹配不上 | `keyword-gap.ts:26-28` | 统一按主机名比较 |
| 20 ✔ | 模板 | 7 条 GEO 规则无专属建议模板;G08 自称"不建议"却生成了建议 | `templates.ts` | 补模板;记录型规则不生成建议 |
| 21 ✔ | 丢数据 | 搜索量/KD/意图不写入关键词表 | `collect-evidence.ts:634`、`repositories/index.ts:264` | 写入并展示 |
| 22 ✔ | 误导 | "结构化数据覆盖"卡实为类型个数 | `lib/diagnostics.ts:98-105` | 改名,或改成"有效结构化数据页 / 已抓页" |
| 23 ✔ | 环境 | 本地库 CHECK 约束缺 `social_presence`,迁移 11/15 | `veris.db` | 重建本地库(fresh push + seed) |
| 24 | 误报/漏报 | T08 把 http 的 `<link>` 计入混合内容,漏掉 iframe/video/srcset | `light-check.ts:328-334` | 只计会加载资源的元素 |
| 25 | 中文失效 | C11 按空格分词;IPF01 剔除非 ASCII 后误报;意图/页型正则只认英文 | `light-check.ts:107,318-321`、`intent-page-fit.ts:217-224` | 按语言分词;中文按字数 |
| 26 | 死规则 | E03、A02、A03、A01 对比分支永不触发 | `authority.ts`、`backlinks.ts:43-45` | 补采数据,或下线并改文案 |
| 27 | 系统性 0 | Q02 用域名去匹配 AI 回答 | `reevaluate-competitors.ts:191` | 改用品牌名/别名 |
| 28 | 虚增 | 回测把竞品类发现判为"已修复" | `generate-findings.ts:203-215` | 回测时同样带上已确认竞品 |
| 29 | 口径 | C03 把"H1 = title"报为 warning/measured_hard(Google 公开说法是这样没问题 [转述]) | `content.ts:142-182` | 降为 notice/hypothesis,或删除 |
| 30 | 静默 | 中大型站点深度视界被拉低时,T12/L01 静默不报 | `link-graph.ts:308-325` | 不精确时降级为 inferred 输出,而不是不报 |
| 31 | 抓取 | robots 解析有 5 类问题;UA 为 `node` | `robots.ts:8-40` | 按 RFC 9309 实现;使用可识别的 UA |
| 32 | 漏判 | E01/SO02 忽略 Organization 子类型和嵌套组织;完全没有 Org schema 时无人报告 | `geo.ts:45,206-207` | 认子类型与嵌套;补"缺组织实体"检查 |
| 33 | 丢数据 | SERP item 类型被丢弃 | `context.ts:91` | 保留类型,用于富结果实况 |
| 34 | BYOK | 设置页存的 DataForSEO 凭据,主采集阶段不读 | `dataforseo/index.ts:10-19` | 统一凭据来源 |
| 35 | 误导 | 关键词页空态无条件提示"缺 DataForSEO" | `keywords/page.tsx:29,59-64` | 按实际原因提示 |

**单测现状**:与上述缺陷相关的测试文件全部通过(各代理分别跑了 178、243、93、95 个用例)。这说明这些问题都在测试覆盖之外,而且多数是项目里的老问题——"测试夹具的形状,真实链路产不出来"(见项目陷阱 `trap-rule-fixture-unreachable`、`trap-failure-coerced-to-zero`)。[观测]

---

## 7. 优化方案(经对抗审查修订)

**原则**:守住 Veris 的立身之本——可核验、分层标注、人在环内。顺序是**先让输入正确,再让结论诚实,再让覆盖完整,最后让判断深入**。已有能力尽量复用:逐页 title、`classifyPageRole`、逐页 JSON-LD 解析、工作流产物里的 `evaluatedRuleIds`、`Rule.requiredSources` 字段。工期均为粗估 [假设]。

### 第一步:修输入与数据面(约 1–2 天;重连 GSC 不写代码)
1. **行业改为必填自由文本**:用首页 title/H1/meta 预填,用户确认。行业是默认值或"其他…"时,禁止启动付费采集(探针、AIO、DataForSEO)。
2. **种子词**:本轮 GSC → 项目历史 GSC 词(标注时间)→ 站点关键短语(title/H1)。探针问句不再当种子。向导里增加"目标关键词"(可选)。
3. **市场映射合并为一张表**,让 UI 选项真正映射到 location 和 language。
4. **运行前预检**:GSC token、DataForSEO 凭据(env 或 DB)、PSI、渲染。开跑前告诉用户"本次哪些维度无法评估"。
5. **数据源状态如实写**:PSI 失败或全空记 failed;DataForSEO 按子阶段计数并记录失败原因;Reddit/CSE 失败记 null 而不是 0;**原样保存原始响应**。
6. **本地环境**:重建 `veris.db`(迁移漂移),重新授权 GSC(避开 3000 端口冲突)。

### 第二步:诚信快修 + 诚实计分(小时级,逐项可做)
- C05b `@graph` 继承 @context;C05c 词表按 Google 现行文档重建(Article 改为"推荐字段"口径;Product 实现三选一;补 SoftwareApplication、LocalBusiness);T14 修正语言码表;T01 按入口/重点页与普通页分级;Google-Extended 移出检索型;n=5 改为实际 n;补 7 条 GEO 规则的专属模板,G08 不生成建议;"结构化数据覆盖"卡改名或改口径;C10 改为正文哈希;入口页改用 `decodeBody`。
- **健康分**:核心数据源失败或全空的支柱不出分;取消"有 finding 就算已评分"。
- **新增两条铁律测试**:
  - 采集失败不得产出 measured 类结论;
  - 规则测试的夹具必须来自真实生产函数,例如 `normalizeDomain()` 的输出、真实的 marketOptions 字符串、Yoast 式 `@graph`、GBK 字节、403 响应。

### 第三步:覆盖台账 + 逐页 on-page(约 3–5 天)
1. **四态台账**:每条规则输出以下四种之一,其中"范围"是必填项,例如"C01 通过"目前只代表首页 title 正常:
   - 命中;
   - **在范围 X 内未发现**;
   - **未检查**(原因:缺数据源 / 采集失败 / 未达门槛 / 未配置渲染);
   - 出错。

   实现方式:引擎外包一层;规则声明前置条件(启用已有但无人使用的 `Rule.requiredSources`),再加 `appliesTo`;不必改写 87 条规则的主体逻辑。结果落库到 `check_results`,并重建或改由规则注册表派生工作流定义(现在只路由 64/87 条)。
2. **按你提的维度展示**:run 页和报告首屏按"E-E-A-T / 内容 / 结构化数据 / 站型符合性 / 富文本 / 排名 / 关键词 / 技术 / GEO"分组,每组显示 ✅ / ❌ / ⚪ / ⛔ 计数,并给出"如何解锁"(例如"GSC 授权失效 → 重新授权")。
3. **结构化明细落库**:finding 增加 detail JSON(受影响 URL、字段、取值),UI 可以下钻;建议模板用明细填空。
4. **逐页 on-page**:
   - title 已在快照里,先做跨页的缺失、过长、重复检查,metadocu 能立刻报出 10 页超长和 7 页后缀重复;
   - 逐页补采 meta description、H1(文本 / 数量 / 是否为空)、X-Robots-Tag、响应时间、页面大小、跳转链;
   - C01–C03 改为全站聚合;
   - 站点结构页加上这些列、筛选和 CSV 导出。

### 第四步:声明站型 + 按类型清单 + 页型持久化
- **站型由用户声明**:电商 / B2B 获客 / SaaS 工具 / 本地商家 / 内容媒体。可以用已有信号(`detectEcommerce`、schema 类型)给出建议值。V0 不做独立的推断模型(对抗审查意见:单用户内部工具,用户自己知道站型)。
- **页型**:加强并持久化现有的 `classifyPageRole`,加入 schema 类型、H1、中文/拼音词元信号;用户可以修改;不新建模型。
- **按类型的期望清单**(每条期望附官方出处和证据等级):
  - **产品页**:Product 商品摘要(name + review/aggregateRating/offers 三选一)或商家列表(image + offers.price/priceCurrency);可见价格与 Offer 一致;面包屑;
  - **文章/指南**:Article 推荐字段;个人作者 + 作者页;可见日期;引用来源;
  - **本地商家**:LocalBusiness(name、address);NAP 一致;营业时间;
  - **SaaS 工具**:SoftwareApplication(name、offers.price、aggregateRating 或 review);定价页;文档;对比页;
  - **B2B**:Organization(logo、url、contactPoint);案例;资质;询盘入口。

### 第五步:结构化数据 v2 + 富结果实况 + E-E-A-T 扩展 + 富文本异常
- **结构化数据 v2**:
  - 按 Google **功能**组织规则(必填 / 三选一 / 推荐),覆盖嵌套对象和值类型(ISO 8601、ISO 4217、绝对 URL、数值价格);
  - 维护弃用清单并标日期:FAQ 自 2026-05-07 停展;HowTo;2025-09 下线 Course info 等;2025-11 下线 Practice problem;
  - 支持 Microdata/RDFa,**对全部已抓页抽取**;配置了渲染时抽取 JS 注入的 JSON-LD;
  - 可见内容一致性校验时做格式归一化;
  - 逐页逐项输出"有效 / 有警告 / 无效",口径对齐 Search Console 增强报告;
  - 规则表纳入 `reference_artifacts` 保鲜。
- **富结果实况**:保留 SERP item 类型;GSC 增加 searchAppearance 维度。回答"哪些页面实际拿到了哪种富结果",让结构化数据建议可以回测。
- **E-E-A-T 扩展**:
  - 评估对象扩大到所有内容型页面;不足 3 篇时改为逐页报告;
  - 标注"作者是品牌名";抓取作者页(简介 / 资历 / sameAs / Person schema);
  - 按日期值判断新鲜度;重做权威来源名单;
  - 编辑政策页、评价/口碑存在性;YMYL 识别后从严判定。
- **正文富文本异常**(先确认"富文体"的含义):空或坏的 img src、空标题/空段落、标题层级跳级、占位文本、乱码(U+FFFD 与误解码特征)、内联隐藏的大段文字、正文区混合内容。

### 第六步:排名与关键词数据层(不做排名追踪产品,只做"可核验的快照 + 趋势")
- **GSC**:token 健康检查与重新授权入口;日期维度(趋势)、按市场的国家/设备过滤、分页、searchAppearance;重点页做 URL Inspection(索引状态、Google 选定的 canonical);接 Sitemaps 接口。
- **DataForSEO**:
  - Labs ranked_keywords(本站已排名词):没有 GSC 的新用户也能看到排名和关键词;
  - keyword ideas / related,用于发现缺口;
  - 搜索量/KD/意图入库;跟踪词集的 SERP 深度可配置。
- **固定词集排名快照**:每次运行或回测都存位次和 SERP 特性,形成趋势。
- **关键词→页面映射表**(目标页可编辑):K06 排除品牌词 sitelinks;修复竞品链路(§6 的 19、26、27、28);用户填写的竞品入库。

### 可选(需要拍板):受约束的 LLM 评估层
- 用于确定性规则判断不了的问题:是否有帮助、第一手经验、专业深度、是否完整回答了查询。
- 约束:每个判断必须引用页面原文片段;输出经 `validators.ts` 校验;claim 固定为 hypothesis 或 inferred;过人工闸门。
- 这会改变当前"诊断零 LLM"的设计,也会带来逐页成本。

---

## 8. 需要你拍板的决策

> **2026-10-04 用户已拍板**:
> - 定位:做"功能强大的 SEO + GEO 检测分析工具",终点产物是**优化方案报告**。下面第 1 项的推荐因此升级:覆盖面对齐专业工具。
> - 搜索引擎:"当前只处理 chrome",按决策顺序理解为只做 Google、不做百度(待确认)。
> - "富文体"实为**富媒体**,即 Google 富媒体搜索结果。§5.5、§7 中"正文富文本异常"一项移出范围。
> - 暂不引入 LLM。
>
> 下面保留原始选项,供追溯。

1. **产品定位**
   - **推荐**:"可信的基线审计 + GEO 差异化"。逐页技术、on-page、结构化数据、E-E-A-T 代理信号对齐专业工具的基础层;排名和关键词只做 GSC + Labs 的快照与趋势,不做排名追踪产品,与 CLAUDE.md 的 "not a rank tracker" 一致。
   - **备选**:全功能 SEO 套件。这会直接与 Semrush/Ahrefs 比拼数据库规模,成本高。
2. **"中文 · 中国大陆"市场的数据源**:Google(港台 / 中文)还是百度。DataForSEO 是否覆盖百度、覆盖到什么程度,尚待核实 [转述]。
3. **"富文体"指什么**:富媒体搜索结果,还是正文富文本?
4. **是否引入受约束的 LLM 评估层。**
5. **商业验证节奏**:07-18 定的 4 周验证窗口已经过去。如果还要找站主人工代跑,至少要先完成第一到第三步。站主最先问的是"我的站哪里不对、先改什么",而当前的 AI 可见度结论因为品类错误不能拿给外人看。

---

## 9. 风险与未核验项

- **样本量为 1**:只有 metadocu 一个站的真实运行数据。电商站、本地站、GBK 站、大站上的结论,来自代码推导和合成探针,没有做真实站点冒烟。
- **Google 文档**:经 WebFetch 摘要器读取,Article 与 Product snippet 的关键句已核对。Recipe、Event、Review、JobPosting、Google-Extended 的口径来自记忆或代理转述 [转述]。
- **未核实的推测**:Reddit 在生产环境(Vercel 出口)是否同样返回 403;PSI 全空的原因(推测是匿名调用被限流 [假设])。原始响应没有存,无法证实。
- **未专项审计**:GEO 规则只审了与本维度重叠的部分;回测与规则进化链路没有专项审计。
- **工期**:所有估算都是 [假设]。

### 官方来源(2026-10-03 抓取)
- Article 结构化数据(2026-09-08 更新,"There are no required properties"):https://developers.google.com/search/docs/appearance/structured-data/article
- Product snippet(2026-09-08 更新,name 必填 + review/aggregateRating/offers 三选一,image 不在必填项中):https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Search Central 更新日志(2026-05-08:FAQ 富结果自 2026-05-07 起不再展示;2026-06-15 移除 FAQ 文档;2025-09-09 移除 course info 等文档):https://developers.google.com/search/updates
- 代理 B 另行核对的文档:Video、Merchant listing、Software app、Local business、Organization、Breadcrumb、Course、Search gallery、SD policies。
