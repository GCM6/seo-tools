# S1 链接图谱地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让爬虫产出一张正确、按 run 隔离、带锚文本/rel/区域的站内链接图,并据此修好 T12(永不触发)与 T05(抓取未穷尽时过度断言)。

**Architecture:** 采集层(`light-check`)抽取链接明细 → 爬虫改为首页链接优先 BFS + sitemap 预留 → 抓取 step 内直接落库(`site_pages` 新列 + `last_seen_run_id`)→ 纯函数 `buildLinkGraph` 在本 run 页面上算深度/可达/入度与诚信标志 → 紧凑编码进 `site_audit.payload.linkGraph` → 规则经 `readLinkGraph` 读取。

**Tech Stack:** TypeScript、Next 16、Inngest 3.54、Drizzle 0.45 + libSQL、linkedom、vitest 4(pnpm)。

**Spec:** `docs/superpowers/specs/2026-09-29-s1-link-graph-foundation-design.md`

## Global Constraints

- 包管理器 pnpm;单测 `pnpm vitest run <file>`;全量 `pnpm test`;类型 `pnpm exec tsc --noEmit -p .`;lint `pnpm lint`。
- 测试与源码同层共存,不建 `__tests__/`;不引入 zod。
- 中文业务注释,关键决策标注 spec 出处(如 `// spec S1 §6`)。
- 基线(2026-09-29 17:56):167 文件 / 1316 用例全绿;tsc 0 错;lint 0 错 4 警告。收口必须不低于基线。
- Inngest:单 step 返回 ≤ 4MiB,run 状态 ≤ 32MiB(reported)。大载荷不跨 step 边界。
- 不改 `crawlMaxPages`/`crawlMaxDepth` 默认值;不新增 evidence_type。
- 本仓库工作区有大量他人未提交改动:**只改本计划列出的文件**,不 commit(用户未要求),收口前对比 `scratchpad/s1-hashes-before.txt`。

## Review Focus

1. **链接靠 JS 渲染的站**(初始 HTML 首页零内链):所有 sitemap 页入度 0,T05 会把全站判成孤岛并标实测 —— 期望:入口页零站内出链时 T05 不判定。→ Task 7 测试。
2. **页面带 `<base href>`**:相对链接应相对 base 解析,否则整站链接图错位 —— 期望按 base 解析。→ Task 1 测试。
3. **入口 URL 跳转**(`/` → `/en/`):入口节点的出链来自跳转后页面,深度从入口起算 —— 期望 `/en/` 的出链目标深度为 1。→ Task 8 E2E。
4. **历史 site_audit 证据无 `linkGraph`**:规则必须回退旧逻辑,不崩、不改结论 —— 期望现有 T05/T12 夹具结果不变。→ Task 7 保留旧用例。
5. **链接阶段 frontier 暂时为空**(本块仍在抓,新链接未回来):不应提前消耗 sitemap 预留 —— 期望首块只抓入口。→ Task 2 测试。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `lib/crawl/light-check.ts` | 单页 HTML → 链接明细(站内聚合 + 站外) | 改 |
| `lib/crawl/crawler.ts` | 抓取调度:链接优先 + sitemap 预留 + visited | 改 |
| `lib/crawl/link-graph.ts` | 纯函数:建图、BFS 深度、视界、编码/解码 | 新建 |
| `lib/crawl/site-audit.ts` | 快照组装:挂 linkGraph、深度取图谱值、协议字段 | 改 |
| `lib/crawl/audit-diff.ts` | 重测对比:crawlStrategy 纳入协议一致性 | 改 |
| `db/schema.ts` + `db/migrations/0014_*` | site_pages 三新列 | 改/生成 |
| `lib/repositories/index.ts` | upsert 写新列与 lastSeenRunId;`getRunSitePages`;入度按 run 重置 | 改 |
| `lib/inngest/collect-evidence.ts` | 抓取 step 内落库;入度来自图谱;审计 build+persist 合并 | 改 |
| `lib/diagnosis/rules/technical.ts` | T12 读图谱;T05 降级与 JS 导航守卫 | 改 |
| `lib/diagnosis/types.ts` | `RULES_VERSION = 'rules_v6'` | 改 |

---

### Task 1: 链接明细采集(light-check)

**Files:**
- Modify: `lib/crawl/light-check.ts`
- Test: `lib/crawl/light-check.test.ts`

**Interfaces:**
- Produces: `LinkRegion`、`LinkRel`、`InternalLinkDetail`、`ExternalLinkDetail`、`MAX_INTERNAL_LINK_TARGETS=1000`、`MAX_EXTERNAL_LINKS=200`;`LightCheckPage.linkDetails: InternalLinkDetail[]`、`LightCheckPage.externalLinks: ExternalLinkDetail[]`;`LightCheckExtra.linkDetailsTruncated?: boolean`;`parseLightCheckHtml` 返回值新增 `linkDetails`、`externalLinks`。`internalLinks` 恒等于 `linkDetails.map(d => d.url)`。

- [ ] **Step 1: 写失败测试**(追加到 `light-check.test.ts`,import 增加 `MAX_INTERNAL_LINK_TARGETS`)

```ts
describe('parseLightCheckHtml 链接明细（spec S1 §3）', () => {
  const doc = `<html><body>
    <nav><a href="/a">导航A</a></nav>
    <div class="site-footer"><a href="/a" rel="nofollow">页脚A</a><a href="https://www.linkedin.com/company/x" rel="noopener nofollow">LinkedIn</a></div>
    <main><p><a href="/b"><img src="x.png" alt="产品图"></a> <a href="/c" aria-label="联系我们"></a> <a href="/d" title="标题D"></a> <a href="/e">  多个   空白  </a></p>
      <a href="/f" rel="ugc">u1</a><a href="/f" rel="sponsored">u2</a>
      <a href="https://other.com/p?utm_source=x">外站</a><a href="https://other.com/p">外站重复</a>
    </main>
    <div role="navigation"><a href="/g">G</a></div>
    <a href="/h">裸链</a>
  </body></html>`
  const out = parseLightCheckHtml(doc, 'https://example.com/', 'example.com')
  const byPath = Object.fromEntries(out.linkDetails.map((d) => [d.url.replace('https://example.com', ''), d]))

  it('同目标聚合次数/锚文本/区域；部分出现带 nofollow 不算 nofollow', () => {
    expect(byPath['/a']).toEqual({ url: 'https://example.com/a', count: 2, anchors: ['导航A', '页脚A'], regions: ['nav', 'footer'], nofollow: false })
  })
  it('锚文本回退 img alt → aria-label → title，空白折叠', () => {
    expect(byPath['/b'].anchors).toEqual(['产品图'])
    expect(byPath['/c'].anchors).toEqual(['联系我们'])
    expect(byPath['/d'].anchors).toEqual(['标题D'])
    expect(byPath['/e'].anchors).toEqual(['多个 空白'])
  })
  it('每次出现都带 ugc/sponsored → nofollow=true', () => {
    expect(byPath['/f'].nofollow).toBe(true)
  })
  it('区域：role=navigation→nav，main 内→main，无区域祖先→body', () => {
    expect(byPath['/g'].regions).toEqual(['nav'])
    expect(byPath['/b'].regions).toEqual(['main'])
    expect(byPath['/h'].regions).toEqual(['body'])
  })
  it('internalLinks 与 linkDetails 目标一致', () => {
    expect(out.internalLinks).toEqual(out.linkDetails.map((d) => d.url))
  })
  it('站外链接归一化去重，记 host/锚文本/区域/rel', () => {
    expect(out.externalLinks).toEqual([
      { url: 'https://linkedin.com/company/x', host: 'linkedin.com', anchor: 'LinkedIn', region: 'footer', rel: ['nofollow'] },
      { url: 'https://other.com/p', host: 'other.com', anchor: '外站', region: 'main', rel: [] },
    ])
    expect(out.extra.linkDetailsTruncated).toBe(false)
  })
  it('<base href> 存在时相对链接按 base 解析（Review Focus 2）', () => {
    const o = parseLightCheckHtml('<html><head><base href="https://example.com/docs/"></head><body><a href="intro">i</a></body></html>', 'https://example.com/', 'example.com')
    expect(o.internalLinks).toEqual(['https://example.com/docs/intro'])
  })
  it('站内目标超上限记 linkDetailsTruncated', () => {
    const many = Array.from({ length: MAX_INTERNAL_LINK_TARGETS + 5 }, (_, i) => `<a href="/p${i}">p</a>`).join('')
    const o = parseLightCheckHtml(`<html><body>${many}</body></html>`, 'https://example.com/', 'example.com')
    expect(o.linkDetails).toHaveLength(MAX_INTERNAL_LINK_TARGETS)
    expect(o.extra.linkDetailsTruncated).toBe(true)
  })
})
```

