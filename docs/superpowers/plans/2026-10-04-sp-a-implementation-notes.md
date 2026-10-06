# 子项目 A 实现笔记

> 计划:`docs/superpowers/plans/2026-10-04-sp-a-trustworthy-foundation.md` · 设计:`docs/superpowers/specs/2026-10-04-sp-a-trustworthy-foundation-design.md`
> 执行方式:主会话直接按计划实现;每一波结束后由只读代理独立审查。**不提交 git**(工作区原有 139 处他人未提交改动)。
> 基线(2026-10-04 12:19):`pnpm test` 共 183 个测试文件、1662 个用例,全部通过。

## Task 1:市场表与三处消费方接线

**外部常量核实**:
- DataForSEO `GET /v3/dataforseo_labs/locations_and_languages`(真实凭据,cost 0)返回的 location_code:US 2840、UK 2826、CA 2124、AU 2036、IE 2372、NZ 2554、SG 2702、IN 2356、ZA 2710。与计划一致,9 国均提供 `en`。[观测]
- GSC 的 searchanalytics.query 文档写明 country 过滤值是 ISO 3166-1 alpha-3,未说明大小写。我按 GSC 返回值的写法取小写 [假设],首次真实 GSC 运行时复核:如果加过滤后返回 0 行而不加过滤有数据,就改成大写。

**改动文件**:
- 新增:`lib/markets.ts`、`lib/markets.test.ts`
- 删除(git 已跟踪、工作区内未改动,可从 HEAD 恢复):`lib/dataforseo/locations.ts`、`lib/serp/locations.ts`、`lib/serp/locations.test.ts`
- 修改:
  - `lib/gsc/search-analytics.ts` 及其测试:新增 `country` 参数
  - `lib/dataforseo/collect-stage.ts` 及其测试:市场表接线
  - `lib/inngest/collect-evidence.ts` 及其测试:新增 `load-project` 步骤;GSC 查询带国家过滤;GSC 关键词写入市场 code,语言写 en;AIO 改用 `findMarket`;语言回退值改为 en
  - `lib/probes/run-probes.ts` 及其测试:语言回退值改为 en

**偏离计划的决定**:
- `locale-guess.ts` 的删除推迟到 Task 6。它唯一的调用方(向导)在 Task 6 才改,现在删会导致编译失败。
- 市场未映射时,AIO 的跳过原因沿用现有短码 `market_not_mapped`(计划里写的是 `market_unmapped`),以减少改动面。
- DataForSEO 阶段查不到市场时,暂时整体不采集、不报错;由 Task 13 改为逐个子阶段如实记录 failed。

**TDD 记录**:
- `collect-stage` 的两条市场测试写在实现之后。补救做法:临时还原旧实现,确认"未知市场不发请求"这一条在旧实现下失败,再恢复新实现。gb 那条在新旧实现下都能通过,只起一致性守护作用。
- `run-probes` 的语言回退测试:在旧值 'zh' 下失败,改为新值 'en' 后通过。

## Task 2:品类校验器与候选提取
- 新增:`lib/analysis/category-candidates.ts` 及其测试
- 修改:`lib/repositories/validators.ts` 及其测试(新增 `isValidCategory`、`assertValidCategory`、`isValidKeyword`)
- 测试先跑红、再变绿:新增 13 个用例,全部通过。

## Task 3:站点预读接口
- 新增:`lib/analysis/site-preview.ts` 及其测试;`app/api/site-preview/route.ts` 及其测试
- 修改:`lib/crawl/light-check.ts`,只给 `readBodyLimited` 加了 `export`
- **测试本身的错误**:字符串 body 构造的 `Response` 会自动带上 `text/plain`,模拟不出"缺 content-type"的情况。改用字节 body 构造,并在测试里断言该响应头确实为 null。
- 路由测试的验证方式:先临时移走 route 文件,看到测试变红,再放回来。

