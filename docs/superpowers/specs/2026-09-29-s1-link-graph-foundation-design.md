# S1 链接图谱地基 设计

> 状态：已获用户授权直接推进(2026-09-29,"先写 S1 的 spec,做完后继续执行后续")。
> 所属：链接结构 / 内链权重 / E-E-A-T 功能补齐的 4 个子项目之一(S1 地基 → S2 断链断层 → S3 内链权重;S4 E-E-A-T+社媒可并行)。

## 1. 为什么先做地基

用户要的"从首页爬链找断层、每个链接能否闭环、权重对不对",全部建立在**一张正确的站内链接图**上。2026-09-29 用假站点实跑现有爬虫 + 查本地库,确认现有链接数据有以下缺陷(标签:observed = 实跑/实查,derived = 由代码推出):

| # | 缺陷 | 标签 | 后果 |
|---|---|---|---|
| D1 | sitemap 声明的页 `depth` 恒为 null(链接先入 seen='sitemap',再被链接发现时只改标记不补深度) | observed(假站点 + 本地库 metadocu.com 21 页中 19 页 depth=null) | 有 sitemap 的站几乎测不到点击深度 |
| D2 | 超过 `maxDepth`(默认 3)的链接不入队;T12 判定 `depth > 3` | observed(无 sitemap 时第 4 层页根本不出现) | **T12 在默认配置下永不触发**;其单测手造 `depth: 4` 所以全绿 |
| D3 | 孤岛只认"入度 = 0";sitemap 里互链的孤岛对各有入度 1 | observed | 首页不可达的孤岛群漏报 |
| D4 | `site_pages` 以 (project,url) 跨 run 累积,从不按 run 清理;`build-site-audit` 读的是项目全量 | derived(`getSitePages` 无 run 过滤,无删除语句) | 重测时上一轮已下线的页混进本轮快照 |
| D5 | `updateInboundCounts` 只更新本轮出现在入度表里的 URL,本轮入度归零的页保留旧值 | derived | 页面被撤掉所有内链后 T05/T11 仍按旧入度判断 |
| D6 | 链接只记目标 URL:无锚文本、无 rel(nofollow/ugc/sponsored)、无所在区域(导航/页脚/正文);站外链接完全不记 | observed(`parseLightCheckHtml`) | S2 断链溯源、S3 权重、S4 社媒链接全都无数据可用 |
| D7 | sitemap URL 在初始化时排在首页链接之前,预算按 sitemap 顺序消耗 | observed(`createCrawlState`) | 大站 200 页预算花在 sitemap 前 199 条,首页链接图几乎没展开 |
| D8 | `build-site-audit` 这一步把整份 payload 当返回值跨 step 传递 | observed | 加上链接明细后可能超过 Inngest 单步 4MiB 返回上限(reported:Inngest 文档) |

## 2. 目标与非目标

**目标(S1 交付即可验收):**
1. 每个已抓页记录**链接明细**:站内目标 + 锚文本 + rel + 区域;站外链接 + 锚文本 + rel + 区域。
2. 抓取改为**首页链接优先(BFS)**,sitemap 保留一部分预算做补充抽样。
3. 链接图按 **run 隔离**:本轮快照只含本轮见过的页;入度每轮重算。
4. 新增纯函数**链接图谱分析**:从首页出发的真实点击深度、可达性、每节点入度/出度,并给出**深度精确视界**和**闭包完整性**两个诚信标志(决定哪些结论能标实测)。
5. 链接图以紧凑格式存入 `site_audit` 证据(不新增 evidence_type),附读取 helper。
6. 修 T12(改读图谱深度)、T05(抓取未穷尽时降级措辞与 claim)。
7. 一条**端到端测试**:假站点图 → 真实爬虫 → 真实 site_audit 构建 → 真实规则,覆盖 D1–D3(落实陷阱 `trap-rule-fixture-unreachable` 的捕获检查)。

**非目标(留给后续子项目):**
- 新的断链/断层/死胡同/nofollow 规则 → S2
- 内部 PageRank、权重错配、锚文本质量 → S3
- 社媒链接识别、E-E-A-T 全站信号 → S4(S1 只负责把站外链接采下来)
- 站点结构页 UI 改造(仍读项目全量 `site_pages`,见 §9 已知缺口)
- 修改 `crawlMaxDepth` / `crawlMaxPages` 默认值(改了会破坏同协议重测)

