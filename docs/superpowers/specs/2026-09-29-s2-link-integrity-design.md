# S2 断链与断层诊断 设计

> 状态:用户授权连续推进(2026-09-29)。依赖 S1(`2026-09-29-s1-link-graph-foundation-design.md`)的 `readLinkGraph` 与 `site_audit.linkGraph`。
> 对应用户原话:"从首页去链,看看有没有断层,每个 a 链接是否能够……闭环"。

## 1. 要回答的问题

| 用户问题 | 本期规则 | 证据 |
|---|---|---|
| 链接点过去是不是坏的? | L01 站内断链(带来源页与锚文本)、L07 站外链接失效 | 目标页实测状态码(L4) |
| 链接是不是绕路了? | L02 内链指向会跳转的 URL | 目标页实测最终 URL(L4) |
| 链接是不是把权重送给了不该收录的页? | L03 内链指向 noindex / canonical 指向别页的页面 | 目标页 meta robots / canonical(L4) |
| 从首页出发有没有断层? | L04 首页不可达页(孤岛群)、L05 只能经 nofollow 到达的页 | 链接图 BFS(L4),诚信标志决定能否标实测 |
| 页面有没有"死胡同"? | L06 初始 HTML 无任何站内链接的页 | 页面出链明细(L4) |

"闭环"按 S1 的约定理解(assumed,用户未纠正):每个页面从首页可达、自身有链接回到站内、链接不指向坏页或跳转页。

## 2. 非目标

- 内部 PageRank / 权重错配 → S3;社媒链接、E-E-A-T、博客数据支撑 → S4。
- 站外链接只做**状态码可达性**抽检,不评价外链质量,不追踪 JS 跳转。
- 不改 `stats` 结构,不新增 evidence_type。

## 3. 规则

**分层**:纯分析函数 `analyzeLinkIntegrity(payload)`(新文件 `lib/crawl/link-integrity.ts`)产出断链/跳转/noindex/孤岛/nofollow-only/死胡同/站外失效各清单与守卫结论;规则(新文件 `lib/diagnosis/rules/links.ts`,支柱 P1,side `technical`)只把清单格式化成命中;站点结构页用同一个函数出计数。规则与 UI 的数字同源,不会各算一套。

**公共守卫**(所有 L 规则):
- 无图谱(历史证据)→ no-op。
- 入口页零站内出链 → no-op(与 T05 同一守卫:多为 JS 渲染导航,初始 HTML 抽不到链接)。
- 所有"目标页"统计只看**已抓**节点(`fetched`);未抓、抓取失败、robots 禁抓的目标不下结论,只计入 detail 的 `unverifiedTargets`。

| 规则 | 命中条件 | 严重度 | claim_type | detail |
|---|---|---|---|---|
| L01 站内断链 | 目标已抓且 `httpStatus ∈ {404, 410}`,且至少 1 条入链(其他 4xx/5xx 可能是反爬或临时故障,只计 `errorTargets`,不断言)| 任一来源链接位于 nav/header/footer(全站模板)或来源页 ≥ 5 → error,否则 warning | measured_hard | 断链目标数、断链条数、按来源数排序的样例(目标、状态码、来源页、锚文本、区域) |
| L02 内链指向跳转 | 目标已抓、`finalUrl ≠ url`、最终状态 < 400,且有入链 | notice | measured_hard | 同上结构 + 最终 URL |
| L03 内链指向 noindex / 非自指 canonical 页 | 目标已抓 200,meta robots 含 noindex,或 canonical 归一化后指向本站其他 URL;只统计可跟随边 | notice | measured_hard(事实);描述中"浪费权重"措辞为机制说明 | 目标、原因(noindex/canonical)、来源样例 |
| L04 首页不可达页 | sitemap 声明、已抓 200、非 noindex、沿全部边(含 nofollow)仍不可达,且 `inAll > 0`(`inAll = 0` 由 T05 负责,避免重复) | warning | 闭包完整 → measured_hard;否则 inferred,措辞"在已抓取范围内未发现从首页出发的路径" | 页数、样例、`closureComplete` |
| L05 仅经 nofollow 可达 | 已抓 200、非 noindex、沿可跟随边不可达、沿全部边可达 | notice | 同 L04 | 页数、样例、把它连进来的 nofollow 边样例 |
| L06 死胡同页 | 已抓 200、HTML 正文 > 0、`outInternal = 0` | warning | measured_hard(措辞:"初始 HTML 中无任何站内链接") | 页数、样例 |
| L07 站外链接失效 | 站外抽检结果 404/410 | warning | measured_hard;其他 ≥400/网络错误只计 `unverified`,不下结论 | 失效 URL、状态码、来源页、锚文本 |

**L03 排除功能页**(实现中据真实站点冒烟补充):路径段为隐私/条款/cookie/法律声明/登录注册/账户/购物车/结算/站内搜索的 noindex 页不计入——这类页本就不该收录,全站链接到它们是正常做法。
**L06 额外守卫**:已抓 200 页里 ≥ 50% 都是死胡同 → 判为抽取失败(站点靠 JS 输出导航),规则 no-op 并在 detail 不产出。
**L04/L05 的"沿全部边可达"**:在 `readLinkGraph` 的 `edges` 上另跑一次 BFS(含 nofollow、含 meta nofollow 源页),由新增纯函数 `reachableViaAnyLink(view)` 提供。

每条规则一个站级命中(`scope: 'site'`),与 T05/T12 同粒度,样例最多 10 条。

## 4. 站外链接抽检(新文件 `lib/crawl/external-check.ts`)