并在 `fetchLightCheck` 的 404 用例断言里追加 `linkDetails: [], externalLinks: []`。

- [ ] **Step 2: 跑测试确认失败** — `pnpm vitest run lib/crawl/light-check.test.ts`,预期新用例 FAIL(`linkDetails` undefined)。

- [ ] **Step 3: 实现**(`light-check.ts`)

```ts
// 链接所在区域：就近祖先启发式（语义标签 → role → id/class 词元），S3 加权时须标 inferred（spec S1 §3）。
export type LinkRegion = 'nav' | 'header' | 'footer' | 'aside' | 'main' | 'body'
export type LinkRel = 'nofollow' | 'ugc' | 'sponsored'

// 同一源页 → 同一目标聚合为一条。
export interface InternalLinkDetail {
  url: string
  count: number
  anchors: string[] // 去重，最多 3 条，每条 ≤80 字符
  regions: LinkRegion[]
  nofollow: boolean // 仅当每次出现都带 nofollow/ugc/sponsored
}

export interface ExternalLinkDetail {
  url: string
  host: string
  anchor: string
  region: LinkRegion
  rel: LinkRel[]
}

export const MAX_INTERNAL_LINK_TARGETS = 1000
export const MAX_EXTERNAL_LINKS = 200
const MAX_ANCHORS_PER_TARGET = 3
const MAX_ANCHOR_CHARS = 80

const REGION_BY_TAG: Record<string, LinkRegion> = { NAV: 'nav', HEADER: 'header', FOOTER: 'footer', ASIDE: 'aside', MAIN: 'main', ARTICLE: 'main' }
const REGION_BY_ROLE: Record<string, LinkRegion> = { navigation: 'nav', banner: 'header', contentinfo: 'footer', complementary: 'aside', main: 'main' }
const REGION_BY_TOKEN: Record<string, LinkRegion> = { nav: 'nav', navbar: 'nav', navigation: 'nav', menu: 'nav', header: 'header', masthead: 'header', footer: 'footer', sidebar: 'aside' }
const REL_VALUES: LinkRel[] = ['nofollow', 'ugc', 'sponsored']

export function linkRegion(a: Element): LinkRegion {
  for (let el = a.parentElement; el; el = el.parentElement) {
    const byTag = REGION_BY_TAG[el.tagName.toUpperCase()]
    if (byTag) return byTag
    const byRole = REGION_BY_ROLE[(el.getAttribute('role') ?? '').trim().toLowerCase()]
    if (byRole) return byRole
    const tokens = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.toLowerCase().split(/[\s_-]+/)
    for (const t of tokens) {
      const r = REGION_BY_TOKEN[t]
      if (r) return r
    }
  }
  return 'body'
}

const clipAnchor = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_ANCHOR_CHARS)

// 锚文本：可见文本 → 链接内 img alt → aria-label → title → 空串。
export function anchorText(a: Element): string {
  const candidates = [a.textContent, a.querySelector('img[alt]')?.getAttribute('alt'), a.getAttribute('aria-label'), a.getAttribute('title')]
  for (const c of candidates) {
    const v = clipAnchor(c ?? '')
    if (v) return v
  }
  return ''
}

const relOf = (a: Element): LinkRel[] => {
  const tokens = (a.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
  return REL_VALUES.filter((r) => tokens.includes(r))
}

function extractLinks(document: ReturnType<typeof parseHTML>['document'], pageUrl: string, entryHost: string) {
  // <base href> 改变相对链接的解析基准（Review Focus 2）。
  const baseHref = document.querySelector('base[href]')?.getAttribute('href')
  const base = (baseHref && normalizeUrl(baseHref, pageUrl)) || pageUrl
  const internal = new Map<string, { count: number; anchors: string[]; regions: LinkRegion[]; anyFollow: boolean }>()
  const external = new Map<string, ExternalLinkDetail>()
  let truncated = false
  for (const a of document.querySelectorAll('a[href]')) {
    const n = normalizeUrl(a.getAttribute('href') ?? '', base)
    if (!n || n === pageUrl) continue
    const rel = relOf(a)
    const region = linkRegion(a)
    const anchor = anchorText(a)
    if (isSameSite(n, entryHost)) {
      let acc = internal.get(n)
      if (!acc) {
        if (internal.size >= MAX_INTERNAL_LINK_TARGETS) {
          truncated = true
          continue
        }
        acc = { count: 0, anchors: [], regions: [], anyFollow: false }
        internal.set(n, acc)
      }
      acc.count++
      if (anchor && !acc.anchors.includes(anchor) && acc.anchors.length < MAX_ANCHORS_PER_TARGET) acc.anchors.push(anchor)
      if (!acc.regions.includes(region)) acc.regions.push(region)
      if (rel.length === 0) acc.anyFollow = true
    } else if (!external.has(n)) {
      if (external.size >= MAX_EXTERNAL_LINKS) {
        truncated = true
        continue
      }
      external.set(n, { url: n, host: new URL(n).hostname.replace(/^www\./, ''), anchor, region, rel })
    }
  }
  const linkDetails: InternalLinkDetail[] = [...internal].map(([url, acc]) => ({
    url, count: acc.count, anchors: acc.anchors, regions: acc.regions, nofollow: !acc.anyFollow,
  }))
  return { linkDetails, externalLinks: [...external.values()], truncated }
}
```

`LightCheckExtra` 追加 `linkDetailsTruncated?: boolean // 站内目标或站外链接超上限被截断（spec S1 §3）`;`emptyLightCheckExtra` 返回 `linkDetailsTruncated: false`。`LightCheckPage` 追加 `linkDetails: InternalLinkDetail[]`、`externalLinks: ExternalLinkDetail[]`。`parseLightCheckHtml` 用 `extractLinks` 替换原内链循环:

```ts
  const links = extractLinks(document, pageUrl, entryHost)
  return {
    title, canonicalUrl, metaRobots,
    mainTextChars: extractMainTextChars(html),
    internalLinks: links.linkDetails.map((d) => d.url),
    linkDetails: links.linkDetails,
    externalLinks: links.externalLinks,
    extra: { ...parseExtra(document), linkDetailsTruncated: links.truncated },
  }
```

`EMPTY_PARSE` 追加 `linkDetails: [] as InternalLinkDetail[], externalLinks: [] as ExternalLinkDetail[]`。

- [ ] **Step 4: 跑测试确认通过** — `pnpm vitest run lib/crawl/light-check.test.ts`,全 PASS。
- [ ] **Step 5: 修同形夹具** — `lib/crawl/crawler.ts` 的 `blockedResult` 补 `linkDetails: [], externalLinks: []`;`pnpm exec tsc --noEmit -p .` 列出的其他 `LightCheckPage` 夹具(如 `crawler.test.ts`、`competitor-form.test.ts`)补两个空数组。

---

### Task 2: 链接优先抓取(crawler)