## Task 4:种子词重写
- 新增:`lib/diagnosis/site-phrases.ts` 及其测试
- 重写:`lib/diagnosis/seed-keywords.ts` 及其测试
- 修改:
  - `lib/repositories/index.ts`:新增 `getManualKeywords`、`getGscKeywordHistory`。`runs.started_at` 为空时用 `finished_at`;SQLite 的 `current_timestamp` 统一转成 ISO 格式。
  - `lib/repositories/keywords.repo.test.ts`
  - `lib/inngest/collect-evidence.ts` 的 `dfs-gather-seeds` 步骤及其测试
  - `lib/dataforseo/collect-stage.ts`:`seeds` 改为 `Seed[]`;seed_serp 证据的 request 里带上 seeds;请求 DataForSEO 时只传 text。同时修改其测试。
- **tsc 抓到的真实缺陷**:调用 `getRunSitePages` 时漏传了 projectId。原测试的 mock 不检查入参,所以照样通过;运行时会查不到任何页面,站点短语静默变空。
  - 修法:把 mock 改为只有入参正确时才返回页面。先在缺陷代码上确认测试变红,修复后变绿。

## Task 5:建 run 闸门与项目接口校验
- 新增:
  - `lib/runs/gate.ts` 及其测试(`runGateError`、`resolveSessionRunGate`)
  - `lib/projects/input.ts`(`parseProjectTargeting`,供 POST 与 PATCH 共用)
  - `app/api/projects/[id]/route.test.ts`、`app/api/analysis-sessions/route.test.ts`(用真库 bootstrap)
- 修改:
  - `app/api/runs/route.ts`、`app/api/runs/[id]/retest/route.ts`、`app/api/runs/[id]/retry/route.ts`,以及这三处的测试
  - `app/api/analysis-sessions/route.ts`、`app/api/analysis-sessions/[id]/route.ts`
  - `app/api/projects/route.ts` 及其测试、`app/api/projects/[id]/route.ts`
  - `lib/repositories/index.ts`:新增 `replaceManualKeywords`
  - `lib/repositories/keywords.repo.test.ts`
- **对 spec 的更正**:原文说 analysis-sessions 不建 run,这是错的。实际上它和 retest、retry 一样会建 run 或派发采集。现在 5 个入口共用同一个闸门(spec §3.5 已就地更正)。
- 确认 `marketLocation` 没有任何读取方:grep 只命中我自己写的注释(这次命中本身就是阳性对照)。

## Task 6:向导第 1 步改造与市场显示
- **向导** `components/NewAnalysisForm.tsx` 及其测试(26 个用例):
  - 品类改为输入框 + 候选按钮(不自动填,点击才填入);市场下拉 10 项(按 ccTLD 给默认值,用户改过就不再覆盖);新增目标关键词 textarea。
  - 品类或关键词不合规时,"下一步"禁用;建 run 返回 422 `category_required`/`market_required` 时回到第 1 步。
  - 站点预读防抖 500ms,用 AbortController 中止过期请求。预读结果带上 `forDomain`,渲染时只展示与当前域名一致的那份(lint 的 `set-state-in-effect` 抓到我原先在 effect 里同步清空 state,已改为这种写法)。
- **i18n**(文本级编辑,每处都断言唯一命中,并用 json.loads 校验文件合法):
  - `screen1` 新增 12 个 key,`marketLabel` 改为"目标市场",`scopeIndustry` 改为"品类";删除 `industryLabel`、`industryOptions`、`marketOptions`;新增 `errorCategoryRequired`、`errorMarketRequired`。
  - 另新增 `projects.marketUnset`、`retest.needsSetup`、`screen2.run.retryNeedsSetup`。
  - 注意:messages 文件里本来就有他人未提交的改动,所以 `git diff` 无法单独看出我的改动范围;改动的正确性靠"断言唯一命中 + 只替换目标块"来保证。
