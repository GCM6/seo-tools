# SP-A2 #2 忠实群内邻接图（TA01/TA02）设计

> 「A 档」backlog 第 2 项（见 `2026-07-07-sp-a1-backend-backlog-batch-design.md` §开头）。中型：把 `internalLinks[]`（每页出向站内链）从 `crawler.ts` 一路穿到 `site_audit` payload，再重写 TA01/TA02 用**忠实群内有向邻接**替换现在的「站内全站入度近似」。

## 背景与真源

- 上游规则真源：`2026-07-03-diagnosis-v3-methodology-design.md` §126(TA01)/§127(TA02)；落地切片：`2026-07-06-deferred-rules-t15-ta01-ta02-design.md`（当时明确以站内入度均值**近似**群内邻接，非严格）。
- 编码前必读 `veris-coding` skill（React 19 / Next 16 / libSQL·Drizzle / Vercel 铁律）。

## 问题：站内全站入度 ≠ 群内邻接

TA01（话题群孤立）与 TA02（缺 Hub）当前读 `SiteAuditPage.inboundLinkCount`——那是**全站**入度（`crawler.ts` 里 `state.inbound[link]++` 的聚合值，导航/页脚/面包屑的链接全算进去）。后果：

- 一个话题群的页可能因**全局导航**而人人高入度，但**彼此之间零互链**——现口径看着「连接良好」，实际群内割裂。TA01 漏报孤立群、TA02 漏报缺 Hub。
- 反之亦然。全站入度对「群内结构」是有偏代理。

「忠实群内邻接」= 拿到真实**有向边**（谁链向谁），只统计「群内成员 → 群内成员」的边，才能诚实回答「这个话题群内部互链吗？有没有一个被众多子页指向的中心页？」

边其实**一直存在**：`light-check.ts` 每页算出 `internalLinks: string[]`（归一化后的同站出向链），`crawler.ts` 用它累加 `inbound` 计数后，`results` 仍带着它（spread），但 `collect-evidence.ts` 的 `toUpsert`（:312）把它**丢弃**——只落轻检字段进 `site_pages`。`buildSiteAudit` 从 `site_pages` 读回，故 `SiteAuditPage` 无边，规则只能用聚合入度近似。

## 设计：穿边入 payload + 重写规则（忠实优先、旧证据回退）

### 数据流改动（4 层 + 1 migration）

1. **schema/migration**：`site_pages` 加可空 JSON 列 `internal_links`（存出向同站链 `string[]`，与既有 `light_check_extra` 同模式）。`0006_*.sql` 由 `drizzle-kit generate` 生成。
2. **repository**（`lib/repositories/index.ts`）：`SitePageUpsert` 加 `internalLinks: string[] | null`；`upsertSitePages` 的 `values` 与 `onConflictDoUpdate.set` 各加该字段。`getSitePages` 自动带回（drizzle `$type<string[]>()`）。
3. **collect-evidence**（`lib/inngest/collect-evidence.ts`）：`toUpsert` 加 `internalLinks: r.internalLinks`（`CrawlPageResult` 经 `LightCheckPage` 已带）；`discovered_only` 兜底页 `internalLinks: null`（未抓，出向链未知）；`build-site-audit` 的 `pages.map` 里加 `internalLinks: p.internalLinks`。
4. **契约类型**（`lib/crawl/site-audit.ts`）：`SiteAuditPage` 加 **可选** `internalLinks?: string[] | null`。可选=历史 payload 与其它 `SiteAuditPage` 构造点（competitor-form 等）无需改即通过。

### 规则重写：`clusterInbound` 纯函数（content.ts）

新增群内邻接辅助函数，供 TA01/TA02 复用：

```
群内成员集 members = { strip(p.url) }        // strip = 去尾斜杠，与 GSC 匹配同口径
faithful = pages.some(p => Array.isArray(p.internalLinks))   // 有任一页带边即忠实模式
对每个源页 src（有 internalLinks 数组）：
  其群内出向目标 = { strip(link) | link∈src.internalLinks, ≠strip(src.url)（去自链）, ∈members }（每源→目标去重）
  每个目标 in-cluster inbound += 1
countOf(p) = faithful ? inbound[strip(p.url)] ?? 0 : p.inboundLinkCount   // 旧证据回退全站入度
```

- **去重语义**：同一源页对同一目标多次链接只计 1（导航/正文重复不膨胀）；去自链。
- **忠实/回退**：payload 带边 → 群内有向入度；历史 payload（全 `undefined`）→ 回退 `inboundLinkCount`（即现行为，**不回归**）。`discovered_only`（`null`）页作零出向源、正常计入成员目标。

TA01：`avgInbound` 改用 `countOf` 均值；`shallow`（页数 ≤2）判据不变（那是深度不是邻接）。TA02：`maxInbound` 改用 `countOf` 最大值。阈值 `TA01_ISOLATED_AVG_INBOUND=1` / `TA02_HUB_MIN_INBOUND=5` / `TA02_HUB_CLUSTER_MIN_PAGES=4` **不变**（语义从「全站入度」收紧为「群内入度」，同阈值下更灵敏，符合修正方向）。

- **话术**：忠实模式描述改为「群内邻接（成员互链）密度近乎为 0」、去掉「以站内入度均值近似，非严格群内邻接」的免责；回退模式保留旧免责措辞。以 rule 级 `faithful = payload.pages.some(...)` 决定措辞。恒 `inferred/notice`，恒结构性建议、**不作排名断言**（真源约束）。

### 版本

TA01/TA02 求值逻辑变化 = 规则行为变化，语义上应随 `RULES_VERSION` 固化；但 release 的 `RULES_VERSION` 常量同步仍是手动部署流程（A1 spec 约定），本 SP 不 bump、只记录。

## 测试（TDD）

- `content.test.ts`：
  - **回归守卫（免费）**：现有 TA01/TA02 用例的页无 `internalLinks`（`undefined`）→ 走回退分支 → 断言不变，保证零回归。
  - **忠实新例**：构造一个群——每页 `inboundLinkCount` 高（模拟全局导航），但**彼此无 `internalLinks` 边** → 新口径 TA01 判孤立 / TA02 判缺 Hub（旧口径会漏）；另构造群内有真实 Hub（一页被多个成员 `internalLinks` 指向，其余互不链）→ TA02 不报、TA01 不报。断言 `detail` 与忠实话术。
- `crawler.test.ts` 无需改（results 已带 `internalLinks`）。
- `collect-evidence` 若有 upsert 形状断言则补 `internalLinks` 字段。
- `site-audit.test.ts` 无需改（`internalLinks` 可选，`buildSiteAudit` 只透传 `pages`）。
- 验收门槛（全绿）：`npx tsc --noEmit` 0 error / `pnpm lint` / `pnpm test` / `pnpm build` ✓。

## 不做（YAGNI / 边界）

- 不建独立邻接表 / 不存 PageRank / 不算跨群边（规则只需群内子图）。
- 不改 `clusterTemplates` 聚类逻辑、不动语言路径排除。
- 不 bump `RULES_VERSION` 代码常量（手动部署流程）。
- 不给 `internalLinks` 加体积上限（V0 内部工具、crawl 页数本已受 `maxPages` 约束）；若日后 payload 过大再议。