**Files:**
- Modify: `lib/crawl/crawler.ts`
- Test: `lib/crawl/crawler.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `LightCheckPage.linkDetails/externalLinks`。
- Produces: `CrawlState`(新增 `sitemapQueue`、`sitemapTotal`、`visited`;**移除 `inbound`**);`SITEMAP_RESERVE_RATIO = 0.2`;`CRAWL_STRATEGY = 'link_first_v1'`;`createCrawlState`/`runCrawlBatch`/`leftoverDiscovered` 签名不变。

- [ ] **Step 1: 写失败测试**(`crawler.test.ts`:`page()` 夹具补 `linkDetails: links.map((u) => ({ url: u, count: 1, anchors: [], regions: ['body'], nofollow: false })), externalLinks: []`;首个用例删去对 `out.state.inbound` 的两行断言,改为断言 `byUrl['https://example.com/b']).toMatchObject({ discoveredVia: 'both', depth: 1 })`;新增:)

```ts
  it('链接阶段 frontier 暂空时不提前消耗 sitemap 预留：首块只抓入口（Review Focus 5）', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/l1'] })
    const state = createCrawlState(entry, ['https://example.com/s1'], 'example.com')
    await runCrawlBatch(state, opts({ batchSize: 1 }), fetchImpl)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([entry])
  })

  it('链接预算内优先抓链接，预算用尽后抓 sitemap 预留（maxPages=5 → 预留 1）', async () => {
    const entry = 'https://example.com/'
    const links = Array.from({ length: 10 }, (_, i) => `https://example.com/l${i}`)
    const sitemap = Array.from({ length: 10 }, (_, i) => `https://example.com/s${i}`)
    const fetchImpl = siteFetch({ [entry]: links })
    let out = await runCrawlBatch(createCrawlState(entry, sitemap, 'example.com'), opts({ maxPages: 5 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxPages: 5 }), fetchImpl)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([entry, links[0], links[1], links[2], sitemap[0]])
    const left = leftoverDiscovered(out.state).map((l) => l.url)
    expect(left).toContain(links[3])
    expect(left).toContain(sitemap[1])
    expect(left).not.toContain(sitemap[0])
    expect(new Set(left).size).toBe(left.length)
  })

  it('sitemap 页被链接发现后按 BFS 深度抓取且只抓一次（修 D1）', async () => {
    const entry = 'https://example.com/'
    const a = 'https://example.com/a'
    const fetchImpl = siteFetch({ [entry]: [a], [a]: [] })
    let out = await runCrawlBatch(createCrawlState(entry, [a], 'example.com'), opts(), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) {
      out = await runCrawlBatch(out.state, opts(), fetchImpl)
      results.push(...out.results)
    }
    expect(results.find((r) => r.url === a)).toMatchObject({ discoveredVia: 'both', depth: 1 })
    expect(fetchImpl.mock.calls.filter((c) => c[0] === a)).toHaveLength(1)
  })

  it('深度未知页（仅 sitemap 抓到）的出链以 depth=null 入队，不受深度上限约束', async () => {
    const entry = 'https://example.com/'
    const s = 'https://example.com/s'
    const t = 'https://example.com/t'
    const fetchImpl = siteFetch({ [entry]: [], [s]: [t] })
    let out = await runCrawlBatch(createCrawlState(entry, [s], 'example.com'), opts({ maxDepth: 0 }), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) {
      out = await runCrawlBatch(out.state, opts({ maxDepth: 0 }), fetchImpl)
      results.push(...out.results)
    }
    expect(results.find((r) => r.url === t)).toMatchObject({ discoveredVia: 'crawl', depth: null })
  })
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm vitest run lib/crawl/crawler.test.ts`。
- [ ] **Step 3: 实现**(替换 `crawler.ts` 中 `CrawlState`、`createCrawlState`、`runCrawlBatch`、`leftoverDiscovered`)

```ts
// 抓取策略（spec S1 §4）：首页链接优先（BFS 层序），sitemap 保留 20% 预算做补充抽样。
export const CRAWL_STRATEGY = 'link_first_v1'
export const SITEMAP_RESERVE_RATIO = 0.2

type FrontierItem = { url: string; depth: number | null; via: DiscoveredVia }

// 状态是纯 JSON：要在 Inngest step.run 之间序列化往返（不要放 URL/Set/Map）。
// 入度不在状态里：由图谱构建时从已落库的 linkDetails 重算（spec S1 §7，控制跨 step 体积）。
export interface CrawlState {
  entryHost: string
  frontier: FrontierItem[] // 链接发现队列（FIFO = BFS 层序）
  sitemapQueue: string[]
  sitemapTotal: number
  visited: Record<string, 1> // 已抓或已判 robots 禁抓，出队时跳过
  seen: Record<string, DiscoveredVia>
  checkedCount: number
  done: boolean
}

export function createCrawlState(entryUrl: string, sitemapUrls: string[], entryHost: string): CrawlState {
  const seen: Record<string, DiscoveredVia> = { [entryUrl]: 'entry' }
  const sitemapQueue: string[] = []
  for (const u of sitemapUrls) {
    if (seen[u]) continue
    seen[u] = 'sitemap'
    sitemapQueue.push(u)
  }
  return {
    entryHost,
    frontier: [{ url: entryUrl, depth: 0, via: 'entry' }],
    sitemapQueue,
    sitemapTotal: sitemapQueue.length,
    visited: {},
    seen,
    checkedCount: 0,
    done: false,
  }
}

export async function runCrawlBatch(
  state: CrawlState,
  opts: CrawlOptions,
  fetchImpl: typeof fetchLightCheck = fetchLightCheck,
): Promise<{ state: CrawlState; results: CrawlPageResult[] }> {
  const next: CrawlState = {
    ...state,
    frontier: [...state.frontier],
    sitemapQueue: [...state.sitemapQueue],
    visited: { ...state.visited },
    seen: { ...state.seen },
  }
  const results: CrawlPageResult[] = []
  let processed = 0
  const linkBudget = opts.maxPages - Math.min(next.sitemapTotal, Math.floor(opts.maxPages * SITEMAP_RESERVE_RATIO))

  // 出队：链接阶段只取链接；链接队列暂空但本块已有在抓项时停止组块，等新链接回来（不提前消耗 sitemap 预留）。
  const takeNext = (inChunk: number): FrontierItem | null => {
    const inLinkPhase = next.checkedCount + inChunk < linkBudget
    while (next.frontier.length && next.visited[next.frontier[0].url]) next.frontier.shift()
    while (next.sitemapQueue.length && next.visited[next.sitemapQueue[0]]) next.sitemapQueue.shift()
    if (inLinkPhase) {
      if (next.frontier.length) return next.frontier.shift()!
      if (inChunk > 0) return null
    }
    if (next.sitemapQueue.length) {
      const url = next.sitemapQueue.shift()!
      return { url, depth: null, via: next.seen[url] ?? 'sitemap' }
    }
    return next.frontier.shift() ?? null
  }

  while (processed < opts.batchSize && next.checkedCount < opts.maxPages) {
    const chunk: FrontierItem[] = []
    while (
      chunk.length < opts.concurrency &&
      processed + chunk.length < opts.batchSize &&
      next.checkedCount + chunk.length < opts.maxPages
    ) {
      const item = takeNext(chunk.length)
      if (!item) break
      next.visited[item.url] = 1
      const path = new URL(item.url).pathname || '/'
      if (!parseRobotsAllowed(opts.robotsTxt, path)) {
        // robots 禁抓：不消耗页面配额，但记录该 URL 的存在（本身是诊断信号）。
        results.push(blockedResult({ ...item, via: next.seen[item.url] ?? item.via }))
        continue
      }
      chunk.push(item)
    }
    if (!chunk.length) break

    const pages = await Promise.all(chunk.map((item) => fetchImpl(item.url, state.entryHost)))
    pages.forEach((page, j) => {
      const item = chunk[j]
      next.checkedCount++
      processed++
      for (const link of page.internalLinks) {
        const known = next.seen[link]
        if (known && known !== 'sitemap') continue
        if (known === 'sitemap') next.seen[link] = 'both'
        // 深度未知页（仅 sitemap 抓到）的出链深度也未知：不受 maxDepth 约束，只受 maxPages 约束。
        const depth = item.depth === null ? null : item.depth + 1
        // 超深链接不入队（预算控制）；仍作为源页 linkDetails 的目标进入图谱，深度由图谱算出（修 D2）。
        if (depth !== null && depth > opts.maxDepth) continue
        if (!known) next.seen[link] = 'crawl'
        next.frontier.push({ url: link, depth, via: next.seen[link] })
      }
      results.push({ ...page, checkStatus: page.checkStatus, discoveredVia: next.seen[item.url] ?? item.via, depth: item.depth })
    })
  }

  next.frontier = next.frontier.filter((f) => !next.visited[f.url])
  next.sitemapQueue = next.sitemapQueue.filter((u) => !next.visited[u])
  next.done = next.checkedCount >= opts.maxPages || (next.frontier.length === 0 && next.sitemapQueue.length === 0)
  return { state: next, results }
}

