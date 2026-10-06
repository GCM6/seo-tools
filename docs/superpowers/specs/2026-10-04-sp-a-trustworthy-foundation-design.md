# 子项目 A:可信地基 —— 设计文档

> 日期:2026-10-04 · 状态:**待用户审阅** · 规则版本:rules_v9 → rules_v10(本子项目会发布)
> 上游:能力审计报告 `docs/plans/2026-10-03-seo-capability-audit-optimization-plan.md`(下称"审计报告",缺陷编号沿用其 §6)
> 下游:子项目 B(检查台账 + 报告骨架)直接消费本子项目产出的子阶段状态、原始响应表和统一采集结果类型,见 §12。

---

## 0. 背景与目标

审计结论(第 0 节第 1、2、4 层):工具现在会**测错对象**、**把失败记成零**、**用错误口径下结论**。具体表现:

- 行业默认值污染了 AI 探针、AIO 与种子词;
- 三个市场选项全部落到美国英文;
- PSI 全空、Reddit 返回 403、CSE 报错,都被记成"已采集"或"0";
- 部分规则与 Google 官方口径冲突,或者会必然误报。

**目标:下一次检测输出的每一个数字都可信**。要么测得对,要么明确标出"没测到"以及原因。

**成功标准**:
1. 品类或市场无效的项目无法启动检测。
2. 每个数据源及其子阶段的状态与实际一致,失败带原因,原始响应可以调取。
3. 失败或为空的数据源不会产出任何发现。
4. 审计中已核实的误报不再出现。
5. 健康分不再给没有数据的支柱打分。

## 1. 已确认的产品决策(用户原话见审计报告 §8)

| 决策 | 内容 |
|---|---|
| 定位 | 功能强大的 SEO + GEO 检测分析工具,终点产物是**优化方案报告**(正文给站主,附录给从业者) |
| 搜索引擎与市场 | 只做 **Google 英文市场**,每个项目选 1 个主市场;不做中文、不做百度 |
| 富媒体 | 指 Google 富媒体搜索结果;正文富文本异常不在范围内 |
| LLM | 暂不引入;判定与报告文字都由确定性规则 + 模板生成 |
| 排名 | 每次检测时的快照 + 与上次对比,不做每日追踪 |
| 实施方案 | 方案一:沿数据流从上游修到下游,把"诚实"写成可测试的契约 |

## 2. 范围

**范围内**:
- 输入层:市场、品类、种子词、向导、建 run 闸门、旧数据迁移
- 采集层:统一结果类型、子阶段状态、原始响应保存、运行前预检、凭据统一
- 规则层:结构化数据口径修正、7 处误报修复、文案与模板修正、健康分诚实化
- 测试:两条铁律测试、回放测试、真实运行验收
- CLAUDE.md 更新建议(需批准)

**范围外**(归属后续子项目):