## 3. 链接明细采集(`lib/crawl/light-check.ts`)

`parseLightCheckHtml` 在现有输出上**新增**两个字段(`internalLinks: string[]` 保持不变,仍是去重后的目标 URL 列表,TA01/TA02 与竞品形态采集继续可用):

```ts
export type LinkRegion = 'nav' | 'header' | 'footer' | 'aside' | 'main' | 'body'

// 同一源页 → 同一目标聚合为一条
export interface InternalLinkDetail {
  url: string            // normalizeUrl 后的目标
  count: number          // 本页出现次数
  anchors: string[]      // 去重后最多 3 条,每条截断 80 字符
  regions: LinkRegion[]  // 去重
  nofollow: boolean      // 仅当每次出现都带 nofollow/ugc/sponsored 才为 true
}

export interface ExternalLinkDetail {
  url: string            // normalizeUrl 后
  host: string           // 去 www
  anchor: string         // 截断 80
  region: LinkRegion
  rel: ('nofollow' | 'ugc' | 'sponsored')[]
}
```

- **锚文本取值顺序**:可见文本(空白折叠)→ 链接内 `<img alt>` → `aria-label` → `title` → 空串。
- **区域判定**(启发式,就近祖先优先):语义标签 `nav/header/footer/aside/main/article` 与对应 `role`(navigation/banner/contentinfo/complementary/main)→ 其次祖先 `id/class` 词元命中 `nav|navbar|menu`→nav、`header|masthead`→header、`footer`→footer、`sidebar`→aside → 都没有则 `body`。区域是**推断**,S3 用它时必须标 inferred。
- **上限**:每页站内目标最多 1000 条、站外最多 200 条,超出记 `linkDetailsTruncated: true`(放进 `LightCheckExtra`)。
- 页面级 `meta robots nofollow` 不在采集层处理,由图谱构建时统一套用(见 §6)。
- 自链接继续排除;`mailto:`/`tel:`/`javascript:` 由 `normalizeUrl` 返回 null 自然排除。

`LightCheckPage` 与 `CrawlPageResult` 增加 `linkDetails` / `externalLinks`;错误页、非 HTML 页、robots 禁抓页都是空数组。

## 4. 抓取策略:首页链接优先(`lib/crawl/crawler.ts`)

`CrawlState` 仍是纯 JSON。改动:

```ts
interface CrawlState {
  entryHost: string
  frontier: { url: string; depth: number | null; via: DiscoveredVia }[] // 链接发现队列(FIFO = BFS 层序)
  sitemapQueue: string[]                                               // 新增:sitemap 待抓
  sitemapTotal: number                                                 // 新增:用于计算预留额
  visited: Record<string, 1>                                           // 新增:已抓或已判禁抓,出队时跳过
  seen: Record<string, DiscoveredVia>
  // inbound 移出状态:入度改由图谱构建时从已落库的 linkDetails 重算(§7),减小跨 step 状态体积
  checkedCount: number
  done: boolean
}
```

- **预算分配**:`sitemapReserve = min(sitemapTotal, floor(maxPages × 0.2))`,`linkBudget = maxPages − sitemapReserve`。
- **出队顺序**:`checkedCount < linkBudget` 且链接队列非空 → 取链接队列;否则 sitemap 队列非空 → 取 sitemap;否则回到链接队列。已 `visited` 的直接跳过。
- **sitemap 页被链接发现**:标 `both`,并**按链接深度入链接队列**(让它按 BFS 顺序被抓,修 D1/D7);之后在 sitemap 队列出队时因 visited 跳过。
- **深度上限**:保持"超过 maxDepth 的链接不入队"(抓取预算控制不变),但这些目标仍会作为源页的 `linkDetails` 出现在图谱里,成为"已发现未抓"节点,深度由图谱算出(修 D2)。
- 来自深度未知页(仅 sitemap 抓到的页)的链接:以 `depth: null` 入队,不受深度上限约束,仍受 `maxPages` 约束。
- `leftoverDiscovered` = 两个队列里未 visited 的项(去重)。
- `done` = 两个队列都没有未 visited 项,或 `checkedCount >= maxPages`。
- 协议快照记 `crawlStrategy: 'link_first_v1'`、`sitemapReserveRatio: 0.2`。