export function leftoverDiscovered(state: CrawlState): { url: string; via: DiscoveredVia; depth: number | null }[] {
  const out = new Map<string, { url: string; via: DiscoveredVia; depth: number | null }>()
  for (const f of state.frontier) {
    if (!state.visited[f.url] && !out.has(f.url)) out.set(f.url, { url: f.url, via: state.seen[f.url] ?? f.via, depth: f.depth })
  }
  for (const u of state.sitemapQueue) {
    if (!state.visited[u] && !out.has(u)) out.set(u, { url: u, via: state.seen[u] ?? 'sitemap', depth: null })
  }
  return [...out.values()]
}
```

- [ ] **Step 4: 跑测试确认通过** — `pnpm vitest run lib/crawl/crawler.test.ts`。

---

### Task 3: 链接图谱纯函数(link-graph)

**Files:**
- Create: `lib/crawl/link-graph.ts`
- Test: `lib/crawl/link-graph.test.ts`

**Interfaces:**
- Consumes: Task 1 类型。
- Produces:
  - `LinkGraphPageInput { url; checkStatus: string; httpStatus: number | null; metaRobots: string | null; discoveredVia: string; linkDetails: InternalLinkDetail[] | null; externalLinks: ExternalLinkDetail[] | null }`
  - `buildLinkGraph(input: { entryUrl: string; pages: LinkGraphPageInput[] }): LinkGraphPayload`
  - `readLinkGraph(payload: { linkGraph?: LinkGraphPayload | null } | null | undefined): LinkGraphView | null`
  - `inboundAllByUrl(graph: LinkGraphPayload): Record<string, number>`
  - `LinkGraphView { version; entryUrl; exactDepthHorizon: number | null; closureComplete; exhaustive; summary; nodes: LinkGraphNode[]; nodeByUrl: Map<string, LinkGraphNode>; edges: LinkGraphEdge[]; external: LinkGraphExternal[] }`
  - `LinkGraphNode { url; depth: number | null; depthExact: boolean; resolved; fetched; blocked; error; inSitemap; metaNofollow; httpStatus: number | null; inFollow; inAll; outInternal; outExternal }`
  - `LinkGraphEdge { from; to; count; regions: LinkRegion[]; nofollow; followable; anchors: string[] }`
  - `LinkGraphExternal { from; url; host; anchor; region: LinkRegion; rel: LinkRel[] }`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { buildLinkGraph, readLinkGraph, inboundAllByUrl, type LinkGraphPageInput } from './link-graph'
import type { InternalLinkDetail } from './light-check'

const H = 'https://ex.com'
const L = (path: string, over: Partial<InternalLinkDetail> = {}): InternalLinkDetail =>
  ({ url: `${H}${path}`, count: 1, anchors: [path], regions: ['main'], nofollow: false, ...over })
const P = (path: string, links: InternalLinkDetail[] = [], over: Partial<LinkGraphPageInput> = {}): LinkGraphPageInput => ({
  url: `${H}${path}`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl',
  linkDetails: links, externalLinks: [], ...over,
})
const view = (pages: LinkGraphPageInput[]) => readLinkGraph({ linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages }) })!
const node = (v: ReturnType<typeof view>, path: string) => v.nodeByUrl.get(`${H}${path}`)!

describe('buildLinkGraph（spec S1 §6）', () => {
  it('BFS 最短点击深度；nofollow 边不传递深度', () => {
    const v = view([
      P('/', [L('/a'), L('/c', { nofollow: true })], { discoveredVia: 'entry' }),
      P('/a', [L('/b')]),
      P('/b', [L('/c', { nofollow: true })]),
      P('/c'),
    ])
    expect([node(v, '/').depth, node(v, '/a').depth, node(v, '/b').depth, node(v, '/c').depth]).toEqual([0, 1, 2, null])
    expect(v.closureComplete).toBe(true)
    expect(v.exhaustive).toBe(true)
    expect(v.exactDepthHorizon).toBeNull()
  })

  it('meta robots nofollow 页的出链不可跟随', () => {
    const v = view([P('/', [L('/a')], { discoveredVia: 'entry' }), P('/a', [L('/b')], { metaRobots: 'noindex, nofollow' }), P('/b')])
    expect(node(v, '/b').depth).toBeNull()
    expect(v.edges.find((e) => e.from === `${H}/a`)?.followable).toBe(false)
  })

  it('视界 H = 已到达未解析节点的最小深度；更深节点只是上界', () => {
    const v = view([
      P('/', [L('/err'), L('/b')], { discoveredVia: 'entry' }),
      P('/err', null as never, { checkStatus: 'error', httpStatus: 0, linkDetails: null }),
      P('/b', [L('/c')]),
      P('/c', null as never, { checkStatus: 'discovered_only', httpStatus: null, linkDetails: null }),
    ])
    expect(v.exactDepthHorizon).toBe(1)
    expect(node(v, '/b').depthExact).toBe(true)
    expect(node(v, '/c')).toMatchObject({ depth: 2, depthExact: false })
    expect(v.closureComplete).toBe(false)
    expect(v.exhaustive).toBe(false)
  })

  it('robots 禁抓页算已解析；只作为链接目标出现的 URL 是未解析节点', () => {
    const v = view([
      P('/', [L('/blocked'), L('/a')], { discoveredVia: 'entry' }),
      P('/blocked', null as never, { checkStatus: 'blocked_by_robots', httpStatus: null, linkDetails: null }),
      P('/a', [L('/beyond')]),
    ])
    expect(node(v, '/blocked')).toMatchObject({ resolved: true, blocked: true, depth: 1 })
    expect(node(v, '/beyond')).toMatchObject({ resolved: false, fetched: false, depth: 2, depthExact: true })
    expect(v.exactDepthHorizon).toBe(2)
  })

  it('入度：inAll 计所有源页，inFollow 只计可跟随；自链忽略', () => {
    const v = view([
      P('/', [L('/t'), L('/a')], { discoveredVia: 'entry' }),
      P('/a', [L('/t', { nofollow: true }), L('/a')]),
      P('/t'),
    ])
    expect(node(v, '/t')).toMatchObject({ inAll: 2, inFollow: 1 })
    expect(node(v, '/a').outInternal).toBe(1)
    expect(inboundAllByUrl(buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/t')]), P('/t')] }))[`${H}/t`]).toBe(1)
  })

  it('sitemap 节点首页不可达计入 unreachableSitemapNodes；站外链接往返解码', () => {
    const v = view([
      P('/', [], { discoveredVia: 'entry', externalLinks: [{ url: 'https://x.com/p', host: 'x.com', anchor: 'X', region: 'footer', rel: ['nofollow'] }] }),
      P('/x', [L('/y')], { discoveredVia: 'sitemap' }),
      P('/y', [L('/x')], { discoveredVia: 'both' }),
    ])
    expect(v.summary.unreachableSitemapNodes).toBe(2)
    expect(node(v, '/x').inSitemap).toBe(true)
    expect(v.external).toEqual([{ from: `${H}/`, url: 'https://x.com/p', host: 'x.com', anchor: 'X', region: 'footer', rel: ['nofollow'] }])
    expect(node(v, '/').outExternal).toBe(1)
  })

  it('边解码保留锚文本/区域/次数；历史证据无 linkGraph 返回 null', () => {
    const v = view([P('/', [L('/a', { count: 3, anchors: ['A1', 'A2'], regions: ['nav', 'footer'] })], { discoveredVia: 'entry' }), P('/a')])
    expect(v.edges).toEqual([{ from: `${H}/`, to: `${H}/a`, count: 3, regions: ['nav', 'footer'], nofollow: false, followable: true, anchors: ['A1', 'A2'] }])
    expect(readLinkGraph(null)).toBeNull()
    expect(readLinkGraph({})).toBeNull()
  })

  it('编码可 JSON 往返（Inngest/libSQL 存储）', () => {
    const g = buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/a')]), P('/a')] })
    expect(readLinkGraph({ linkGraph: JSON.parse(JSON.stringify(g)) })!.nodes).toEqual(readLinkGraph({ linkGraph: g })!.nodes)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**(模块不存在)。
- [ ] **Step 3: 实现 `lib/crawl/link-graph.ts`**

```ts
import type { ExternalLinkDetail, InternalLinkDetail, LinkRegion, LinkRel } from './light-check'

// 站内链接图谱（spec S1 §6）：纯函数，输入本 run 页面，输出紧凑编码；规则一律经 readLinkGraph 解码读取。
// 深度语义 = 搜索引擎发现视角：只沿可跟随边（非 nofollow、源页 checked 且无 meta nofollow）扩展。

export const LINK_GRAPH_VERSION = 1

export interface LinkGraphPageInput {
  url: string
  checkStatus: string
  httpStatus: number | null
  metaRobots: string | null
  discoveredVia: string
  linkDetails: InternalLinkDetail[] | null
  externalLinks: ExternalLinkDetail[] | null
}

const REGIONS: LinkRegion[] = ['nav', 'header', 'footer', 'aside', 'main', 'body']
const RELS: LinkRel[] = ['nofollow', 'ugc', 'sponsored']

// 节点标志位
const N_RESOLVED = 1
const N_FETCHED = 2
const N_BLOCKED = 4
const N_ERROR = 8
const N_SITEMAP = 16
const N_META_NOFOLLOW = 32
// 边标志位
const E_NOFOLLOW = 1
const E_FOLLOWABLE = 2

type NodeTuple = [depth: number | null, flags: number, inFollow: number, inAll: number, outInternal: number, outExternal: number, httpStatus: number | null]
type EdgeTuple = [src: number, dst: number, count: number, regionMask: number, flags: number, anchorIdx: number[]]
type ExternalTuple = [src: number, url: string, host: string, anchorIdx: number, regionIdx: number, relMask: number]

export interface LinkGraphSummary {
  nodes: number
  resolvedNodes: number
  reachableNodes: number
  unreachableSitemapNodes: number
  edges: number
  followableEdges: number
  externalLinks: number
}

export interface LinkGraphPayload {
  version: typeof LINK_GRAPH_VERSION
  entry: number
  exactDepthHorizon: number | null // null = ∞（到达的节点全部已解析）
  closureComplete: boolean
  exhaustive: boolean
  summary: LinkGraphSummary
  urls: string[]
  anchors: string[]
  nodes: NodeTuple[]
  edges: EdgeTuple[]
  external: ExternalTuple[]
}