- **市场显示**:新增 `lib/markets.ts` 的 `marketLabel` 及测试;`app/[locale]/projects/page.tsx`、`app/[locale]/page.tsx` 改为显示市场名,值无效时显示"未设置"。
- **会话表单** `app/[locale]/sessions/[id]/SessionInputForm.tsx` 及其新测试:`industry` 字段改为英文品类输入并做校验;`market` 改为 10 项下拉,默认全球英文。该文件原本就用 isZh 内联中英文,为保持一致沿用这一风格,未改成 next-intl。
- **回测/重试被闸门拒绝时的引导**:
  - retest/retry 返回的 422 带上 `projectId`;`RetestButton` 新增 needsSetup 状态,链接到 `/new?projectId=`,文案可选,缺省时回落到 error 文案。
  - `RunProgress` 的重试改为相同处理。
  - needsSetup 文案已接入 4 个调用方:projects 页、项目详情页、RunHistory、RetestPlanCard。
- 删除 `lib/analysis/locale-guess.ts` 及其测试(git 已跟踪、工作区未改动)。
- **门禁**:tsc 0 错误;本任务涉及文件的 eslint 0 错误(另有 2 条 warning,在别人未提交的 `app/api/recommendations/[id]/route.test.ts` 里,不属于本次改动);相关测试 377 个全部通过。
- **延后处理**:向导右侧的预估仍按"20 条 prompt × n=5"计算,而实际是 30 条 prompt,n 取 env/设置的值。这和本次改动无关,但同样是数字不实,记入延后清单。

## Task 8:统一采集结果类型与父级状态汇总
- 新增 `lib/collection/result.ts`(`CollectResult`、`okResult`、`failResult`、`readRaw`、`reasonOf`)和 `lib/runs/source-status.ts`(`subSourceKey`、`parentOf`、`aggregateParentStatus`),两个文件都配了测试,共 12 个用例。
- `reasonOf` 用"鸭子类型"判断 DataforseoTaskError(看 name 和 statusCode),没有 import client。原因是 client 要 import `readRaw`,两边互相 import 会形成循环依赖。

## Task 9:原始响应表
- spec §9 #3 的核实结论 [转述]:SQLite/libSQL 单个值最大 1GB;Turso Cloud 的限制在整库大小(随套餐可配)。所以单行压缩后 4MB 的上限不需要分块存储,要关注的只是整库体积。

## Task 16：结构化数据口径

### Google 文档核对（2026-10-04，WebFetch 逐页读取）

| 类型 | 文档页 | 页面"最后更新" | Required | 至少一项 | Recommended（摘要） |
|---|---|---|---|---|---|
| Article / NewsArticle / BlogPosting | article | 2026-09-08 | 无（原文 "There are no required properties"） | — | author(.name/.url)、dateModified、datePublished、headline、image |
| Product（商品摘要） | product-snippet | 2026-09-08 | name | review / aggregateRating / offers | Offer：price 或 priceSpecification.price；AggregateOffer：lowPrice；image **不是**必填 |
| Product（商家listing） | merchant-listing | 页面未显示 | name、image、offers（price/priceSpecification.price + priceCurrency） | — | aggregateRating、brand.name、description、sku、availability… |
| SoftwareApplication | software-app | 2026-09-08 | name、offers.price（免费填 0） | aggregateRating / review | applicationCategory、operatingSystem；原文同时支持 MobileApplication、WebApplication；只有 VideoGame 类型不出结果 |
| LocalBusiness | local-business | 2026-09-08 | address、name | — | geo、openingHoursSpecification、priceRange、telephone、url；aggregateRating/review 仅限收录他人商家评价的站点 |
| VideoObject | video | 2026-09-24 | name、thumbnailUrl、uploadDate | — | description（推荐，非必填）、contentUrl、embedUrl、duration… |
| JobPosting | job-posting | 2026-09-08 | datePosted、description、hiringOrganization、title、jobLocation（例外：有 applicantLocationRequirements 时可省） | — | validThrough、baseSalary、employmentType… |
| Recipe | recipe | 2026-09-08 | image、name | — | author、datePublished、description、recipeIngredient、recipeInstructions、totalTime… |
| Event | event | 2026-09-08 | location、name、startDate | — | description、endDate、eventStatus、image、offers、organizer… |
| Review | review-snippet | 2026-09-08 | author、itemReviewed（嵌套时可省）、reviewRating.ratingValue | — | datePublished、reviewRating.bestRating/worstRating |
| AggregateRating | review-snippet | 2026-09-08 | itemReviewed（嵌套时可省）、ratingValue | ratingCount / reviewCount | bestRating、worstRating |
| Course（课程列表） | course | 2026-09-08 | description、name | — | provider；功能仍在支持 |
| Organization | organization | 2026-09-08 | 无（原文 "There are no required properties"） | — | name、url、logo、sameAs、description、address、contactPoint… |
| BreadcrumbList | breadcrumb | 2026-09-08 | itemListElement（ListItem：position、name、item〔末项可省〕） | — | — |