## 5. run 隔离(`db/schema.ts` + `lib/repositories/index.ts`)

- `site_pages` 新增三列:`last_seen_run_id text`、`link_details text(json)`、`external_links text(json)`。迁移 `0014`。
- `upsertSitePages` 每次写入都设 `lastSeenRunId = runId`,并写两个新 JSON 列。
- 新增 `getRunSitePages(projectId, runId)`:`where project_id = ? and last_seen_run_id = ?`。`build-site-audit` 改用它(修 D4)。模板聚类、深检目标、站点结构页 UI **暂不改**(§9)。
- `updateInboundCounts(projectId, runId, counts)`:先把本 run 的页入度置 0,再写入本轮计数(修 D5)。计数来自图谱的 `inAll`(不同源页数,含 nofollow,与旧口径一致),只写本 run 存在行的 URL。

## 6. 链接图谱分析(新文件 `lib/crawl/link-graph.ts`,纯函数)

输入:本 run 的页面(url、checkStatus、httpStatus、metaRobots、discoveredVia、linkDetails、externalLinks)+ 入口 URL。

**节点** = 本 run 页面 ∪ 所有站内链接目标。节点**已解析**(resolved)= 该页 `checkStatus ∈ {checked, blocked_by_robots}`;`error`、`discovered_only`、只作为链接目标出现的都算未解析。

**可跟随边**:源页 `checked`、源页 meta robots 不含 nofollow、该边 `nofollow = false`。只有 `checked` 页能向外扩展(禁抓页的出链未知,和搜索引擎视角一致)。

**深度**:从入口节点在可跟随边上 BFS,得到每个节点的最短点击深度;BFS 到不了的为 null。

**深度精确视界 H**(诚信标志):H = BFS 到达的**未解析**节点中的最小深度;全部已解析则 H = ∞(存为 null)。
- 深度 ≤ H 的节点,深度是**精确值**:比它浅的层全部已解析,不存在更短的未知路径。
- 深度 > H 的节点,深度只是**上界**。规则只能拿精确值下实测结论。

**闭包完整**(`closureComplete`)= H 为 ∞。只有闭包完整时,"首页不可达"才能下实测结论(S2 用)。
**抓取穷尽**(`exhaustive`)= 所有节点都已解析。只有穷尽时,"没有任何页面链到它"才能下实测结论(T05 用)。

**每节点统计**:`inFollow`(可跟随入链的不同源页数)、`inAll`(全部入链的不同源页数)、`outInternal`、`outExternal`、`inSitemap`。

**存储**:紧凑编码放进 `SiteAuditPayload.linkGraph`(可选字段,历史证据无此字段):URL 表 + 锚文本表 + 元组形式的节点/边/站外链接数组 + 上述标志。**规则禁止直接读元组**,一律经 `readLinkGraph(payload)` 解码成带字段名的对象;历史证据返回 null,规则回退旧逻辑。

`site_audit.pages[].depth` 改为图谱深度(无图谱时保留爬虫深度)。图谱汇总(`nodes`/`resolvedNodes`/`reachableNodes`/`unreachableSitemapNodes`/`edges`/`followableEdges`/`externalLinks`)与三个诚信标志放在 `linkGraph.summary` 及其顶层字段里,**不改 `stats` 结构**(避免牵动重测对比与大量测试夹具;S2 需要时再把选定指标加进 `audit-diff`)。

## 7. 编排改动(`lib/inngest/collect-evidence.ts`)

Inngest 限制(reported,官方文档):单 step 返回 ≤ 4MiB,整个 run 状态 ≤ 32MiB,step 数 ≤ 1000。原则:**大载荷不跨 step 边界**。

- **`crawl-batch-i` 与 `persist-crawl-batch-i` 合并为一个 step**:step 内抓取并 upsert(带 `runId`、`linkDetails`、`externalLinks`),只返回 `{ state, resultCount }`。抓取结果(含链接明细)不再进入 Inngest 状态。重试会重抓本批,upsert 幂等,可接受。
- `update-inbound-counts` 并入图谱构建 step:从本 run 页面的 `linkDetails` 算入度后写回。
- **`build-site-audit` 与 `persist-site-audit` 合并为一个 step**,只返回 `{ evidenceId, payloadBytes }`(修 D8)。
- 体积预算(测试强制,合成最坏站点:sitemap 5000 条 + 200 页 × 每页 300 个站内目标):单个抓取 step 返回值 < 2 MiB;全部抓取 step 返回值之和 < 16 MiB;`site_audit` payload < 8 MiB(存 libSQL,不走 Inngest 状态)。超预算时优先调大 `batchSize` 减少状态副本数,并在实现笔记记录。