export interface LinkGraphNode {
  url: string
  depth: number | null
  depthExact: boolean
  resolved: boolean
  fetched: boolean
  blocked: boolean
  error: boolean
  inSitemap: boolean
  metaNofollow: boolean
  httpStatus: number | null
  inFollow: number
  inAll: number
  outInternal: number
  outExternal: number
}

export interface LinkGraphEdge {
  from: string
  to: string
  count: number
  regions: LinkRegion[]
  nofollow: boolean
  followable: boolean
  anchors: string[]
}

export interface LinkGraphExternal {
  from: string
  url: string
  host: string
  anchor: string
  region: LinkRegion
  rel: LinkRel[]
}

export interface LinkGraphView {
  version: number
  entryUrl: string
  exactDepthHorizon: number | null
  closureComplete: boolean
  exhaustive: boolean
  summary: LinkGraphSummary
  nodes: LinkGraphNode[]
  nodeByUrl: Map<string, LinkGraphNode>
  edges: LinkGraphEdge[]
  external: LinkGraphExternal[]
}

const isMetaNofollow = (metaRobots: string | null) => /(^|[\s,])(nofollow|none)([\s,]|$)/i.test(metaRobots ?? '')
const mask = <T>(all: T[], values: T[]) => values.reduce((m, v) => m | (1 << all.indexOf(v)), 0)
const unmask = <T>(all: T[], m: number) => all.filter((_, i) => (m & (1 << i)) !== 0)

export function buildLinkGraph(input: { entryUrl: string; pages: LinkGraphPageInput[] }): LinkGraphPayload {
  const urls: string[] = []
  const urlIdx = new Map<string, number>()
  const id = (u: string) => {
    let i = urlIdx.get(u)
    if (i === undefined) {
      i = urls.length
      urls.push(u)
      urlIdx.set(u, i)
    }
    return i
  }
  const anchors: string[] = []
  const anchorIdx = new Map<string, number>()
  const aid = (s: string) => {
    let i = anchorIdx.get(s)
    if (i === undefined) {
      i = anchors.length
      anchors.push(s)
      anchorIdx.set(s, i)
    }
    return i
  }

  const entry = id(input.entryUrl)
  const pageByIdx = new Map<number, LinkGraphPageInput>()
  for (const p of input.pages) pageByIdx.set(id(p.url), p)

  const edges: EdgeTuple[] = []
  const external: ExternalTuple[] = []
  const adjacency = new Map<number, number[]>()
  const inFollow = new Map<number, Set<number>>()
  const inAll = new Map<number, Set<number>>()
  const outInternal = new Map<number, number>()
  const outExternal = new Map<number, number>()
  const addIn = (m: Map<number, Set<number>>, dst: number, src: number) => {
    let s = m.get(dst)
    if (!s) m.set(dst, (s = new Set()))
    s.add(src)
  }

  for (const [src, p] of pageByIdx) {
    const sourceFollows = p.checkStatus === 'checked' && !isMetaNofollow(p.metaRobots)
    const seenDst = new Set<number>()
    for (const d of p.linkDetails ?? []) {
      const dst = id(d.url)
      if (dst === src || seenDst.has(dst)) continue
      seenDst.add(dst)
      const followable = sourceFollows && !d.nofollow
      edges.push([src, dst, d.count, mask(REGIONS, d.regions), (d.nofollow ? E_NOFOLLOW : 0) | (followable ? E_FOLLOWABLE : 0), d.anchors.map(aid)])
      addIn(inAll, dst, src)
      if (followable) {
        addIn(inFollow, dst, src)
        const adj = adjacency.get(src) ?? []
        adj.push(dst)
        adjacency.set(src, adj)
      }
    }
    outInternal.set(src, seenDst.size)
    const ext = p.externalLinks ?? []
    for (const x of ext) external.push([src, x.url, x.host, aid(x.anchor), REGIONS.indexOf(x.region), mask(RELS, x.rel)])
    outExternal.set(src, ext.length)
  }

  // BFS：从入口沿可跟随边求最短点击深度。
  const depth: (number | null)[] = urls.map(() => null)
  depth[entry] = 0
  const queue = [entry]
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]
    for (const v of adjacency.get(u) ?? []) {
      if (depth[v] !== null) continue
      depth[v] = depth[u]! + 1
      queue.push(v)
    }
  }

  const resolved = (i: number) => {
    const s = pageByIdx.get(i)?.checkStatus
    return s === 'checked' || s === 'blocked_by_robots'
  }
  let horizon: number | null = null
  for (let i = 0; i < urls.length; i++) {
    const d = depth[i]
    if (d !== null && !resolved(i) && (horizon === null || d < horizon)) horizon = d
  }

  const nodes: NodeTuple[] = urls.map((_, i) => {
    const p = pageByIdx.get(i)
    const flags =
      (resolved(i) ? N_RESOLVED : 0) |
      (p?.checkStatus === 'checked' ? N_FETCHED : 0) |
      (p?.checkStatus === 'blocked_by_robots' ? N_BLOCKED : 0) |
      (p?.checkStatus === 'error' ? N_ERROR : 0) |
      (p && (p.discoveredVia === 'sitemap' || p.discoveredVia === 'both') ? N_SITEMAP : 0) |
      (p && isMetaNofollow(p.metaRobots) ? N_META_NOFOLLOW : 0)
    return [depth[i], flags, inFollow.get(i)?.size ?? 0, inAll.get(i)?.size ?? 0, outInternal.get(i) ?? 0, outExternal.get(i) ?? 0, p?.httpStatus ?? null]
  })

  const resolvedCount = nodes.filter((n) => n[1] & N_RESOLVED).length
  return {
    version: LINK_GRAPH_VERSION,
    entry,
    exactDepthHorizon: horizon,
    closureComplete: horizon === null,
    exhaustive: resolvedCount === urls.length,
    summary: {
      nodes: urls.length,
      resolvedNodes: resolvedCount,
      reachableNodes: nodes.filter((n) => n[0] !== null).length,
      unreachableSitemapNodes: nodes.filter((n) => n[0] === null && n[1] & N_SITEMAP).length,
      edges: edges.length,
      followableEdges: edges.filter((e) => e[4] & E_FOLLOWABLE).length,
      externalLinks: external.length,
    },
    urls,
    anchors,
    nodes,
    edges,
    external,
  }
}

export function readLinkGraph(payload: { linkGraph?: LinkGraphPayload | null } | null | undefined): LinkGraphView | null {
  const g = payload?.linkGraph
  if (!g) return null
  const h = g.exactDepthHorizon
  const nodes: LinkGraphNode[] = g.nodes.map(([depth, flags, inF, inA, oI, oE, httpStatus], i) => ({
    url: g.urls[i],
    depth,
    depthExact: depth !== null && (h === null || depth <= h),
    resolved: (flags & N_RESOLVED) !== 0,
    fetched: (flags & N_FETCHED) !== 0,
    blocked: (flags & N_BLOCKED) !== 0,
    error: (flags & N_ERROR) !== 0,
    inSitemap: (flags & N_SITEMAP) !== 0,
    metaNofollow: (flags & N_META_NOFOLLOW) !== 0,
    httpStatus,
    inFollow: inF,
    inAll: inA,
    outInternal: oI,
    outExternal: oE,
  }))
  return {
    version: g.version,
    entryUrl: g.urls[g.entry],
    exactDepthHorizon: h,
    closureComplete: g.closureComplete,
    exhaustive: g.exhaustive,
    summary: g.summary,
    nodes,
    nodeByUrl: new Map(nodes.map((n) => [n.url, n])),
    edges: g.edges.map(([src, dst, count, regionMask, flags, anchorIdx]) => ({
      from: g.urls[src],
      to: g.urls[dst],
      count,
      regions: unmask(REGIONS, regionMask),
      nofollow: (flags & E_NOFOLLOW) !== 0,
      followable: (flags & E_FOLLOWABLE) !== 0,
      anchors: anchorIdx.map((a) => g.anchors[a]),
    })),
    external: g.external.map(([src, url, host, anchorI, regionI, relMask]) => ({
      from: g.urls[src],
      url,
      host,
      anchor: g.anchors[anchorI],
      region: REGIONS[regionI] ?? 'body',
      rel: unmask(RELS, relMask),
    })),
  }
}