- **选目标** `selectExternalTargets(pages, cap = 100)`:本 run 所有已抓页的 `externalLinks` 去重,按"链到它的来源页数"降序取前 100;排除对爬虫普遍拦截的平台主机(linkedin.com、facebook.com、instagram.com、x.com、twitter.com、tiktok.com),这些计入 `skippedHosts`,不下结论。
- **检测** `checkExternalLinks(urls, { concurrency: 8, timeoutMs: 8000 }, fetchImpl = safeFetch)`:先 `HEAD`;遇 403/405/501 改 `GET` 并立即取消响应体;记录跟随跳转后的最终状态码或错误类型(`timeout` / `dns` / `blocked_private` / `other`)。单个失败不抛错。
- **编排**:抓取完成后新增 step `check-external-links-{i}`,每批 25 个 URL(控制单 step 耗时);结果只含 `{url, status, error}`,体积小,可作 step 返回值;最终传入 `build-site-audit`,写进 `site_audit.payload.externalChecks`,协议记 `externalCheck: { cap, checked, skippedHosts }`。
- 数据源状态:`writeDss({ sourceKey: 'crawl' ... })` 的 protocolSnapshot 增加外链抽检计数(不新增 sourceKey)。

## 5. 站点结构页(`app/[locale]/runs/[id]/site/page.tsx`)

- **页面列表按本 run 快照过滤**:只列出本 run `site_audit.payload.pages` 里出现的 URL(仍用 `site_pages` 行以保留"设为重点页/代表页"操作所需 id);无快照时维持旧行为。修 S1 §9 已知缺口。
- 列表新增两列:**点击深度**(图谱深度;深度只是上界时显示"≤N";无法到达且闭包完整显示"不可达",闭包不完整显示"未发现路径")与**入链数**(`inAll`)。
- 统计区新增"链接结构"卡片:可达页数、首页不可达的 sitemap 页数、站内断链数、死胡同页数;抓取未穷尽时显示提示"不可达结论仅限已抓取范围"。
- 文案走 `messages/zh.json` / `en.json` 的 `site` 命名空间;术语解释走 `terms`。

## 6. 建议模板(`lib/diagnosis/templates.ts`)

为 L01–L07 各加一条模板(what / whyHint / effort / validationMethod / promptType=technical)。例:L01 "把指向 4xx/5xx 的内链改到有效目标,或为已删除页设置 301 到最相关的现存页;优先修导航/页脚里的全站链接",验证方式"重新抓取确认断链目标数为 0"。

## 7. 版本与兼容

- `RULES_VERSION` → `rules_v7`(新增 L01–L07)。
- 历史证据无 `linkGraph` / `externalChecks` → L 规则全部 no-op,不影响旧 run 重算。

## 8. 测试策略

1. `links.test.ts`:每条规则命中/不命中/守卫(无图谱、入口零出链、目标未抓、L06 抽取失败守卫、L04 闭包完整与否两种 claim)。
2. `external-check.test.ts`:目标选择(去重、按来源数排序、排除平台、上限);HEAD→GET 回退;超时/DNS/SSRF 拦截的错误分类;单个失败不影响其他。
3. 端到端:扩展 `link-graph.e2e.test.ts` 的假站点(已有 `/broken` 404、`/nf` nofollow-only、`/x`↔`/y` 孤岛),断言 L01、L04、L05、L06 真实触发;加一条 301 目标验证 L02。
4. `collect-evidence.test.ts`:外链抽检 step 分批、结果进入 site_audit、未抓站外链接时跳过。
5. 站点结构页:按快照过滤与新列的渲染测试(沿用该页现有测试方式,若无则为纯函数抽出后单测)。
6. 全量 `pnpm test` / `tsc` / `lint` 不低于 S1 收口基线。

## 9. 风险

- **区域启发式误判**会影响 L01 的严重度分档(nav/footer → error)。只影响严重度,不影响是否命中。
- **站外抽检是单次测量**:404/410 才下结论;其他错误可能是临时故障或反爬,只计数不断言。
- **L03 的 canonical 判定**依赖 canonical 归一化;带参数的分页 canonical 可能是站点有意为之,描述里保留"若为有意设计可忽略"。

## 10. 第二轮独立审查后的口径修订(2026-10-03,已实现)

- **L01**:只认 404/410;其他 4xx/5xx 计 `errorTargets` 不断言;来源样例带 `linkedAs`(页面里实际写的跳转前地址)。
- **L02**:只报最终状态 < 400 的跳转(跳到 404/5xx 的改成最终地址也是坏的);入口跳转回链不报。
- **L03**:功能页排除只认精确路径段(`/privacy`、`/terms-of-service`、`/login`、`/cart`、`/search` 等,可带 .html),不再前缀匹配。
- **L07**:抽检目标只从链接图的站外链接选(源页是本站 HTML,第三方页面上的链接不算本站);请求原始 href;HEAD 返回 403/404/405/410/501 时用 GET 复核;单 URL 硬超时 + 每批 60 秒截止(未开始的记 `not_checked`);跳转最多 3 次;单批失败降级为 `not_checked` 并计 `failedBatches`,不拖垮 run;没有本站来源的结果不下结论。协议字段名为 `skippedUrls`(非 spec 初稿的 skippedHosts)。
- **T02/T03 口径对齐**:T02 不计 401/403/429 拒绝访问码(单列 `denied`);T03 不计功能页的 noindex。
- **SSRF 守卫**:补封 IPv4 映射 IPv6、`::`、CGNAT 100.64/10、TEST-NET、组播/保留段、fec0::/10;**刻意不封 198.18.0.0/15**(代理 fake-ip 模式解析结果)。
- **站点结构页**:入口零出链时深度列显示未知;HTTP 状态与状态筛选取自本次快照;"点击深度"表头带口径说明;"仅限已抓取范围"提示按闭包是否完整判断。