## 8. 规则改动

| 规则 | 改动 | claim_type |
|---|---|---|
| T12 点击深度过深 | 有图谱:取 `depth > 3` 且深度精确的节点(已抓 + 已发现未抓都算);detail 带 `exactDepthHorizon` 与上界计数。视界 < 4 时不判定。无图谱:回退旧逻辑 | measured_hard(仅用精确深度) |
| T05 孤岛页 | 数据源修正后自动变准(run 隔离 + 入度重算)。抓取未穷尽时,命中降级为 inferred,措辞改为"在已抓取的 N 页中未发现指向它的内链" | 穷尽:measured_hard;否则 inferred |

`RULES_VERSION` 从 `rules_v5` 升为 `rules_v6`(T12/T05 判定口径变化)。

**重测兼容**:`protocol` 增加 `crawlStrategy`;`diffSiteAudits` 的 `protocolMismatch` 把 `crawlStrategy` 不同也算作协议不一致(旧快照无此字段视为 `'sitemap_first_v0'`),只标记不硬比,遵守同协议重测铁律。

## 9. 已知缺口(本期不做,记录在案)

- 站点结构页 `/runs/[id]/site` 列表仍读项目全量 `site_pages`,会显示历史 run 的页;应改为读 `site_audit` 快照。放到 S2 的 UI 部分。
- 模板聚类 `cluster-templates` 与深检目标 `resolve-deep-check-targets` 仍读项目全量页。
- 区域判定是 class/语义标签启发式,对纯 div 布局的站准确率未知(assumed 中等),S3 用区域加权前要用真实站点抽查。
- 单页应用(链接靠 JS 渲染)的出链在初始 HTML 里拿不到;沿用 T10 的渲染依赖提示,S1 不做渲染后抽链。

## 10. 测试策略

1. `light-check.test.ts`:锚文本各取值来源、区域各判定路径、rel 聚合规则(部分 nofollow ≠ nofollow)、站外链接、上限截断。
2. `crawler.test.ts`:链接优先顺序;sitemap 预留额;sitemap 页被链接发现后按 BFS 深度抓取;visited 跳过;leftover 去重;done 判定。
3. `link-graph.test.ts`:BFS 深度;nofollow 边与 meta nofollow 页不传递;视界 H 的计算(error 页、预算截断、禁抓页);closureComplete / exhaustive;编码 → `readLinkGraph` 往返一致。
4. `site-audit.test.ts`:pages[].depth 取图谱深度;新 stats。
5. **端到端 `lib/crawl/link-graph.e2e.test.ts`**:假站点(链式 5 层 + sitemap 孤岛对 + nofollow 边 + 4xx 页)→ 真实 `runCrawlBatch` 循环 → 真实 `buildSiteAudit` → 真实 `buildRuleContext` 片段 → T05/T12 实际命中。必须覆盖 D1、D2、D3 三个复现。
6. 体积预算测试(§7)。
7. `collect-evidence.test.ts`:新 step 结构、`runId` 透传、合并后的审计 step 只返回小对象。
8. `audit-diff.test.ts`:crawlStrategy 不同 → protocolMismatch。
9. 仓库全量 `pnpm test` + `pnpm lint` + `pnpm exec tsc --noEmit` 通过。

## 11. 给后续子项目的接口