// 全部入链的不同源页数（含 nofollow，与旧 inboundLinkCount 口径一致），写回 site_pages 用。
export function inboundAllByUrl(graph: LinkGraphPayload): Record<string, number> {
  const out: Record<string, number> = {}
  graph.nodes.forEach((n, i) => {
    out[graph.urls[i]] = n[3]
  })
  return out
}
```

- [ ] **Step 4: 跑测试确认通过** — `pnpm vitest run lib/crawl/link-graph.test.ts`。

---

### Task 4: site_audit 挂载图谱 + 重测协议

**Files:**
- Modify: `lib/crawl/site-audit.ts`、`lib/crawl/audit-diff.ts`
- Test: `lib/crawl/site-audit.test.ts`、`lib/crawl/audit-diff.test.ts`

**Interfaces:**
- Consumes: Task 3 `LinkGraphPayload`、`readLinkGraph`;Task 2 `CRAWL_STRATEGY`。
- Produces: `buildSiteAudit` 输入新增可选 `linkGraph?: LinkGraphPayload | null`、`crawlStrategy?: string`、`sitemapReserveRatio?: number`;`SiteAuditPayload.linkGraph?: LinkGraphPayload`;`protocol.crawlStrategy?: string`、`protocol.sitemapReserveRatio?: number`。

- [ ] **Step 1: 写失败测试**(`site-audit.test.ts` 追加)

```ts
  it('挂载 linkGraph：pages[].depth 取图谱深度，协议记录抓取策略', () => {
    const graph = buildLinkGraph({
      entryUrl: 'https://a.com/',
      pages: [
        { url: 'https://a.com/', checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'entry', linkDetails: [{ url: 'https://a.com/x', count: 1, anchors: [], regions: ['main'], nofollow: false }], externalLinks: [] },
        { url: 'https://a.com/x', checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'both', linkDetails: [], externalLinks: [] },
      ],
    })
    const out = buildSiteAudit({
      pages: [page({ url: 'https://a.com/', discoveredVia: 'entry', depth: 0 }), page({ url: 'https://a.com/x', discoveredVia: 'both', depth: null })],
      templates: [], citedUrls: [], entryHost: 'a.com', maxPages: 200, maxDepth: 3,
      linkGraph: graph, crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2,
    })
    expect(out.pages.map((p) => p.depth)).toEqual([0, 1])
    expect(out.protocol).toEqual({ maxPages: 200, maxDepth: 3, crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2 })
    expect(out.linkGraph).toBe(graph)
  })
```

(import `buildLinkGraph` from `./link-graph`。)`audit-diff.test.ts` 追加:

```ts
  it('crawlStrategy 不同（旧快照缺省视为 sitemap_first_v0）→ protocolMismatch', () => {
    const base = audit({})
    const retest = { ...audit({}), protocol: { ...audit({}).protocol, crawlStrategy: 'link_first_v1' } }
    expect(diffSiteAudits(base, retest).protocolMismatch).toBe(true)
    expect(diffSiteAudits(retest, retest).protocolMismatch).toBe(false)
  })
```

(按 `audit-diff.test.ts` 现有夹具函数名调整 `audit(...)`。)

- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**

`site-audit.ts`:

```ts
import { readLinkGraph, type LinkGraphPayload } from './link-graph'
// SiteAuditPayload:
  protocol: { maxPages: number; maxDepth: number; crawlStrategy?: string; sitemapReserveRatio?: number }
  // 站内链接图谱（spec S1 §6）：历史证据无此字段，规则经 readLinkGraph 取得 null 后回退旧逻辑。
  linkGraph?: LinkGraphPayload
// buildSiteAudit 输入追加：
  linkGraph?: LinkGraphPayload | null
  crawlStrategy?: string
  sitemapReserveRatio?: number
// 函数体：
  const view = input.linkGraph ? readLinkGraph({ linkGraph: input.linkGraph }) : null
  // 有图谱时逐页深度取图谱 BFS 深度（修 D1：sitemap 页不再恒为 null）；首页不可达为 null。
  const outPages = view ? pages.map((p) => ({ ...p, depth: view.nodeByUrl.get(p.url)?.depth ?? null })) : pages
  ...
  protocol: {
    maxPages, maxDepth,
    ...(input.crawlStrategy ? { crawlStrategy: input.crawlStrategy } : {}),
    ...(input.sitemapReserveRatio !== undefined ? { sitemapReserveRatio: input.sitemapReserveRatio } : {}),
  },
  pages: outPages,
  ...(input.linkGraph ? { linkGraph: input.linkGraph } : {}),
```

`audit-diff.ts`:

```ts
// 旧快照无 crawlStrategy：视为 S1 之前的 sitemap 优先抓取（spec S1 §8 重测兼容）。
const strategyOf = (a: SiteAuditPayload) => a.protocol.crawlStrategy ?? 'sitemap_first_v0'
  const protocolMismatch =
    baseline.protocol.maxPages !== retest.protocol.maxPages ||
    baseline.protocol.maxDepth !== retest.protocol.maxDepth ||
    strategyOf(baseline) !== strategyOf(retest)
```

- [ ] **Step 4: 跑测试确认通过**;并跑 `lib/crawl` 全目录。

---

### Task 5: DB 列 + 仓库函数(run 隔离)

**Files:**
- Modify: `db/schema.ts`、`lib/repositories/index.ts`
- Create: `db/migrations/0014_*.sql`(drizzle-kit generate)、`lib/repositories/site-pages.repo.test.ts`

**Interfaces:**
- Produces: `sitePages.lastSeenRunId`、`sitePages.linkDetails`、`sitePages.externalLinks`;`SitePageUpsert.linkDetails`、`SitePageUpsert.externalLinks`;`getRunSitePages(projectId: string, runId: string)`;`updateInboundCounts(projectId: string, runId: string, counts: Record<string, number>)`。

- [ ] **Step 1: 改 schema**(`sitePages` 表 `isKeyPage` 之后):

```ts
  // 本行最近一次被哪个 run 抓到/发现（spec S1 §5）：快照与入度按 run 隔离，历史 run 的页不混入。
  lastSeenRunId: text('last_seen_run_id'),
  // 链接明细（spec S1 §3）：站内目标聚合（锚文本/区域/rel）与站外链接；discovered_only 等未抓页为 null。
  linkDetails: text('link_details', { mode: 'json' }).$type<InternalLinkDetail[]>(),
  externalLinks: text('external_links', { mode: 'json' }).$type<ExternalLinkDetail[]>(),
```

顶部 `import type { InternalLinkDetail, ExternalLinkDetail } from '../lib/crawl/light-check'`。

- [ ] **Step 2: 生成迁移** — `LIBSQL_URL=file:./veris.db pnpm drizzle-kit generate --name s1_link_graph`。检查生成的 SQL **只含**三条 `ALTER TABLE site_pages ADD ...`;若混入其他表的变更,停止并在实现笔记记录(说明 schema 与 0013 快照已漂移)。

- [ ] **Step 3: 写失败测试** `lib/repositories/site-pages.repo.test.ts`(沿用 `keywords.repo.test.ts` 的临时库引导方式)

```ts
// 覆盖 D4/D5：快照按 run 隔离；入度每轮先清零再写入。
it('getRunSitePages 只返回本 run 见过的页；链接明细 JSON 往返', async () => {
  await repo.upsertSitePages('proj_s1', 'run_1', [row('https://ex.com/a'), row('https://ex.com/b')])
  await repo.upsertSitePages('proj_s1', 'run_2', [row('https://ex.com/a', [{ url: 'https://ex.com/b', count: 2, anchors: ['B'], regions: ['nav'], nofollow: false }])])
  const r2 = await repo.getRunSitePages('proj_s1', 'run_2')
  expect(r2.map((p) => p.url)).toEqual(['https://ex.com/a'])
  expect(r2[0].linkDetails).toEqual([{ url: 'https://ex.com/b', count: 2, anchors: ['B'], regions: ['nav'], nofollow: false }])
  expect(r2[0].lastSeenRunId).toBe('run_2')
})

it('updateInboundCounts 先把本 run 页入度清零，不动其他 run 的页', async () => {
  await repo.upsertSitePages('proj_s1', 'run_1', [row('https://ex.com/a'), row('https://ex.com/b')])
  await repo.updateInboundCounts('proj_s1', 'run_1', { 'https://ex.com/a': 5, 'https://ex.com/b': 4 })
  await repo.upsertSitePages('proj_s1', 'run_2', [row('https://ex.com/a')])
  await repo.updateInboundCounts('proj_s1', 'run_2', {})
  const all = Object.fromEntries((await repo.getSitePages('proj_s1')).map((p) => [p.url, p.inboundLinkCount]))
  expect(all).toEqual({ 'https://ex.com/a': 0, 'https://ex.com/b': 4 })
})
```

`row(url, linkDetails = [])` 返回完整 `SitePageUpsert`(`discoveredVia: 'crawl'`、`checkStatus: 'checked'`、`externalLinks: []`,其余 null)。`beforeEach` 删 `sitePages`/`runs`/`projects` 并插入 `proj_s1` 与 `run_1`、`run_2`(字段照 `keywords.repo.test.ts` 的 seed)。

- [ ] **Step 4: 跑测试确认失败**(`getRunSitePages` 不存在)。
- [ ] **Step 5: 实现**(`lib/repositories/index.ts`)

```ts
// SitePageUpsert 追加：
  // 链接明细（spec S1 §3）；未抓页（discovered_only / 禁抓 / 错误）为 null 或空数组。
  linkDetails: InternalLinkDetail[] | null
  externalLinks: ExternalLinkDetail[] | null

