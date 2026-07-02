# 全站路由发现 + 动态路由去重采样分析 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次诊断 run 从「只采集入口 URL 一页」扩展为「sitemap+内链发现全站路由 → 全站轻检（≤200 页）→ URL 模板聚类 → 每模板代表页深检 → 探针引用归属」，并提供站点结构面板 UI。

**Architecture:** 新增 `lib/crawl/` 模块群（URL 归一化、sitemap 解析、轻检、BFS 批爬、模板聚类、site_audit 聚合，全部纯函数或注入 fetch 的可测函数）；数据模型新增 `site_pages` + `url_templates` 两张表；`collectEvidenceHandler` 插入爬取/聚类/深检/审计 steps（沿用 deps 注入模式）；UI 新增 `app/[locale]/runs/[id]/site/` 页面 + Server Actions。

**Tech Stack:** Next.js 16 App Router + React 19、Inngest、libSQL (Turso) + Drizzle、linkedom、Vitest、next-intl。

**Spec:** `docs/superpowers/specs/2026-07-02-site-route-discovery-design.md`（本计划的需求来源，实现有歧义时以 spec 为准）。

## Global Constraints

- **编码前必读 veris-coding skill 铁律**：Server Component 默认、`'use client'` 只在叶子；`params`/`searchParams`/`cookies` 必须 `await`；不用 `forwardRef`；变更数据用 Server Action + `revalidatePath`，不另起 `/api`；长任务在 Inngest 内。
- **证据纪律**：evidence 不可变（原始内容 + hash + capturedAt 一起存）；模板聚类结论是 `inferred`，代表页推广到模板是 `measured_sample`，逐页轻检/深检是 L4 `measured_hard`；UI 不得把推断标成「实测」。
- **语言规范**：commit message、代码内业务注释用中文；UI 文案中文（经 next-intl messages）；变量/函数/字段名英文。
- **测试**：Vitest，命令 `pnpm test <文件路径>`（跑单文件）/ `pnpm test`（全量）。TDD：先写失败测试。
- **包管理**：pnpm。数据库变更：改 `db/schema.ts` 后 `pnpm db:push`（项目无 migration 文件流，走 push；SQLite 改 check 约束会重建表，push 时确认即可）。
- **step.run 返回值经 JSON 序列化往返**：不要让 step 返回 URL/Date/Map/Set 等富对象，一律返回普通 JSON 结构（现有代码与测试都据此约定）。
- **爬取默认参数**：maxPages=200、maxDepth=3、batchSize=20、并发=4，均以 `projectSettings` 为准可配置。
- 只爬与入口同 host（www 归一化后）的 URL；遵守 robots.txt disallow；每个被 fetch 的 URL 都过 `safeFetch`（内含 SSRF guard）。

---

## 文件结构总览

| 文件 | 职责 | 任务 |
|---|---|---|
| `db/schema.ts`（改） | 新表 site_pages / url_templates；evidence 枚举 + site_page_id 列；projectSettings 爬取配置 | 1 |
| `lib/types.ts`（改） | EvidenceType 扩枚举 | 1 |
| `lib/repositories/index.ts`（改） | site_pages / url_templates / site_audit 数据访问 | 1 |
| `lib/crawl/url.ts`（新） | URL 归一化、同站判定 | 2 |
| `lib/crawl/sitemap.ts`（新） | robots 声明解析、sitemap(index) 递归抓取 | 3 |
| `lib/crawl/light-check.ts`（新） | 单页轻检（fetch + 解析 + 内链提取） | 4 |
| `lib/crawl/crawler.ts`（新） | BFS 批爬状态机 | 5 |
| `lib/crawl/template-cluster.ts`（新） | URL 模板聚类 + 代表页选择 | 6 |
| `lib/crawl/site-audit.ts`（新） | site_audit 聚合快照 + citations 归属 | 7 |
| `lib/inngest/channels.ts`（改） | 进度消息扩 phase 帧 | 8 |
| `lib/inngest/collect-evidence.ts`（改） | 集成爬取/聚类/深检/审计 steps | 8 |
| `app/[locale]/runs/[id]/site/page.tsx`（新） | 站点结构面板（Server Component） | 9 |
| `app/[locale]/runs/[id]/site/actions.ts`（新） | 标记重点页 / 更换代表页 Server Actions | 9 |
| `components/SitePageActions.tsx`（新） | 客户端操作叶子组件 | 9 |
| `messages/zh.json` `messages/en.json`（改） | 面板文案 | 9 |
| `lib/crawl/audit-diff.ts`（新） | 两次 site_audit 快照对比 | 10 |
| `app/api/runs/[id]/delta/route.ts`（改） | delta 响应加 siteAuditDiff | 10 |

---

### Task 1: 数据模型扩展（schema + types + repositories）

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/types.ts:12`
- Modify: `lib/repositories/index.ts`

**Interfaces:**
- Consumes: 现有 `projects` / `runs` / `evidenceArtifacts` 表定义。
- Produces（后续任务依赖的确切签名）:
  - 表对象 `sitePages`、`urlTemplates`（`db/schema.ts` 导出）
  - `EvidenceType` 新增 `'sitemap' | 'site_audit'`
  - `NewEvidenceArtifact` 新增可选字段 `sitePageId?: string | null`
  - `upsertSitePages(projectId: string, runId: string, rows: SitePageUpsert[]): Promise<void>`
  - `getSitePages(projectId: string)` → `Promise<(typeof sitePages.$inferSelect)[]>`
  - `updateInboundCounts(projectId: string, counts: Record<string, number>): Promise<void>`
  - `syncUrlTemplates(projectId: string, plans: TemplatePlanInput[]): Promise<void>`
  - `getProjectTemplates(projectId: string)` → `Promise<(typeof urlTemplates.$inferSelect)[]>`
  - `setSitePageKeyFlag(id: string, isKeyPage: boolean): Promise<void>`
  - `setTemplateRepresentative(templateId: string, pageId: string): Promise<void>`（同时置 `source='user'`）
  - `getSiteAuditEvidence(runId: string)` → 该 run 的 `site_audit` evidence 行或 undefined

说明：仓库层是薄 Drizzle 包装（与现有 `lib/repositories/index.ts` 同风格，无单测——项目没有 DB 测试挂具，逻辑都放纯函数模块里测）。本任务的验证 = 类型检查 + `db:push` 成功 + 既有测试全绿。

- [ ] **Step 1: 修改 `db/schema.ts`**

在 `runs` 表定义之后、`prompts` 之前插入两张新表（顺序重要：`evidenceArtifacts` 之后会引用 `sitePages`）：

```ts
// 站点页面：全站轻检的「当前状态」模型（可变）。不可变快照存 site_audit evidence。
export const sitePages = sqliteTable('site_pages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  firstSeenRunId: text('first_seen_run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  discoveredVia: text('discovered_via').notNull(),
  depth: integer('depth'),
  httpStatus: integer('http_status'),
  finalUrl: text('final_url'),
  title: text('title'),
  canonicalUrl: text('canonical_url'),
  metaRobots: text('meta_robots'),
  mainTextChars: integer('main_text_chars'),
  contentHash: text('content_hash'),
  inboundLinkCount: integer('inbound_link_count').notNull().default(0),
  checkStatus: text('check_status').notNull().default('discovered_only'),
  errorReason: text('error_reason'),
  // 与 url_templates.representative_page_id 互为环，SQLite 单侧建 FK，此列存普通 id 字符串。
  templateId: text('template_id'),
  isKeyPage: integer('is_key_page', { mode: 'boolean' }).notNull().default(false),
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('site_pages_project_url').on(t.projectId, t.url),
  check('site_pages_via', sql`${t.discoveredVia} in ('entry','sitemap','crawl','both')`),
  check('site_pages_status', sql`${t.checkStatus} in ('checked','discovered_only','blocked_by_robots','error')`),
])

// URL 模板：project 级持久，保障同协议重测（代表页被用户改过后启发式不再覆盖）。
export const urlTemplates = sqliteTable('url_templates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  pageCount: integer('page_count').notNull().default(0),
  representativePageId: text('representative_page_id').references(() => sitePages.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('heuristic'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [
  uniqueIndex('url_templates_project_pattern').on(t.projectId, t.pattern),
  check('url_templates_source', sql`${t.source} in ('heuristic','user')`),
])
```

首行 import 增加 `uniqueIndex`：

```ts
import { sqliteTable, text, integer, check, uniqueIndex } from 'drizzle-orm/sqlite-core'
```

`evidenceArtifacts` 两处修改——加列 + 扩 check 枚举：

```ts
  parserVersion: text('parser_version').notNull().default('v0'),
  // 深检证据挂到具体站点页面；历史行与站点无关的证据留空。
  sitePageId: text('site_page_id').references(() => sitePages.id, { onDelete: 'set null' }),
}, (t) => [
  check('evidence_type', sql`${t.type} in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual','sitemap','site_audit')`),
  check('evidence_level', sql`${t.claimLevel} in ('L1','L2','L3','L4')`),
])
```

`projectSettings` 追加三列：

```ts
  cachePolicy: text('cache_policy').notNull().default('default'),
  crawlEnabled: integer('crawl_enabled', { mode: 'boolean' }).notNull().default(true),
  crawlMaxPages: integer('crawl_max_pages').notNull().default(200),
  crawlMaxDepth: integer('crawl_max_depth').notNull().default(3),
```

- [ ] **Step 2: 修改 `lib/types.ts` 第 12 行**

```ts
export type EvidenceType = 'gsc' | 'ai_answer' | 'page_fetch' | 'render_check' | 'schema' | 'serp_snapshot' | 'manual' | 'sitemap' | 'site_audit'
```

- [ ] **Step 3: 扩展 `lib/repositories/index.ts`**

import 行加入 `sitePages, urlTemplates`，drizzle 操作符加 `inArray, and, sql`：

```ts
import { eq, asc, and, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, evidenceArtifacts, projects, projectSettings, brandFacts, retestSnapshots, prompts, aiProbeResults, sitePages, urlTemplates } from '@/db/schema'
```

`NewEvidenceArtifact` 加可选字段：

```ts
export interface NewEvidenceArtifact {
  id: string
  projectId: string
  runId: string
  type: EvidenceType
  claimLevel: EvidenceLevel
  source: string
  request?: unknown
  payload: unknown
  rawText: string
  rawHash: string
  sitePageId?: string | null
}
```

文件末尾（`export * from './validators'` 之前）追加：

```ts
// —— 站点页面 / URL 模板（全站路由发现，spec: 2026-07-02-site-route-discovery）——
export interface SitePageUpsert {
  url: string
  discoveredVia: 'entry' | 'sitemap' | 'crawl' | 'both'
  depth: number | null
  httpStatus: number | null
  finalUrl: string | null
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number | null
  contentHash: string | null
  checkStatus: 'checked' | 'discovered_only' | 'blocked_by_robots' | 'error'
  errorReason: string | null
}

// 逐行 upsert：以 (projectId, url) 为键；只覆盖轻检字段，不碰 isKeyPage/templateId 等人工状态。
export const upsertSitePages = async (projectId: string, runId: string, rows: SitePageUpsert[]) => {
  const now = new Date().toISOString()
  for (const row of rows) {
    await db
      .insert(sitePages)
      .values({ id: `sp_${crypto.randomUUID()}`, projectId, firstSeenRunId: runId, ...row, lastCheckedAt: now })
      .onConflictDoUpdate({
        target: [sitePages.projectId, sitePages.url],
        set: {
          discoveredVia: row.discoveredVia,
          depth: row.depth,
          httpStatus: row.httpStatus,
          finalUrl: row.finalUrl,
          title: row.title,
          canonicalUrl: row.canonicalUrl,
          metaRobots: row.metaRobots,
          mainTextChars: row.mainTextChars,
          contentHash: row.contentHash,
          checkStatus: row.checkStatus,
          errorReason: row.errorReason,
          lastCheckedAt: now,
        },
      })
  }
}