### 实现要点
- 词表每个类型带 `source`；recommended 只节选对多数站点适用的项（例如 Product 不放 gtin，Organization 不放 contactPoint）。
- `hasField`：点路径逐层下钻，遇数组取首元素；`offers.price` 等价接受 `offers.priceSpecification.price` 与 `offers.lowPrice`；价格 0 算有值。**不解析 @id 引用**：若 SoftwareApplication 的 offers 或 Review 的 reviewRating 以 `{"@id"}` 引用写在 @graph 别处，会被误判为缺——留到 E。
- C05c 的 url 直接用 schema 证据已有的 `source`（collect-evidence 写入的就是页面 URL），没有另加 `url` 字段。
- 真实站点冒烟（2026-10-04）：metadocu.com 首页 → 仅 Organization 缺 sameAs 的推荐提示；Yoast 文章页 → 无命中；WordPress 插件页（SoftwareApplication+Product）与 App Store 应用页（SoftwareApplication）→ 无"不符合要求"误报；Allbirds 商品页 → C05b 命中一个评分挂件输出的 `{"aggregateRating":…}` 块（无 @context/@type，确为无效块）。据此把 C05b 描述从"整体失效"改为"这些块会被 Google 忽略……同页其他有效块不受影响"，并列出页面 URL。
- ProductGroup（商品变体）不在词表内，其 hasVariant 内的 Product 不是实体根，不校验——留到 E。

## Task 20：健康分诚实化
- 10-03 metadocu 运行（run_d12cceaf）实测：psi 子阶段 = collected，但唯一一条 psi 载荷全为 null（hasFieldData=false、performanceScore=null）；P3 没有任何 gsc / dataforseo_labs 证据，只因一条 P3 发现被算进健康分；确认竞品 0。
- 新判定只看"可用证据"：旧结果 P1/P2/P3/P5 → 新结果 P1/P2/P5。P1 由 site_audit / page_fetch 支撑，与 PSI 是否成功无关。
- 采用计划的 `{type, payload}` 接口而不是 spec 的 `{type, usable}`：历史数据的子阶段状态本身不可信（见上），只能看载荷。
- 测试样本 `METADOCU_RUN_2026_10_03_EVIDENCE` 是从本地库只读导出的每种（type, 顶层键）形态；非 psi 的字段值省略为 '…'，psi 载荷原样。

## Task 7 检查点与第一波收口门禁（补记，审查 M7）
- 0015 迁移在 veris.db 副本上执行（审查代理复核）：两个旧项目 → industry ''、market 'global-en'、language 'en'。本地库本身尚未执行，留到 Task 22（先备份）。
- 第一波门禁（12:53–12:54）：`pnpm test` 191 文件 / 1742 通过；`pnpm lint` 0 错误（4 个警告都不在 SP-A 文件）；`pnpm build` 退出码 0。
- 本地库的 `__drizzle_migrations` 只记录到 0010；仓库没有 db:migrate 脚本，`db:push` 不执行纯数据 SQL——Task 22 的 runbook 要写清楚 0011–0017 怎么落到本地库。