// upsertSitePages：values 加 lastSeenRunId: runId；set 加
          linkDetails: row.linkDetails,
          externalLinks: row.externalLinks,
          lastSeenRunId: runId,

// 本 run 见过的页（spec S1 §5）：site_audit 快照与图谱只用它，历史 run 的页不混入（修 D4）。
export const getRunSitePages = (projectId: string, runId: string) =>
  db.select().from(sitePages).where(and(eq(sitePages.projectId, projectId), eq(sitePages.lastSeenRunId, runId)))

// 入度按 run 重算（修 D5）：先把本 run 页清零，再写入本轮计数；不动其他 run 的页。
export const updateInboundCounts = async (projectId: string, runId: string, counts: Record<string, number>) => {
  const scope = and(eq(sitePages.projectId, projectId), eq(sitePages.lastSeenRunId, runId))
  await db.update(sitePages).set({ inboundLinkCount: 0 }).where(scope)
  for (const [url, count] of Object.entries(counts)) {
    if (count <= 0) continue
    await db.update(sitePages).set({ inboundLinkCount: count }).where(and(scope, eq(sitePages.url, url)))
  }
}
```

- [ ] **Step 6: 跑测试确认通过**;跑 `lib/repositories` 全目录。

---

### Task 6: 编排接线(collect-evidence)

**Files:**
- Modify: `lib/inngest/collect-evidence.ts`
- Test: `lib/inngest/collect-evidence.test.ts`

**Interfaces:**
- Consumes: Task 2 `CRAWL_STRATEGY`、`SITEMAP_RESERVE_RATIO`;Task 3 `buildLinkGraph`、`inboundAllByUrl`;Task 4 `buildSiteAudit` 新参数;Task 5 `getRunSitePages`、`updateInboundCounts(projectId, runId, counts)`。
- Produces: step `crawl-batch-i` 返回 `{ state, resultCount }`(无 `persist-crawl-batch-i`);step `update-inbound-counts` 返回 `void`;step `build-site-audit` 返回 `{ evidenceId, payloadBytes }`(无 `persist-site-audit`)。

- [ ] **Step 1: 写失败测试**(`collect-evidence.test.ts`)
  - `makeArgs` 增加 `stepOutputs: Record<string, unknown>`,在 `step.run` 里记录 `stepOutputs[id] = out`,随 `{ args, published, stepOutputs }` 返回。
  - `makeDeps` 增加 `getRunSitePages`(默认返回与 `getSitePages` 默认相同的一行,并带 `linkDetails: []`、`externalLinks: []`、`lastSeenRunId: 'run_1'`);默认 `runCrawlBatch` 结果补 `linkDetails: [], externalLinks: []`。
  - 新用例:

```ts
  it('S1：抓取 step 内落库且返回值不含抓取结果；审计 step 只返回引用；site_audit 带 linkGraph 与抓取策略', async () => {
    const deps = makeDeps()
    const { args, stepOutputs } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(Object.keys(stepOutputs['crawl-batch-0'] as object).sort()).toEqual(['resultCount', 'state'])
    expect(stepOutputs).not.toHaveProperty('persist-crawl-batch-0')
    expect(deps.upsertSitePages).toHaveBeenCalledWith('proj_1', 'run_1', expect.arrayContaining([expect.objectContaining({ linkDetails: [], externalLinks: [] })]))
    expect(deps.updateInboundCounts).toHaveBeenCalledWith('proj_1', 'run_1', expect.any(Object))
    expect(deps.getRunSitePages).toHaveBeenCalledWith('proj_1', 'run_1')
    expect(Object.keys(stepOutputs['build-site-audit'] as object).sort()).toEqual(['evidenceId', 'payloadBytes'])
    const audit = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'site_audit')?.[0]
    expect(audit?.payload).toMatchObject({ protocol: { crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2 }, linkGraph: { version: 1 } })
    expect(audit?.id).toBe((stepOutputs['build-site-audit'] as { evidenceId: string }).evidenceId)
  })
```

- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**
  - `CollectDeps` 增加 `getRunSitePages: typeof getRunSitePages`;`defaultDeps()` 增加 `getRunSitePages`;import 增加 `getRunSitePages`、`buildLinkGraph, inboundAllByUrl, type LinkGraphPageInput`、`CRAWL_STRATEGY, SITEMAP_RESERVE_RATIO`。
  - `toUpsert` 增加 `linkDetails: r.linkDetails, externalLinks: r.externalLinks`;`persist-discovered-only` 行增加 `linkDetails: null, externalLinks: null`。
  - 抓取循环:

```ts
      // 抓取与落库同一 step（spec S1 §7）：抓取结果（含链接明细）不进入 Inngest 状态，只回传状态与计数。
      const batch = await step.run(`crawl-batch-${batchIdx}`, async () => {
        const out = await deps.runCrawlBatch(snapshot, crawlOpts)
        if (out.results.length) await deps.upsertSitePages(projectId, runId, out.results.map(toUpsert))
        return { state: out.state, resultCount: out.results.length }
      })
      crawlState = batch.state
```

  - 模块级辅助:

```ts
// 本 run 页面 → 图谱输入（spec S1 §6）。
const toGraphInput = (p: Awaited<ReturnType<typeof getRunSitePages>>[number]): LinkGraphPageInput => ({
  url: p.url, checkStatus: p.checkStatus, httpStatus: p.httpStatus, metaRobots: p.metaRobots,
  discoveredVia: p.discoveredVia, linkDetails: p.linkDetails ?? null, externalLinks: p.externalLinks ?? null,
})
```

  - `update-inbound-counts`:

```ts
    // 入度来自本 run 图谱（spec S1 §5/§7）：只写本 run 存在行的 URL，先清零再写（修 D5）。
    await step.run('update-inbound-counts', async () => {
      const pages = await deps.getRunSitePages(projectId, runId)
      const inbound = inboundAllByUrl(buildLinkGraph({ entryUrl: entrySeed, pages: pages.map(toGraphInput) }))
      const counts = Object.fromEntries(pages.map((p) => [p.url, inbound[p.url] ?? 0]))
      await deps.updateInboundCounts(projectId, runId, counts)
    })
```

  - `build-site-audit`(替换原 build + persist 两个 step):

```ts
    // 构建与落库同一 step（spec S1 §7，修 D8）：大载荷不跨 step 边界，只回传证据引用与体积。
    await step.run('build-site-audit', async () => {
      const [pages, templates, probeResults] = await Promise.all([
        deps.getRunSitePages(projectId, runId),
        deps.getProjectTemplates(projectId),
        deps.getRunProbeResults(runId),
      ])
      const pageById = new Map(pages.map((p) => [p.id, p]))
      const linkGraph = buildLinkGraph({ entryUrl: entrySeed, pages: pages.map(toGraphInput) })
      const auditPayload = buildSiteAudit({
        pages: pages.map((p): SiteAuditPage => ({ /* 与原映射相同 */ })),
        templates: templates.map((t) => ({ /* 与原映射相同 */ })),
        citedUrls: probeResults.flatMap((r) => r.citedUrls),
        entryHost: domain, maxPages, maxDepth,
        linkGraph, crawlStrategy: CRAWL_STRATEGY, sitemapReserveRatio: SITEMAP_RESERVE_RATIO,
      })
      const rawText = JSON.stringify(auditPayload)
      const evidenceId = `ev_${crypto.randomUUID()}`
      await deps.createEvidenceArtifact({
        id: evidenceId, projectId, runId, type: 'site_audit', claimLevel: 'L4', source: entryUrl,
        payload: auditPayload, rawText, rawHash: sha256Hex(rawText),
      })
      return { evidenceId, payloadBytes: rawText.length }
    })