export const getSitePages = (projectId: string) =>
  db.select().from(sitePages).where(eq(sitePages.projectId, projectId))

export const updateInboundCounts = async (projectId: string, counts: Record<string, number>) => {
  for (const [url, count] of Object.entries(counts)) {
    await db.update(sitePages).set({ inboundLinkCount: count })
      .where(and(eq(sitePages.projectId, projectId), eq(sitePages.url, url)))
  }
}

export interface TemplatePlanInput {
  pattern: string
  pageUrls: string[]
  representativeUrl: string | null
}

// 模板同步：pageCount 每次刷新；representativePageId 仅在 source='heuristic' 时被启发式结果覆盖。
export const syncUrlTemplates = async (projectId: string, plans: TemplatePlanInput[]) => {
  const now = new Date().toISOString()
  const pages = await getSitePages(projectId)
  const idByUrl = new Map(pages.map((p) => [p.url, p.id]))
  for (const plan of plans) {
    const repId = plan.representativeUrl ? idByUrl.get(plan.representativeUrl) ?? null : null
    await db
      .insert(urlTemplates)
      .values({
        id: `tpl_${crypto.randomUUID()}`,
        projectId,
        pattern: plan.pattern,
        pageCount: plan.pageUrls.length,
        representativePageId: repId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [urlTemplates.projectId, urlTemplates.pattern],
        set: {
          pageCount: plan.pageUrls.length,
          representativePageId: sql`case when ${urlTemplates.source} = 'heuristic' then ${repId} else ${urlTemplates.representativePageId} end`,
          updatedAt: now,
        },
      })
    const pageIds = plan.pageUrls.map((u) => idByUrl.get(u)).filter((v): v is string => Boolean(v))
    if (pageIds.length) {
      const tpl = await db.query.urlTemplates.findFirst({
        where: and(eq(urlTemplates.projectId, projectId), eq(urlTemplates.pattern, plan.pattern)),
      })
      if (tpl) await db.update(sitePages).set({ templateId: tpl.id }).where(inArray(sitePages.id, pageIds))
    }
  }
}

export const getProjectTemplates = (projectId: string) =>
  db.select().from(urlTemplates).where(eq(urlTemplates.projectId, projectId))

export const setSitePageKeyFlag = (id: string, isKeyPage: boolean) =>
  db.update(sitePages).set({ isKeyPage }).where(eq(sitePages.id, id))

export const setTemplateRepresentative = (templateId: string, pageId: string) =>
  db.update(urlTemplates)
    .set({ representativePageId: pageId, source: 'user', updatedAt: new Date().toISOString() })
    .where(eq(urlTemplates.id, templateId))

export const getSiteAuditEvidence = async (runId: string) => {
  const rows = await db.select().from(evidenceArtifacts)
    .where(and(eq(evidenceArtifacts.runId, runId), eq(evidenceArtifacts.type, 'site_audit')))
  return rows[0]
}
```

- [ ] **Step 4: 类型检查 + 推库 + 既有测试**

```bash
npx tsc --noEmit
pnpm db:push
pnpm test
```

预期：tsc 无错误；db:push 成功（改 check 约束会提示重建 evidence_artifacts 表，确认）；既有测试全绿。

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts lib/types.ts lib/repositories/index.ts
git commit -m "feat(site): 站点页面/URL模板数据模型与仓库层（全站路由发现 Task1）"
```

---

### Task 2: URL 归一化工具

**Files:**
- Create: `lib/crawl/url.ts`
- Test: `lib/crawl/url.test.ts`

**Interfaces:**
- Produces:
  - `normalizeUrl(raw: string, base?: string): string | null` — 非 http(s) 或解析失败返回 null
  - `sameSiteHost(entryUrl: string): string` — 取 host 并去 `www.`
  - `isSameSite(url: string, entryHost: string): boolean`

- [ ] **Step 1: 写失败测试 `lib/crawl/url.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUrl, sameSiteHost, isSameSite } from './url'

describe('normalizeUrl', () => {
  it('去 fragment、去 tracking 参数、排序 query、去 www、去尾斜杠', () => {
    expect(normalizeUrl('https://www.example.com/products/?utm_source=x&b=2&a=1#top'))
      .toBe('https://example.com/products?a=1&b=2')
  })
  it('根路径保留尾斜杠', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
  it('相对路径基于 base 解析', () => {
    expect(normalizeUrl('../a/b', 'https://example.com/x/y/z')).toBe('https://example.com/x/a/b')
  })
  it('非 http(s) 与非法 URL 返回 null', () => {
    expect(normalizeUrl('mailto:a@b.com')).toBeNull()
    expect(normalizeUrl('javascript:void(0)')).toBeNull()
    expect(normalizeUrl('::::')).toBeNull()
  })
})

describe('isSameSite / sameSiteHost', () => {
  it('www 前缀归一后同 host 判定为同站，子域不算', () => {
    const host = sameSiteHost('https://www.example.com/')
    expect(host).toBe('example.com')
    expect(isSameSite('https://example.com/a', host)).toBe(true)
    expect(isSameSite('https://www.example.com/a', host)).toBe(true)
    expect(isSameSite('https://blog.example.com/a', host)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/url.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/url.ts`**

```ts
// URL 归一化：全站爬取的去重键。同一页面的各种写法（www、尾斜杠、utm、fragment、query 顺序）归一到同一字符串。
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|msclkid|ref)$/i

export function normalizeUrl(raw: string, base?: string): string | null {
  let u: URL
  try {
    u = new URL(raw, base)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key)
  }
  u.searchParams.sort()
  u.hostname = u.hostname.replace(/^www\./, '')
  if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export function sameSiteHost(entryUrl: string): string {
  return new URL(entryUrl).hostname.replace(/^www\./, '')
}

export function isSameSite(url: string, entryHost: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === entryHost
  } catch {
    return false
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/url.test.ts`
Expected: PASS（6 例）

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/url.ts lib/crawl/url.test.ts
git commit -m "feat(site): URL 归一化与同站判定（Task2）"
```

---

### Task 3: sitemap 解析与发现

**Files:**
- Create: `lib/crawl/sitemap.ts`
- Test: `lib/crawl/sitemap.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl`（Task 2）、`safeFetch`（`@/lib/security/safe-fetch`，签名 `(rawUrl: string, init?) => Promise<Response>`）。
- Produces:
  - `sitemapUrlsFromRobots(robotsTxt: string): string[]`
  - `extractLocs(xml: string): { isIndex: boolean; locs: string[] }`
  - `discoverSitemaps(entryUrl: string, robotsTxt: string, fetchImpl?: typeof safeFetch): Promise<SitemapDiscovery>`
  - `interface SitemapDiscovery { files: { url: string; xml: string }[]; pageUrls: string[]; warnings: string[] }`

- [ ] **Step 1: 写失败测试 `lib/crawl/sitemap.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { sitemapUrlsFromRobots, extractLocs, discoverSitemaps } from './sitemap'

const xmlUrlset = (urls: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u}</loc></url>`)
    .join('')}</urlset>`

const xmlIndex = (urls: string[]) =>
  `<?xml version="1.0"?><sitemapindex>${urls.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`

function fakeFetch(routes: Record<string, { status: number; body: string }>) {
  return vi.fn(async (url: string) => {
    const r = routes[url] ?? { status: 404, body: '' }
    return { status: r.status, text: async () => r.body, headers: new Headers(), url } as unknown as Response
  })
}

describe('sitemapUrlsFromRobots', () => {
  it('提取 Sitemap: 行（大小写不敏感），无声明返回空数组', () => {
    expect(sitemapUrlsFromRobots('User-agent: *\nSitemap: https://a.com/s.xml\nsitemap:https://a.com/s2.xml'))
      .toEqual(['https://a.com/s.xml', 'https://a.com/s2.xml'])
    expect(sitemapUrlsFromRobots('User-agent: *\nDisallow:')).toEqual([])
  })
})

describe('extractLocs', () => {
  it('区分 index 与 urlset，支持 CDATA', () => {
    expect(extractLocs(xmlIndex(['https://a.com/s1.xml']))).toEqual({ isIndex: true, locs: ['https://a.com/s1.xml'] })
    expect(extractLocs('<urlset><url><loc><![CDATA[ https://a.com/p ]]></loc></url></urlset>'))
      .toEqual({ isIndex: false, locs: ['https://a.com/p'] })
  })
})