| 内容 | 归属 |
|---|---|
| 四态检查台账、明细落库、报告重组 | B |
| 逐页字段与逐页规则、抓取参数可配 | C |
| 站型声明、页型持久化、按站型区分的探针模板 | D |
| 结构化数据嵌套校验 v2、Microdata/RDFa、富结果实况 | E |
| E-E-A-T 扩展 | F |
| GSC 趋势与 URL Inspection、Labs 本站排名词、竞品链路其余缺陷(审计 §6 #26–28) | G |
| 中文相关修复(GBK 解码、中文分词) | 不做 |

---

## 3. 设计:输入层

### 3.1 市场表(单一真源)

新建 `lib/markets.ts`,导出 `MARKETS` 常量和 `getMarket(code)`。取不到时抛错,**不回落默认值**。

```ts
export interface MarketSpec {
  code: MarketCode            // 'global-en' | 'us' | 'gb' | 'ca' | 'au' | 'ie' | 'nz' | 'sg' | 'in' | 'za'
  labelZh: string             // 界面显示(中文 UI)
  labelEn: string
  locationCode: number        // DataForSEO / Google Ads 国家码
  languageCode: 'en'
  gscCountry: string | null   // GSC searchAnalytics 的 country 过滤值(ISO 3166-1 alpha-3 小写);global-en 为 null
  ccTlds: string[]            // 向导默认值推断用
}
```

| code | 显示名 | locationCode | gscCountry | ccTLD 推断 |
|---|---|---|---|---|
| global-en | 全球英文(以美国结果代理) | 2840 | null | 其余一切 |
| us | 美国 | 2840 | usa | us |
| gb | 英国 | 2826 | gbr | uk, co.uk |
| ca | 加拿大 | 2124 | can | ca |
| au | 澳大利亚 | 2036 | aus | au, com.au |
| ie | 爱尔兰 | 2372 | irl | ie |
| nz | 新西兰 | 2554 | nzl | nz, co.nz |
| sg | 新加坡 | 2702 | sgp | sg, com.sg |
| in | 印度 | 2356 | ind | in, co.in |
| za | 南非 | 2710 | zaf | za, co.za |

- locationCode 按"2000 + ISO 3166-1 数字码"的规律推出,US=2840、GB=2826 已在现有代码中;**实现时必须用 DataForSEO locations 接口逐个核对**(§9)。
- **消费方统一读这张表**:
  - DataForSEO 主阶段:替换 `lib/dataforseo/locations.ts` 的 `resolveLocation`;
  - AIO:替换 `lib/serp/locations.ts` 的 `resolveAioLocation`;
  - GSC:`querySearchAnalytics` 增加 `dimensionFilterGroups` 国家过滤;
  - 向导下拉框和 ccTLD 推断:替换 `lib/analysis/locale-guess.ts` 的 `guessMarketLanguage`。
  - 两张旧映射表删除。
- `projects.market` 改存 code;`projects.language` 固定写 `'en'`。
- `project_settings.marketLocation` 不再写入(全仓无读取方)。列暂时保留,下次清理迁移时删除。
- GSC 来源的关键词入库时写入项目市场 code(当前写的是 `''`,导致同一个词与缺口词各存一行,见审计 §5.6)。

### 3.2 品类(替换"行业"下拉框)

**含义**:一句英文的产品或服务品类,例如 `document metadata removal tool`。它会被拼进英文 AI 探针问句和 AIO 查询。数据库列名 `industry` 保留,语义改为"品类";TS 类型字段同名,并加注释说明。

**校验器**:`assertValidCategory(text)`,放在 `lib/repositories/validators.ts`,沿用项目手写 assert 的风格,失败时抛错:
- trim 后长度 3–80;
- 正则 `/^[A-Za-z0-9][A-Za-z0-9 &\/,.'()+-]*$/`。这条正则天然排除了中文以及两个旧默认值("B2B SaaS · 项目协作"、"其他…")。

**预填**:新增 `POST /api/site-preview`,只读,不写库。
- 入参 `{ domain }`;出参 `{ title, h1, metaDescription, siteName, candidates: string[] }`。
- 流程:`normalizeDomain` → `assertPublicUrl` → `safeFetch`(沿用 SSRF 守卫)→ 按字符集解码 → linkedom 抽取。
- 候选生成(纯函数 `lib/analysis/category-candidates.ts`):
  1. 把 title 按 `| – — - : · •` 切段,去掉与品牌名(域名二级段或 og:site_name)相同的段;
  2. 加上 H1;
  3. 加上 meta description 的首句(截到 80 字符);
  4. 只保留能通过 `assertValidCategory` 的候选,最多 3 个。
- 抓取失败(超时、非 HTML、4xx/5xx)时返回空候选和 `error` 短码,不抛 5xx。向导照常显示手填框。
- 限制:不用 LLM,无法把站点标语自动归纳成准确品类。候选只是起点,**用户必须点选或编辑后确认**。

### 3.3 种子关键词

重写 `lib/diagnosis/seed-keywords.ts`。仍为纯函数、确定性。

```ts
export type SeedSource = 'manual' | 'gsc' | 'gsc_history' | 'site_phrase'
export interface Seed { text: string; source: SeedSource; lastSeenAt?: string }
export function gatherSeedKeywords(input: {
  manualKeywords: string[]                                   // 用户目标词
  gscQueries: { keyText: string; impressions: number }[]     // 本期 GSC
  historicalGsc: { keyText: string; lastSeenAt: string }[]   // keywords 表 source='gsc',不含本期已出现的
  sitePhrases: string[]                                      // 站点关键短语
  brand: string
  aliases: string[]                                          // 品牌别名同样用于去品牌
  limit: number
}): Seed[]
```

- **优先级**:manual → 本期 gsc(按展示量降序)→ gsc_history(按 lastSeenAt 降序)→ site_phrase。
- **lastSeenAt 的取值**:该词最近一条 `keyword_metrics` 所属 run 的 `started_at`;没有 metrics 时取 `keywords.created_at`。
- **去品牌、去重、截断**:沿用现有逻辑;品牌别名也参与去品牌。
- **探针问句不再作为种子**:删除 `promptTexts` 参数。
- **站点关键短语**:取所有已抓 2xx HTML 页的 title(排除 `isUtilityPage` 判定的法律、联系等功能页)和深检页的 H1,按 3.2 的分隔符切段、去品牌,保留 2–6 个英文词的短语,转小写。纯函数 `lib/diagnosis/site-phrases.ts`。
- **目标关键词**:向导第 1 步新增可选多行输入,每行一个,最多 20 个,每个通过 `assertValidCategory` 同款字符校验。存入 `keywords` 表,`source='manual'`,市场为项目 code。
- **种子写入证据**:seed_serp 证据的 `request` 中记录每个种子的 `{ text, source }`,报告可以说明种子来源。
- **种子为空时**:只有依赖种子的子阶段(`seed_serp`、`labs`)记为 `not_attempted`,原因 `no_seeds`;`backlinks`、`bing_index`、`brand_serp` 照常执行。这修复了 `collect-stage.ts:65` 提前 return 导致整体静默跳过的问题。

### 3.4 向导改动(`components/NewAnalysisForm.tsx` 第 1 步)

- 输入网址失焦或防抖结束后调用 `/api/site-preview`。品类输入框上方显示候选芯片和站点 title/H1/description 原文。
- **品类**:必填文本框,前端用同一个校验器给出即时提示。
- **市场**:下拉框 10 项,默认值由 ccTLD 推断。
- **目标关键词**:可选的多行文本。
- **竞品**:保持不变(竞品入库问题归 G)。
- **语言**:不再推断,固定为 `en`。
- 所有文案走 next-intl,在 `messages/zh.json`、`en.json` 中**以文本级插入**新增 key。

### 3.5 建 run 闸门

在 `POST /api/runs` 中,`getProject` 之后:

- `assertValidCategory(project.industry)` 不通过 → 422 `{ error: 'category_required' }`;
- `getMarket(project.market)` 取不到 → 422 `{ error: 'market_required' }`。
- 项目页的"重新分析"按钮、向导提交收到这两个错误码时,跳转到向导第 1 步并定位到对应字段。

**实现时更正(2026-10-04)**:`analysis-sessions` 流程**也会创建 run**(`POST /api/analysis-sessions`、`PATCH /api/analysis-sessions/[id]`),另外 `POST /runs/[id]/retest` 与 `/runs/[id]/retry` 也会派发采集。闸门已抽成 `lib/runs/gate.ts`,五个入口共用:
- 两个 runs 入口(retest、retry)遇到无效值直接返回 422;
- 两个会话入口遇到无效值时,把会话退回 `waiting_input`,并把 `industry`/`market` 加入 `missingFields`,复用现有的补充输入界面;会话补充的合规值会覆盖项目上的无效旧值。

### 3.6 旧数据迁移

新增 drizzle 迁移,只改数据,不改结构:
- `projects.market`:`'English · Global'` → `'global-en'`;其余值(`'中文 · 中国大陆'`、`'东南亚'` 及中英文变体、空串)→ `''`。
- `projects.industry`:不能通过新校验器的值 → `''`。由于 SQL 难以表达这个正则,迁移只清掉已知的两个旧默认值及其英文变体;其余不合规的值由 3.5 闸门在下次运行时拦截。
- `projects.language` → `'en'`。

---

## 4. 设计:采集层

### 4.1 统一采集结果类型

新增 `lib/collection/result.ts`:

```ts
export interface RawResponse { status: number; contentType: string | null; body: string }
export type CollectResult<T> =
  | { ok: true; value: T; raw: RawResponse | null }
  | { ok: false; httpStatus: number | null; reason: string; raw: RawResponse | null }
```

- **适用范围**:`fetchPageSpeedInsights`、`checkThirdPartyPresence`(Wikipedia 与 Reddit 各自独立返回)、`checkSocialPresence`(按平台独立返回)、DataForSEO client(新增 `requestRaw`,在保留解析结果的同时返回原文)。
- **失败判定**:
  - 非 2xx;
  - JSON 解析失败;
  - DataForSEO 信封或任务级 status_code 非 2xx。注意:`40102` 表示"零结果",是测量值,不算失败(见项目陷阱 `trap-dataforseo-live-batch`);
  - **PSI 返回 2xx,但 Lighthouse 性能分与 CrUX 指标全为 null**,记为 `ok:false, reason:'empty_result'`。
- **失败时不写证据行**,只写数据源状态(4.2)和原始响应(4.3,保存错误响应体,便于复核)。

### 4.2 子阶段状态

`data_source_statuses` 表结构不变。子阶段使用 `父键:子键` 形式的 `source_key`(冒号分隔,避免与 next-intl 的点号嵌套路径冲突):

| 父键 | 子键 |
|---|---|
| `dataforseo` | `dataforseo:seed_serp`、`dataforseo:labs`、`dataforseo:backlinks`、`dataforseo:bing_index`、`dataforseo:brand_serp` |
| `third_party` | `third_party:wikipedia`、`third_party:reddit` |
| `social_presence` | `social_presence:youtube`、`social_presence:g2`、`social_presence:trustpilot`、`social_presence:capterra` |
| `psi` | (单阶段,不拆) |

- **子阶段**:各自记录 `status`、`captured_evidence_count`、`failure_reason`(短码 + HTTP 状态,例如 `http_403`、`empty_result`、`task_40101`、`no_seeds`)。
- **父级汇总**:新纯函数 `lib/runs/source-status.ts` 的 `aggregateParentStatus(children)`:
  - 全部 `collected` → `collected`;
  - 存在 `collected` 且存在失败或未尝试 → `partial`;
  - 全部失败 → `failed`;
  - 全部未尝试 → `not_attempted`。
  - 替换 `collect-evidence.ts:836` 无条件写 `collected` 的做法。
- **报告合同**(`lib/diagnosis/report.ts`)按前缀把子阶段挂到父级下;`gaps` 列出非 `collected` 的子阶段。
- **界面标签**:i18n 新增 `contract.subSourceLabel.<父键>_<子键>`(例如 `dataforseo_seed_serp`)。

### 4.3 原始响应表

新表 `evidence_raw`,附迁移:

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | `raw_${uuid}` |
| run_id | text FK → runs(cascade) | |
| evidence_id | text FK → evidence_artifacts(cascade),可空 | 失败响应没有证据行,为空 |
| source_key | text | 与 4.2 的键一致 |
| http_status | integer | |
| content_type | text | |
| encoding | text | 固定 `'gzip'` |
| content | blob | gzip 后的原文 |
| byte_length | integer | 原文字节数 |
| sha256 | text | **原文**的 sha256 |
| created_at | text | |

- **覆盖范围**:DataForSEO(每个任务一行)、PSI、Wikipedia、Reddit、CSE。页面 HTML(page_fetch / render)与 AIO 已经存原文,不变。
- **对应证据的 `raw_hash`**:改为原文 sha256,同时提升相关解析器的版本号。
- **读取方式**:按需读取。新增 `GET /api/evidence/[id]/raw`(按证据 id 读取并解压)和 `GET /api/runs/[id]/raw/[rawId]`(读取失败响应)。诊断上下文**不加载**这张表。
- **大小**:单行上限设为压缩后 4MB,超过时只保留前 4MB 并标记 `truncated`;是否需要分块,取决于实现前核实的 Turso 行大小限制(§9)。粗估每次检测新增 1–3MB(压缩后)[假设]。
- 删除项目时按外键级联删除(满足 CLAUDE.md 的级联删除铁律)。

### 4.4 第三方与 CSE 采集器的语义修正

- **Wikipedia**:
  - "有词条"改为:用 MediaWiki API `action=query&titles=<候选>&redirects=1&prop=pageprops` 精确匹配标题,页面存在且 `pageprops` 中不含 `disambiguation` 才算有。
  - 候选 = 品牌名(首字母大写)+ 品牌别名,最多 4 个。
  - 不再使用"全文搜索有任意结果就算存在"的判定。
- **Reddit**:接口不变;非 2xx 时记为失败,不再返回 0。Reddit 匿名接口可能长期返回 403 [转述],A 只负责如实上报,不做绕过。替代数据源留到 F/G 再定。
- **G07** 只消费状态为 ok 的子结果,判定如下:

  | Wikipedia | Reddit | G07 结果 |
  |---|---|---|
  | ok,有词条 | 任意 | null(判定为不缺失) |
  | ok,无词条 | ok | 按原阈值判定 |
  | ok,无词条 | 失败 | null(无法判定,由 B 显示"未检查") |
  | 失败 | 任意 | null(无法判定) |
- **CSE**:每个平台独立判定 ok 或失败;SP01/SP02 只对 ok 的平台下结论。

### 4.5 运行前预检

- **纯逻辑**放在 `lib/runs/preflight.ts`:输入各数据源的探测结果,输出预检项清单。
- **路由** `POST /api/projects/[id]/preflight` 负责实际探测。

```ts
export type Dimension = 'eeat' | 'content' | 'structured_data' | 'site_type' | 'rich_results'
  | 'rankings' | 'keywords' | 'technical' | 'geo' | 'competitors' | 'backlinks'
export interface PreflightItem {
  source: string                       // 与 4.2 的父键一致
  state: 'ready' | 'degraded' | 'unavailable'
  reason: string | null                // 短码:gsc_token_invalid / gsc_site_missing / dfs_auth_failed / psi_no_key / render_not_configured / ai_memory_only / category_invalid / market_invalid ...
  affects: Dimension[]                 // 这一项不可用时,哪些维度无法评估
  fix: { action: 'reauth_gsc' | 'select_gsc_site' | 'configure_key' | 'edit_project'; href: string } | null
  detail?: Record<string, unknown>     // 例如 DataForSEO 余额、已配置的 AI 引擎列表
}
```

| 数据源 | 探测方式 | 状态判定 |
|---|---|---|
| gsc | 实际刷新一次 token | 未连接、刷新失败或未选站点 → unavailable,并给出对应 fix |
| dataforseo | 解析凭据(4.6),调用一次免费的账户信息接口(具体端点实现前核实,§9) | 无凭据或 401 → unavailable;网络错误 → degraded |
| psi | 是否配置了 `PAGESPEED_API_KEY` | 无 key → degraded(`psi_no_key`,匿名调用可能被限流) |
| render | 渲染提供方是否已配置 | 未配置 → unavailable |
| ai_probe | 已配置哪些引擎、是否带联网检索 | 只有记忆型引擎(如 DeepSeek)→ degraded(`ai_memory_only`,影响引用类规则) |
| project | 品类与市场 | 无效 → unavailable,并**阻断**运行 |

**各数据源影响的维度**:
- `gsc`:rankings、keywords
- `dataforseo`:keywords、competitors、backlinks、geo
- `psi`:technical
- `render`:technical、structured_data
- `ai_probe`:geo
- `crawl`:technical、content、eeat、structured_data、site_type(恒为 ready)

**界面与写入时机**:
- 向导第 2 步展示预检结果,文案示例:"本次无法评估:关键词与排名(原因:GSC 授权失效)[重新授权]"。
- `POST /api/runs` 内部同步执行同一预检。品类或市场无效时返回 422;其余不可用项写入 `data_source_statuses`,状态为 `not_attempted`,`failure_reason` 记为 `preflight:<reason>`。采集流水线随后会对同一行做 upsert。
  - **实现偏离(2026-10-04,见实现笔记 Task 14)**:建 run 时只做品类与市场闸门,不重复执行网络预检,也不预写 `not_attempted`。理由:采集流水线本来就会如实写出 failed 与原因,建 run 时重复探测只会拖慢创建,不增加信息。
- 除品类与市场外,预检**不阻断**运行,带着缺口照常检测。

### 4.6 凭据统一

- 新增 `lib/credentials/dataforseo.ts`,提供 `resolveDataforseoCredentials()`:先查数据库(`provider_credentials`,键为 `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`,解密后取值),取不到再回落 env。
- 以下各处统一走这个函数:DataForSEO 主阶段、AIO、预检、设置页状态。
- `isDataforseoConfigured()` 改为基于这个函数的结果。修复审计 §6 #34:设置页里填写的凭据目前对主阶段不生效。

### 4.7 本地环境(写进操作手册 `docs/runbooks/local-env.md`,不改代码)

- **重建本地库**:当前只执行了 11/15 个迁移,`evidence_type` 的 CHECK 约束缺 `social_presence`。备份 `veris.db` 后,重新执行 push 与 seed。
- **固定 dev 端口**:例如 `next dev -p 3100`,并把 `GOOGLE_OAUTH_REDIRECT_URI` 与 Google Cloud 控制台的回调地址改成一致(**需要用户在控制台操作**)。
- **PSI**:在 `.env.example` 中补上 `PAGESPEED_API_KEY` 的说明。

---

## 5. 设计:规则层

### 5.1 结构化数据口径(按 Google 现行文档修正;嵌套对象的完整校验留到 E)

改动 `lib/diagnosis/schema-vocab.ts`,为每个类型增加 `oneOf` 字段(取值为字段组的数组):

| 类型 | required | oneOf | recommended(节选) |
|---|---|---|---|
| Article / NewsArticle / BlogPosting | — | — | headline, image, datePublished, dateModified, author |
| Product(商品摘要口径) | name | [review, aggregateRating, offers] | image, brand, sku, gtin, description |
| SoftwareApplication(新增) | name, offers.price | [aggregateRating, review] | applicationCategory, operatingSystem |
| LocalBusiness(新增,含子类型) | name, address | — | telephone, openingHoursSpecification, url, geo |
| VideoObject | name, thumbnailUrl, uploadDate | — | description, contentUrl, embedUrl, duration |
| JobPosting | title, description, datePosted, hiringOrganization | jobLocation 或 jobLocationType=TELECOMMUTE(二选一) | validThrough, baseSalary |
| 其余已有类型 | 保持不变,实现时逐个核对 Google 文档(§9) | | |

- `offers.price` 只额外下钻**一层**做存在性检查(取 offers 本身,或数组中的第一个 Offer)。完整的嵌套校验留到 E。
- **C05c 拆成两个发现**:
  - Google 要求的字段(或三选一)缺失 → warning / measured_hard,标题"不符合 Google 富媒体结果要求";
  - 推荐字段缺失 → notice / measured_hard,标题"缺少 Google 推荐字段"。
  - 两者描述都写明**页面 URL、类型、缺失字段**;删除"富摘要无法生成"这一表述。
  - 两者使用各自独立的 fingerprint scope(`schema:required` / `schema:recommended`)。
- **C05b 修正 @graph 误报**:`entityRoots` 展开 @graph 时,让子节点继承外层块的 @context 后再校验。
- **自家修复模板**:`templates.ts` 中的 `JSONLD_SNIPPET` 已经合规(name + offers),修改后的词表不应再对它报警;为此补一条测试。

### 5.2 误报修复

| # | 规则 | 修改 |
|---|---|---|
| 1 | T14 | 按 BCP 47 子集校验:`语言(ISO 639-1)[-文字(4 字母)][-地区(ISO 3166-1 alpha-2)]`,另允许 `x-default`。`en`、`uk`(乌克兰语)、`eu`(巴斯克语)合法;`en-uk` 判错,提示应为 `en-gb`。代码表内置并注明来源 |
| 2 | T01 | 入口页或重点页被禁抓 → error(原标题);只有其他 URL 被禁抓 → notice,标题"robots.txt 禁抓了 N 个 URL",列出前 10 条路径,提示确认是否有意为之 |
| 3 | T08 | 只统计会加载资源的元素:img/script/iframe/video/audio/source/embed/object 的 src、srcset 中的每一项、`link[rel~=stylesheet\|preload\|modulepreload\|icon\|manifest]` 的 href。不计 `a[href]` 与 `link[rel=canonical\|alternate\|profile\|pingback]` |
| 4 | G01 | `Google-Extended` 移出 `SEARCH_CRAWLER_UAS`,归为"训练与使用控制令牌"。屏蔽它不报错,至多记一条信息;口径实现前对照 Google 文档核实(§9) |
| 5 | C10 | 新增 `lightCheckExtra.textHash`:去掉 script/style/noscript/template/svg 后的可见文本,压缩空白后取 sha256。C10 改用它,并排除 `redirected=true` 的行和 finalUrl 相同的重复行;文案改为"正文文本完全相同"。原 `contentHash` 保持整页 HTML 的语义不变,其他消费方不受影响 |
| 6 | C03 | "H1 与 title 完全相同"降为 notice / hypothesis,措辞改为"可考虑差异化表达,这不是错误";缺失或多个 H1 仍为 warning |
| 7 | K03 | `keyword-gap.ts` 的 `normDomain` 先用 URL 解析取 hostname,再去掉 www。测试数据使用 `normalizeDomain()` 的真实输出 |

### 5.3 文案与建议模板

- **"n=5"改为实际 n**:G05/G06/G09/G11 中写死的"n=5",改为读取 `RuleContext.probe.samplesPerPrompt`。
  - 计算方式:按引擎分别算"该引擎结果条数 ÷ prompt 数",取各引擎中的最小值。
  - 文案示例:"每条问题每个引擎采样 n=1,结果仅供参考方向"。
- **补 7 条 GEO 规则的专属模板**:G02、G05、G06、G07、G09、Q02、G08。
  - `RecommendationTemplate` 新增 `recordOnly?: true`;`recommend.ts` 遇到 recordOnly 时**不生成建议**。
  - G08(llms.txt 仅记录)标为 recordOnly。
- **统计卡改名**:"结构化数据覆盖"改为"入口页结构化数据类型数"。只改 i18n 文案,以文本级插入方式修改。

### 5.4 健康分诚实化

修改 `lib/diagnosis/pillars-with-data.ts`:

- 签名改为 `pillarsWithData(evidence: { type: string; usable: boolean }[], confirmedCompetitorCount)`。
  - `usable` = 该证据所属数据源(子阶段)状态为 `collected`,且 payload 非空。
  - 由于 4.1 已规定"失败不写证据",`usable` 主要用于防御历史数据。
- **删除 `findingPillars` 参数**:不再因为"有发现"就让支柱入分。
- 两个调用方同步修改:`app/api/runs/[id]/report/route.ts` 与 `components/ReportView.tsx`。
- **已知副作用**:K05(品牌词 SERP,属于 P3)在 P3 未评分时仍会作为发现显示,只是不计入分数。按检查完成度评分由 B 实现。

### 5.5 规则版本

- `RULES_VERSION` 升为 `rules_v10`,所有口径变化记入 changelog。
- 回测跨版本时,沿用现有的"跨版本横幅"机制。

---

## 6. 错误处理与降级

| 场景 | 行为 |
|---|---|
| 品类或市场无效 | 建 run 返回 422,界面引导修改,不产生任何外部调用 |
| 站点预读失败 | 候选为空,返回 `error` 短码,允许手填 |
| GSC 刷新失败 | 预检提示重新授权;运行继续,GSC 状态为 failed;依赖 GSC 的规则不运行 |
| DataForSEO 任一子阶段失败 | 该子阶段状态为 failed 并带原因,保存错误响应原文;其余子阶段继续;父级状态为 partial |
| PSI 非 2xx 或全空 | 不写证据;状态为 failed(`http_xxx` 或 `empty_result`);T09 不运行;P1 不因 PSI 入分 |
| Reddit/Wikipedia/CSE 失败 | 对应子阶段为 failed;依赖规则返回 null |
| 原始响应超过 4MB | 截断并标记 truncated;不影响证据写入 |
| 种子为空 | `seed_serp` 与 `labs` 为 not_attempted(`no_seeds`);其余子阶段照常 |

---

## 7. 测试策略

1. **铁律测试一:失败不出结论。** 新文件 `lib/inngest/collect-evidence.failure-matrix.test.ts`。
   - 对每个采集器注入失败:403 / 429 / 500 / 超时 / 非 JSON / 空结果 / DataForSEO 任务级错误。
   - 跑完"采集 → 上下文 → 全部规则"后断言:
     - 对应子阶段状态为 failed,且带原因;
     - 不存在 evidenceRefs 指向失败来源的发现;
     - 不存在依赖该来源、类型为 measured_* 的发现。
2. **铁律测试二:测试数据取真实形态。** 新文件 `lib/test-fixtures/real-shapes.ts`,导出:
   - `normalizeDomain('metadocu.com')` 的真实输出;
   - 市场表中的全部 code;
   - Yoast 式单块 `@graph` JSON-LD;
   - 脱敏后的真实 DataForSEO 响应(seed_serp / labs / backlinks / 任务级 40101);
   - PSI 成功样本与 429 样本;
   - Reddit 403 样本。

   本子项目新增或改动的规则与采集测试,必须使用这些形态。
3. **回放测试**:把 metadocu `run_d12cceaf` 的证据导出为脱敏夹具,用修复后的上下文和规则重新求值,断言:
   - C05c 不再出现"无法生成",改报 Article 推荐字段缺失;
   - SoftwareApplication 缺 aggregateRating/review 时被报出;
   - `hreflang="en"` 不再判错;
   - P3 未评分;
   - G05 文案中的 n 等于实际样本数。
4. **单元测试**:市场表(三处消费方读到的是同一份配置)、品类校验器、候选生成、种子优先级与来源标签、站点短语提取、父级状态汇总、预检纯逻辑、T14 代码表、T08 计数、C10 textHash、K03 域名归一。
5. **门禁**:`pnpm test`、`pnpm lint`、`pnpm build` 全部通过,tsc 零错误。
6. **真实运行验收(人工,结果写进实现笔记)**:在 metadocu 上以品类 `document metadata removal tool`、市场 `global-en` 实跑一次,检查:
   - 30 条探针问句中不再出现旧默认品类;
   - 种子带来源标签,不含问句;
   - 竞品候选不再是项目管理类 SaaS(人工核对);
   - 每个子阶段的状态与原始响应一致;
   - **每条发现都用 curl 或浏览器独立复核**,按"真且可操作 / 真但价值低 / 误报"三档计数。

## 8. 验收标准(A 完成的定义)

- [ ] 品类或市场无效时无法启动检测,界面能引导修改
- [ ] 探针、AIO、种子都使用确认后的品类与市场;三处市场映射来自同一张表
- [ ] 每个数据源及子阶段的状态如实;失败带原因;DataForSEO / PSI / 第三方 / CSE 的原始响应可以调取
- [ ] 两条铁律测试通过
- [ ] §5.2 的 7 处误报都有回归测试且通过;§5.1 的口径与 §9 核实后的 Google 文档一致
- [ ] 健康分不再给无数据的支柱打分;回放中 P3 显示"未评分"
- [ ] 全量门禁通过
- [ ] 真实运行验收完成,误报计数为 0;若有误报,修复后重跑

## 9. 实现前或实现中必须核实的事项(不得凭记忆写死)

1. DataForSEO 中 10 个市场的 location_code:用 locations 接口核对。
2. DataForSEO 免费账户信息接口(余额)的端点与响应形态。
3. Turso / libSQL 的单行(blob)大小上限,决定是否需要分块。
4. GSC searchAnalytics 国家过滤的取值格式(是否为 ISO 3166-1 alpha-3 小写)。
5. Google 文档中 SoftwareApplication、LocalBusiness、VideoObject、JobPosting、Recipe、Event、Review、AggregateRating、Course、Organization 的现行要求。核对后把来源 URL 与日期写进 `schema-vocab.ts` 注释和 `reference_artifacts`(其中 `google_rich_result_status` 将于 10-06 过期)。
6. Google-Extended 的官方定义。
7. MediaWiki `action=query` 的精确标题匹配与 disambiguation pageprop 的实际行为。
8. PSI 的 429 / 500 响应形态。

## 10. 风险与取舍

- **原始响应会让库变大**:粗估每次检测增加 1–3MB(压缩后)[假设]。保留策略留待后续。
- **闸门会拦住旧项目**:靠预填与跳转引导来缓解;迁移会清空已知的错误默认值。
- **新站种子可能很少**:没有 GSC、title 质量又差的新站,种子会变少。会如实标记 `no_seeds`,并鼓励用户填写目标词;这比用问句当种子更诚实。
- **Wikipedia 漏判**:精确标题匹配可能漏掉多词品牌。用品牌别名缓解;文案如实写成"未找到与品牌名或别名同名的词条"。
- **Reddit 可能长期 403**:G07 将长期显示"未检查"(在 B 上线后可见)。需要替代数据源,留到后续决策。
- **规则版本变化**:rules_v10 的口径变化,会让与 v9 运行的回测对比出现跨版本差异,沿用现有横幅提示。

## 11. 附:CLAUDE.md 更新建议(需用户批准后才改)

- "Project status: pre-implementation" 改为"已实现、正在迭代",并指向审计报告与子项目 A–G。
- 范围:只做英文 Google 市场;DataForSEO 在范围内(BYOK);排名只做快照与对比,不做每日追踪;诊断暂不使用 LLM。
- 删除"V0 不做 DataForSEO"等与现状矛盾的表述。

## 12. 与后续子项目的接口

- **B(检查台账)**:
  - 消费 4.2 的子阶段状态(含 `preflight:` 前缀的原因),以及 4.5 的 `PreflightItem.affects`,用来判定"未检查"及其原因;
  - 消费 `evidence_raw`,实现证据下钻;
  - 消费 5.1 中 C05c 拆分后的 scope。
- **C(逐页审计)**:复用 4.1 的结果类型与 4.3 的原始响应表。
- **D(站型)**:复用 3.1 的市场表与 3.2 的品类字段;按站型区分的探针模板在 D 中实现。
- **G(排名与关键词)**:复用 3.3 的种子来源与 keywords 表中的 manual 词;GSC 的国家过滤已在 A 中接通。