## 第一波审查修复（Review1）
- **C1 / I1 目标关键词**：改存 `project_settings.target_keywords`（迁移 0017，只有一条 ALTER TABLE）。仓储函数 `getTargetKeywords` / `setTargetKeywords`（单行 upsert，原子）替换原来的 `getManualKeywords` / `replaceManualKeywords`。原设计的两处问题都在真库测试里复现过：目标词与 GSC 词同文同市场时报 `SQLITE_CONSTRAINT_UNIQUE`；GSC 指标合并进 manual 行后整组替换会把指标级联删除。
- **C1 回填**：/new 页改用 `wizardProjectProps(project, settings)` 把已存目标词传给向导，向导提交时原样带回。
- **I3 复用分支**：POST /projects 遇到同域名项目时，写入用户本次填写的品类、竞品、目标词（非空才写）；市场只在已存值无效时补上；空值不清空已存数据。
- **I2**：会话 PATCH 建 run 前先查进行中的 run，查到就把会话挂上去，不新建、不派发（与 POST 会话一致）。
- **I4**：回测原样复用基线 run 的问句集；探针阶段新增 `baselineRunId` 参数和 `getRunPrompts` 依赖，collect-evidence 负责透传。引擎集合与 n 仍取当前设置。
- 全量：199 文件 / 1801 测试通过。

## Task 10：PSI 统一结果
- 实测（2026-10-04）：匿名调用 PSI 返回 429（"Quota exceeded … Queries per day"，共享项目日配额），本地 .env 未配 PAGESPEED_API_KEY。10-03 运行中 PSI 全为 null，极可能就是这个原因：旧代码把错误 JSON 解析成了全 null，并记成 collected。
- 现在采集失败如实返回原因：http_<status>、invalid_json、empty_result、network_error。失败时不写 psi 证据，状态记为 failed 并带上原因；只要有响应，原文都会写入 evidence_raw（无 evidence_id）。
- 原文必须在取数的同一个 step 里存档，因为 step 返回值会被记忆化回放；step 只返回 rawId。证据写好之后再用 linkEvidenceRaw 挂上。
- psi 证据的 rawText 仍然存解析后的 JSON，因为现有规则读的是 payload；响应原文另存在 evidence_raw。
- `.env.example` 补充了 PAGESPEED_API_KEY 的说明。没有 key 时，真实运行里 PSI 会如实显示"失败：http_429"。

## Task 11：第三方语料（维基同名词条 / Reddit 失败如实记录）
- MediaWiki 真实响应（2026-10-04，formatversion=2）：缺失页是 `missing: true`；消歧义页的 `pageprops.disambiguation` 值为空串，必须按"键是否存在"判断；重定向写在 `query.redirects`，`pages` 里出现的是目标标题。原样存入 `real-shapes.ts`。
- Reddit `search.json` 对服务器请求返回 403 拦截页（text/html，约 190KB）。旧代码把它记成 0 条，现在记为 failed/http_403，不做任何绕过（spec §4.4）。
- 候选标题 = 品牌名首字母大写 + 别名。先把首字母转大写再去重（MediaWiki 标题只有首字母不区分大小写），最多 4 个。
- 载荷 v2：`{version: 2, candidates, wikipedia: WikipediaCheck, reddit: RedditCheck}`。v1 旧载荷不能当测得值回放：维基标为"无法核实"，Reddit 只有正数提及可信（裁决见台账）。
- 编排层：两路各自记子阶段状态 `third_party:wikipedia`、`third_party:reddit`，原文都存档；两路都失败时不写证据，父级记 failed，否则父级状态按 `aggregateParentStatus` 汇总；别名取自 `settings.brandAliases`。
- 真实冒烟：metadocu 维基 ok、无同名词条，Reddit 403 → G07 返回 null；notion 加别名 Notion (app) 经重定向命中正确词条。