describe('discoverSitemaps', () => {
  it('robots 无声明时回退 /sitemap.xml，URL 经归一化去重', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': { status: 200, body: xmlUrlset(['https://www.example.com/a/', 'https://example.com/a']) },
    })
    const out = await discoverSitemaps('https://example.com/', '', fetchImpl)
    expect(out.files).toHaveLength(1)
    expect(out.pageUrls).toEqual(['https://example.com/a'])
  })

  it('sitemap index 递归读取子文件', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/s.xml': { status: 200, body: xmlIndex(['https://example.com/s1.xml']) },
      'https://example.com/s1.xml': { status: 200, body: xmlUrlset(['https://example.com/p1']) },
    })
    const out = await discoverSitemaps('https://example.com/', 'Sitemap: https://example.com/s.xml', fetchImpl)
    expect(out.files.map((f) => f.url)).toEqual(['https://example.com/s.xml', 'https://example.com/s1.xml'])
    expect(out.pageUrls).toEqual(['https://example.com/p1'])
  })

  it('抓取失败降级：记 warning 不抛错', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('boom') })
    const out = await discoverSitemaps('https://example.com/', 'Sitemap: https://example.com/s.xml', fetchImpl as never)
    expect(out.pageUrls).toEqual([])
    expect(out.warnings[0]).toContain('sitemap_fetch_failed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/sitemap.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/sitemap.ts`**

```ts
import { safeFetch } from '@/lib/security/safe-fetch'
import { normalizeUrl } from './url'

export interface SitemapFile { url: string; xml: string }
export interface SitemapDiscovery { files: SitemapFile[]; pageUrls: string[]; warnings: string[] }

// 防爆闸门：sitemap 文件数与 URL 总数上限（超出记 warning，不算错误）。
const MAX_SITEMAP_FILES = 10
const MAX_PAGE_URLS = 5000

export function sitemapUrlsFromRobots(robotsTxt: string): string[] {
  return robotsTxt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^sitemap\s*:/i.test(l))
    .map((l) => l.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean)
}

// XML 里只取 <loc>，容忍 CDATA。sitemap 的 loc 不嵌套，正则解析足够且免依赖。
export function extractLocs(xml: string): { isIndex: boolean; locs: string[] } {
  const isIndex = /<\s*sitemapindex[\s>]/i.test(xml)
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].trim())
  return { isIndex, locs }
}

export async function discoverSitemaps(
  entryUrl: string,
  robotsTxt: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<SitemapDiscovery> {
  const origin = new URL(entryUrl).origin
  const declared = sitemapUrlsFromRobots(robotsTxt)
  const fallback = `${origin}/sitemap.xml`
  const queue = declared.length ? [...declared] : [fallback]
  const seen = new Set<string>()
  const files: SitemapFile[] = []
  const pageUrls = new Set<string>()
  const warnings: string[] = []

  while (queue.length && files.length < MAX_SITEMAP_FILES && pageUrls.size < MAX_PAGE_URLS) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    let res: Response
    try {
      res = await fetchImpl(url)
    } catch {
      warnings.push(`sitemap_fetch_failed:${url}`)
      continue
    }
    if (res.status !== 200) {
      // 回退地址 404 是常态，不记 warning；声明过的地址失败要记。
      if (declared.length || url !== fallback) warnings.push(`sitemap_http_${res.status}:${url}`)
      continue
    }
    const xml = await res.text()
    files.push({ url, xml })
    const { isIndex, locs } = extractLocs(xml)
    if (isIndex) {
      queue.push(...locs)
    } else {
      for (const loc of locs) {
        const n = normalizeUrl(loc)
        if (n) pageUrls.add(n)
        if (pageUrls.size >= MAX_PAGE_URLS) break
      }
    }
  }
  if (queue.length) warnings.push(`sitemap_truncated:${queue.length}_files_unread`)
  return { files, pageUrls: [...pageUrls], warnings }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/sitemap.test.ts`
Expected: PASS（5 例）

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/sitemap.ts lib/crawl/sitemap.test.ts
git commit -m "feat(site): sitemap 声明解析与 index 递归发现（Task3）"
```

---

### Task 4: 单页轻检

**Files:**
- Create: `lib/crawl/light-check.ts`
- Test: `lib/crawl/light-check.test.ts`

**Interfaces:**
- Consumes: `extractMainTextChars`（`@/lib/collection/page-parser`）、`sha256Hex`（`@/lib/collection/hash`）、`normalizeUrl` / `isSameSite`（Task 2）、`safeFetch`。
- Produces:
  - `interface LightCheckPage { url: string; finalUrl: string; httpStatus: number; title: string | null; canonicalUrl: string | null; metaRobots: string | null; mainTextChars: number; contentHash: string; internalLinks: string[]; checkStatus: 'checked' | 'error'; errorReason: string | null }`
  - `parseLightCheckHtml(html: string, pageUrl: string, entryHost: string): Pick<LightCheckPage, 'title' | 'canonicalUrl' | 'metaRobots' | 'mainTextChars' | 'internalLinks'>`
  - `fetchLightCheck(url: string, entryHost: string, fetchImpl?: typeof safeFetch): Promise<LightCheckPage>`（**任何异常都收敛为 checkStatus='error'，绝不抛出**——爬虫据此保证单页失败不中断 run）

- [ ] **Step 1: 写失败测试 `lib/crawl/light-check.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { parseLightCheckHtml, fetchLightCheck } from './light-check'

const html = `<html><head><title> 产品列表 </title>
<link rel="canonical" href="https://example.com/products">
<meta name="robots" content="noindex"></head>
<body><a href="/products/1?utm_source=x">a</a><a href="/products/1">dup</a>
<a href="https://blog.example.com/x">跨子域</a><a href="mailto:a@b.c">mail</a>
<p>hello world</p></body></html>`

describe('parseLightCheckHtml', () => {
  it('提取 title/canonical/metaRobots，内链归一化去重且只留同站', () => {
    const out = parseLightCheckHtml(html, 'https://example.com/products', 'example.com')
    expect(out.title).toBe('产品列表')
    expect(out.canonicalUrl).toBe('https://example.com/products')
    expect(out.metaRobots).toBe('noindex')
    expect(out.internalLinks).toEqual(['https://example.com/products/1'])
    expect(out.mainTextChars).toBeGreaterThan(0)
  })
})

describe('fetchLightCheck', () => {
  it('200 HTML 页返回完整轻检结果', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 200, url, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => html,
    })) as never
    const out = await fetchLightCheck('https://example.com/products', 'example.com', fetchImpl)
    expect(out.checkStatus).toBe('checked')
    expect(out.httpStatus).toBe(200)
    expect(out.contentHash).toHaveLength(64)
  })

  it('404 与非 HTML 不解析正文，仍记状态', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 404, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => 'nf',
    })) as never
    const out = await fetchLightCheck('https://example.com/gone', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'checked', httpStatus: 404, internalLinks: [] })
  })

  it('fetch 抛错收敛为 error，不向外抛', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('timeout') }) as never
    const out = await fetchLightCheck('https://example.com/x', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'error', errorReason: 'timeout', httpStatus: 0 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/light-check.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/light-check.ts`**

```ts
import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'
import { extractMainTextChars } from '@/lib/collection/page-parser'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl, isSameSite } from './url'

export interface LightCheckPage {
  url: string
  finalUrl: string
  httpStatus: number
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number
  contentHash: string
  internalLinks: string[]
  checkStatus: 'checked' | 'error'
  errorReason: string | null
}

export function parseLightCheckHtml(html: string, pageUrl: string, entryHost: string) {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  const internalLinks = new Set<string>()
  for (const a of document.querySelectorAll('a[href]')) {
    const n = normalizeUrl(a.getAttribute('href') ?? '', pageUrl)
    if (n && isSameSite(n, entryHost) && n !== pageUrl) internalLinks.add(n)
  }
  return { title, canonicalUrl, metaRobots, mainTextChars: extractMainTextChars(html), internalLinks: [...internalLinks] }
}

const EMPTY_PARSE = { title: null, canonicalUrl: null, metaRobots: null, mainTextChars: 0, internalLinks: [] as string[] }