- **S2 断链断层**:读 `readLinkGraph` → 边(带锚文本、区域)+ 节点 httpStatus/finalUrl/metaRobots/canonical → 断链溯源、链向跳转/noindex、首页不可达孤岛(需 closureComplete)、死胡同页(outInternal = 0)、仅 nofollow 可达页。
- **S3 内链权重**:在可跟随边上算内部 PageRank;区域与锚文本用于错配与锚文本质量判断(inferred)。
- **S4 文章页识别 + 文章级 E-E-A-T 与数据支撑 + 社媒**:
  - 读 `externalLinks` 识别社媒主页链接及区域,与 schema `sameAs` 对照。
  - **博客/文章数据支撑识别**(用户 2026-09-29 追加需求):现有 C07 只看首页,且"任何数字=统计""任何站外链接=引用"(页脚社媒图标也算)(observed,`content.ts:480`)。S4 在抓取阶段为每页抽取文章级信号——正文区(`region=main`)内的站外来源链接、带单位/百分比且邻近来源归属语("据…统计""according to""来源:")的数据、表格、引述、作者、发布/更新日期、参考资料段——再按文章模板聚合判定。依赖 S1 的链接区域:区分正文引用与页脚/导航链接。

## 12. 两轮独立审查后的口径修订(2026-09-29 ~ 10-03,已实现)

下列定义覆盖 §3–§8 中的对应描述,以本节为准。

1. **链接图的范围**:只含站内 **HTML 超链接**(`<a href>` 与 `<area href>`)。sitemap、RSS/Atom、CSS/JS/JSON 等机器格式是发现通道,不属于链接图(与 sitemap 不给深度一致)。深度语义 = "从首页出发、沿可跟随的站内 HTML 链接的最少点击次数"。
2. **出链状态 linkState**(`link-graph.ts`):`complete`(2xx HTML、站内链接未截断)/`none`(404/410、媒体、机器格式、跨站跳转)/`blocked`(robots 禁抓,含**跳转落到禁抓路径**)/`partial`(站内链接截断)/`unknown`(抓取失败、401/403/408/429/5xx、PDF/Office 文档、未知类型、未抓)。
   - 发现口径(视界 H、closureComplete):complete|none|blocked 算已解析。
   - 任意链接口径(exhaustive、孤岛):只有 complete|none 算出链已知。
3. **内容类型**(`lightCheckExtra.contentKind`):html / document(PDF、Office:含可点击超链接、搜索引擎会跟随,本工具不解析 → unknown)/ resource(feed、CSS、JS、JSON、纯文本、XML → none)/ media / other。
4. **同站跳转合并**:请求 URL 并入最终 URL 节点;指向请求 URL 的边改指最终 URL 并记 `redirectedFrom`(L02 与 L01 来源样例用);入口跳转记 `entryRequested`。
5. **请求原始地址**:链接明细、sitemap、入口都保留原始解析地址(`href` / `fetchUrls`),抓取请求原始地址,归一化 URL 只作去重键(避免 `/docs` 404、`/docs/` 200 一类站点被误判)。
6. **截断标志分开**:`linkDetailsTruncated` 只表示站内目标截断;站外截断另记 `externalLinksTruncated`,不影响站内完整性。
7. **采集健壮性**:补抽 `<area href>`;字符集按 BOM → Content-Type → 前 8KB meta → 合法 UTF-8 → windows-1252(Node 下手动映射 0x80–0x9F)解码,支持 UTF-16;正文读取上限 5MB / 15 秒;区域判定的局部 header/footer 作用域只看 article/aside/nav/section(`<main>` 常包整页,不算)。
8. **T12**:实测只给已抓取的 2xx HTML 页;未抓取的超深链接目标(排除静态资源扩展名)单独计数且只标 inferred;detail 带 `upperBoundDeepCount`。`site_audit.pages[].depth` 只写精确深度。
9. **取消守卫**:写 site_pages / site_audit 的 step 先检查 run 是否被用户取消(`cancelled_by_user`),是则 `NonRetriableError('run_cancelled')`,防止在途的旧 run 抢走新 run 的行。
10. **step id**:返回形状或语义变化的 step 一律带 `-v2`(`crawl-v2-batch-*`、`persist-discovered-only-v2`、`update-inbound-counts-v2`、`build-site-audit-v2`),部署过渡期旧 run 不会回放旧记忆化结果。
11. **图谱版本**:`LINK_GRAPH_VERSION = 2`,`readLinkGraph` 对其他版本返回 null(规则回退旧逻辑)。

已知未修(低影响,记录在案):`<section>` 包整页时页眉页脚链接判为 body(只影响 L01 严重度);DNS 重绑定(解析与连接之间地址变化)不在 SSRF 守卫覆盖范围;Turso 单行约 11MB 写入未实测。