```

  - 注意 `pageById` 查找模板代表页时,代表页可能不在本 run 页中 → 仍返回 `null`(与原逻辑一致)。原 `pageById` 用于模板 → 若需项目全量,保留 `deps.getSitePages(projectId)` 仅供模板代表页 URL 查找。
  - 已有用例若 mock 了 `getSitePages` 用于审计断言,改为同时 mock `getRunSitePages`。

- [ ] **Step 4: 跑测试确认通过** — `pnpm vitest run lib/inngest/collect-evidence.test.ts`。

---

### Task 7: 规则 T12 / T05 + 规则版本

**Files:**
- Modify: `lib/diagnosis/rules/technical.ts`、`lib/diagnosis/types.ts`
- Test: `lib/diagnosis/rules/technical.test.ts`、`lib/diagnosis/rules/geo.test.ts`

**Interfaces:**
- Consumes: Task 3 `readLinkGraph`、`buildLinkGraph`。

- [ ] **Step 1: 写失败测试**(`technical.test.ts` 追加;现有 T05/T12 用例保留不改 = Review Focus 4)

```ts
const H = 'https://example.com'
const gp = (path: string, links: string[], over: Partial<LinkGraphPageInput> = {}): LinkGraphPageInput => ({
  url: `${H}${path}`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl',
  linkDetails: links.map((l) => ({ url: `${H}${l}`, count: 1, anchors: [], regions: ['main'], nofollow: false })),
  externalLinks: [], ...over,
})
const withGraph = (a: RuleContext['siteAudit'], pages: LinkGraphPageInput[]): RuleContext['siteAudit'] =>
  ({ ...a!, payload: { ...a!.payload, linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages }) } })

describe('T12 读图谱深度（spec S1 §8）', () => {
  it('只统计深度精确且 > 3 的节点（含已发现未抓）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']), gp('/2', ['/3']), gp('/3', ['/4']),
    ])
    const hit = rule('T12').evaluate(ctx) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, exactDepthHorizon: 4, examples: [{ url: `${H}/4`, depth: 4, fetched: false }] })
    expect(hit.claimType).toBeUndefined()
  })
  it('视界不足 4（第 2 层有抓取失败）时不判定', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']),
      gp('/2', [], { checkStatus: 'error', httpStatus: 0, linkDetails: null }),
    ])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })
})

describe('T05 诚信降级（spec S1 §8）', () => {
  const orphan = page({ url: `${H}/o`, discoveredVia: 'sitemap', depth: null, inboundLinkCount: 0 })
  it('抓取未穷尽 → inferred，措辞说明已抓范围', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 3 }, [orphan]), [
      gp('/', ['/a'], { discoveredVia: 'entry' }), gp('/a', ['/z']), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    const hit = rule('T05').evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
    expect(hit.description).toContain('已抓取的 3 页')
  })
  it('抓取穷尽 → 保持 measured_hard', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 3 }, [orphan]), [
      gp('/', ['/a'], { discoveredVia: 'entry' }), gp('/a', []), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    expect((rule('T05').evaluate(ctx) as RuleHitDraft).claimType).toBeUndefined()
  })
  it('入口页零站内出链（疑似 JS 渲染导航）→ 不判定（Review Focus 1）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 2 }, [orphan]), [
      gp('/', [], { discoveredVia: 'entry' }), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    expect(rule('T05').evaluate(ctx)).toBeNull()
  })
})
```

`geo.test.ts` 的版本断言改为 `rules_v6`(用例名同步为"已随 S1 T05/T12 口径变化升版为 rules_v6")。

- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**(`technical.ts`,import `readLinkGraph`)

T05 在 `if (n <= 0) return null` 之后:

```ts
    const graph = readLinkGraph(audit.payload)
    // 入口页零站内出链：多为 JS 渲染导航，初始 HTML 抽不到链接，孤岛判定不可信（spec S1 Review Focus 1）。
    if (graph && (graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0) return null
    // 抓取未穷尽：未抓页可能链向它，只能说「已抓范围内未发现入链」（spec S1 §8）。
    const partial = graph !== null && !graph.exhaustive
    return {
      title: '存在孤岛页（sitemap 声明但无内链入口）',
      description: partial
        ? `在已抓取的 ${audit.payload.stats.checked} 页中，有 ${n} 个 sitemap 声明的页面未发现任何内链指向（本次抓取未穷尽全站，未抓取页面可能链向它们）。`
        : `检测到 ${n} 个页面仅在 sitemap 中声明、站内无任何内链指向，抓取发现与内链传权受限。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples, ...(graph ? { exhaustive: graph.exhaustive } : {}) },
      ...(partial ? { claimType: 'inferred' as const } : {}),
    }
```

T12 在 `if (!audit) return null` 之后:

```ts
    const graph = readLinkGraph(audit.payload)
    if (graph) {
      // 只用深度精确的节点下实测结论（深度 ≤ 视界 H）；已发现未抓的超深目标同样计入（修 D2）。
      const deep = graph.nodes.filter((n) => n.depthExact && n.depth !== null && n.depth > MAX_DEPTH)
      if (deep.length === 0) return null
      const examples = [...deep]
        .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
        .slice(0, 10)
        .map((n) => ({ url: n.url, depth: n.depth, fetched: n.fetched }))
      return {
        title: '页面点击深度过深',
        description: `在本次抓取的链接图内，${deep.length} 个页面从首页出发的最短点击路径超过 ${MAX_DEPTH} 层（仅统计可精确测定深度的页面），权重传导与抓取效率随深度递减，重点页应压到 ${MAX_DEPTH} 层内。`,
        evidenceRefs: [audit.id],
        scope: 'site',
        detail: { maxDepth: MAX_DEPTH, count: deep.length, examples, exactDepthHorizon: graph.exactDepthHorizon, closureComplete: graph.closureComplete },
      }
    }
```

`types.ts`:`export const RULES_VERSION = 'rules_v6'`。

- [ ] **Step 4: 跑测试确认通过** — `pnpm vitest run lib/diagnosis`。

---

### Task 8: 端到端 + 体积预算测试

**Files:**
- Create: `lib/crawl/link-graph.e2e.test.ts`、`lib/crawl/link-graph.size.test.ts`

**Interfaces:**
- Consumes: 真实 `fetchLightCheck`(假 safeFetch)、`createCrawlState`/`runCrawlBatch`、`buildLinkGraph`、`inboundAllByUrl`、`buildSiteAudit`、`technicalRules`。

- [ ] **Step 1: 写 E2E 测试**:假站点 HTML(入口 `/` 302 到 `/en`;`/en` → `/a`、`/nf`(rel=nofollow)、`/broken`(404);`/a`→`/b`→`/c`→`/d`→`/e` 链;sitemap 声明 `/a`…`/e`、`/x`、`/y`、`/lonely`;`/x`↔`/y` 互链;`/lonely` 无链接)。循环 `runCrawlBatch`(maxDepth 3、maxPages 200)收集结果 → 转 `LinkGraphPageInput` → `buildLinkGraph` → 用 `inboundAllByUrl` 回填 `inboundLinkCount` → `buildSiteAudit` → 构造 `RuleContext`(同 technical.test 的 baseCtx 字段)→ 断言:
  - D1:`/a`、`/b`、`/c` 图谱深度 1、2、3(非 null);
  - D2:T12 命中且 examples 含 `/d`(4)、`/e`(5);
  - D3:`summary.unreachableSitemapNodes` = 3(`/x`、`/y`、`/lonely`),`/x`、`/y` 的 `inAll` = 1;
  - T05 命中 `/lonely`(唯一入度 0 的 sitemap-only 页),`exhaustive = true` → claimType 未覆盖(measured_hard);
  - Review Focus 3:入口跳转后 `/a` 深度仍为 1;
  - `/nf` 深度 null(只经 nofollow 可达)。
- [ ] **Step 2: 写体积预算测试**:假 fetch 直接返回 `LightCheckPage`,200 页 × 每页 300 个目标(从 10000 个 URL 空间取、3 条 30 字锚文本)、sitemap 5000 条;模拟 collect-evidence 的 step 返回值 `{ state, resultCount }` 做 `JSON.stringify` 计字节:单步 < 2 MiB、总和 < 16 MiB;再 `buildLinkGraph` + `buildSiteAudit` payload < 8 MiB。
- [ ] **Step 3: 跑测试**。E2E 失败即回到对应 Task 修实现;体积超预算按 spec §7 调 `batchSize` 并记实现笔记。

---

### Task 9: 本地库迁移 + 全量验证 + 审查

- [ ] **Step 1: 本地库加列**(已备份到 scratchpad `veris.db.before-s1`):对 `veris.db` 执行 Task 5 生成的三条 `ALTER TABLE`(sqlite3),`PRAGMA table_info(site_pages)` 确认三列存在。
- [ ] **Step 2: 全量** — `pnpm test`、`pnpm exec tsc --noEmit -p .`、`pnpm lint`,不低于基线。
- [ ] **Step 3: 并发改动检查** — 对比 `scratchpad/s1-hashes-before.txt` 与 `git status`,确认本计划外文件未被本会话改动;若计划内文件在本会话之外变动,停下核对。
- [ ] **Step 4: 独立审查** — 派一个新上下文审查代理(只给 spec + diff,不给推理过程),按 Review Focus 与 spec 逐条找缺陷;确认的问题回到对应 Task 修复。
- [ ] **Step 5: 更新项目 memory**(S1 落地状态、未提交、下一步 S2)。