// 单页轻检永不抛错：失败收敛为 checkStatus='error'，run 不因单页中断。
export async function fetchLightCheck(
  url: string,
  entryHost: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<LightCheckPage> {
  try {
    const res = await fetchImpl(url, { timeoutMs: 10_000 })
    const finalUrl = normalizeUrl(res.url || url) ?? url
    const contentType = res.headers.get('content-type') ?? ''
    if (res.status >= 400 || !contentType.includes('text/html')) {
      return { url, finalUrl, httpStatus: res.status, ...EMPTY_PARSE, contentHash: '', checkStatus: 'checked', errorReason: null }
    }
    const html = await res.text()
    return {
      url,
      finalUrl,
      httpStatus: res.status,
      ...parseLightCheckHtml(html, finalUrl, entryHost),
      contentHash: sha256Hex(html),
      checkStatus: 'checked',
      errorReason: null,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'fetch_failed'
    return { url, finalUrl: url, httpStatus: 0, ...EMPTY_PARSE, contentHash: '', checkStatus: 'error', errorReason: reason }
  }
}
```

注意：若 `lib/collection/hash.ts` 的 `sha256Hex` 是异步的，改为 `await`——先打开该文件确认签名（collect-evidence.ts 中同步调用，应为同步）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/light-check.test.ts`
Expected: PASS（4 例）

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/light-check.ts lib/crawl/light-check.test.ts
git commit -m "feat(site): 单页轻检（状态/canonical/noindex/内链提取）（Task4）"
```

---

### Task 5: BFS 批爬状态机

**Files:**
- Create: `lib/crawl/crawler.ts`
- Test: `lib/crawl/crawler.test.ts`

**Interfaces:**
- Consumes: `fetchLightCheck` / `LightCheckPage`（Task 4）、`parseRobotsAllowed`（`@/lib/collection/robots`，签名 `(robotsTxt: string, path: string, userAgent?) => boolean`）。
- Produces:
  - `type DiscoveredVia = 'entry' | 'sitemap' | 'crawl' | 'both'`
  - `interface CrawlState { entryHost: string; frontier: { url: string; depth: number | null; via: DiscoveredVia }[]; seen: Record<string, DiscoveredVia>; inbound: Record<string, number>; checkedCount: number; done: boolean }`（**纯 JSON，可安全穿越 step.run 序列化**）
  - `interface CrawlPageResult extends Omit<LightCheckPage, 'checkStatus'> { checkStatus: 'checked' | 'error' | 'blocked_by_robots'; discoveredVia: DiscoveredVia; depth: number | null }`
  - `createCrawlState(entryUrl: string, sitemapUrls: string[], entryHost: string): CrawlState`
  - `runCrawlBatch(state: CrawlState, opts: CrawlOptions, fetchImpl?: typeof fetchLightCheck): Promise<{ state: CrawlState; results: CrawlPageResult[] }>`
  - `interface CrawlOptions { maxPages: number; maxDepth: number; batchSize: number; concurrency: number; robotsTxt: string }`
  - `leftoverDiscovered(state: CrawlState): { url: string; via: DiscoveredVia; depth: number | null }[]` — cap 截断后 frontier 里剩余的 URL

- [ ] **Step 1: 写失败测试 `lib/crawl/crawler.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlOptions } from './crawler'
import type { LightCheckPage } from './light-check'

const page = (url: string, links: string[] = []): LightCheckPage => ({
  url, finalUrl: url, httpStatus: 200, title: 't', canonicalUrl: null, metaRobots: null,
  mainTextChars: 100, contentHash: 'h', internalLinks: links, checkStatus: 'checked', errorReason: null,
})

const opts = (over: Partial<CrawlOptions> = {}): CrawlOptions =>
  ({ maxPages: 200, maxDepth: 3, batchSize: 20, concurrency: 4, robotsTxt: '', ...over })

function siteFetch(site: Record<string, string[]>) {
  return vi.fn(async (url: string) => page(url, site[url] ?? []))
}

describe('crawler', () => {
  it('BFS 爬取内链并标注 via/both，入口 depth=0、内链逐层加深', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({
      [entry]: ['https://example.com/a', 'https://example.com/b'],
      'https://example.com/a': ['https://example.com/b'],
    })
    let state = createCrawlState(entry, ['https://example.com/b', 'https://example.com/only-sitemap'], 'example.com')
    const out = await runCrawlBatch(state, opts(), fetchImpl)
    const byUrl = Object.fromEntries(out.results.map((r) => [r.url, r]))
    expect(byUrl[entry]).toMatchObject({ discoveredVia: 'entry', depth: 0 })
    expect(byUrl['https://example.com/a']).toMatchObject({ discoveredVia: 'crawl', depth: 1 })
    // b 同时来自 sitemap 与内链 → both；only-sitemap 无内链入度
    expect(byUrl['https://example.com/b'].discoveredVia).toBe('both')
    expect(out.state.inbound['https://example.com/b']).toBe(2)
    expect(out.state.inbound['https://example.com/only-sitemap']).toBeUndefined()
    expect(out.state.done).toBe(true)
  })

  it('maxPages 截断：多余 URL 留在 frontier 由 leftoverDiscovered 返回', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'] })
    let state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ maxPages: 2, batchSize: 1 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxPages: 2, batchSize: 1 }), fetchImpl)
    expect(out.state.checkedCount).toBe(2)
    expect(leftoverDiscovered(out.state).length).toBeGreaterThan(0)
  })

  it('超过 maxDepth 的链接不入队', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({
      [entry]: ['https://example.com/d1'],
      'https://example.com/d1': ['https://example.com/d2'],
      'https://example.com/d2': ['https://example.com/d3'],
    })
    let state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ maxDepth: 1 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxDepth: 1 }), fetchImpl)
    const urls = Object.keys(out.state.seen)
    expect(urls).toContain('https://example.com/d1')
    expect(urls).not.toContain('https://example.com/d2')
  })

  it('robots disallow 的路径不 fetch，记 blocked_by_robots', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/admin/x'] })
    let state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
    while (!out.state.done) {
      const next = await runCrawlBatch(out.state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
      out = { state: next.state, results: [...out.results, ...next.results] }
    }
    const blocked = out.results.find((r) => r.url === 'https://example.com/admin/x')
    expect(blocked?.checkStatus).toBe('blocked_by_robots')
    expect(fetchImpl.mock.calls.map((c) => c[0])).not.toContain('https://example.com/admin/x')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/crawler.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/crawler.ts`**

```ts
import { parseRobotsAllowed } from '@/lib/collection/robots'
import { fetchLightCheck, type LightCheckPage } from './light-check'

export type DiscoveredVia = 'entry' | 'sitemap' | 'crawl' | 'both'

// 状态是纯 JSON：要在 Inngest step.run 之间序列化往返（不要放 URL/Set/Map）。
export interface CrawlState {
  entryHost: string
  frontier: { url: string; depth: number | null; via: DiscoveredVia }[]
  seen: Record<string, DiscoveredVia>
  inbound: Record<string, number>
  checkedCount: number
  done: boolean
}

export interface CrawlOptions {
  maxPages: number
  maxDepth: number
  batchSize: number
  concurrency: number
  robotsTxt: string
}

export interface CrawlPageResult extends Omit<LightCheckPage, 'checkStatus'> {
  checkStatus: 'checked' | 'error' | 'blocked_by_robots'
  discoveredVia: DiscoveredVia
  depth: number | null
}

export function createCrawlState(entryUrl: string, sitemapUrls: string[], entryHost: string): CrawlState {
  const seen: Record<string, DiscoveredVia> = { [entryUrl]: 'entry' }
  const frontier: CrawlState['frontier'] = [{ url: entryUrl, depth: 0, via: 'entry' }]
  for (const u of sitemapUrls) {
    if (seen[u]) continue
    seen[u] = 'sitemap'
    frontier.push({ url: u, depth: null, via: 'sitemap' })
  }
  return { entryHost, frontier, seen, inbound: {}, checkedCount: 0, done: frontier.length === 0 }
}

function blockedResult(item: { url: string; depth: number | null; via: DiscoveredVia }): CrawlPageResult {
  return {
    url: item.url, finalUrl: item.url, httpStatus: 0, title: null, canonicalUrl: null, metaRobots: null,
    mainTextChars: 0, contentHash: '', internalLinks: [], errorReason: null,
    checkStatus: 'blocked_by_robots', discoveredVia: item.via, depth: item.depth,
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
    seen: { ...state.seen },
    inbound: { ...state.inbound },
  }
  const results: CrawlPageResult[] = []
  const batch: CrawlState['frontier'] = []

  while (batch.length < opts.batchSize && next.frontier.length) {
    if (next.checkedCount + batch.length >= opts.maxPages) break
    const item = next.frontier.shift()!
    const path = new URL(item.url).pathname || '/'
    if (!parseRobotsAllowed(opts.robotsTxt, path)) {
      // robots 禁抓：不消耗页面配额，但记录该 URL 的存在（本身是诊断信号）。
      results.push(blockedResult({ ...item, via: next.seen[item.url] ?? item.via }))
      continue
    }
    batch.push(item)
  }

  for (let i = 0; i < batch.length; i += opts.concurrency) {
    const chunk = batch.slice(i, i + opts.concurrency)
    const pages = await Promise.all(chunk.map((item) => fetchImpl(item.url, state.entryHost)))
    pages.forEach((page, j) => {
      const item = chunk[j]
      next.checkedCount++
      for (const link of page.internalLinks) {
        next.inbound[link] = (next.inbound[link] ?? 0) + 1
        const known = next.seen[link]
        if (known === 'sitemap') next.seen[link] = 'both'
        if (!known) {
          next.seen[link] = 'crawl'
          // 仅 sitemap 发现的页 depth=null，从它出发的链接按第 1 层计。
          const depth = (item.depth ?? 0) + 1
          if (depth <= opts.maxDepth) next.frontier.push({ url: link, depth, via: 'crawl' })
        }
      }
      results.push({ ...page, checkStatus: page.checkStatus, discoveredVia: next.seen[item.url] ?? item.via, depth: item.depth })
    })
  }

  next.done = next.frontier.length === 0 || next.checkedCount >= opts.maxPages
  return { state: next, results }
}

export function leftoverDiscovered(state: CrawlState): { url: string; via: DiscoveredVia; depth: number | null }[] {
  return state.frontier.map((f) => ({ url: f.url, via: state.seen[f.url] ?? f.via, depth: f.depth }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/crawler.test.ts`
Expected: PASS（4 例）

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/crawler.ts lib/crawl/crawler.test.ts
git commit -m "feat(site): BFS 批爬状态机（cap/深度/robots/入度统计）（Task5）"
```

---

### Task 6: URL 模板聚类 + 代表页选择

**Files:**
- Create: `lib/crawl/template-cluster.ts`
- Test: `lib/crawl/template-cluster.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSegment(seg: string): string`
  - `clusterTemplates(urls: string[], entryUrl?: string): { pattern: string; urls: string[] }[]`
  - `interface RepresentativeCandidate { url: string; mainTextChars: number | null; httpStatus: number | null; checkStatus: string }`
  - `selectRepresentative(pages: RepresentativeCandidate[]): string | null`
  - `planTemplates(pages: RepresentativeCandidate[], entryUrl: string): TemplatePlan[]`，`interface TemplatePlan { pattern: string; pageUrls: string[]; representativeUrl: string | null }`——形状与 Task 1 的 `TemplatePlanInput` 一致，Task 8 直接传给 `syncUrlTemplates`。
- **纪律**：聚类结论是推断（`inferred`），命名与注释里不得出现「实测/measured」。

- [ ] **Step 1: 写失败测试 `lib/crawl/template-cluster.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { clusterTemplates, selectRepresentative, planTemplates } from './template-cluster'

describe('clusterTemplates', () => {
  it('数字段→{id}、uuid→{uuid}、日期→{date}', () => {
    const out = clusterTemplates([
      'https://a.com/products/123',
      'https://a.com/products/456',
      'https://a.com/e/0f8fad5b-d9cb-469f-a165-70867728950e',
      'https://a.com/blog/2026/07',
    ])
    const patterns = out.map((c) => c.pattern).sort()
    expect(patterns).toContain('/products/{id}')
    expect(patterns).toContain('/e/{uuid}')
    expect(patterns).toContain('/blog/{date}/{date}')
    expect(out.find((c) => c.pattern === '/products/{id}')!.urls).toHaveLength(2)
  })

  it('同父路径 ≥3 个不同字面尾段聚为 {slug}，低基数导航页不聚', () => {
    const out = clusterTemplates([
      'https://a.com/docs/install',
      'https://a.com/docs/config',
      'https://a.com/docs/deploy',
      'https://a.com/about',
      'https://a.com/pricing',
    ])
    const patterns = out.map((c) => c.pattern)
    expect(patterns).toContain('/docs/{slug}')
    expect(patterns).toContain('/about')
    expect(patterns).toContain('/pricing')
  })

  it('多语言前缀保持字面段；入口页永远单独成组', () => {
    const out = clusterTemplates(
      ['https://a.com/', 'https://a.com/en/p1', 'https://a.com/en/p2', 'https://a.com/en/p3', 'https://a.com/zh/p1'],
      'https://a.com/',
    )
    const patterns = out.map((c) => c.pattern)
    expect(patterns).toContain('/')
    expect(patterns).toContain('/en/{slug}')
    expect(patterns).toContain('/zh/p1')
  })
})

describe('selectRepresentative', () => {
  it('取 200 且 checked 页面中 mainTextChars 的中位页', () => {
    const url = selectRepresentative([
      { url: 'u1', mainTextChars: 10, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u2', mainTextChars: 500, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u3', mainTextChars: 9000, httpStatus: 200, checkStatus: 'checked' },
      { url: 'u4', mainTextChars: 99999, httpStatus: 404, checkStatus: 'checked' },
    ])
    expect(url).toBe('u2')
  })
  it('无健康页时回退第一个候选，空数组返回 null', () => {
    expect(selectRepresentative([{ url: 'u1', mainTextChars: 0, httpStatus: 500, checkStatus: 'checked' }])).toBe('u1')
    expect(selectRepresentative([])).toBeNull()
  })
})

describe('planTemplates', () => {
  it('输出 pattern/pageUrls/representativeUrl 三元组', () => {
    const plans = planTemplates(
      [
        { url: 'https://a.com/p/1', mainTextChars: 100, httpStatus: 200, checkStatus: 'checked' },
        { url: 'https://a.com/p/2', mainTextChars: 300, httpStatus: 200, checkStatus: 'checked' },
      ],
      'https://a.com/',
    )
    expect(plans).toEqual([
      { pattern: '/p/{id}', pageUrls: ['https://a.com/p/1', 'https://a.com/p/2'], representativeUrl: 'https://a.com/p/1' },
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/template-cluster.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/template-cluster.ts`**

```ts
// URL 模板聚类：把动态路由（/products/123、/blog/2026/07/x）按结构归并，
// 深检只跑每模板一个代表页。整套是启发式推断（claim_type: inferred），不是实测。

export interface TemplateCluster { pattern: string; urls: string[] }
export interface RepresentativeCandidate {
  url: string
  mainTextChars: number | null
  httpStatus: number | null
  checkStatus: string
}
export interface TemplatePlan { pattern: string; pageUrls: string[]; representativeUrl: string | null }

const SEGMENT_RULES: { re: RegExp; token: string }[] = [
  { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, token: '{uuid}' },
  { re: /^\d{4}(-\d{2}){1,2}$/, token: '{date}' },
  { re: /^(19|20)\d{2}$/, token: '{date}' }, // 独立 4 位年份段（/blog/2026/…）
  { re: /^\d{1,2}$/, token: '{date}' },      // 已被年份段引导的月/日在下方特判，这里先占位
  { re: /^\d+$/, token: '{id}' },
]

// 说明：1-2 位纯数字段既可能是分页/id 也可能是月/日，无上下文不可判。
// 取「与 {id} 同形」处理：规则表把 ≤2 位数字先标 {date} 会误伤 /page/2。
// 折中：只有紧跟在 {date}(年份) 之后的 1-2 位数字段才算 {date}，否则走 {id}。
export function normalizeSegment(seg: string, prevToken?: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}'
  if (/^\d{4}(-\d{2}){1,2}$/.test(seg)) return '{date}'
  if (/^(19|20)\d{2}$/.test(seg)) return '{date}'
  if (/^\d{1,2}$/.test(seg) && prevToken === '{date}') return '{date}'
  if (/^\d+$/.test(seg)) return '{id}'
  return seg
}

const SLUG_MIN_SIBLINGS = 3

export function clusterTemplates(urls: string[], entryUrl?: string): TemplateCluster[] {
  const meta = urls.map((url) => {
    const segsRaw = new URL(url).pathname.split('/').filter(Boolean)
    const segs: string[] = []
    for (const s of segsRaw) segs.push(normalizeSegment(s, segs[segs.length - 1]))
    return { url, segs }
  })

  // 同父路径下 ≥3 个不同「字面」尾段 → {slug}（入口页豁免，永远单独成组）。
  const parentTails = new Map<string, Set<string>>()
  for (const m of meta) {
    if (!m.segs.length) continue
    const tail = m.segs[m.segs.length - 1]
    if (tail.startsWith('{')) continue
    const parent = m.segs.slice(0, -1).join('/')
    if (!parentTails.has(parent)) parentTails.set(parent, new Set())
    parentTails.get(parent)!.add(tail)
  }
  for (const m of meta) {
    if (entryUrl && m.url === entryUrl) continue
    if (!m.segs.length) continue
    const tail = m.segs[m.segs.length - 1]
    if (tail.startsWith('{')) continue
    const parent = m.segs.slice(0, -1).join('/')
    if ((parentTails.get(parent)?.size ?? 0) >= SLUG_MIN_SIBLINGS) {
      m.segs = [...m.segs.slice(0, -1), '{slug}']
    }
  }

  const byPattern = new Map<string, string[]>()
  for (const m of meta) {
    const pattern = '/' + m.segs.join('/')
    if (!byPattern.has(pattern)) byPattern.set(pattern, [])
    byPattern.get(pattern)!.push(m.url)
  }
  return [...byPattern.entries()].map(([pattern, u]) => ({ pattern, urls: u }))
}

// 代表页：健康页（200 且 checked）里正文字符数取中位 —— 该模板下最「典型」的页面。
export function selectRepresentative(pages: RepresentativeCandidate[]): string | null {
  if (!pages.length) return null
  const ok = pages.filter((p) => p.checkStatus === 'checked' && p.httpStatus === 200)
  if (!ok.length) return pages[0].url
  const sorted = [...ok].sort((a, b) => (a.mainTextChars ?? 0) - (b.mainTextChars ?? 0))
  return sorted[Math.floor((sorted.length - 1) / 2)].url
}

export function planTemplates(pages: RepresentativeCandidate[], entryUrl: string): TemplatePlan[] {
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  return clusterTemplates(pages.map((p) => p.url), entryUrl).map((c) => ({
    pattern: c.pattern,
    pageUrls: c.urls,
    representativeUrl: selectRepresentative(c.urls.map((u) => byUrl.get(u)!)),
  }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/template-cluster.test.ts`
Expected: PASS（6 例）。若 `/blog/2026/07` 一例失败，检查 normalizeSegment 的 prevToken 传递。

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/template-cluster.ts lib/crawl/template-cluster.test.ts
git commit -m "feat(site): URL 模板聚类与代表页选择（推断层）（Task6）"
```

---

### Task 7: site_audit 聚合快照 + citations 归属

**Files:**
- Create: `lib/crawl/site-audit.ts`
- Test: `lib/crawl/site-audit.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl` / `isSameSite`（Task 2）。输入页面行的形状 = `sitePages` 表 select 行的子集（字段名一致，便于 Task 8 直接把 DB 行传入）。
- Produces:
  - `interface SiteAuditPage { url: string; discoveredVia: string; depth: number | null; httpStatus: number | null; finalUrl: string | null; canonicalUrl: string | null; metaRobots: string | null; mainTextChars: number | null; inboundLinkCount: number; checkStatus: string; errorReason: string | null; isKeyPage: boolean }`
  - `interface SiteAuditPayload { protocol: { maxPages: number; maxDepth: number }; stats: { totalDiscovered: number; checked: number; truncated: number; http4xx: number; http5xx: number; errors: number; blockedByRobots: number; noindex: number; canonicalOffsite: number; orphanPages: number; citedPages: number }; pages: SiteAuditPage[]; templates: { pattern: string; pageCount: number; representativeUrl: string | null }[]; citations: { url: string; count: number }[] }`
  - `buildSiteAudit(input: { pages: SiteAuditPage[]; templates: { pattern: string; pageCount: number; representativeUrl: string | null }[]; citedUrls: string[]; entryHost: string; maxPages: number; maxDepth: number }): SiteAuditPayload`

- [ ] **Step 1: 写失败测试 `lib/crawl/site-audit.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildSiteAudit, type SiteAuditPage } from './site-audit'

const page = (over: Partial<SiteAuditPage>): SiteAuditPage => ({
  url: 'https://a.com/x', discoveredVia: 'crawl', depth: 1, httpStatus: 200, finalUrl: null,
  canonicalUrl: null, metaRobots: null, mainTextChars: 100, inboundLinkCount: 1,
  checkStatus: 'checked', errorReason: null, isKeyPage: false, ...over,
})

describe('buildSiteAudit', () => {
  it('统计 404/noindex/站外 canonical/孤岛/截断', () => {
    const out = buildSiteAudit({
      pages: [
        page({ url: 'https://a.com/' , discoveredVia: 'entry', depth: 0 }),
        page({ url: 'https://a.com/404', httpStatus: 404 }),
        page({ url: 'https://a.com/ni', metaRobots: 'noindex,follow' }),
        page({ url: 'https://a.com/co', canonicalUrl: 'https://other.com/x' }),
        page({ url: 'https://a.com/orphan', discoveredVia: 'sitemap', depth: null, inboundLinkCount: 0 }),
        page({ url: 'https://a.com/later', checkStatus: 'discovered_only', httpStatus: null }),
      ],
      templates: [{ pattern: '/', pageCount: 1, representativeUrl: 'https://a.com/' }],
      citedUrls: [],
      entryHost: 'a.com',
      maxPages: 200,
      maxDepth: 3,
    })
    expect(out.stats).toMatchObject({
      totalDiscovered: 6, checked: 5, truncated: 1, http4xx: 1, noindex: 1,
      canonicalOffsite: 1, orphanPages: 1,
    })
    expect(out.protocol).toEqual({ maxPages: 200, maxDepth: 3 })
  })

  it('citations 归一化后按页计数（www/尾斜杠差异也能命中）', () => {
    const out = buildSiteAudit({
      pages: [page({ url: 'https://a.com/p' })],
      templates: [],
      citedUrls: ['https://www.a.com/p/', 'https://a.com/p', 'https://other.com/x'],
      entryHost: 'a.com',
      maxPages: 200,
      maxDepth: 3,
    })
    expect(out.citations).toEqual([{ url: 'https://a.com/p', count: 2 }])
    expect(out.stats.citedPages).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/site-audit.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/site-audit.ts`**

```ts
import { normalizeUrl, isSameSite } from './url'

// site_audit：一次 run 的全站轻检不可变快照（存 evidence payload）。
// site_pages 表是「当前状态」，本快照才是 findings 引用与 retest 对比的锚。

export interface SiteAuditPage {
  url: string
  discoveredVia: string
  depth: number | null
  httpStatus: number | null
  finalUrl: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number | null
  inboundLinkCount: number
  checkStatus: string
  errorReason: string | null
  isKeyPage: boolean
}

export interface SiteAuditTemplate { pattern: string; pageCount: number; representativeUrl: string | null }

export interface SiteAuditPayload {
  protocol: { maxPages: number; maxDepth: number }
  stats: {
    totalDiscovered: number
    checked: number
    truncated: number
    http4xx: number
    http5xx: number
    errors: number
    blockedByRobots: number
    noindex: number
    canonicalOffsite: number
    orphanPages: number
    citedPages: number
  }
  pages: SiteAuditPage[]
  templates: SiteAuditTemplate[]
  citations: { url: string; count: number }[]
}

const isNoindex = (p: SiteAuditPage) => (p.metaRobots ?? '').toLowerCase().includes('noindex')

function isCanonicalOffsite(p: SiteAuditPage, entryHost: string): boolean {
  if (!p.canonicalUrl) return false
  const n = normalizeUrl(p.canonicalUrl, p.url)
  return n !== null && !isSameSite(n, entryHost)
}

// 孤岛：sitemap 声明了、但全站内链入度为 0（入口页除外）。
const isOrphan = (p: SiteAuditPage) =>
  p.discoveredVia === 'sitemap' && p.inboundLinkCount === 0 && p.checkStatus === 'checked'

export function buildSiteAudit(input: {
  pages: SiteAuditPage[]
  templates: SiteAuditTemplate[]
  citedUrls: string[]
  entryHost: string
  maxPages: number
  maxDepth: number
}): SiteAuditPayload {
  const { pages, templates, citedUrls, entryHost, maxPages, maxDepth } = input
  const checkedPages = pages.filter((p) => p.checkStatus === 'checked')

  const counts = new Map<string, number>()
  const pageUrlSet = new Set(pages.map((p) => p.url))
  for (const raw of citedUrls) {
    const n = normalizeUrl(raw)
    if (n && pageUrlSet.has(n)) counts.set(n, (counts.get(n) ?? 0) + 1)
  }

  return {
    protocol: { maxPages, maxDepth },
    stats: {
      totalDiscovered: pages.length,
      checked: checkedPages.length,
      truncated: pages.filter((p) => p.checkStatus === 'discovered_only').length,
      http4xx: checkedPages.filter((p) => (p.httpStatus ?? 0) >= 400 && (p.httpStatus ?? 0) < 500).length,
      http5xx: checkedPages.filter((p) => (p.httpStatus ?? 0) >= 500).length,
      errors: pages.filter((p) => p.checkStatus === 'error').length,
      blockedByRobots: pages.filter((p) => p.checkStatus === 'blocked_by_robots').length,
      noindex: checkedPages.filter(isNoindex).length,
      canonicalOffsite: checkedPages.filter((p) => isCanonicalOffsite(p, entryHost)).length,
      orphanPages: pages.filter(isOrphan).length,
      citedPages: counts.size,
    },
    pages,
    templates,
    citations: [...counts.entries()].map(([url, count]) => ({ url, count })),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/site-audit.test.ts`
Expected: PASS（2 例）

- [ ] **Step 5: Commit**

```bash
git add lib/crawl/site-audit.ts lib/crawl/site-audit.test.ts
git commit -m "feat(site): site_audit 聚合快照与探针引用归属（Task7）"
```

---

### Task 8: collect-evidence 集成（爬取 → 聚类 → 深检 → 审计）

**Files:**
- Modify: `lib/inngest/channels.ts`
- Modify: `lib/inngest/collect-evidence.ts`
- Test: `lib/inngest/collect-evidence.test.ts`（改既有 + 加新用例）

**Interfaces:**
- Consumes: Task 1 仓库函数、Task 3 `discoverSitemaps`、Task 5 `createCrawlState/runCrawlBatch/leftoverDiscovered`、Task 6 `planTemplates`、Task 7 `buildSiteAudit`、既有 `getRunProbeResults`。
- Produces: `CollectDeps` 新增字段（见 Step 3），handler 的 step 顺序（后续 UI/测试依赖）：
  `validate-url → [serp] → fetch-page/check-robots/persist-page-fetch → extract-schema/persist-schema → load-crawl-settings → [discover-sitemap → persist-sitemap-{i} → crawl-batch-{n}/persist-crawl-batch-{n} → persist-discovered-only → update-inbound-counts → cluster-templates] → render-check(入口) → [resolve-deep-check-targets → deep-*:{url}] → run-probes → [build-site-audit → persist-site-audit] → mark-collected`（方括号 = crawlEnabled 时才有；探针引用归属在 build-site-audit 内完成）。

- [ ] **Step 1: 扩展 `lib/inngest/channels.ts` 消息类型**

```ts
import { channel, topic } from '@inngest/realtime'

export type RunProgressMessage =
  | { type: 'progress'; pct: number }
  | {
      type: 'evidence_created'
      evidenceType: 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' | 'sitemap' | 'site_audit'
    }
  | { type: 'phase'; phase: 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes'; checked?: number; total?: number }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export const runProgressChannel = channel((runId: string) => `run:${runId}`).addTopic(
  topic('progress').type<RunProgressMessage>(),
)
```

检查 `components/RunProgress.tsx` 与 `app/api/runs/[id]/events/route.ts` 对未知 `type` 帧的处理：SSE 路由只透传即可；RunProgress 若对 `type` 做 switch，确认未匹配分支静默忽略（没有则补 default 忽略）。

- [ ] **Step 2: 改既有测试 `lib/inngest/collect-evidence.test.ts` 的 `makeDeps`（先让新期望失败）**

`makeDeps` 追加以下 mock（默认走「crawl 开启、sitemap 为空、只爬到入口页」的最小路径）：

```ts
    getProjectSettings: vi.fn(async () => undefined),
    discoverSitemaps: vi.fn(async () => ({ files: [], pageUrls: [], warnings: [] })),
    runCrawlBatch: vi.fn(async (state: unknown) => ({
      state: { ...(state as Record<string, unknown>), frontier: [], checkedCount: 1, done: true },
      results: [
        {
          url: 'https://example.com/', finalUrl: 'https://example.com/', httpStatus: 200, title: 'home',
          canonicalUrl: null, metaRobots: null, mainTextChars: 2, contentHash: 'h', internalLinks: [],
          checkStatus: 'checked', errorReason: null, discoveredVia: 'entry', depth: 0,
        },
      ],
    })),
    upsertSitePages: vi.fn(async () => undefined),
    getSitePages: vi.fn(async () => [
      {
        id: 'sp_1', projectId: 'proj_1', url: 'https://example.com/', discoveredVia: 'entry', depth: 0,
        httpStatus: 200, finalUrl: null, title: 'home', canonicalUrl: null, metaRobots: null,
        mainTextChars: 2, contentHash: 'h', inboundLinkCount: 0, checkStatus: 'checked',
        errorReason: null, templateId: null, isKeyPage: false,
      },
    ]),
    updateInboundCounts: vi.fn(async () => undefined),
    syncUrlTemplates: vi.fn(async () => undefined),
    getProjectTemplates: vi.fn(async () => [
      { id: 'tpl_1', projectId: 'proj_1', pattern: '/', pageCount: 1, representativePageId: 'sp_1', source: 'heuristic' },
    ]),
    getRunProbeResults: vi.fn(async () => []),
```

首个用例的证据断言改为（多出 `site_audit`，顺序在末尾、mark-collected 之前）：

```ts
    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(4)
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(['page_fetch', 'schema', 'render_check', 'site_audit'])
```

新增三个用例：

```ts
  it('crawlEnabled=false 时跳过爬取/聚类/审计，行为与旧单页流程一致', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({ crawlEnabled: false, crawlMaxPages: 200, crawlMaxDepth: 3 })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.discoverSitemaps).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(3)
  })

  it('sitemap 文件逐个落 L4 evidence，爬取批次循环到 done 为止', async () => {
    let calls = 0
    const deps = makeDeps({
      discoverSitemaps: vi.fn(async () => ({
        files: [{ url: 'https://example.com/sitemap.xml', xml: '<urlset/>' }],
        pageUrls: ['https://example.com/a'],
        warnings: [],
      })),
      runCrawlBatch: vi.fn(async (state: unknown) => {
        calls++
        const s = state as Record<string, unknown>
        return { state: { ...s, frontier: [], checkedCount: calls, done: calls >= 2 }, results: [] }
      }),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.runCrawlBatch).toHaveBeenCalledTimes(2)
    const sitemapEv = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'sitemap')
    expect(sitemapEv?.[0]).toMatchObject({ claimLevel: 'L4', source: 'https://example.com/sitemap.xml', rawText: '<urlset/>' })
  })

  it('深检目标 = 非入口代表页 + 重点页，证据带 sitePageId', async () => {
    const deps = makeDeps({
      getSitePages: vi.fn(async () => [
        { id: 'sp_1', url: 'https://example.com/', httpStatus: 200, checkStatus: 'checked', isKeyPage: false, templateId: null },
        { id: 'sp_2', url: 'https://example.com/p/1', httpStatus: 200, checkStatus: 'checked', isKeyPage: false, templateId: 'tpl_2' },
        { id: 'sp_3', url: 'https://example.com/key', httpStatus: 200, checkStatus: 'checked', isKeyPage: true, templateId: null },
      ]),
      getProjectTemplates: vi.fn(async () => [
        { id: 'tpl_2', projectId: 'proj_1', pattern: '/p/{id}', pageCount: 5, representativePageId: 'sp_2', source: 'heuristic' },
      ]),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    // 入口页 1 次 + 深检 2 个目标各 1 次
    expect(deps.fetchPageFacts).toHaveBeenCalledTimes(3)
    const deepFetches = deps.createEvidenceArtifact.mock.calls.filter(
      (c) => c[0].type === 'page_fetch' && c[0].sitePageId,
    )
    expect(deepFetches.map((c) => c[0].sitePageId).sort()).toEqual(['sp_2', 'sp_3'])
  })
```

Run: `pnpm test lib/inngest/collect-evidence.test.ts`
Expected: FAIL（deps 缺字段 / handler 未实现新流程）

- [ ] **Step 3: 修改 `lib/inngest/collect-evidence.ts`**

import 追加：

```ts
import { discoverSitemaps } from '@/lib/crawl/sitemap'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlPageResult } from '@/lib/crawl/crawler'
import { planTemplates } from '@/lib/crawl/template-cluster'
import { buildSiteAudit, type SiteAuditPage } from '@/lib/crawl/site-audit'
```

repositories import 追加 `upsertSitePages, getSitePages, updateInboundCounts, syncUrlTemplates, getProjectTemplates, getRunProbeResults`（`getProjectSettings` 已有）。

`CollectDeps` 追加字段，`defaultDeps()` 逐一填真实现：

```ts
interface CollectDeps {
  // …existing…
  getProjectSettings: typeof getProjectSettings
  discoverSitemaps: typeof discoverSitemaps
  runCrawlBatch: typeof runCrawlBatch
  upsertSitePages: typeof upsertSitePages
  getSitePages: typeof getSitePages
  updateInboundCounts: typeof updateInboundCounts
  syncUrlTemplates: typeof syncUrlTemplates
  getProjectTemplates: typeof getProjectTemplates
  getRunProbeResults: typeof getRunProbeResults
}
```

handler 内，在 `persist-schema` 之后、render 之前插入爬取块（emit 帧 `{type:'phase'}` 不动既有 pct 序列）：

```ts
  // —— 全站路由发现 + 轻检（spec: 2026-07-02-site-route-discovery §4）——
  const settings = await step.run('load-crawl-settings', () => deps.getProjectSettings(projectId))
  const crawlEnabled = settings?.crawlEnabled ?? true
  const maxPages = settings?.crawlMaxPages ?? 200
  const maxDepth = settings?.crawlMaxDepth ?? 3

  if (crawlEnabled) {
    await emit({ type: 'phase', phase: 'discover' })
    const sitemaps = await step.run('discover-sitemap', () => deps.discoverSitemaps(entryUrl, robots.rawText))
    for (const [i, file] of sitemaps.files.entries()) {
      await step.run(`persist-sitemap-${i}`, () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`,
          projectId,
          runId,
          type: 'sitemap',
          claimLevel: 'L4',
          source: file.url,
          payload: { warnings: sitemaps.warnings, pageUrlCount: sitemaps.pageUrls.length },
          rawText: file.xml,
          rawHash: sha256Hex(file.xml),
        }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'sitemap' })
    }

    // createCrawlState 是纯函数且输入已被 step 记忆化，无需再包 step。
    let crawlState = createCrawlState(entryUrl, sitemaps.pageUrls, domain)
    const crawlOpts = { maxPages, maxDepth, batchSize: 20, concurrency: 4, robotsTxt: robots.rawText }
    const toUpsert = (r: CrawlPageResult) => ({
      url: r.url,
      discoveredVia: r.discoveredVia,
      depth: r.depth,
      httpStatus: r.httpStatus || null,
      finalUrl: r.finalUrl !== r.url ? r.finalUrl : null,
      title: r.title,
      canonicalUrl: r.canonicalUrl,
      metaRobots: r.metaRobots,
      mainTextChars: r.mainTextChars,
      contentHash: r.contentHash || null,
      checkStatus: r.checkStatus,
      errorReason: r.errorReason,
    })
    let batchIdx = 0
    const maxBatches = Math.ceil(maxPages / crawlOpts.batchSize) + 5 // 保险丝：防状态机 bug 造成死循环
    while (!crawlState.done && batchIdx < maxBatches) {
      const snapshot = crawlState
      const batch = await step.run(`crawl-batch-${batchIdx}`, () => deps.runCrawlBatch(snapshot, crawlOpts))
      crawlState = batch.state
      if (batch.results.length) {
        await step.run(`persist-crawl-batch-${batchIdx}`, () =>
          deps.upsertSitePages(projectId, runId, batch.results.map(toUpsert)),
        )
      }
      await emit({ type: 'phase', phase: 'light_check', checked: crawlState.checkedCount, total: maxPages })
      batchIdx++
    }
    const leftover = leftoverDiscovered(crawlState)
    if (leftover.length) {
      await step.run('persist-discovered-only', () =>
        deps.upsertSitePages(
          projectId,
          runId,
          leftover.map((l) => ({
            url: l.url, discoveredVia: l.via, depth: l.depth, httpStatus: null, finalUrl: null,
            title: null, canonicalUrl: null, metaRobots: null, mainTextChars: null, contentHash: null,
            checkStatus: 'discovered_only' as const, errorReason: null,
          })),
        ),
      )
    }
    await step.run('update-inbound-counts', () => deps.updateInboundCounts(projectId, crawlState.inbound))

    await emit({ type: 'phase', phase: 'cluster' })
    await step.run('cluster-templates', async () => {
      const pages = await deps.getSitePages(projectId)
      const candidates = pages
        .filter((p) => p.checkStatus === 'checked')
        .map((p) => ({ url: p.url, mainTextChars: p.mainTextChars, httpStatus: p.httpStatus, checkStatus: p.checkStatus }))
      await deps.syncUrlTemplates(projectId, planTemplates(candidates, entryUrl))
    })
  }
```

在既有入口 `render-check` 块**之后**、`runProbes` 之前插入深检块：

```ts
  // —— 模板代表页 + 重点页深检：渲染调用数 = 模板数 + 重点页数，而非全站页数 ——
  if (crawlEnabled) {
    const targets = await step.run('resolve-deep-check-targets', async () => {
      const [pages, templates] = await Promise.all([deps.getSitePages(projectId), deps.getProjectTemplates(projectId)])
      const byId = new Map(pages.map((p) => [p.id, p]))
      const picked = new Map<string, string>() // url -> sitePageId
      for (const tpl of templates) {
        const rep = tpl.representativePageId ? byId.get(tpl.representativePageId) : undefined
        if (rep && rep.url !== entryUrl && rep.httpStatus === 200) picked.set(rep.url, rep.id)
      }
      for (const p of pages) {
        if (p.isKeyPage && p.url !== entryUrl && p.checkStatus === 'checked') picked.set(p.url, p.id)
      }
      return [...picked.entries()].map(([url, sitePageId]) => ({ url, sitePageId }))
    })
    await emit({ type: 'phase', phase: 'deep_check', total: targets.length })
    for (const target of targets) {
      // 单模板深检失败不中断 run（spec §8）：该目标跳过，其余继续。
      // step.run 内部仍由 Inngest 重试；这里兜的是重试耗尽后的最终失败。
      try {
        await deepCheckTarget(target)
      } catch {
        await emit({ type: 'phase', phase: 'deep_check', checked: targets.indexOf(target) + 1, total: targets.length })
      }
    }
  }
```

其中 `deepCheckTarget` 是 handler 内的局部 async 函数（闭包持有 step/deps/runId/projectId），主体如下：

```ts
    async function deepCheckTarget(target: { url: string; sitePageId: string }) {
      const facts = await step.run(`deep-fetch:${target.url}`, () => deps.fetchPageFacts(target.url))
      await step.run(`deep-persist-fetch:${target.url}`, () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'page_fetch', claimLevel: 'L4',
          source: target.url, sitePageId: target.sitePageId,
          payload: { canonicalUrl: facts.canonicalUrl, metaRobots: facts.metaRobots },
          rawText: facts.rawHtml, rawHash: sha256Hex(facts.rawHtml),
        }),
      )
      const deepSchema = await step.run(`deep-schema:${target.url}`, () => deps.extractSchema(facts.rawHtml))
      await step.run(`deep-persist-schema:${target.url}`, () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'schema', claimLevel: 'L4',
          source: target.url, sitePageId: target.sitePageId,
          payload: { types: deepSchema.types },
          rawText: JSON.stringify(deepSchema.raw), rawHash: sha256Hex(JSON.stringify(deepSchema.raw)),
        }),
      )
      if (deps.renderProvider.isConfigured?.() ?? true) {
        const deepRendered = await step.run(`deep-render:${target.url}`, () => deps.renderProvider.renderMainText(target.url))
        const deepDelta = computeMainContentDelta(facts.mainTextChars, deepRendered.mainTextChars)
        await step.run(`deep-persist-render:${target.url}`, () =>
          deps.createEvidenceArtifact({
            id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'render_check', claimLevel: 'L4',
            source: target.url, sitePageId: target.sitePageId,
            payload: {
              initialHtmlMainTextChars: facts.mainTextChars,
              renderedMainTextChars: deepRendered.mainTextChars,
              mainContentDelta: deepDelta,
            },
            rawText: deepRendered.html, rawHash: sha256Hex(deepRendered.html),
          }),
        )
      }
    }
```

（`deepCheckTarget` 定义放在 handler 内 targets 循环之前即可。）

在 `runProbes` 之后、`progress pct 90` 之前插入审计块：

```ts
  // —— site_audit：全站轻检不可变快照（含探针引用归属），findings 与 retest 的引用锚 ——
  if (crawlEnabled) {
    const auditPayload = await step.run('build-site-audit', async () => {
      const [pages, templates, probeResults] = await Promise.all([
        deps.getSitePages(projectId),
        deps.getProjectTemplates(projectId),
        deps.getRunProbeResults(runId),
      ])
      const pageById = new Map(pages.map((p) => [p.id, p]))
      return buildSiteAudit({
        pages: pages.map((p): SiteAuditPage => ({
          url: p.url, discoveredVia: p.discoveredVia, depth: p.depth, httpStatus: p.httpStatus,
          finalUrl: p.finalUrl, canonicalUrl: p.canonicalUrl, metaRobots: p.metaRobots,
          mainTextChars: p.mainTextChars, inboundLinkCount: p.inboundLinkCount,
          checkStatus: p.checkStatus, errorReason: p.errorReason, isKeyPage: p.isKeyPage,
        })),
        templates: templates.map((t) => ({
          pattern: t.pattern,
          pageCount: t.pageCount,
          representativeUrl: t.representativePageId ? pageById.get(t.representativePageId)?.url ?? null : null,
        })),
        citedUrls: probeResults.flatMap((r) => r.citedUrls),
        entryHost: domain,
        maxPages,
        maxDepth,
      })
    })
    await step.run('persist-site-audit', () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'site_audit', claimLevel: 'L4',
        source: entryUrl,
        payload: auditPayload,
        rawText: JSON.stringify(auditPayload), rawHash: sha256Hex(JSON.stringify(auditPayload)),
      }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'site_audit' })
  }
```

`defaultDeps()` 补齐：

```ts
    getProjectSettings,
    discoverSitemaps,
    runCrawlBatch,
    upsertSitePages,
    getSitePages,
    updateInboundCounts,
    syncUrlTemplates,
    getProjectTemplates,
    getRunProbeResults,
```

注意：probes deps 里已单独传入 `getProjectSettings`，保持不动，`CollectDeps` 顶层再加一份即可（handler 用顶层这份读爬取配置）。

- [ ] **Step 4: 跑 handler 测试到全绿**

Run: `pnpm test lib/inngest/collect-evidence.test.ts`
Expected: PASS（既有用例 + 3 个新用例）。若首用例 pct 序列断言失败，检查是否误加了 pct 帧（phase 帧不带 pct，不影响该断言）。

- [ ] **Step 5: 全量测试 + Commit**

```bash
pnpm test
npx tsc --noEmit
git add lib/inngest/channels.ts lib/inngest/collect-evidence.ts lib/inngest/collect-evidence.test.ts components/RunProgress.tsx
git commit -m "feat(site): 采集链集成全站爬取/模板聚类/代表页深检/site_audit（Task8）"
```

---

### Task 9: 站点结构面板 UI + Server Actions

**Files:**
- Create: `app/[locale]/runs/[id]/site/page.tsx`
- Create: `app/[locale]/runs/[id]/site/actions.ts`
- Create: `components/SitePageActions.tsx`
- Modify: `messages/zh.json`、`messages/en.json`（新增 `site` 命名空间）
- Test: `components/SitePageActions.test.tsx`

**Interfaces:**
- Consumes: `getRun/getProject/getSitePages/getProjectTemplates/getSiteAuditEvidence/setSitePageKeyFlag/setTemplateRepresentative`（Task 1）、`SiteAuditPayload`（Task 7）。
- Produces: 页面路由 `/{locale}/runs/{id}/site`；Server Actions `toggleKeyPageAction(pageId, isKeyPage, runId, locale)`、`setRepresentativeAction(templateId, pageId, runId, locale)`。
- **UI 纪律**：模板区标「推断模板」徽标；全站统计来自 site_audit（L4 实测）；截断必须明示。文案走 next-intl，中英都填，中文为准。

- [ ] **Step 1: messages 文案**

`messages/zh.json` 顶层加（与现有命名空间平级）：

```json
"site": {
  "title": "站点结构",
  "inferredBadge": "推断模板",
  "statsTitle": "全站健康（实测）",
  "totalDiscovered": "发现页面",
  "checked": "已轻检",
  "http4xx": "4xx 页面",
  "noindex": "noindex 页面",
  "canonicalOffsite": "canonical 指向站外",
  "orphanPages": "孤岛页",
  "citedPages": "被 AI 引用页",
  "truncatedNotice": "已达 {maxPages} 页上限，另有 {count} 个 URL 未检查",
  "templatesTitle": "URL 模板",
  "pattern": "模板",
  "pageCount": "页数",
  "representative": "代表页",
  "setRepresentative": "设为代表页",
  "userPinned": "已人工指定",
  "pagesTitle": "页面清单",
  "markKeyPage": "标记重点页",
  "unmarkKeyPage": "取消重点页",
  "keyPageBadge": "重点页",
  "nextRunNotice": "更改将在下次 run 生效",
  "noData": "本次 run 未启用全站爬取或尚未完成采集",
  "status": { "checked": "已检", "discovered_only": "未检（超上限）", "blocked_by_robots": "robots 禁抓", "error": "失败" }
}
```

`messages/en.json` 加同结构英文：

```json
"site": {
  "title": "Site structure",
  "inferredBadge": "Inferred template",
  "statsTitle": "Site health (measured)",
  "totalDiscovered": "Pages discovered",
  "checked": "Light-checked",
  "http4xx": "4xx pages",
  "noindex": "Noindex pages",
  "canonicalOffsite": "Canonical points offsite",
  "orphanPages": "Orphan pages",
  "citedPages": "Cited by AI",
  "truncatedNotice": "Reached the {maxPages}-page cap; {count} URLs left unchecked",
  "templatesTitle": "URL templates",
  "pattern": "Template",
  "pageCount": "Pages",
  "representative": "Representative page",
  "setRepresentative": "Set as representative",
  "userPinned": "Pinned by user",
  "pagesTitle": "Page list",
  "markKeyPage": "Mark as key page",
  "unmarkKeyPage": "Unmark key page",
  "keyPageBadge": "Key page",
  "nextRunNotice": "Changes take effect on the next run",
  "noData": "Site crawl was not enabled for this run or collection has not finished",
  "filterAll": "All",
  "renderDelta": "Render delta",
  "status": { "checked": "Checked", "discovered_only": "Unchecked (over cap)", "blocked_by_robots": "Blocked by robots", "error": "Failed" }
}
```

`messages/zh.json` 的 `site` 命名空间同步补两个 key：`"filterAll": "全部"`、`"renderDelta": "渲染差异"`。

- [ ] **Step 2: Server Actions `app/[locale]/runs/[id]/site/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { setSitePageKeyFlag, setTemplateRepresentative } from '@/lib/repositories'

// 面板上的两个人工操作。都只改 project 级状态，不回写历史 run 的证据（证据不可变）。
export async function toggleKeyPageAction(pageId: string, isKeyPage: boolean, runId: string, locale: string) {
  await setSitePageKeyFlag(pageId, isKeyPage)
  revalidatePath(`/${locale}/runs/${runId}/site`)
}

export async function setRepresentativeAction(templateId: string, pageId: string, runId: string, locale: string) {
  await setTemplateRepresentative(templateId, pageId)
  revalidatePath(`/${locale}/runs/${runId}/site`)
}
```

- [ ] **Step 3: 写失败组件测试 `components/SitePageActions.test.tsx`**

（参考 `components/PromptCard.test.tsx` 的既有测试环境写法——先读它，沿用其 render/mock 风格。）

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SitePageActions } from './SitePageActions'

describe('SitePageActions', () => {
  it('渲染标记按钮并在点击时回调 action', () => {
    const onToggle = vi.fn()
    render(<SitePageActions pageId="sp_1" isKeyPage={false} onToggleKeyPage={onToggle} labels={{ mark: '标记重点页', unmark: '取消重点页', notice: '更改将在下次 run 生效' }} />)
    fireEvent.click(screen.getByRole('button', { name: '标记重点页' }))
    expect(onToggle).toHaveBeenCalledWith('sp_1', true)
  })

  it('已是重点页时显示取消文案', () => {
    render(<SitePageActions pageId="sp_1" isKeyPage={true} onToggleKeyPage={vi.fn()} labels={{ mark: '标记重点页', unmark: '取消重点页', notice: '更改将在下次 run 生效' }} />)
    expect(screen.getByRole('button', { name: '取消重点页' })).toBeDefined()
  })
})
```

Run: `pnpm test components/SitePageActions.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 4: 实现 `components/SitePageActions.tsx`（client 叶子）**

```tsx
'use client'

import { useTransition } from 'react'

// 页面行内操作按钮：client 叶子，action 由 Server Component 以闭包传入。
export function SitePageActions({
  pageId,
  isKeyPage,
  onToggleKeyPage,
  labels,
}: {
  pageId: string
  isKeyPage: boolean
  onToggleKeyPage: (pageId: string, next: boolean) => void | Promise<void>
  labels: { mark: string; unmark: string; notice: string }
}) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      title={labels.notice}
      className="text-xs underline underline-offset-2 disabled:opacity-50"
      onClick={() => startTransition(async () => onToggleKeyPage(pageId, !isKeyPage))}
    >
      {isKeyPage ? labels.unmark : labels.mark}
    </button>
  )
}
```

Run: `pnpm test components/SitePageActions.test.tsx`
Expected: PASS（2 例）

- [ ] **Step 5: 实现页面 `app/[locale]/runs/[id]/site/page.tsx`（Server Component）**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { SitePageActions } from '@/components/SitePageActions'
import {
  getRun,
  getProject,
  getSitePages,
  getProjectTemplates,
  getSiteAuditEvidence,
} from '@/lib/repositories'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import { toggleKeyPageAction, setRepresentativeAction } from './actions'

// 站点结构面板：全站健康统计（site_audit 快照，L4 实测）+ 推断模板列表 + 页面清单。
// Next 16：params 是 Promise，必须 await。
export default async function SiteStructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { locale, id } = await params
  const { status: statusFilter } = await searchParams
  setRequestLocale(locale)
  const [t, run] = await Promise.all([getTranslations('site'), getRun(id)])
  if (!run) notFound()
  const [project, pages, templates, audit, runEvidence] = await Promise.all([
    getProject(run.projectId),
    getSitePages(run.projectId),
    getProjectTemplates(run.projectId),
    getSiteAuditEvidence(id),
    getRunEvidence(id),
  ])
  const payload = (audit?.payload ?? null) as SiteAuditPayload | null
  const pageById = new Map(pages.map((p) => [p.id, p]))
  // 代表页深检摘要：本次 run 的 render_check 证据按 sitePageId 归属（无渲染配置时为空）。
  const renderDeltaBySitePageId = new Map(
    runEvidence
      .filter((e) => e.type === 'render_check' && e.sitePageId)
      .map((e) => [e.sitePageId as string, (e.payload as { mainContentDelta?: number })?.mainContentDelta]),
  )
  const visiblePages = statusFilter ? pages.filter((p) => p.checkStatus === statusFilter) : pages

  if (!payload) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="mt-4 text-sm text-neutral-500">{t('noData')}</p>
      </Shell>
    )
  }

  const stats: [string, number][] = [
    [t('totalDiscovered'), payload.stats.totalDiscovered],
    [t('checked'), payload.stats.checked],
    [t('http4xx'), payload.stats.http4xx],
    [t('noindex'), payload.stats.noindex],
    [t('canonicalOffsite'), payload.stats.canonicalOffsite],
    [t('orphanPages'), payload.stats.orphanPages],
    [t('citedPages'), payload.stats.citedPages],
  ]

  return (
    <Shell>
      <h1 className="text-lg font-semibold">{project?.domain} · {t('title')}</h1>

      <section className="mt-4">
        <h2 className="text-sm font-medium">{t('statsTitle')}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded border p-3">
              <div className="text-xs text-neutral-500">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
        {payload.stats.truncated > 0 && (
          <p className="mt-2 text-xs text-amber-600">
            {t('truncatedNotice', { maxPages: payload.protocol.maxPages, count: payload.stats.truncated })}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium">
          {t('templatesTitle')} <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{t('inferredBadge')}</span>
        </h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1">{t('pattern')}</th>
              <th>{t('pageCount')}</th>
              <th>{t('representative')}</th>
              <th>{t('renderDelta')}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => {
              const rep = tpl.representativePageId ? pageById.get(tpl.representativePageId) : undefined
              const delta = tpl.representativePageId ? renderDeltaBySitePageId.get(tpl.representativePageId) : undefined
              return (
                <tr key={tpl.id} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{tpl.pattern}</td>
                  <td>{tpl.pageCount}</td>
                  <td className="truncate max-w-xs">
                    {rep?.url ?? '—'}
                    {tpl.source === 'user' && (
                      <span className="ml-1 text-xs text-neutral-400">{t('userPinned')}</span>
                    )}
                  </td>
                  <td>{delta !== undefined ? `${Math.round(delta * 100)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium">{t('pagesTitle')}</h2>
        <nav className="mt-1 space-x-2 text-xs">
          <a href={`/${locale}/runs/${id}/site`} className={!statusFilter ? 'font-semibold' : 'underline'}>{t('filterAll')}</a>
          {(['checked', 'discovered_only', 'blocked_by_robots', 'error'] as const).map((s) => (
            <a key={s} href={`/${locale}/runs/${id}/site?status=${s}`} className={statusFilter === s ? 'font-semibold' : 'underline'}>
              {t(`status.${s}`)}
            </a>
          ))}
        </nav>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1">URL</th>
              <th>HTTP</th>
              <th>{t('pattern')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visiblePages.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="max-w-md truncate py-1.5 font-mono text-xs">
                  {p.url}
                  {p.isKeyPage && (
                    <span className="ml-1 rounded bg-blue-50 px-1 text-xs text-blue-600">{t('keyPageBadge')}</span>
                  )}
                </td>
                <td>{p.httpStatus ?? t(`status.${p.checkStatus}` as never)}</td>
                <td className="font-mono text-xs">{templates.find((tp) => tp.id === p.templateId)?.pattern ?? '—'}</td>
                <td className="space-x-2 text-right">
                  <SitePageActions
                    pageId={p.id}
                    isKeyPage={p.isKeyPage}
                    labels={{ mark: t('markKeyPage'), unmark: t('unmarkKeyPage'), notice: t('nextRunNotice') }}
                    onToggleKeyPage={async (pageId, next) => {
                      'use server'
                      await toggleKeyPageAction(pageId, next, id, locale)
                    }}
                  />
                  {p.templateId && p.checkStatus === 'checked' && (
                    <form
                      className="inline"
                      action={async () => {
                        'use server'
                        await setRepresentativeAction(p.templateId!, p.id, id, locale)
                      }}
                    >
                      <button type="submit" className="text-xs text-neutral-500 underline underline-offset-2">
                        {t('setRepresentative')}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>
  )
}
```

实现时注意：
- import 需补 `getRunEvidence`（`@/lib/repositories` 已有）。
- 对照 `app/[locale]/runs/[id]/page.tsx` 的 `Shell` 用法（若 `Shell` 需要额外 props，照现有页面传法调整）。
- 渲染差异列的格式化先读 `lib/collection/readability-risk.ts` 确认 `mainContentDelta` 的取值语义（比例还是绝对字符差），按实际语义展示，不要照抄上面的 `%` 写法。

- [ ] **Step 6: 从 run 详情页加入口链接**

在 `app/[locale]/runs/[id]/page.tsx` 的页首区域（`Shell` 内标题附近，具体位置对照现有布局）加：

```tsx
<Link href={`/${locale}/runs/${id}/site`} className="text-sm underline underline-offset-2">
  {t('siteLink')}
</Link>
```

并在 messages 的 run 详情页所在命名空间加 `"siteLink": "站点结构 →"`（en: `"Site structure →"`）。`Link` 用 `next/link`（若该页已有 next-intl 的 Link 封装则沿用之）。

- [ ] **Step 7: 验证 + Commit**

```bash
pnpm test
npx tsc --noEmit
pnpm dev  # 手动访问 /zh/runs/<已有runId>/site 看空态与（跑过 run 后）真数据
git add app/[locale]/runs/[id]/site components/SitePageActions.tsx components/SitePageActions.test.tsx messages/zh.json messages/en.json app/[locale]/runs/[id]/page.tsx
git commit -m "feat(site): 站点结构面板（统计/推断模板/页面清单/重点页与代表页操作）（Task9）"
```

---

### Task 10: 同协议重测对比（site_audit diff）

**Files:**
- Create: `lib/crawl/audit-diff.ts`
- Test: `lib/crawl/audit-diff.test.ts`
- Modify: `app/api/runs/[id]/delta/route.ts`

**Interfaces:**
- Consumes: `SiteAuditPayload`（Task 7）、`getSiteAuditEvidence`（Task 1）。
- Produces:
  - `diffSiteAudits(baseline: SiteAuditPayload, retest: SiteAuditPayload): SiteAuditDiff`
  - `interface SiteAuditDiff { protocolMismatch: boolean; metrics: { name: string; baseline: number; retest: number; delta: number }[]; newTemplates: string[]; removedTemplates: string[] }`
  - `GET /api/runs/{id}/delta?compareRunId={retestRunId}` 响应变为 `{ snapshots, siteAuditDiff: SiteAuditDiff | null }`；无 `compareRunId` 时保持旧形状（纯数组）不破坏现有消费方。

- [ ] **Step 1: 写失败测试 `lib/crawl/audit-diff.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { diffSiteAudits } from './audit-diff'
import type { SiteAuditPayload } from './site-audit'

const audit = (over: Partial<SiteAuditPayload['stats']>, templates: string[] = ['/'], maxPages = 200): SiteAuditPayload => ({
  protocol: { maxPages, maxDepth: 3 },
  stats: {
    totalDiscovered: 10, checked: 10, truncated: 0, http4xx: 0, http5xx: 0, errors: 0,
    blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0, ...over,
  },
  pages: [],
  templates: templates.map((pattern) => ({ pattern, pageCount: 1, representativeUrl: null })),
  citations: [],
})

describe('diffSiteAudits', () => {
  it('输出核心指标 delta 与新增/消失模板', () => {
    const out = diffSiteAudits(audit({ http4xx: 3 }, ['/', '/p/{id}']), audit({ http4xx: 1 }, ['/', '/docs/{slug}']))
    expect(out.protocolMismatch).toBe(false)
    expect(out.metrics.find((m) => m.name === 'http4xx')).toEqual({ name: 'http4xx', baseline: 3, retest: 1, delta: -2 })
    expect(out.newTemplates).toEqual(['/docs/{slug}'])
    expect(out.removedTemplates).toEqual(['/p/{id}'])
  })

  it('爬取参数不同标记协议不一致', () => {
    expect(diffSiteAudits(audit({}), audit({}, ['/'], 500)).protocolMismatch).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test lib/crawl/audit-diff.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/crawl/audit-diff.ts`**

```ts
import type { SiteAuditPayload } from './site-audit'

export interface SiteAuditDiff {
  protocolMismatch: boolean
  metrics: { name: string; baseline: number; retest: number; delta: number }[]
  newTemplates: string[]
  removedTemplates: string[]
}

const METRIC_KEYS = [
  'totalDiscovered', 'checked', 'http4xx', 'http5xx', 'noindex',
  'canonicalOffsite', 'orphanPages', 'citedPages',
] as const

// 同协议重测对比：参数不同（maxPages/maxDepth）时只标记不硬比；
// 新出现的模板不参与本次对比结论（标 new 由 UI 呈现）。
export function diffSiteAudits(baseline: SiteAuditPayload, retest: SiteAuditPayload): SiteAuditDiff {
  const protocolMismatch =
    baseline.protocol.maxPages !== retest.protocol.maxPages ||
    baseline.protocol.maxDepth !== retest.protocol.maxDepth
  const basePatterns = new Set(baseline.templates.map((t) => t.pattern))
  const retestPatterns = new Set(retest.templates.map((t) => t.pattern))
  return {
    protocolMismatch,
    metrics: METRIC_KEYS.map((name) => ({
      name,
      baseline: baseline.stats[name],
      retest: retest.stats[name],
      delta: retest.stats[name] - baseline.stats[name],
    })),
    newTemplates: [...retestPatterns].filter((p) => !basePatterns.has(p)),
    removedTemplates: [...basePatterns].filter((p) => !retestPatterns.has(p)),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test lib/crawl/audit-diff.test.ts`
Expected: PASS（2 例）

- [ ] **Step 5: 扩展 `app/api/runs/[id]/delta/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getRun, getRetestSnapshots, getSiteAuditEvidence } from '@/lib/repositories'
import { diffSiteAudits } from '@/lib/crawl/audit-diff'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'

// GET /runs/{id}/delta（§7）—— 以 baseline run 为锚返回回测 delta（retest_snapshots）。
// 带 ?compareRunId= 时追加两次 site_audit 快照的对比；不带时保持旧响应形状。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const snapshots = await getRetestSnapshots(id)

  const compareRunId = new URL(req.url).searchParams.get('compareRunId')
  if (!compareRunId) return NextResponse.json(snapshots)

  const [baseAudit, retestAudit] = await Promise.all([getSiteAuditEvidence(id), getSiteAuditEvidence(compareRunId)])
  const siteAuditDiff =
    baseAudit?.payload && retestAudit?.payload
      ? diffSiteAudits(baseAudit.payload as SiteAuditPayload, retestAudit.payload as SiteAuditPayload)
      : null
  return NextResponse.json({ snapshots, siteAuditDiff })
}
```

- [ ] **Step 6: 全量验证 + Commit**

```bash
pnpm test
npx tsc --noEmit
git add lib/crawl/audit-diff.ts lib/crawl/audit-diff.test.ts app/api/runs/[id]/delta/route.ts
git commit -m "feat(site): site_audit 同协议重测对比与 delta 接口扩展（Task10）"
```

---

## 收尾核对（最后一个任务完成后）

- [ ] `pnpm test` 全绿、`npx tsc --noEmit` 无错、`pnpm lint` 无新增告警。
- [ ] 手动冒烟：对一个真实小站点发起 run，确认 SSE 进度出现 phase 帧、site_pages/url_templates 落库、`/{locale}/runs/{id}/site` 面板渲染、渲染 API 调用次数 ≈ 模板数。
- [ ] 更新 `CLAUDE.md`「Project status」不需要；但 spec 状态改为「已实现」并在 `docs/superpowers/specs/2026-07-02-site-route-discovery-design.md` 顶部标注对应 commit 区间。
- [ ] 使用 superpowers:finishing-a-development-branch skill 决定合并方式。