## Task 12：社媒/评价站检索按平台判定
- CSE 查询现在会读取响应原文。HTTP 失败或返回非 JSON 时，抛出 `CseSearchError`，带原因码（http_<status> 或 invalid_json）和原文；成功时结果附带 `raw`。
- 真实样本：不带 key 调用返回 403，内容是 PERMISSION_DENIED 的 JSON（"unregistered callers"）。
- 每个平台单独判定 ok 或 failed。失败时如实标出原因，不再降级成"0 条结果"。规则 SP01、SP02 只使用 ok 的平台。
- 编排层为 4 个平台分别写子阶段状态 `social_presence:<平台>`，各平台原文都存档；4 个平台全部失败时不写证据，否则父级状态按 `aggregateParentStatus` 汇总。
- 旧载荷没有 status 字段：结果数大于 0 记 ok，等于 0 记 failed/legacy_unverified。本地库没有这类数据。

## Task 13：DataForSEO 子阶段、原文存档、凭据统一
- 凭据：新增 `resolveDataforseoCredentials`，DB 优先、env 回退，主采集与 AIO 共用。删除了只读 env 的旧入口，同时删掉已无调用方的 `isDataforseoConfigured` 和 `createDataforseoProviderFromEnv`。
- client：每个 HTTP 响应（包括 401 和信封错误）都会先交给 `onResponse` 拿到原文；信封错误的原因码为 `api_<status_code>`。真实 401 样本：HTTP 401，信封 40100，tasks:null。
- 采集阶段返回 5 个 `SubStageOutcome`：seed_serp、labs、backlinks、bing_index、brand_serp。
  - 种子为空时，只有 seed_serp 和 labs 记为 not_attempted/no_seeds，其余照常执行（审查 I5）。
  - 部分种子失败记 partial，原因 task_<code>。
  - 40102 仍按"零结果"计入测量值。
  - Labs 返回空记 collected/no_data，不写空证据。
- 原文存档：每个子阶段在同一个 step 里先 drain provider 的缓冲区再存档（sourceKey 为 `dataforseo:<子阶段>`）；请求失败时也先存档再抛出；证据写好后用 linkEvidenceRaw 挂上。
- 编排层：每个子阶段写一条状态，父级状态用 `aggregateParentStatus` 汇总，证据数为各子阶段之和；不再无条件记 collected。
- 种子站点短语改为同时使用深检页 H1（spec §3.3）。深检页 HTML 的抓取结果已被 step 记忆化，所以重放时提取出的 H1 不变。
- AIO：回测时复用基线 run 的问句文本，和探针阶段一致（同协议回测）。

## Task 14：运行前预检
- 核实（真实请求，cost 0）：`GET /v3/appendix/user_data` 返回 200，余额位于 `tasks[0].result[0].money.balance`。响应约 720KB，因为附带了价目表。测试样本已脱敏。
- 代码分三层：
  - 纯逻辑 `lib/runs/preflight.ts`（`buildPreflight` / `preflightBlocks` / `preflightGaps`）；
  - 实际探测 `lib/runs/preflight-probe.ts`，所有依赖都可注入；
  - 路由 `POST /api/projects/[id]/preflight` 只负责组装。探测之所以不写在路由文件里，是因为 Next 16 的 route 文件只能导出 HTTP 方法。
- 探测项：
  - GSC：沿用采集的门槛（已授权、有 token、已选站点）后实际刷新一次 token。invalid_grant 记为不可用；其他错误记为受限（gsc_unreachable）。
  - DataForSEO：调用一次免费的账户信息接口。401/403 记为不可用；其他错误记为受限。
  - PSI：只看 env 里有没有 key。
  - 渲染：按渲染提供方的 isConfigured 判断。
  - AI 引擎：列出已配置 key 的 provider 及其 webSearchEnabled。
- 向导第 2 步：进入时对当前项目请求一次预检，面板是纯展示组件。顶部"本次无法评估"和"本次评估受限"分两行显示。修复链接（重新授权 / 选择站点 / 去配置）由向导按 locale 和项目拼好。预检请求失败时不阻断向导。
- Spec 偏离（已在 spec §4.5 补一行）：建 run 时只做品类与市场闸门，不重复执行网络预检。
- 本地真实冒烟推迟到 Task 22（本地库迁移之后）。
