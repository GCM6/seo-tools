# 子项目 A:可信地基 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让下一次检测输出的每个数字都可信:输入正确、失败如实上报、已核实的误报消失、健康分不给无数据的支柱打分。

**Architecture:** 沿数据流从上游修到下游,分三波:
1. **输入层**:市场表、品类、种子词、向导、闸门、迁移。
2. **采集层**:统一结果类型、子阶段状态、原始响应表、预检、凭据统一。
3. **规则层**:口径与误报修正、模板、健康分、铁律测试。

每波结束后,由一个独立的只读审查代理审查该波改动。

**Tech Stack:** Next.js 16 App Router + React 19、TypeScript、Drizzle + libSQL、Inngest、vitest(jsdom + RTL)、linkedom、pnpm

**Spec:** `docs/superpowers/specs/2026-10-04-sp-a-trustworthy-foundation-design.md`(下称 spec);上游审计 `docs/plans/2026-10-03-seo-capability-audit-optimization-plan.md`

## Global Constraints

- **框架与写法**
  - 遵守 `veris-coding` skill:`params`、`searchParams`、`cookies` 一律 await;ref 作为 prop 传递,不用 forwardRef;默认写 Server Component,`'use client'` 只放在叶子组件。
  - 不引入 zod。校验写成手写 assert,放在 `lib/repositories/validators.ts`,失败时 `throw new Error`。
  - Route Handler 错误体统一为 `{ error: 'snake_case' }`:参数错误返回 422,不存在返回 404,下游失败返回 503。
  - 插入行时显式写前缀 id,例如 `raw_${crypto.randomUUID()}`。
- **工具与测试**
  - 包管理器只用 pnpm。测试与源码同层(`foo.ts` 旁边放 `foo.test.ts`),不建 `__tests__/`。
- **文案与 i18n**
  - UI 文案必须是中文,并且必须走 next-intl。
  - `messages/zh.json`、`en.json` 只能**文本级插入或修改**,禁止整体 JSON 重新序列化(见项目陷阱 trap-json-reserialize-messages)。
  - 证据标签:"实测"只给 L3/L4;推断类不得标为实测。
- **Git**
  - **不提交、不 stash、不 checkout、不 reset**。工作区里有 139 处他人未提交的改动。每个任务的"提交"步骤改为:记录到实现笔记 `docs/superpowers/plans/2026-10-04-sp-a-implementation-notes.md`。
- **外部数值必须核实**
  - 凡外部接口的常量(location_code、端点、字段名),实现前都要按 spec §9 用官方文档或真实接口核实,结果写进实现笔记。不得凭记忆写入。
- **测试数据**
  - 新增或改动的测试,夹具必须由真实生产函数生成,例如 `normalizeDomain()` 的输出、市场 code、真实 JSON-LD 形态(项目陷阱 trap-rule-fixture-unreachable)。

## Review Focus

1. **旧项目**:market 是旧显示文案、industry 是旧默认值的项目点"重新分析",应返回 422 并引导回向导第 1 步,不得报 500 或启动付费采集。测试在 Task 5。
2. **站点预读失败**:首页抓取超时、跳转到非 HTML、返回 4xx/5xx 时,预读返回空候选和 error 短码,向导仍允许手填。测试在 Task 3。
3. **DataForSEO 部分失败**:部分种子任务返回 40101,子阶段应为 partial 并带计数;40102(零结果)记为测量值而不是失败。测试在 Task 13。
4. **超大或非 UTF-8 原始响应**:如约 1MB 的 PSI 响应,应压缩存储;压缩后超过 4MB 时截断并标记 truncated;sha256 按原文计算。测试在 Task 9。
5. **Wikipedia 边界情况**:品牌名为常见词时命中消歧义页、标题需要跟随重定向、别名含空格,这些都不得误判为"有词条"。测试在 Task 11。

---

# 第一波:输入层

### Task 1: 市场表(单一真源)与三处消费方接线

**Files:**
- Create: `lib/markets.ts`、`lib/markets.test.ts`
- Modify: `lib/dataforseo/collect-stage.ts`(把 `resolveLocation` 换成 `getMarket`)、`lib/inngest/collect-evidence.ts`(AIO 用 `findMarket`;GSC 传国家;读取项目)、`lib/gsc/search-analytics.ts`(`QueryOptions.country`)、`lib/gsc/search-analytics.test.ts`、`lib/probes/run-probes.ts:112` 与 `lib/inngest/collect-evidence.ts:860`(语言回退值由 `'zh'` 改为 `'en'`)
- Delete: `lib/dataforseo/locations.ts`(及其测试)、`lib/serp/locations.ts`(及其测试)、`lib/analysis/locale-guess.ts`(及其测试;唯一调用方 NewAnalysisForm 在 Task 6 改)

**Interfaces:**
- Produces: `MARKET_CODES`、`type MarketCode`、`interface MarketSpec`、`MARKETS`、`isMarketCode(v)`、`findMarket(code): MarketSpec | null`、`getMarket(code): MarketSpec`(找不到时抛错)、`guessMarketCode(domain): MarketCode`;`QueryOptions.country?: string | null`

- [ ] **Step 1: 核实外部常量**(spec §9 #1、#4)

  用 DataForSEO 的 locations 接口(`GET /v3/serp/google/locations`,用真实凭据调一次,只读)核对 10 个 location_code;用 Google 官方文档核对 GSC 的 country 过滤值格式(searchanalytics.query 的 dimensionFilterGroups,country 取值是否为 ISO 3166-1 alpha-3 小写)。结果写入实现笔记。若与下表不一致,以核实结果为准。

- [ ] **Step 2: 写失败测试** `lib/markets.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { MARKETS, MARKET_CODES, findMarket, getMarket, guessMarketCode, isMarketCode } from './markets'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'

describe('markets', () => {
  it('每个 code 唯一且都是英文 Google 市场', () => {
    expect(new Set(MARKETS.map((m) => m.code)).size).toBe(MARKETS.length)
    expect(MARKETS.map((m) => m.code)).toEqual([...MARKET_CODES])
    for (const m of MARKETS) expect(m.languageCode).toBe('en')
  })
  it('global-en 以美国结果代理且 GSC 不按国家过滤', () => {
    const g = getMarket('global-en')
    expect(g.locationCode).toBe(getMarket('us').locationCode)
    expect(g.gscCountry).toBeNull()
  })
  it('旧显示文案与未知值查不到、getMarket 抛错(不回落默认)', () => {
    for (const legacy of ['English · Global', '中文 · 中国大陆', '东南亚', '']) {
      expect(findMarket(legacy)).toBeNull()
      expect(isMarketCode(legacy)).toBe(false)
      expect(() => getMarket(legacy)).toThrow()
    }
  })
  it('ccTLD 推断(输入为 normalizeDomain 真实输出)', () => {
    const g = (d: string) => guessMarketCode(normalizeDomain(d)!)
    expect(g('shop.co.uk')).toBe('gb')
    expect(g('brand.uk')).toBe('gb')
    expect(g('brand.com.au')).toBe('au')
    expect(g('brand.co.nz')).toBe('nz')
    expect(g('brand.ca')).toBe('ca')
    expect(g('metadocu.com')).toBe('global-en')
    expect(g('brand.co')).toBe('global-en')
    expect(guessMarketCode('not a url')).toBe('global-en')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

  Run: `pnpm vitest run lib/markets.test.ts`;Expected: FAIL(找不到模块 `./markets`)

- [ ] **Step 4: 实现** `lib/markets.ts`

```ts
// 英文 Google 市场单一真源(SP-A spec §3.1):DataForSEO 主阶段 / AIO / GSC 国家过滤 / 向导下拉与默认值共用。
// locationCode = 2000 + ISO 3166-1 数字码(Google Ads 地理定位口径),已按实现笔记的核实结果写入;
// gscCountry 为 GSC searchAnalytics country 维度取值(ISO 3166-1 alpha-3 小写)。找不到市场一律抛错,不回落默认。
export const MARKET_CODES = ['global-en', 'us', 'gb', 'ca', 'au', 'ie', 'nz', 'sg', 'in', 'za'] as const
export type MarketCode = (typeof MARKET_CODES)[number]

export interface MarketSpec {
  code: MarketCode
  labelZh: string
  labelEn: string
  locationCode: number
  languageCode: 'en'
  gscCountry: string | null
  ccTlds: string[]
}

export const MARKETS: readonly MarketSpec[] = [
  { code: 'global-en', labelZh: '全球英文(以美国结果代理)', labelEn: 'Global English (US results as proxy)', locationCode: 2840, languageCode: 'en', gscCountry: null, ccTlds: [] },
  { code: 'us', labelZh: '美国', labelEn: 'United States', locationCode: 2840, languageCode: 'en', gscCountry: 'usa', ccTlds: ['us'] },
  { code: 'gb', labelZh: '英国', labelEn: 'United Kingdom', locationCode: 2826, languageCode: 'en', gscCountry: 'gbr', ccTlds: ['uk', 'co.uk', 'org.uk'] },
  { code: 'ca', labelZh: '加拿大', labelEn: 'Canada', locationCode: 2124, languageCode: 'en', gscCountry: 'can', ccTlds: ['ca'] },
  { code: 'au', labelZh: '澳大利亚', labelEn: 'Australia', locationCode: 2036, languageCode: 'en', gscCountry: 'aus', ccTlds: ['au', 'com.au'] },
  { code: 'ie', labelZh: '爱尔兰', labelEn: 'Ireland', locationCode: 2372, languageCode: 'en', gscCountry: 'irl', ccTlds: ['ie'] },
  { code: 'nz', labelZh: '新西兰', labelEn: 'New Zealand', locationCode: 2554, languageCode: 'en', gscCountry: 'nzl', ccTlds: ['nz', 'co.nz'] },
  { code: 'sg', labelZh: '新加坡', labelEn: 'Singapore', locationCode: 2702, languageCode: 'en', gscCountry: 'sgp', ccTlds: ['sg', 'com.sg'] },
  { code: 'in', labelZh: '印度', labelEn: 'India', locationCode: 2356, languageCode: 'en', gscCountry: 'ind', ccTlds: ['in', 'co.in'] },
  { code: 'za', labelZh: '南非', labelEn: 'South Africa', locationCode: 2710, languageCode: 'en', gscCountry: 'zaf', ccTlds: ['za', 'co.za'] },
]

export function isMarketCode(v: string): v is MarketCode {
  return (MARKET_CODES as readonly string[]).includes(v)
}

export function findMarket(code: string): MarketSpec | null {
  return MARKETS.find((m) => m.code === code) ?? null
}

export function getMarket(code: string): MarketSpec {
  const m = findMarket(code)
  if (!m) throw new Error(`unknown market code: "${code}"`)
  return m
}

function hostnameOf(domain: string): string {
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

// 向导默认值:先匹配二级公共后缀(co.uk),再匹配一级(uk);都不中 → global-en。
export function guessMarketCode(domain: string): MarketCode {
  const labels = hostnameOf(domain).split('.').filter(Boolean)
  if (labels.length < 2) return 'global-en'
  const last2 = labels.slice(-2).join('.')
  const last1 = labels[labels.length - 1]
  return MARKETS.find((m) => m.ccTlds.includes(last2))?.code ?? MARKETS.find((m) => m.ccTlds.includes(last1))?.code ?? 'global-en'
}
```

- [ ] **Step 5: GSC 国家过滤**

  在 `lib/gsc/search-analytics.ts` 的 `QueryOptions` 中增加 `country?: string | null`,并在请求体里条件性加入过滤:

```ts
    body: JSON.stringify({
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 1000,
      ...(opts.country
        ? { dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: opts.country }] }] }
        : {}),
    }),
```

  在 `search-analytics.test.ts` 中补两条用例:传 `country: 'gbr'` 时请求体包含该 filter;传 `null` 时不包含 `dimensionFilterGroups`。

- [ ] **Step 6: 接线三处消费方**
  - `collect-stage.ts`:删除 `import { resolveLocation } from './locations'`,改为 `import { getMarket } from '@/lib/markets'`;`const m = getMarket(market); const locOpts = { locationCode: m.locationCode, languageCode: m.languageCode }`。`getMarket` 抛错由 Task 13 的子阶段错误处理接住;在 Task 5 的闸门上线后,这里理论上不会被触发。
  - `collect-evidence.ts`:
    - 在 `load-crawl-settings` 之后新增 `const project = await step.run('load-project', () => deps.getProject(projectId))`。
    - GSC 的两次 `querySearchAnalytics` 调用增加 `country: findMarket(project?.market ?? '')?.gscCountry ?? null`。
    - AIO 改为 `const m = findMarket(market)`;`m` 为 null 时沿用现有的"跳过"分支,失败原因写 `market_unmapped`;不为 null 时 `loc = { locationCode: m.locationCode, languageCode: m.languageCode }`。
    - GSC 关键词 upsert 时 `market: project?.market ?? ''`、`language: 'en'`。
  - `run-probes.ts:112`、`collect-evidence.ts:860`:`project.language || 'zh'` 改为 `project.language || 'en'`。
  - 删除 `lib/dataforseo/locations.ts`、`lib/serp/locations.ts` 及它们的测试文件;用 `grep -rn "resolveLocation\|resolveAioLocation" lib app components` 确认零残留。

- [ ] **Step 7: 运行相关测试**

  Run: `pnpm vitest run lib/markets.test.ts lib/gsc lib/dataforseo lib/inngest/collect-evidence.test.ts lib/probes`;Expected: PASS。原有测试若断言了旧市场文案(如 'de'、'English · Global'),改为使用市场 code,并在实现笔记中逐条记录。

- [ ] **Step 8: 记录检查点**(不提交):在实现笔记中记下本任务改动的文件清单与测试结果。

### Task 2: 品类校验器与候选提取(纯函数)

**Files:**
- Modify: `lib/repositories/validators.ts`、`lib/repositories/validators.test.ts`
- Create: `lib/analysis/category-candidates.ts`、`lib/analysis/category-candidates.test.ts`

**Interfaces:**
- Produces:
  - `isValidCategory(text): boolean`
  - `assertValidCategory(text): void`
  - `isValidKeyword(text): boolean`(同一字符集,长度 2–80)
  - `interface SitePreviewFacts { title: string | null; h1: string | null; metaDescription: string | null; siteName: string | null }`
  - `extractSitePreviewFacts(html): SitePreviewFacts`
  - `categoryCandidates(facts, brand): string[]`
  - `splitTitleSegments(text): string[]`

- [ ] **Step 1: 写失败测试**(在 validators.test.ts 中追加)

```ts
import { isValidCategory, assertValidCategory, isValidKeyword } from './validators'

describe('category / keyword validators (SP-A §3.2)', () => {
  it('接受英文品类', () => {
    for (const ok of ['document metadata removal tool', 'B2B SaaS', "Men's running shoes", 'CRM & sales automation']) expect(isValidCategory(ok)).toBe(true)
  })
  it('拒绝旧默认值、中文、过短过长', () => {
    for (const bad of ['B2B SaaS · 项目协作', '其他…', '文档工具', 'ab', '  ', 'x'.repeat(81)]) expect(isValidCategory(bad)).toBe(false)
    expect(() => assertValidCategory('其他…')).toThrow()
  })
  it('关键词允许 2 字符', () => {
    expect(isValidKeyword('ai')).toBe(true)
    expect(isValidKeyword('移除元数据')).toBe(false)
  })
})
```

  另建 `category-candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { categoryCandidates, extractSitePreviewFacts, splitTitleSegments } from './category-candidates'

const html = `<!doctype html><html><head><title>Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu</title>
<meta name="description" content="Clean author, GPS and revision data from documents. Works in your browser.">
<meta property="og:site_name" content="MetaDocu"></head><body><h1>Remove PDF Metadata Online</h1></body></html>`

describe('category candidates', () => {
  it('抽取首页事实', () => {
    expect(extractSitePreviewFacts(html)).toEqual({
      title: 'Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu',
      h1: 'Remove PDF Metadata Online',
      metaDescription: 'Clean author, GPS and revision data from documents. Works in your browser.',
      siteName: 'MetaDocu',
    })
  })
  it('切段:| — – : · • 与两侧带空格的 -,保留连字符词', () => {
    expect(splitTitleSegments('A | B — C - D:E · F • G e-mail tool')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G e-mail tool'])
  })
  it('去品牌、去重、最多 3 个且全部可通过品类校验', () => {
    const c = categoryCandidates(extractSitePreviewFacts(html), 'metadocu')
    expect(c).toEqual(['Remove PDF Metadata Online', 'Free, No Upload', 'Clean author, GPS and revision data from documents.'])
  })
  it('中文站点给不出候选(只做英文)', () => {
    const zh = extractSitePreviewFacts('<title>文档元数据清除 | 某品牌</title><h1>清除元数据</h1>')
    expect(categoryCandidates(zh, 'brand')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**:`pnpm vitest run lib/repositories/validators.test.ts lib/analysis/category-candidates.test.ts`

- [ ] **Step 3: 实现**

  在 `validators.ts` 中追加:

```ts
// 品类(projects.industry 语义,SP-A §3.2):英文描述,会被拼进英文 AI 探针与 AIO 查询。
const CATEGORY_CHARS = /^[A-Za-z0-9][A-Za-z0-9 &/,.'()+-]*$/

export function isValidCategory(text: string): boolean {
  const t = text.trim()
  return t.length >= 3 && t.length <= 80 && CATEGORY_CHARS.test(t)
}

export function assertValidCategory(text: string): void {
  if (!isValidCategory(text)) throw new Error('category must be 3-80 English chars (letters, digits, space, & / , . \' ( ) + -)')
}

export function isValidKeyword(text: string): boolean {
  const t = text.trim()
  return t.length >= 2 && t.length <= 80 && CATEGORY_CHARS.test(t)
}
```

  新建 `category-candidates.ts`:

```ts
import { parseHTML } from 'linkedom'
import { isValidCategory } from '@/lib/repositories/validators'

// 站点预读事实与品类候选(SP-A §3.2)。确定性、零 LLM:候选只是起点,用户必须点选或编辑后确认。
export interface SitePreviewFacts {
  title: string | null
  h1: string | null
  metaDescription: string | null
  siteName: string | null
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t || null
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function extractSitePreviewFacts(html: string): SitePreviewFacts {
  const { document } = parseHTML(html)
  const metaDescription = [...document.querySelectorAll('meta[name]')]
    .filter((m) => m.getAttribute('name')?.trim().toLowerCase() === 'description')
    .map((m) => clean(m.getAttribute('content')))
    .find(Boolean) ?? null
  return {
    title: clean(document.querySelector('title')?.textContent),
    h1: clean(document.querySelector('h1')?.textContent),
    metaDescription,
    siteName: clean(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')),
  }
}

// 标题分隔符:| — – : · • 以及两侧带空格的 -(保留 e-mail 这类连字符词)。
export function splitTitleSegments(text: string): string[] {
  return text.split(/\s*[|—–:·•]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean)
}

function firstSentence(s: string | null): string | null {
  if (!s) return null
  const first = s.split(/(?<=[.!?])\s+/)[0] ?? s
  return first.length > 80 ? first.slice(0, 80).replace(/\s+\S*$/, '') : first
}

export function categoryCandidates(facts: SitePreviewFacts, brand: string): string[] {
  const brandKeys = [brand, facts.siteName ?? ''].map(norm).filter(Boolean)
  const out: string[] = []
  const push = (s: string | null) => {
    const t = clean(s)
    if (!t || brandKeys.includes(norm(t)) || !isValidCategory(t)) return
    if (out.some((o) => norm(o) === norm(t))) return
    out.push(t)
  }
  for (const seg of splitTitleSegments(facts.title ?? '')) push(seg)
  push(facts.h1)
  push(firstSentence(facts.metaDescription))
  return out.slice(0, 3)
}
```

- [ ] **Step 4: 运行测试确认通过**:同 Step 2;Expected: PASS
- [ ] **Step 5: 记录检查点**(不提交)

### Task 3: 站点预读接口 `POST /api/site-preview`

**Files:**
- Create: `lib/analysis/site-preview.ts`、`lib/analysis/site-preview.test.ts`、`app/api/site-preview/route.ts`
- Modify(仅在未导出时):`lib/crawl/light-check.ts`,导出 `decodeBody`、`readBodyLimited`

**Interfaces:**
- Consumes:Task 2 的 `extractSitePreviewFacts`、`categoryCandidates`;`assertPublicUrl`(`@/lib/security/ssrf-guard`);`safeFetch`(先 `grep -rn "export.*safeFetch" lib` 确认路径);`brandFromDomain`(`@/lib/probes/prompt-set`)
- Produces:`interface SitePreview { facts: SitePreviewFacts; candidates: string[]; error: string | null }`;`previewSite(url, deps?)`

- [ ] **Step 1: 写失败测试** `site-preview.test.ts`

  注入 `assertPublicUrl` 与 `safeFetch` 的假实现,覆盖以下情况:
  1. 200 HTML → 返回 facts 与候选,`error: null`
  2. 返回 404 → `error: 'http_404'`,候选为空
  3. `content-type: application/pdf` → `error: 'not_html'`
  4. fetch 抛出 → `error: 'fetch_failed'`
  5. `assertPublicUrl` 抛出 `SsrfBlockedError` → `error: 'blocked'`

  每种情况都断言**不抛错**。

```ts
import { describe, it, expect } from 'vitest'
import { previewSite } from './site-preview'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'

const okHtml = '<title>Remove PDF Metadata Online | MetaDocu</title><h1>Remove PDF Metadata Online</h1>'
const res = (status: number, body: string, ct = 'text/html; charset=utf-8') =>
  new Response(body, { status, headers: { 'content-type': ct } })
const deps = (r: () => Promise<Response>, ssrf?: Error) => ({
  assertPublicUrl: async (u: string) => { if (ssrf) throw ssrf; return new URL(u) },
  safeFetch: async () => r(),
})

describe('previewSite', () => {
  it('200 HTML → 候选', async () => {
    const p = await previewSite('https://metadocu.com/', deps(async () => res(200, okHtml)))
    expect(p.error).toBeNull()
    expect(p.candidates).toEqual(['Remove PDF Metadata Online'])
  })
  it.each([
    ['http_404', () => Promise.resolve(res(404, 'nope')), undefined],
    ['not_html', () => Promise.resolve(res(200, '%PDF', 'application/pdf')), undefined],
    ['fetch_failed', () => Promise.reject(new Error('timeout')), undefined],
    ['blocked', () => Promise.resolve(res(200, okHtml)), new SsrfBlockedError('private')],
  ])('%s → 空候选不抛错', async (code, r, ssrf) => {
    const p = await previewSite('https://x.test/', deps(r, ssrf))
    expect(p).toMatchObject({ error: code, candidates: [] })
  })
})
```

  (`SsrfBlockedError` 的构造参数以 `lib/security/ssrf-guard.ts` 的实际签名为准。)

- [ ] **Step 2: 运行测试确认失败**:`pnpm vitest run lib/analysis/site-preview.test.ts`
- [ ] **Step 3: 实现** `lib/analysis/site-preview.ts`

```ts
import { assertPublicUrl as realAssert, SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { safeFetch as realFetch } from '@/lib/security/safe-fetch'
import { decodeBody, readBodyLimited } from '@/lib/crawl/light-check'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { categoryCandidates, extractSitePreviewFacts, type SitePreviewFacts } from './category-candidates'

// 向导第 1 步的站点预读(SP-A §3.2):只读、不落库;任何失败都只返回空候选 + error 短码。
export interface SitePreview { facts: SitePreviewFacts; candidates: string[]; error: string | null }

const EMPTY_FACTS: SitePreviewFacts = { title: null, h1: null, metaDescription: null, siteName: null }

interface PreviewDeps {
  assertPublicUrl: (u: string) => Promise<URL>
  safeFetch: (u: string, opts?: { timeoutMs?: number }) => Promise<Response>
}

export async function previewSite(url: string, deps: PreviewDeps = { assertPublicUrl: realAssert, safeFetch: realFetch }): Promise<SitePreview> {
  const empty = (error: string): SitePreview => ({ facts: EMPTY_FACTS, candidates: [], error })
  let safe: URL
  try {
    safe = await deps.assertPublicUrl(url)
  } catch (err) {
    return empty(err instanceof SsrfBlockedError ? 'blocked' : 'invalid_url')
  }
  try {
    const res = await deps.safeFetch(safe.toString(), { timeoutMs: 8000 })
    if (res.status >= 400) return empty(`http_${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    if (ct && !/html/i.test(ct)) return empty('not_html')
    const html = decodeBody(await readBodyLimited(res), ct)
    const facts = extractSitePreviewFacts(html)
    return { facts, candidates: categoryCandidates(facts, brandFromDomain(safe.hostname)), error: null }
  } catch {
    return empty('fetch_failed')
  }
}
```

  route:

```ts
import { NextResponse } from 'next/server'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { previewSite } from '@/lib/analysis/site-preview'

// POST /api/site-preview — 向导品类候选(只读,不落库)。域名非法 422;抓取失败照样 200 + error 短码。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { domain?: string }
  const domain = normalizeDomain(body.domain?.trim() ?? '')
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
  return NextResponse.json(await previewSite(domain))
}
```

  如果 `safeFetch` 不在 `@/lib/security/safe-fetch`,或者 `decodeBody`、`readBodyLimited` 的签名不同,以实际代码为准,并在实现笔记中记录。

- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 4: 种子词重写(四个来源 + 来源标签)

**Files:**
- Modify: `lib/diagnosis/seed-keywords.ts`、`lib/diagnosis/seed-keywords.test.ts`(重写)
- Create: `lib/diagnosis/site-phrases.ts`、`lib/diagnosis/site-phrases.test.ts`
- Modify: `lib/repositories/index.ts`(新增 `getManualKeywords`、`getGscKeywordHistory`)、`lib/repositories/keywords.repo.test.ts`
- Modify: `lib/inngest/collect-evidence.ts`(`dfs-gather-seeds` 步骤)、`lib/dataforseo/collect-stage.ts`(`seeds: Seed[]`,request 中记录种子与来源)

**Interfaces:**
- Produces:
  - `type SeedSource = 'manual' | 'gsc' | 'gsc_history' | 'site_phrase'`
  - `interface Seed { text: string; source: SeedSource; lastSeenAt?: string }`
  - `gatherSeedKeywords(input: { manualKeywords: string[]; gscQueries: { keyText: string; impressions: number }[]; historicalGsc: { keyText: string; lastSeenAt: string }[]; sitePhrases: string[]; brand: string; aliases: string[]; limit: number }): Seed[]`
  - `sitePhrases(input: { titles: string[]; h1s: string[]; brand: string; aliases: string[] }): string[]`
  - `getManualKeywords(projectId): Promise<string[]>`
  - `getGscKeywordHistory(projectId): Promise<{ keyText: string; lastSeenAt: string }[]>`
  - `DataforseoStageArgs.seeds: Seed[]`

- [ ] **Step 1: 写失败测试**

```ts
// seed-keywords.test.ts(整文件重写)
import { describe, it, expect } from 'vitest'
import { gatherSeedKeywords } from './seed-keywords'

const base = { manualKeywords: [], gscQueries: [], historicalGsc: [], sitePhrases: [], brand: 'metadocu', aliases: [], limit: 100 }

describe('gatherSeedKeywords (SP-A §3.3)', () => {
  it('优先级 manual → gsc(按展示) → gsc_history(按时间) → site_phrase,带来源标签', () => {
    const seeds = gatherSeedKeywords({
      ...base,
      manualKeywords: ['remove pdf metadata'],
      gscQueries: [{ keyText: 'remove author from word', impressions: 3 }, { keyText: 'remove metadata excel', impressions: 9 }],
      historicalGsc: [{ keyText: 'old query', lastSeenAt: '2026-07-01' }, { keyText: 'newer query', lastSeenAt: '2026-09-01' }],
      sitePhrases: ['remove gps exif from document images'],
    })
    expect(seeds.map((s) => [s.text, s.source])).toEqual([
      ['remove pdf metadata', 'manual'],
      ['remove metadata excel', 'gsc'],
      ['remove author from word', 'gsc'],
      ['newer query', 'gsc_history'],
      ['old query', 'gsc_history'],
      ['remove gps exif from document images', 'site_phrase'],
    ])
    expect(seeds.find((s) => s.text === 'newer query')?.lastSeenAt).toBe('2026-09-01')
  })
  it('去品牌(含别名)、去重(大小写/空白)、截断', () => {
    const seeds = gatherSeedKeywords({
      ...base,
      aliases: ['Meta Docu'],
      manualKeywords: ['MetaDocu review', 'meta docu pricing', 'Remove  PDF metadata'],
      gscQueries: [{ keyText: 'remove pdf metadata', impressions: 5 }],
      limit: 1,
    })
    expect(seeds).toEqual([{ text: 'Remove  PDF metadata', source: 'manual' }])
  })
  it('全部为空 → 空数组(由调用方标记 no_seeds)', () => {
    expect(gatherSeedKeywords(base)).toEqual([])
  })
})
```

```ts
// site-phrases.test.ts
import { describe, it, expect } from 'vitest'
import { sitePhrases } from './site-phrases'

describe('sitePhrases', () => {
  it('从 title/H1 切出 2–6 词英文短语、去品牌、去重、小写', () => {
    expect(sitePhrases({
      titles: ['Remove PDF Metadata Online — Free, No Upload | MetaDocu | MetaDocu', 'Privacy Policy - MetaDocu | MetaDocu', 'MetaDocu alternatives'],
      h1s: ['Remove PDF Metadata Online'],
      brand: 'metadocu',
      aliases: [],
    })).toEqual(['remove pdf metadata online', 'free, no upload', 'privacy policy'])
  })
  it('单词与超过 6 词、中文都丢弃', () => {
    expect(sitePhrases({ titles: ['Home', 'one two three four five six seven', '清除元数据工具'], h1s: [], brand: 'x', aliases: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**:`pnpm vitest run lib/diagnosis/seed-keywords.test.ts lib/diagnosis/site-phrases.test.ts`
- [ ] **Step 3: 实现**

```ts
// seed-keywords.ts(整文件替换)
// 种子词收集(SP-A §3.3):用户目标词 → 本期 GSC → 历史 GSC → 站点关键短语;去品牌(含别名)、去重、截断。
// 探针问句不再作为种子(它们是自然语言问题,而且曾被行业默认值污染)。纯函数、确定性,保证同协议回测可比。
export type SeedSource = 'manual' | 'gsc' | 'gsc_history' | 'site_phrase'
export interface Seed { text: string; source: SeedSource; lastSeenAt?: string }

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function gatherSeedKeywords(input: {
  manualKeywords: string[]
  gscQueries: { keyText: string; impressions: number }[]
  historicalGsc: { keyText: string; lastSeenAt: string }[]
  sitePhrases: string[]
  brand: string
  aliases: string[]
  limit: number
}): Seed[] {
  const brandKeys = [input.brand, ...input.aliases].map(squash).filter(Boolean)
  const isBrand = (t: string) => brandKeys.some((b) => squash(t).includes(b))
  const seen = new Set<string>()
  const out: Seed[] = []
  const push = (raw: string, source: SeedSource, lastSeenAt?: string) => {
    const text = raw.trim()
    if (!text || isBrand(text)) return
    const key = normalize(text)
    if (seen.has(key)) return
    seen.add(key)
    out.push(lastSeenAt ? { text, source, lastSeenAt } : { text, source })
  }
  for (const k of input.manualKeywords) push(k, 'manual')
  for (const q of [...input.gscQueries].sort((a, b) => b.impressions - a.impressions)) push(q.keyText, 'gsc')
  for (const h of [...input.historicalGsc].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))) push(h.keyText, 'gsc_history', h.lastSeenAt)
  for (const p of input.sitePhrases) push(p, 'site_phrase')
  return out.slice(0, Math.max(0, input.limit))
}
```

```ts
// site-phrases.ts
import { splitTitleSegments } from '@/lib/analysis/category-candidates'

// 站点关键短语(SP-A §3.3 第 4 来源):已抓页 title + 深检页 H1 → 2–6 词英文短语,去品牌、去重、小写。
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const ENGLISH_PHRASE = /^[a-z0-9][a-z0-9 &/,.'()+-]*$/

export function sitePhrases(input: { titles: string[]; h1s: string[]; brand: string; aliases: string[] }): string[] {
  const brandKeys = [input.brand, ...input.aliases].map(squash).filter(Boolean)
  const out = new Set<string>()
  for (const raw of [...input.titles, ...input.h1s]) {
    for (const seg of splitTitleSegments(raw)) {
      const t = seg.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!t || brandKeys.some((b) => squash(t).includes(b))) continue
      const words = t.split(' ').length
      if (words < 2 || words > 6 || !ENGLISH_PHRASE.test(t)) continue
      out.add(t)
    }
  }
  return [...out]
}
```

  仓库函数(追加到 `lib/repositories/index.ts`,沿用该文件的 drizzle 风格):

```ts
export async function getManualKeywords(projectId: string): Promise<string[]> {
  const rows = await db.select({ text: keywords.text }).from(keywords)
    .where(and(eq(keywords.projectId, projectId), eq(keywords.source, 'manual')))
  return rows.map((r) => r.text)
}

// 历史 GSC 词 + 最近一次出现时间(最近一条 keyword_metrics 所属 run 的 started_at,缺省取 keywords.created_at)。
export async function getGscKeywordHistory(projectId: string): Promise<{ keyText: string; lastSeenAt: string }[]> {
  const rows = await db
    .select({ keyText: keywords.text, lastRun: sql<string | null>`max(${runs.startedAt})`, createdAt: keywords.createdAt })
    .from(keywords)
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .leftJoin(runs, eq(runs.id, keywordMetrics.runId))
    .where(and(eq(keywords.projectId, projectId), eq(keywords.source, 'gsc')))
    .groupBy(keywords.id)
  return rows.map((r) => ({ keyText: r.keyText, lastSeenAt: r.lastRun ?? r.createdAt }))
}
```

  (实现前先 `sed -n` 查看 `runs.startedAt` 的列类型与格式;若存的是 epoch 数字,统一转成 ISO 字符串后再比较,并在实现笔记中记录。)`keywords.repo.test.ts` 补两条用例:只返回 manual;按 run 时间取最新、没有 metrics 时回落 created_at。

  `collect-evidence.ts` 的 `dfs-gather-seeds` 步骤替换为:

```ts
    const { seeds, market } = await step.run('dfs-gather-seeds', async () => {
      const [proj, manual, history, sitePagesNow] = await Promise.all([
        deps.getProject(projectId),
        deps.getManualKeywords(projectId),
        deps.getGscKeywordHistory(projectId),
        deps.getRunSitePages(runId),
      ])
      const current = new Set(gscTopQueries.map((q) => q.keyText.trim().toLowerCase()))
      const titles = sitePagesNow
        .filter((p) => p.checkStatus === 'checked' && p.httpStatus === 200 && p.title && !isUtilityPage(p.finalUrl ?? p.url))
        .map((p) => p.title as string)
      const entryH1 = extractSitePreviewFacts(pageFacts.rawHtml).h1
      const seeds = gatherSeedKeywords({
        manualKeywords: manual,
        gscQueries: gscTopQueries,
        historicalGsc: history.filter((h) => !current.has(h.keyText.trim().toLowerCase())),
        sitePhrases: sitePhrases({ titles, h1s: entryH1 ? [entryH1] : [], brand, aliases: settings?.brandAliases ?? [] }),
        brand,
        aliases: settings?.brandAliases ?? [],
        limit: settings?.seedKeywordLimit ?? 100,
      })
      return { seeds, market: proj?.market ?? '' }
    })
```

  - `CollectDeps` 新增 `getManualKeywords: typeof getManualKeywords`、`getGscKeywordHistory: typeof getGscKeywordHistory`,`defaultDeps` 同步加上。
  - `isUtilityPage` 来自 `@/lib/crawl/link-integrity`(先确认它接受的参数是 URL)。
  - `collect-stage.ts` 中,`seeds` 改为 `Seed[]`;API 调用使用 `seeds.map((s) => s.text)`;seed_serp 证据的 request 改为 `{ kind: 'seed_serp', ...locOpts, seedCount: seeds.length, seeds }`。

- [ ] **Step 4: 运行测试确认通过**:`pnpm vitest run lib/diagnosis/seed-keywords.test.ts lib/diagnosis/site-phrases.test.ts lib/repositories/keywords.repo.test.ts lib/inngest/collect-evidence.test.ts lib/dataforseo`
- [ ] **Step 5: 记录检查点**(不提交)

### Task 5: 建 run 闸门与项目接口校验

**Files:**
- Modify: `app/api/runs/route.ts`、`app/api/runs/route.test.ts`、`app/api/projects/route.ts`、`app/api/projects/route.test.ts`、`app/api/projects/[id]/route.ts`
- Modify: `lib/repositories/index.ts`(新增 `replaceManualKeywords(projectId, market, texts)`)

**Interfaces:**
- Consumes:`isValidCategory`、`isValidKeyword`(Task 2);`findMarket`、`isMarketCode`(Task 1);`getManualKeywords`(Task 4)
- Produces:
  - 错误码:`category_required`、`market_required`(POST /api/runs,422);`invalid_category`、`invalid_market`、`invalid_keywords`(项目接口,422)
  - 项目接口新增可选入参 `targetKeywords: string[]`;GET/POST(复用项目)的响应新增 `targetKeywords`

- [ ] **Step 1: 写失败测试**(在 `app/api/runs/route.test.ts` 中追加,沿用该文件已有的 mock 方式)
  - 项目 `industry = 'B2B SaaS · 项目协作'` → 422 `category_required`,且不调用 `inngest.send`
  - `market = 'English · Global'` → 422 `market_required`
  - 合规项目(`industry = 'document metadata removal tool'`、`market = 'global-en'`)→ 201

  在项目接口测试中追加:
  - `market: '中文 · 中国大陆'` → 422 `invalid_market`
  - `industry: '其他…'` → 422 `invalid_category`
  - `targetKeywords` 超过 20 个,或含中文 → 422 `invalid_keywords`
  - 合规的 `targetKeywords` 写入 keywords(`source = 'manual'`,`market` 为项目 code)
  - `language` 无论传入什么,都存为 `'en'`
  - 不再写 `project_settings.market_location`

- [ ] **Step 2: 运行确认失败**:`pnpm vitest run app/api/runs/route.test.ts app/api/projects/route.test.ts`
- [ ] **Step 3: 实现**

  在 `runs/route.ts` 中,`getProject` 之后、并发保护之前加入:

```ts
  // SP-A §3.5 闸门:品类/市场无效不得启动(也就不会触发任何付费采集)。界面据错误码引导回向导第 1 步。
  if (!isValidCategory(project.industry)) return NextResponse.json({ error: 'category_required' }, { status: 422 })
  if (!findMarket(project.market)) return NextResponse.json({ error: 'market_required' }, { status: 422 })
```

  项目 POST/PATCH 的公共校验(放在各自 route 内,保持现有风格):

```ts
  if (body.industry !== undefined && body.industry.trim() !== '' && !isValidCategory(body.industry))
    return NextResponse.json({ error: 'invalid_category' }, { status: 422 })
  if (body.market !== undefined && body.market !== '' && !isMarketCode(body.market))
    return NextResponse.json({ error: 'invalid_market' }, { status: 422 })
  const targetKeywords = body.targetKeywords
  if (targetKeywords !== undefined && (!Array.isArray(targetKeywords) || targetKeywords.length > 20 || !targetKeywords.every((k) => typeof k === 'string' && isValidKeyword(k))))
    return NextResponse.json({ error: 'invalid_keywords' }, { status: 422 })
```

  - 写库:`industry: body.industry?.trim() ?? ''`、`language: 'en'`;从 insert 和 settingsPatch 中删除 `marketLocation`。
  - `targetKeywords` 存在时调用 `replaceManualKeywords(projectId, market, targetKeywords.map((k) => k.trim()))`。该函数先删除本项目全部 `source = 'manual'` 的行,再插入新行,id 为 `kw_${uuid}`,`language = 'en'`。
  - 复用项目的响应与 GET 响应加上 `targetKeywords: await getManualKeywords(id)`。

- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 6: 向导第 1 步改造与市场显示

**Files:**
- Modify: `components/NewAnalysisForm.tsx`、`components/NewAnalysisForm.test.tsx`、`messages/zh.json`、`messages/en.json`(文本级插入新 key)、`components/ProjectList.tsx`、`app/[locale]/page.tsx:162`、`app/[locale]/sessions/[id]/SessionInputForm.tsx`

**Interfaces:**
- Consumes:`MARKETS`、`guessMarketCode`、`findMarket`(Task 1);`isValidCategory`、`isValidKeyword`(Task 2);`POST /api/site-preview`(Task 3);项目接口的 `targetKeywords` 与错误码(Task 5)
- Produces:i18n 新 key(`screen1.*`):`categoryLabel`、`categoryPlaceholder`、`categoryHint`、`categoryCandidates`、`categoryInvalid`、`sitePreviewLoading`、`sitePreviewEmpty`、`siteFactsTitle`、`targetKeywordsLabel`、`targetKeywordsPlaceholder`、`targetKeywordsHint`、`targetKeywordsInvalid`、`errorCategoryRequired`、`errorMarketRequired`

- [ ] **Step 1: 先读全文件** `components/NewAnalysisForm.tsx` 与现有测试,在实现笔记中列出要改的段落(第 1 步表单、`upsertProject`、`syncExistingProject`、第 3 步摘要、提交错误映射)。
- [ ] **Step 2: 写失败测试**(RTL,mock `fetch`):
  1. 输入域名后防抖结束,调用 `/api/site-preview`;返回的候选以按钮(芯片)形式出现,**品类输入框保持为空**;点击芯片后填入。
  2. 品类为空或不合规时"下一步"按钮被禁用,并显示 `categoryInvalid`。
  3. 市场下拉有 10 项,输入 `shop.co.uk` 后默认选中"英国";用户手动改选后,再改域名也不覆盖用户的选择。
  4. 目标关键词某一行含中文时,显示 `targetKeywordsInvalid` 并禁用"下一步"。
  5. 提交请求体为 `{ domain, industry, market: 'gb', competitors, targetKeywords: [...] }`,不含 `language`。
  6. 建 run 返回 422 `category_required` 时回到第 1 步,并显示 `errorCategoryRequired`。
  7. 复用项目时,品类、市场、目标关键词按服务端返回的值恢复。
- [ ] **Step 3: 运行确认失败**:`pnpm vitest run components/NewAnalysisForm.test.tsx`
- [ ] **Step 4: 实现**
  - **状态**:删除 `industryIndex`、`marketIndex`,改为:
    - `const [category, setCategory] = useState(project?.industry && isValidCategory(project.industry) ? project.industry : '')`
    - `const [market, setMarket] = useState<MarketCode>(findMarket(project?.market ?? '')?.code ?? 'global-en')`
    - `const [marketTouched, setMarketTouched] = useState(false)`
    - `const [targetKeywordsText, setTargetKeywordsText] = useState((project?.targetKeywords ?? []).join('\n'))`
    - `const [preview, setPreview] = useState<{ loading: boolean; candidates: string[]; facts: SitePreviewFacts | null }>(...)`
  - **域名变更**:600ms 防抖后 POST `/api/site-preview`,并按 Task 1 的 `guessMarketCode` 规则(仅当 `!marketTouched`)设置市场。用一个 `useEffect` 依赖 `domain`,cleanup 中清掉定时器,并用 AbortController 中止旧请求。
  - **渲染**:
    - 品类:`<input id="wiz-category">`,上方是候选芯片 `<button type="button">`,下方是站点事实原文(title、H1、description)。
    - 市场:`<select id="wiz-market">`,`MARKETS.map((m) => <option value={m.code}>{locale === 'zh' ? m.labelZh : m.labelEn}</option>)`。
    - 目标关键词:`<textarea id="wiz-target-keywords">`。
  - **"下一步"禁用条件**:`!isValidCategory(category) || !keywordsValid`,其中 `keywordsValid = lines.length <= 20 && lines.every(isValidKeyword)`。
  - **提交**:`upsertProject` 的 `shared` 改为 `{ domain, industry: category.trim(), market, competitors, targetKeywords: lines }`,不再发 `language`。
  - **错误映射**:新增 `case 'category_required'` → `t('errorCategoryRequired')` 并 `setStep(1)`;`case 'market_required'` 同理。
  - **第 3 步摘要**:显示品类原文,以及市场显示名。
  - **i18n**:在 `messages/zh.json` 与 `messages/en.json` 的 `screen1` 中用文本级插入新增上面的 key。中文示例:`"categoryLabel": "产品/服务品类(英文)"`、`"categoryHint": "会写进英文 AI 探针与搜索查询,例如 document metadata removal tool"`。原有的 `industryOptions`、`marketOptions` key 在确认全仓零引用后,用文本级删除。删除后跑 `git diff messages/` 核对,只允许出现预期的增删行。
  - **其他显示位置**:`ProjectList.tsx` 与 `app/[locale]/page.tsx:162` 显示市场时用 `findMarket(p.market)?.labelZh ?? '未设置'`(按 locale 选 Zh/En)。`SessionInputForm` 的市场字段改为同一个下拉,行业字段改为品类输入,并加同一校验。
- [ ] **Step 5: 运行测试确认通过**:`pnpm vitest run components/NewAnalysisForm.test.tsx components/ProjectList.test.tsx`;另跑 `pnpm lint` 检查本任务涉及的文件
- [ ] **Step 6: 记录检查点**(不提交)

### Task 7: 旧数据迁移

**Files:**
- Create: `db/migrations/0015_sp_a_market_codes.sql`(用 `pnpm drizzle-kit generate --custom --name=sp_a_market_codes` 生成空迁移和 journal 条目,再填入 SQL)、`lib/repositories/sp-a-migration.repo.test.ts`

- [ ] **Step 1: 写失败测试**

  沿用 keywords.repo.test.ts 的 bootstrap 方式,但**只灌入 0015 之前的迁移**。然后插入旧数据,再执行 0015,最后断言结果:

```ts
// 关键断言
expect(rows).toEqual([
  { id: 'p1', market: 'global-en', industry: '', language: 'en' },        // 'English · Global' + 旧默认行业
  { id: 'p2', market: '', industry: 'document metadata removal tool', language: 'en' }, // '中文 · 中国大陆'
  { id: 'p3', market: '', industry: '', language: 'en' },                 // '东南亚' + '其他…'
])
```

- [ ] **Step 2: 运行确认失败** → **Step 3: 填写 SQL**

```sql
UPDATE `projects` SET `market` = 'global-en' WHERE `market` IN ('English · Global');--> statement-breakpoint
UPDATE `projects` SET `market` = '' WHERE `market` NOT IN ('global-en','us','gb','ca','au','ie','nz','sg','in','za');--> statement-breakpoint
UPDATE `projects` SET `industry` = '' WHERE `industry` IN ('B2B SaaS · 项目协作','其他…','B2B SaaS · Project collaboration','Other…');--> statement-breakpoint
UPDATE `projects` SET `language` = 'en';
```

  英文变体以 `messages/en.json` 中 `screen1.industryOptions` 的实际原文为准(在 Task 6 删除这个 key 之前先读出来)。

- [ ] **Step 4: 运行测试确认通过**;再跑全部 `*.repo.test.ts`,确认全量迁移 bootstrap 不受影响
- [ ] **Step 5: 第一波收口**
  - 跑 `pnpm test`、`pnpm lint`、`pnpm build`。
  - 派一个**只读**独立审查代理,审查第一波的改动文件清单(从实现笔记中取)。任务书必须写明"只报告,禁止修改",收口后对比 git 快照。
  - 审查发现的问题修复后,记录检查点。

---

# 第二波:采集层

### Task 8: 统一采集结果类型与父级状态汇总

**Files:**
- Create: `lib/collection/result.ts`、`lib/collection/result.test.ts`、`lib/runs/source-status.ts`、`lib/runs/source-status.test.ts`

**Interfaces:**
- Produces:
  - `interface RawResponse { status: number; contentType: string | null; body: string }`
  - `type CollectResult<T>`(见 spec §4.1)、`okResult`、`failResult`、`readRaw(res)`
  - `reasonOf(err): string`,映射规则:`DataforseoTaskError` → `task_<code>`;消息含 `request failed: <status>` → `http_<status>`;其余 → `network_error`
  - `subSourceKey(parent, child)`、`parentOf(key)`、`aggregateParentStatus(children: DataSourceStatus[]): DataSourceStatus`

- [ ] **Step 1: 写失败测试**

```ts
// source-status.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateParentStatus, subSourceKey, parentOf } from './source-status'

describe('aggregateParentStatus', () => {
  it.each([
    [['collected', 'collected'], 'collected'],
    [['collected', 'failed'], 'partial'],
    [['collected', 'not_attempted'], 'partial'],
    [['failed', 'failed'], 'failed'],
    [['not_attempted', 'failed'], 'failed'],
    [['not_attempted', 'not_attempted'], 'not_attempted'],
    [[], 'not_attempted'],
  ] as const)('%j → %s', (children, expected) => {
    expect(aggregateParentStatus([...children])).toBe(expected)
  })
  it('键名用冒号(避免 next-intl 点号嵌套)', () => {
    expect(subSourceKey('dataforseo', 'labs')).toBe('dataforseo:labs')
    expect(parentOf('dataforseo:labs')).toBe('dataforseo')
    expect(parentOf('psi')).toBe('psi')
  })
})
```

  `result.test.ts` 覆盖:`readRaw` 原样保留状态码、content-type 与 body;`reasonOf` 对三类错误的映射。

- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**

```ts
// lib/runs/source-status.ts
import type { DataSourceStatus } from '@/lib/types'

// 子阶段键:'父:子'(冒号,避免与 next-intl 点号嵌套路径冲突,SP-A §4.2)。
export const subSourceKey = (parent: string, child: string): string => `${parent}:${child}`
export const parentOf = (key: string): string => key.split(':')[0]

export function aggregateParentStatus(children: DataSourceStatus[]): DataSourceStatus {
  if (children.length === 0) return 'not_attempted'
  const collected = children.filter((s) => s === 'collected').length
  if (collected === children.length) return 'collected'
  if (collected > 0 || children.includes('partial')) return 'partial'
  if (children.every((s) => s === 'not_attempted')) return 'not_attempted'
  return 'failed'
}
```

  (`DataSourceStatus` 的实际导出位置先用 grep 确认。)

```ts
// lib/collection/result.ts
import { DataforseoTaskError } from '@/lib/dataforseo/client'

// 统一采集结果(SP-A §4.1):失败必须带原因,绝不收敛成 0/空/collected。
export interface RawResponse { status: number; contentType: string | null; body: string }
export type CollectResult<T> =
  | { ok: true; value: T; raw: RawResponse | null }
  | { ok: false; httpStatus: number | null; reason: string; raw: RawResponse | null }

export const okResult = <T>(value: T, raw: RawResponse | null = null): CollectResult<T> => ({ ok: true, value, raw })
export const failResult = <T>(reason: string, httpStatus: number | null = null, raw: RawResponse | null = null): CollectResult<T> =>
  ({ ok: false, httpStatus, reason, raw })

export async function readRaw(res: Response): Promise<RawResponse> {
  return { status: res.status, contentType: res.headers.get('content-type'), body: await res.text() }
}

export function reasonOf(err: unknown): string {
  if (err instanceof DataforseoTaskError) return `task_${err.statusCode}`
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(/request failed: (\d{3})/)
  return m ? `http_${m[1]}` : 'network_error'
}
```

- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 9: 原始响应表 `evidence_raw`

**Files:**
- Modify: `db/schema.ts`(新表)
- Create: `db/migrations/0016_*.sql`(用 `pnpm drizzle-kit generate` 生成;检查只含 CREATE TABLE)、`lib/collection/raw-store.ts`、`lib/collection/raw-store.test.ts`、`app/api/evidence/[id]/raw/route.ts`、`app/api/runs/[id]/raw/[rawId]/route.ts`、`lib/repositories/evidence-raw.repo.test.ts`
- Modify: `lib/repositories/index.ts`(新增 `createEvidenceRaw`、`linkEvidenceRaw`、`getEvidenceRawByEvidenceId`、`getEvidenceRawById`)

**Interfaces:**
- Produces:
  - `packRaw(raw: RawResponse, capBytes = 4 * 1024 * 1024): { content: Buffer; byteLength: number; sha256: string; truncated: boolean }`
  - `unpackRaw(content: Buffer | Uint8Array): string`
  - `createEvidenceRaw(row): Promise<void>`
  - `linkEvidenceRaw(rawIds: string[], evidenceId: string): Promise<void>`
  - `getEvidenceRawByEvidenceId(evidenceId)`
  - `getEvidenceRawById(runId, rawId)`

- [ ] **Step 1: 核实 Turso/libSQL 的行大小与 blob 写入方式**(spec §9 #3),确定 4MB 上限是否安全,结果写入实现笔记。
- [ ] **Step 2: 写失败测试**
  - `raw-store.test.ts`:
    - 1MB 的 JSON 文本 → 压缩后 `byteLength` 等于原文字节数,sha256 等于原文的 sha256;`unpackRaw` 还原后与原文完全相同。
    - 构造压缩后超过上限的内容(用随机字节的 base64 字符串,并把 `capBytes` 设为 64KB 便于测试)→ `truncated: true`,压缩后长度不超过上限;sha256 仍是**完整原文**的哈希。
    - 非 ASCII 原文(如 `'ü'.repeat(1000)`)能原样还原。
  - repo 测试:插入行、`linkEvidenceRaw`、按证据 id 查询;删除 run 时级联删除。
  - route 测试:找不到时返回 404 `{ error: 'not_found' }`;找到时返回原文并带 `x-raw-truncated` 响应头。
- [ ] **Step 3: 运行确认失败** → **Step 4: 实现**

```ts
// db/schema.ts 追加(import 增加 blob)
export const evidenceRaw = sqliteTable('evidence_raw', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  evidenceId: text('evidence_id').references(() => evidenceArtifacts.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  httpStatus: integer('http_status'),
  contentType: text('content_type'),
  encoding: text('encoding').notNull().default('gzip'),
  content: blob('content', { mode: 'buffer' }).notNull(),
  byteLength: integer('byte_length').notNull(),
  truncated: integer('truncated', { mode: 'boolean' }).notNull().default(false),
  sha256: text('sha256').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [check('evidence_raw_encoding', sql`${t.encoding} in ('gzip')`)])
```

```ts
// lib/collection/raw-store.ts
import { gzipSync, gunzipSync } from 'node:zlib'
import { sha256Hex } from './hash'
import type { RawResponse } from './result'

// 原始响应压缩存储(SP-A §4.3):sha256 恒为完整原文的哈希;压缩后超上限则截断原文前缀并标 truncated。
export function packRaw(raw: RawResponse, capBytes = 4 * 1024 * 1024) {
  const full = Buffer.from(raw.body, 'utf8')
  const sha256 = sha256Hex(raw.body)
  let content = gzipSync(full)
  let truncated = false
  let keep = full.length
  while (content.length > capBytes && keep > 0) {
    keep = Math.floor(keep * (capBytes / content.length) * 0.9)
    content = gzipSync(full.subarray(0, keep))
    truncated = true
  }
  return { content, byteLength: full.length, sha256, truncated }
}

export function unpackRaw(content: Buffer | Uint8Array): string {
  return gunzipSync(Buffer.from(content)).toString('utf8')
}
```

  route(`app/api/evidence/[id]/raw/route.ts`;`runs/[id]/raw/[rawId]` 同理,改为按 rawId 查询并校验 runId):

```ts
import { NextResponse } from 'next/server'
import { getEvidenceRawByEvidenceId } from '@/lib/repositories'
import { unpackRaw } from '@/lib/collection/raw-store'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getEvidenceRawByEvidenceId(id)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return new Response(unpackRaw(row.content), {
    headers: { 'content-type': row.contentType ?? 'text/plain; charset=utf-8', 'x-raw-truncated': String(row.truncated), 'x-raw-sha256': row.sha256 },
  })
}
```

  先 `ls app/api/evidence` 确认目录结构,避免与已有路由冲突。

- [ ] **Step 5: 运行测试确认通过** → **Step 6: 记录检查点**(不提交)

### Task 10: PSI 改为统一结果并如实落状态

**Files:**
- Modify: `lib/collection/psi.ts`、`lib/collection/psi.test.ts`、`lib/inngest/collect-evidence.ts`(PSI 段)、`lib/inngest/collect-evidence.test.ts`、`.env.example`(补充 `PAGESPEED_API_KEY` 说明)

**Interfaces:**
- Produces:`fetchPageSpeedInsights(url, strategy, fetchImpl?): Promise<CollectResult<PsiResult>>`;`CollectDeps.createEvidenceRaw`、`CollectDeps.linkEvidenceRaw`

- [ ] **Step 1: 写失败测试**(psi.test.ts)
  - 429 → `{ ok: false, reason: 'http_429', httpStatus: 429 }`,并带 raw。
  - 200 但内容不是 JSON → `reason: 'invalid_json'`。
  - 200 但 Lighthouse 分数与 CrUX 全为空 → `reason: 'empty_result'`。
  - fetch 抛出 → `reason: 'network_error'`。
  - 正常响应 → `ok: true`,解析结果与改造前一致(复用已有的正常样本断言)。

  collect-evidence 测试:PSI 失败时**不写** psi 证据;状态为 failed,并带对应 reason;写入一条 evidence_raw(无 evidence_id)。

- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**
  - `psi.ts`:把现有解析逻辑抽成 `parsePsi(json, strategy): PsiResult`。`fetchPageSpeedInsights` 内部用 try 包住 fetch → `readRaw` → 非 2xx 返回 `failResult('http_<status>')` → `JSON.parse` 失败返回 `failResult('invalid_json')` → 解析后若 `performanceScore === null && !crux.hasFieldData` 返回 `failResult('empty_result')` → 否则 `okResult(value, raw)`。
  - `collect-evidence.ts` 的 PSI 段(原 `fetch-psi`、`persist-psi` 两步)改为:

```ts
    const psi = await step.run('fetch-psi', async () => {
      const r = await deps.fetchPageSpeedInsights(entryUrl, 'mobile')
      const rawId = r.raw ? await persistRawRow('psi', r.raw) : null
      return r.ok ? { ok: true as const, value: r.value, rawId } : { ok: false as const, reason: r.reason, rawId }
    })
    if (psi.ok) {
      const rawText = JSON.stringify(psi.value)
      const evidenceId = await step.run('persist-psi', async () => {
        const id = `ev_${crypto.randomUUID()}`
        await deps.createEvidenceArtifact({ id, projectId, runId, type: 'psi', claimLevel: 'L4', source: entryUrl,
          request: { strategy: 'mobile', note: 'CrUX field data = ranking signal (L4); Lighthouse lab = diagnostic only, not ranking input' },
          payload: psi.value, rawText, rawHash: sha256Hex(rawText) })
        if (psi.rawId) await deps.linkEvidenceRaw([psi.rawId], id)
        return id
      })
      void evidenceId
      await emit({ type: 'evidence_created', evidenceType: 'psi' })
      await writeDss({ sourceKey: 'psi', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1 })
    } else {
      await writeDss({ sourceKey: 'psi', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: psi.reason })
    }
```

  - `persistRawRow(sourceKey, raw)` 是 handler 内的辅助函数:`packRaw` 后调用 `deps.createEvidenceRaw({ id: \`raw_${crypto.randomUUID()}\`, runId, evidenceId: null, sourceKey, httpStatus: raw.status, contentType: raw.contentType, encoding: 'gzip', ...packed })`,返回 id。
  - `CollectDeps` 与 `defaultDeps` 同步增加 `createEvidenceRaw`、`linkEvidenceRaw`。
  - PSI 证据的 rawText 仍保存解析后的 JSON(现有规则读取 payload),原文另存于 evidence_raw。这一取舍记入实现笔记。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 11: 第三方存在度(Wikipedia 精确词条 / Reddit 失败如实)与 G07

**Files:**
- Modify: `lib/collection/third-party-presence.ts` 及其测试、`lib/diagnosis/context.ts`(`buildThirdParty` 兼容 v1/v2)、`lib/diagnosis/types.ts`(`thirdParty` 类型)、`lib/diagnosis/rules/geo.ts`(G07)及其测试、`lib/inngest/collect-evidence.ts`(第三方段)

**Interfaces:**
- Produces:

```ts
export type WikipediaCheck = { status: 'ok'; exists: boolean; title: string | null; url: string | null } | { status: 'failed'; httpStatus: number | null; reason: string }
export type RedditCheck = { status: 'ok'; mentions: number; windowDays: number } | { status: 'failed'; httpStatus: number | null; reason: string; windowDays: number }
export interface ThirdPartyPayload { version: 2; candidates: string[]; wikipedia: WikipediaCheck; reddit: RedditCheck }
export function checkThirdPartyPresence(input: { brand: string; aliases?: string[]; windowDays?: number }, fetchImpl?): Promise<{ payload: ThirdPartyPayload; raws: { source: 'wikipedia' | 'reddit'; raw: RawResponse }[] }>
// RuleContext.thirdParty: { wikipedia: WikipediaCheck; reddit: RedditCheck; evidenceId: string } | null
```

- [ ] **Step 1: 核实 MediaWiki 的精确标题查询**(spec §9 #7)

  用真实请求(只读,1–2 次)核对 `action=query&titles=Notion|Metadocu&redirects=1&prop=pageprops&format=json&formatversion=2` 的响应形态:`missing: true`、`pageprops.disambiguation`、重定向后的 title。样本存入实现笔记,并据此写测试夹具。

- [ ] **Step 2: 写失败测试**
  - 词条存在且不是消歧义页 → exists=true;页面 missing → false;命中 disambiguation → false;重定向后的标题作为 title 返回。
  - Wikipedia 返回 500 → `status: 'failed'`;Reddit 返回 403 → `status: 'failed'`,`reason: 'http_403'`,**不是** mentions 0。
  - G07 按 spec §4.4 的判定表写 4 条用例。
  - `buildThirdParty` 遇到 v1 旧 payload 时,映射为 `status: 'ok'`(兼容历史回放)。
- [ ] **Step 3: 运行确认失败** → **Step 4: 实现**
  - **Wikipedia**:
    - 候选 = `[首字母大写的 brand, ...aliases]`,去重后最多 4 个,用 `|` 连接后传入 `titles`。
    - 发请求、`readRaw`;非 2xx 时返回 failed。
    - 解析 `query.pages`:保留 `!p.missing && !p.pageprops?.hasOwnProperty('disambiguation')` 的页;存在时 `exists: true`,`title` 取该页标题,`url` 为 `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`。
  - **Reddit**:沿用现有接口;非 2xx 时返回 failed(reason 为 `http_<status>`);解析失败时 reason 为 `invalid_json`。
  - **collect-evidence 第三方段**:
    - 每个 raw 调用 `persistRawRow('third_party:<source>', raw)`。
    - 子阶段状态写 `third_party:wikipedia` 与 `third_party:reddit`。
    - 两者都 failed 时,不写证据,父级状态为 failed;否则写证据(`payload` 为 v2),并 `linkEvidenceRaw`。父级状态用 `aggregateParentStatus`。
    - 调用时传入 `aliases: settings?.brandAliases ?? []`。
  - **G07**(按判定表):

```ts
    const { thirdParty } = ctx
    if (!thirdParty) return null
    const w = thirdParty.wikipedia
    if (w.status !== 'ok') return null           // 无法判定 → B 显示"未检查"
    if (w.exists) return null                    // 有词条 → 不缺失
    const r = thirdParty.reddit
    if (r.status !== 'ok') return null           // Reddit 失败 → 无法判定
    if (r.mentions >= THIRD_PARTY_REDDIT_MIN_MENTIONS) return null
    // 文案:"未找到与品牌名或别名同名的英文维基词条;Reddit 近 N 天讨论 M 条……"(删除"无 Wikipedia 条目"的绝对说法)
```

- [ ] **Step 5: 运行测试确认通过** → **Step 6: 记录检查点**(不提交)

### Task 12: 社媒与评测站检索按平台判定(CSE)

**Files:**
- Modify: `lib/collection/social-presence.ts` 及其测试、`lib/search/search-visibility-provider.ts`(`search` 返回 raw;先读该文件)、`lib/diagnosis/context.ts`(`buildSocialPresence` 携带 status,旧数据视为 ok)、`lib/diagnosis/types.ts`、`lib/diagnosis/rules/reputation.ts` 及其测试、`lib/inngest/collect-evidence.ts`(社媒段)

**Interfaces:**
- Produces:`SocialPresencePlatformResult` 新增 `status: 'ok' | 'failed'`、`reason?: string`;`SocialPresenceSearchResult` 新增可选 `raw?: RawResponse`

- [ ] **Step 1: 写失败测试**
  - `search` 抛出 → 该平台 `status: 'failed'`,不再返回 resultCount 0。
  - SP01:youtube 为 failed → null;为 ok 且 0 条 → 命中。
  - SP02:三站中任一 failed → null。
  - collect-evidence:写入 4 个子阶段状态与父级汇总状态。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**
  - `checkPlatform` 的 catch 分支返回 `{ platform, query, status: 'failed', reason: reasonOf(err), resultCount: 0, topResults: [] }`,成功时带 `status: 'ok'`。规则只认 `status === 'ok'`。
  - SP01 改为 `if (!youtube || youtube.status !== 'ok') return null`;SP02 改为 `if (entries.some((e) => !e || e.status !== 'ok')) return null`。
  - search provider 的 `search` 在不破坏现有接口的前提下附带 raw,并由采集段落入 evidence_raw。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 13: DataForSEO 子阶段、原文采集与凭据统一

**Files:**
- Create: `lib/credentials/dataforseo.ts`、`lib/credentials/dataforseo.test.ts`
- Modify: `lib/dataforseo/client.ts`(配置增加 `onResponse`)、`lib/dataforseo/types.ts`(`DataforseoConfig.onResponse`)、`lib/dataforseo/provider.ts`(透传 config)、`lib/dataforseo/collect-stage.ts`(重写为子阶段)、`lib/dataforseo/collect-stage.test.ts`、`lib/inngest/collect-evidence.ts`(DataForSEO 段与 AIO 凭据)、`lib/dataforseo/index.ts`(`isDataforseoConfigured` 改为异步解析或标注废弃)

**Interfaces:**
- Produces:
  - `resolveDataforseoCredentials(resolve?): Promise<{ login: string; password: string } | null>`
  - `DataforseoConfig.onResponse?: (info: { path: string; raw: RawResponse }) => void`
  - `type DfsSubStage = 'seed_serp' | 'labs' | 'backlinks' | 'bing_index' | 'brand_serp'`
  - `interface SubStageOutcome { stage: DfsSubStage; status: DataSourceStatus; reason: string | null; evidenceCount: number }`
  - `collectDataforseoStage(args, deps): Promise<SubStageOutcome[]>`
  - `DataforseoStageArgs` 新增 `drainRaws: () => RawResponse[]`,以及 `persistRaws: (stage: DfsSubStage, raws: RawResponse[]) => Promise<string[]>`

- [ ] **Step 1: 写失败测试**
  - 凭据解析:数据库优先;数据库无值时回落 env;两者都缺失时返回 null。
  - client:每个 HTTP 响应(包括 401 与信封错误)都会调用 `onResponse`,且 raw.body 为原文。
  - collect-stage(假 provider):
    - 种子为空 → seed_serp 与 labs 为 `not_attempted`、`no_seeds`;backlinks、bing、brand 仍然执行。
    - 23 个种子中 8 个任务返回 40101 → seed_serp 为 `partial`,reason 为 `task_40101`,evidenceCount 为 1。
    - 全部失败 → `failed`。
    - 某个任务返回 40102(零结果)→ 计为测量值,不算失败;沿用 provider 现有的处理方式,并用测试锁定。
    - labs 正常返回但为空数组 → `collected`、`evidenceCount: 0`、`reason: 'no_data'`。
    - backlinks 抛出 http 402 → `failed`、`http_402`,其余子阶段照常。
  - collect-evidence:写入 5 个子阶段状态,父级状态由 `aggregateParentStatus` 汇总,不再无条件写 collected。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**

```ts
// lib/credentials/dataforseo.ts
import { resolveCredential } from './store'

// DataForSEO 凭据统一解析(SP-A §4.6):DB 优先、env 回退;主采集/AIO/预检/设置页共用。
export async function resolveDataforseoCredentials(
  resolve: (key: string) => Promise<string | undefined> = resolveCredential,
): Promise<{ login: string; password: string } | null> {
  const [login, password] = await Promise.all([resolve('DATAFORSEO_LOGIN'), resolve('DATAFORSEO_PASSWORD')])
  return login && password ? { login, password } : null
}
```

  - **client**:在 `post` 中 fetch 之后执行 `const raw = await readRaw(res); config.onResponse?.({ path, raw })`;之后用 `JSON.parse(raw.body)` 取代 `res.json()`,解析失败按空对象处理,与原逻辑等价。其余逻辑不变。
  - **collect-evidence 的 `defaultDeps`**:新增 `resolveDataforseo: async () => { const creds = await resolveDataforseoCredentials(); if (!creds) return null; const buf: RawResponse[] = []; return { provider: createDataforseoProvider({ ...creds, onResponse: ({ raw }) => buf.push(raw) }), drainRaws: () => buf.splice(0) } }`。删除 `isDataforseoConfigured` 与 `dataforseoProvider` 这两个 deps,测试改为注入 `resolveDataforseo`。AIO 的 `resolveAioProvider` 改用 `resolveDataforseoCredentials`。
  - **collect-stage 每个子阶段的形态**(以 labs 为例;其余子阶段同构,种子 SERP 保留现有的分块逻辑,每块在同一个 step 内 drain 并持久化 raw):

```ts
  // —— 2. Labs ——
  if (seedTexts.length === 0) {
    outcomes.push({ stage: 'labs', status: 'not_attempted', reason: 'no_seeds', evidenceCount: 0 })
  } else {
    try {
      const { keywords, rawIds } = await step.run('dfs-labs', async () => {
        const keywords = await provider.keywordData(seedTexts, locOpts)
        return { keywords, rawIds: await args.persistRaws('labs', args.drainRaws()) }
      })
      if (keywords.length) {
        await step.run('dfs-persist-labs', async () => {
          const id = await persistEvidence(deps, base, 'dataforseo_labs', domain, { kind: 'keyword_data', ...locOpts, keywordCount: keywords.length }, { kind: 'keyword_data', keywords })
          await deps.linkEvidenceRaw(rawIds, id)
        })
        outcomes.push({ stage: 'labs', status: 'collected', reason: null, evidenceCount: 1 })
      } else {
        outcomes.push({ stage: 'labs', status: 'collected', reason: 'no_data', evidenceCount: 0 })
      }
    } catch (err) {
      await args.persistRaws('labs', args.drainRaws())
      outcomes.push({ stage: 'labs', status: 'failed', reason: reasonOf(err), evidenceCount: 0 })
    }
  }
```

  - `getMarket(market)` 抛出时(理论上不可达)捕获,所有子阶段记为 `failed`、`market_unmapped`。
  - **collect-evidence**:遍历 outcomes,写入 `dataforseo:<stage>` 子阶段状态;父级用 `aggregateParentStatus`,`capturedEvidenceCount` 为各子阶段之和。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 14: 运行前预检(纯逻辑 + 接口 + 向导第 2 步)

**Files:**
- Create: `lib/runs/preflight.ts`、`lib/runs/preflight.test.ts`、`app/api/projects/[id]/preflight/route.ts`、`components/PreflightPanel.tsx`、`components/PreflightPanel.test.tsx`
- Modify: `components/NewAnalysisForm.tsx`(第 2 步插入 PreflightPanel)、`messages/*.json`(`preflight.*`,文本级插入)、`.env.example`
- Spec 偏离(写入实现笔记,并在 spec §4.5 补一行说明):建 run 时只做品类与市场闸门,不重复执行网络预检,也不预写 `not_attempted` 状态。理由:采集流水线本来就会如实写出 failed 和原因,在建 run 时重复探测只会拖慢创建,不增加信息。

**Interfaces:**
- Produces:spec §4.5 中的 `Dimension`、`PreflightItem`;`interface PreflightProbe`(见下);`buildPreflight(probe): PreflightItem[]`;`POST /api/projects/[id]/preflight` → `{ items: PreflightItem[] }`

- [ ] **Step 1: 核实 DataForSEO 免费账户信息接口**(spec §9 #2):用真实凭据请求一次 `GET /v3/appendix/user_data`(只读,以文档为准),记录响应中的余额字段。
- [ ] **Step 2: 写失败测试**(preflight.test.ts,纯函数)

```ts
const allGood: PreflightProbe = {
  categoryValid: true, marketValid: true,
  gsc: { platformConfigured: true, connected: true, siteSelected: true, tokenOk: true },
  dataforseo: { hasCredentials: true, authOk: true, balance: 12.3 },
  psi: { hasKey: true }, render: { configured: true },
  ai: { engines: [{ provider: 'openai', webSearch: true }] },
}
it('全部就绪', () => { expect(buildPreflight(allGood).every((i) => i.state === 'ready')).toBe(true) })
it('GSC token 失效 → unavailable + reauth', () => {
  const items = buildPreflight({ ...allGood, gsc: { ...allGood.gsc, tokenOk: false, tokenError: 'invalid_grant' } })
  expect(items.find((i) => i.source === 'gsc')).toMatchObject({ state: 'unavailable', reason: 'gsc_token_invalid', affects: ['rankings', 'keywords'], fix: { action: 'reauth_gsc' } })
})
it('只有记忆型引擎 → degraded ai_memory_only', () => { ... })
it('无 PSI key → degraded psi_no_key', () => { ... })
it('品类无效 → project unavailable 且阻断', () => {
  const items = buildPreflight({ ...allGood, categoryValid: false })
  expect(preflightBlocks(items)).toBe(true)
})
```

  - 接口测试:注入假的探测依赖,验证 404 与正常返回。
  - 组件测试:渲染各状态的文案;显示修复按钮;存在不可用项时显示"本次无法评估:<维度>"。
- [ ] **Step 3: 运行确认失败** → **Step 4: 实现**

```ts
// lib/runs/preflight.ts(纯逻辑)
export type Dimension = 'eeat' | 'content' | 'structured_data' | 'site_type' | 'rich_results' | 'rankings' | 'keywords' | 'technical' | 'geo' | 'competitors' | 'backlinks'
export interface PreflightItem {
  source: string
  state: 'ready' | 'degraded' | 'unavailable'
  reason: string | null
  affects: Dimension[]
  fix: { action: 'reauth_gsc' | 'select_gsc_site' | 'configure_key' | 'edit_project'; href: string } | null
  detail?: Record<string, unknown>
}
export interface PreflightProbe {
  categoryValid: boolean
  marketValid: boolean
  gsc: { platformConfigured: boolean; connected: boolean; siteSelected: boolean; tokenOk: boolean | null; tokenError?: string }
  dataforseo: { hasCredentials: boolean; authOk: boolean | null; balance?: number | null; error?: string }
  psi: { hasKey: boolean }
  render: { configured: boolean }
  ai: { engines: { provider: string; webSearch: boolean }[] }
}

const AFFECTS: Record<string, Dimension[]> = {
  project: ['eeat', 'content', 'structured_data', 'site_type', 'rich_results', 'rankings', 'keywords', 'technical', 'geo', 'competitors', 'backlinks'],
  gsc: ['rankings', 'keywords'],
  dataforseo: ['keywords', 'competitors', 'backlinks', 'geo'],
  psi: ['technical'],
  render: ['technical', 'structured_data'],
  ai_probe: ['geo'],
}

export function buildPreflight(p: PreflightProbe): PreflightItem[] {
  const item = (source: string, state: PreflightItem['state'], reason: string | null, fix: PreflightItem['fix'] = null, detail?: Record<string, unknown>): PreflightItem =>
    ({ source, state, reason, affects: state === 'ready' ? [] : AFFECTS[source], fix, ...(detail ? { detail } : {}) })
  const items: PreflightItem[] = []
  items.push(!p.categoryValid ? item('project', 'unavailable', 'category_invalid', { action: 'edit_project', href: '#wiz-category' })
    : !p.marketValid ? item('project', 'unavailable', 'market_invalid', { action: 'edit_project', href: '#wiz-market' })
    : item('project', 'ready', null))
  const g = p.gsc
  items.push(!g.platformConfigured ? item('gsc', 'unavailable', 'gsc_not_configured', { action: 'configure_key', href: '/settings' })
    : !g.connected ? item('gsc', 'unavailable', 'gsc_not_connected', { action: 'reauth_gsc', href: '/api/gsc/auth' })
    : !g.siteSelected ? item('gsc', 'unavailable', 'gsc_site_missing', { action: 'select_gsc_site', href: '/settings' })
    : g.tokenOk === false ? item('gsc', 'unavailable', 'gsc_token_invalid', { action: 'reauth_gsc', href: '/api/gsc/auth' }, { error: g.tokenError })
    : item('gsc', 'ready', null))
  const d = p.dataforseo
  items.push(!d.hasCredentials ? item('dataforseo', 'unavailable', 'dfs_no_credentials', { action: 'configure_key', href: '/settings' })
    : d.authOk === false ? item('dataforseo', 'unavailable', 'dfs_auth_failed', { action: 'configure_key', href: '/settings' }, { error: d.error })
    : d.authOk === null ? item('dataforseo', 'degraded', 'dfs_unreachable', null, { error: d.error })
    : item('dataforseo', 'ready', null, null, { balance: d.balance ?? null }))
  items.push(p.psi.hasKey ? item('psi', 'ready', null) : item('psi', 'degraded', 'psi_no_key', { action: 'configure_key', href: '/settings' }))
  items.push(p.render.configured ? item('render', 'ready', null) : item('render', 'unavailable', 'render_not_configured', { action: 'configure_key', href: '/settings' }))
  const engines = p.ai.engines
  items.push(engines.length === 0 ? item('ai_probe', 'unavailable', 'ai_not_configured', { action: 'configure_key', href: '/settings' })
    : engines.every((e) => !e.webSearch) ? item('ai_probe', 'degraded', 'ai_memory_only', { action: 'configure_key', href: '/settings' }, { engines })
    : item('ai_probe', 'ready', null, null, { engines }))
  return items
}

export const preflightBlocks = (items: PreflightItem[]): boolean =>
  items.some((i) => i.source === 'project' && i.state === 'unavailable')
```

  - **route 的探测实现**:
    - GSC:读 `project_settings`,调用 `readGscToken` + `refreshAccessToken`,用 try/catch 得到 `tokenOk` 与 `tokenError`。
    - DataForSEO:`resolveDataforseoCredentials`,再请求一次 Step 1 核实过的 user_data 端点。
    - PSI:`resolveCredential('PAGESPEED_API_KEY')`;若该 key 不在 `CREDENTIAL_KEYS` 中,只读 env。
    - 渲染:用 `selectRenderProvider(await resolveCredentials([...]))` 的 `isConfigured`。
    - AI 引擎:用 `buildProbeProviders(creds)` 列出已配置的 provider,能力取自 `lib/probes/engine-capability.ts` 的 `isWebSearchEnabledEngine`。
    - 所有探测都放在 DI 依赖中,便于测试。
  - **向导第 2 步**:进入该步时请求一次预检。`<PreflightPanel items={...} labels={...} />` 是纯展示组件,不调用 hook,文案由调用方 `t()` 解析后传入。存在 `unavailable` 或 `degraded` 项时,顶部显示"本次无法评估:<维度中文名列表>"。
- [ ] **Step 5: 运行测试确认通过** → **Step 6: 记录检查点**(不提交)

### Task 15: 报告合同按父子分组与界面标签

**Files:**
- Modify: `lib/diagnosis/report.ts`(`DataSourceCoverage` 新增 `children?`;`buildReportContract` 分组;gaps 包含子阶段)、`lib/diagnosis/report.test.ts`、`components/ReportView.tsx`(数据源列表渲染子阶段)、`components/ReportView.test.tsx`、`messages/*.json`(`report.contract.subSourceLabel.*` 共 12 个 key:dataforseo 5 个、third_party 2 个、social_presence 4 个,外加 `subSourceTitle`)

- [ ] **Step 1: 写失败测试**
  - 输入包含 `dataforseo`(partial)、`dataforseo:labs`(failed,`task_40101`)、`dataforseo:backlinks`(collected)时,合同里只有一个 `dataforseo` 父项,它的 `children` 有 2 项;`gaps` 中有 `dataforseo` 与 `dataforseo:labs`。
  - 组件渲染出子阶段的中文标签与失败原因;没有任何 key 回退显示成原始键名。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**
  - `buildReportContract`:
    - `const parents = sources.filter((s) => !s.sourceKey.includes(':')).map((p) => ({ ...p, children: sources.filter((c) => c.sourceKey.startsWith(p.sourceKey + ':')) }))`
    - `gaps = sources.filter((s) => s.status !== 'collected').map((s) => s.sourceKey)`
    - `deriveReportLevel` 只看父项。
  - `ReportView`:子阶段标签用 `t(\`contract.subSourceLabel.${key.replace(':', '_')}\`)`;gaps 列表中子阶段键名同样走 subSourceLabel。
- [ ] **Step 4: 运行测试确认通过**
- [ ] **Step 5: 第二波收口**
  - 跑 `pnpm test`、`pnpm lint`、`pnpm build`。
  - 派**只读**审查代理审查第二波改动,重点检查:失败是否一律不写证据;是否存在把失败计为 0 的残留(`grep -rn "return 0" lib/collection`,逐条核对);raw 是否在同一个 step 内落库。
  - 修复后记录检查点。

---

# 第三波:规则层与铁律测试

### Task 16: 结构化数据口径(词表 oneOf + 新类型 + C05c 拆分 + C05b @graph)

**Files:**
- Modify: `lib/diagnosis/schema-vocab.ts`、`lib/diagnosis/schema-vocab.test.ts`、`lib/diagnosis/rules/content.ts`(C05b、C05c、文件内的 `schemaRuleFor` 调用)、`lib/diagnosis/rules/content.test.ts`、`lib/diagnosis/templates.ts`(C05c 模板文案;新增 C05c 推荐字段的说明)
- Create: `lib/test-fixtures/real-shapes.ts`(本任务先放入 Yoast @graph 样本;Task 21 继续扩充)

**Interfaces:**
- Produces:
  - `interface SchemaTypeRule { required: string[]; oneOf?: string[][]; recommended: string[]; source: string }`
  - `schemaRuleFor(type): SchemaTypeRule | null`(包含 LocalBusiness 子类型映射)
  - `hasField(root, path): boolean`(规则:点路径;遇数组取第一个元素;`offers.price` 也接受 `offers.priceSpecification.price` 和 `offers.lowPrice`)

- [ ] **Step 1: 核实 Google 文档**(spec §9 #5)

  逐个用 WebFetch 打开以下文档,把必填、推荐、三选一与"更新日期"写入实现笔记:Article、Product snippet、Merchant listing、Software app、Local business、Video、Job posting、Recipe、Event、Review snippet(含 AggregateRating)、Course list、Organization、Breadcrumb。之后把 `reference_artifacts` 中 `google_rich_result_status` 的 last_verified 更新为本次核实日期(通过现有 seed 或保鲜机制完成,不直接手改数据库)。

- [ ] **Step 2: 写失败测试**(content.test.ts,输入使用 `real-shapes.ts` 中的真实形态)
  - Yoast 式单块 `{"@context":"https://schema.org","@graph":[{"@type":"Organization",...},{"@type":"WebSite",...},{"@type":"WebPage",...}]}` → C05b 不命中。
  - 顶层数组中某个元素没有 `@context` → C05b 命中。
  - Article 只有 `headline`、`author` → 不产生"不符合要求"的命中;产生一条 notice,`scope` 为 `schema:recommended`,描述中包含页面 URL 和 `datePublished`、`image`;全文不出现"无法生成"。
  - Product 只有 `name` 和 `image` → 产生 warning,`scope` 为 `schema:required`,描述中包含"review、aggregateRating 或 offers 至少一项"。
  - `templates.ts` 中的 `JSONLD_SNIPPET`(Product,有 `name` 和 `offers.price`)→ 不产生 required 命中。
  - SoftwareApplication 有 `name`、`offers.price`,但没有 rating 或 review → warning required。
  - `Restaurant`(LocalBusiness 子类型)缺 `address` → warning required。
- [ ] **Step 3: 运行确认失败** → **Step 4: 实现**
  - **词表**:按核实结果重写 `SCHEMA_VOCAB`(spec §5.1 表是初稿,以文档为准)。每个类型加上 `source` 文档 URL;`SCHEMA_VOCAB_VERSION` 改为 `google_rich_results_2026-10`,C05c 中不再写死版本字符串,改为引用该常量。
  - **LocalBusiness 子类型**:用常量 `LOCAL_BUSINESS_SUBTYPES`(Restaurant、Store、AutoDealer、Dentist、MedicalBusiness、LegalService、ProfessionalService、FinancialService、FoodEstablishment、HealthAndBeautyBusiness、HomeAndConstructionBusiness、LodgingBusiness、RealEstateAgent、TravelAgency、AutomotiveBusiness、EntertainmentBusiness、SportsActivityLocation)映射到 LocalBusiness 规则,并注明"非完整 schema.org 继承树,覆盖常见子类型"。
  - **C05b**:新增 `contextCarriers(raw)`,只取块的顶层对象(数组展开一层,不展开 @graph);C05b 只对这些顶层对象检查 `contextIsSchemaOrg`。
  - **C05c**:对每条 schema、每个实体根、每个类型,分别计算 `missingRequired`、`oneOfOk`、`missingRecommended`。
    - 产出最多 2 个 draft:required 一个(warning)、recommended 一个(severity 覆盖为 notice)。
    - `detail.examples = [{ url, type, missing }]`,url 取该 schema 证据的来源页;若 `ctx.schemas` 条目上没有 url,在 context 中补上 `url: evidence.source`。
    - 描述格式:`${url}(${type}):缺 ${字段列表}`,最多列 5 条,超出时加"等 N 处"。
    - 删除"富摘要无法生成"这句。
- [ ] **Step 5: 运行测试确认通过**:`pnpm vitest run lib/diagnosis` → **Step 6: 记录检查点**(不提交)

### Task 17: T14 / T01 / T08 / G01 误报修复

**Files:**
- Create: `lib/diagnosis/rules/hreflang-codes.ts`(ISO 639-1、ISO 3166-1 alpha-2 代码表与 `checkHreflang`)及其测试
- Modify: `lib/diagnosis/rules/technical.ts`(T14、T01)及其测试、`lib/crawl/light-check.ts`(混合内容计数)及其测试、`lib/diagnosis/rules/geo.ts`(Google-Extended)及其测试

**Interfaces:**
- Produces:`checkHreflang(code): { ok: true } | { ok: false; reason: 'bad_language' | 'bad_region' | 'bad_format'; suggestion?: string }`

- [ ] **Step 1: 写失败测试**
  - `checkHreflang`:以下返回 ok:`en`、`uk`、`eu`、`x-default`、`zh-Hant`、`zh-Hant-TW`、`en-GB`。以下不通过:`en-uk`(bad_region,建议改为 `en-gb`)、`en_us`(bad_language)、`english`(bad_language)、`en-UK-x-y`(bad_format)。
  - T14:页面只有 `hreflang="en"` 与 `x-default` → 不命中;有 `en-uk` → 命中,`detail.invalidCodes` 为 `['en-uk']`。
  - T01:
    - 只有 `/cart` 被禁抓(非入口、非重点页)→ 命中,`severity` 为 notice,标题为"robots.txt 禁抓了 1 个 URL"。
    - 入口页被禁抓 → error,标题保持原样。
    - 重点页被禁抓 → error。
  - light-check:
    - 计入混合内容:`<link rel="canonical" href="http://...">` 不计;`<link rel="stylesheet" href="http://...">` 计;`<iframe src="http://...">` 计;`<img srcset="http://a.jpg 1x, https://b.jpg 2x">` 计 1。
    - 非 https 页面仍归零,沿用原逻辑。
  - G01:只屏蔽 Google-Extended → 不产生 error,至多产生训练型说明(notice)。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**
  - `hreflang-codes.ts`:内置 ISO 639-1 的 184 个两字母代码,以及 ISO 3166-1 alpha-2 的 249 个代码。注释写明来源(ISO 官方列表),并在实现笔记中记录取数来源。

```ts
export function checkHreflang(raw: string): { ok: true } | { ok: false; reason: 'bad_language' | 'bad_region' | 'bad_format'; suggestion?: string } {
  const code = raw.trim()
  if (code.toLowerCase() === 'x-default') return { ok: true }
  const parts = code.split('-')
  if (parts.length > 3) return { ok: false, reason: 'bad_format' }
  const lang = parts[0].toLowerCase()
  if (!ISO_639_1.has(lang)) return { ok: false, reason: 'bad_language' }
  const rest = parts.slice(1)
  let region: string | undefined
  if (rest.length === 2) {
    if (!/^[A-Za-z]{4}$/.test(rest[0])) return { ok: false, reason: 'bad_format' }
    region = rest[1]
  } else if (rest.length === 1) {
    if (/^[A-Za-z]{4}$/.test(rest[0])) return { ok: true }
    region = rest[0]
  }
  if (region !== undefined && !ISO_3166_1_A2.has(region.toUpperCase()))
    return { ok: false, reason: 'bad_region', ...(region.toLowerCase() === 'uk' ? { suggestion: `${lang}-gb` } : {}) }
  return { ok: true }
}
```

  - **T14**:删除 `INVALID_REGION_CODES`,改用 `checkHreflang`;`detail` 中加入 `suggestions`。
  - **T01**:如果 `entryBlocked || blockedKeyUrls.length`,保持原有 error 输出;否则输出 `{ title: \`robots.txt 禁抓了 ${blockedUrls.length} 个 URL\`, description: '这些 URL 对 Googlebot 处于 Disallow 状态(如购物车、搜索结果页通常属于有意为之)。请确认其中没有需要被收录的页面。', severity: 'notice', detail: { blockedCount, blockedUrls: blockedUrls.slice(0, 10) } }`。注意现有 `blockedUrls` 在构造时就已截取前 10 条,所以计数要改用完整数组的长度。
  - **light-check**:按 spec §5.2 的第 3 行改写混合内容计数。`rel` 白名单为 `stylesheet`、`preload`、`modulepreload`、`icon`、`manifest`、`apple-touch-icon`;`srcset` 按逗号拆分后,对每一项判断是否以 `http://` 开头。
  - **G01**:把 `'Google-Extended'` 从 `SEARCH_CRAWLER_UAS` 移到 `TRAINING_CRAWLER_UAS`,注释写明"Google-Extended 是控制 Gemini 等产品使用内容的 robots 令牌,不影响 Google 搜索收录"(依据记入实现笔记,spec §9 #6)。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 18: C10 正文哈希、C03 降级、K03 域名归一

**Files:**
- Modify: `lib/crawl/light-check.ts`(`LightCheckExtra.textHash?: string | null`;解析阶段计算 textHash)及其测试、`lib/diagnosis/rules/content.ts`(C10、C03)及其测试、`lib/diagnosis/keyword-gap.ts`(`normDomain`)及其测试

- [ ] **Step 1: 写失败测试**
  - light-check:两页正文相同,但 `<script>` 里的 nonce 不同、title 不同 → `textHash` 相同;正文不同 → `textHash` 不同;页面没有可见文本 → `textHash` 为 `null`。
  - C10:
    - 两页 `textHash` 相同 → 命中,描述中包含"正文文本完全相同"。
    - 其中一页 `redirected: true` → 不计入。
    - 两行 `finalUrl` 相同 → 只算一页。
    - 没有任何 textHash(旧数据)→ null。
  - C03:H1 与 title 相同 → `severity: 'notice'`、`claimType: 'hypothesis'`;缺失 H1、存在多个 H1 → 保持 warning。
  - K03:`computeKeywordGaps({ ownDomain: normalizeDomain('metadocu.com')!, ... })`,本站在 SERP 第 1 名 → 判为 `winning`,而不是 `missing`。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**

```ts
// light-check.ts:非破坏性遍历可见文本(不修改 document,其它抽取器不受影响)
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG'])
function visibleText(node: Node, out: string[] = []): string[] {
  if (node.nodeType === 1 && SKIP_TEXT.has((node as Element).tagName.toUpperCase())) return out
  if (node.nodeType === 3) out.push(node.textContent ?? '')
  for (const child of node.childNodes) visibleText(child, out)
  return out
}
// 在 parseLightCheckHtml 的 extra 中:
//   const text = visibleText(document.body ?? document).join(' ').replace(/\s+/g, ' ').trim()
//   textHash: text ? sha256Hex(text) : null
```

  - **C10**:
    - 读取 `(p.lightCheckExtra as LightCheckExtra | undefined)?.textHash`。
    - 跳过 `extra?.redirected === true` 的页。
    - 用 `p.finalUrl ?? p.url` 去重后再按 hash 分组。
    - 描述改为"检测到 N 组正文文本完全相同的页面……"。
  - **C03**:第三分支的 draft 加上 `severity: 'notice', claimType: 'hypothesis'`,文案改为"入口页 H1 与 title 完全相同(可考虑差异化表达以覆盖更多相关说法,这不是错误)"。
  - **K03**:

```ts
// keyword-gap.ts
function normDomain(domain: string): string {
  const d = domain.trim().toLowerCase()
  let host = d
  try { host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(d) ? d : `https://${d}`).hostname } catch { /* 保留原值 */ }
  return host.replace(/^www\./, '')
}
```

- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 19: 实际样本数、GEO 模板、只记录型规则、统计卡文案

**Files:**
- Modify: `lib/probes/summary.ts`(`ProbeSummary.samplesPerPromptPerEngine`)及其测试、`lib/diagnosis/rules/geo.ts`(G05、G06、G09、G11 文案)及其测试、`lib/diagnosis/templates.ts`(`recordOnly?`;新增 G02、G05、G06、G07、G08、G09、Q02 模板)、`lib/diagnosis/recommend.ts`(`generateRecommendation` 对 recordOnly 返回 null)、`lib/diagnosis/finding-rows.ts`(`buildRecommendationRows` 过滤 null)及其测试、`lib/inngest/generate-findings.ts` 与 `lib/inngest/reevaluate-competitors.ts`(注入函数的类型)、`messages/*.json`(`screen2.stats.schemaCoverage` 文案)

- [ ] **Step 1: 写失败测试**
  - summary:2 个引擎 × 30 条 prompt × n=1 → `samplesPerPromptPerEngine === 1`;引擎 A 每条 2 个样本、引擎 B 每条 1 个 → 1;没有 prompt → 0。
  - G05:描述中包含"n=1",不包含"n=5"。
  - recommend:G08 命中 → `generateRecommendation` 返回 null;`buildRecommendationRows` 只为非 null 生成行,且 `findingId` 与 hit 正确对齐(用 3 个 hit、中间一个为 G08 来测)。
  - templates:G02、G05、G06、G07、G09、Q02 都能找到专属模板,不会回落到通用模板。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**
  - **summary**:按 provider 分组(缺省为 `'unknown'`),每组取 `Math.floor(组内结果数 / promptsTotal)`,再取各组最小值;`promptsTotal === 0` 时为 0。
  - **geo.ts**:把 4 处"当前 n=5 为方向性样本……"统一替换为 `当前每条问题每个引擎采样 n=${ctx.probe?.samplesPerPromptPerEngine ?? 0},结果仅供参考方向`;注释中的 `n=5` 同步改为"n 见探针协议"。
  - **templates.ts**:`RecommendationTemplate` 新增 `recordOnly?: true`。各新增模板的要点如下:

```ts
  G02: { what: '在 CDN/WAF 中为搜索与检索型 AI 爬虫(Googlebot、Bingbot、OAI-SearchBot、PerplexityBot 等)放行,并用对应 UA 复测返回 200。', whyHint: '爬虫被拦截时,页面无法被收录或引用。', effort: 'low', validationMethod: '以被拦截的 UA 重新请求关键 URL,确认返回 200 且内容完整。', promptType: 'technical' },
  G05: { what: '围绕品类核心问题补充可被引用的内容:清晰的定义、对比、数据与案例,并争取在第三方权威页面被提及。', whyHint: '无品牌提问中 AI 很少主动召回品牌,说明品牌与品类问题的关联还不够强。', effort: 'high', validationMethod: '同协议回测无品牌问题的召回率(同一 prompt 集、同一引擎、同一 n)。', promptType: 'content' },
  G06: { what: '让检索型 AI 引擎能引用本站:为核心问题提供可直接引用的答案段落,并补齐结构化数据与来源出处。', whyHint: '检索型引擎回答品类问题时没有引用本站。', effort: 'high', validationMethod: '同协议回测检索型引擎答案中对本站的引用。', promptType: 'content' },
  G07: { what: '建设第三方语料:在维基百科(满足关注度标准时)、行业社区与评测站获得真实提及与讨论,不刷帖。', whyHint: 'AI 引擎主要引用第三方权威语料。', effort: 'high', validationMethod: '复查维基词条与社区提及数(采集成功时)。', promptType: 'content' },
  G08: { recordOnly: true, what: '', whyHint: '', effort: 'low', validationMethod: '', promptType: 'technical' },
  G09: { what: '逐条核对 AI 答案中负面或比较劣势的说法:属实的就修正产品与文档,不属实的就用权威页面与第三方评价澄清。', whyHint: 'AI 答案中品牌的负面提及占比偏高。', effort: 'mid', validationMethod: '同协议回测情感分布。', promptType: 'content' },
  Q02: { what: '针对竞品被 AI 推荐而本站没有的问题,补齐对比页和差异化内容,并以真实数据支撑。', whyHint: '确认竞品在 AI 答案中的份额高于本站。', effort: 'high', validationMethod: '同协议回测竞品与本站的 AI 份额。', promptType: 'content' },
```

  - **recommend.ts**:`generateRecommendation(hit, ctx?): RecommendationDraft | null`,开头加 `if (tpl.recordOnly) return null`。
  - **finding-rows.ts**:先 `const pairs = await Promise.all(hits.map(async (hit, i) => ({ hit, row: findingRows[i], draft: await generateRecommendation(hit, { domain }) })))`,过滤掉 `draft === null` 的项后再映射成行。两个注入点的类型同步修改。
  - **i18n**:`screen2.stats.schemaCoverage` 改为"首页结构化数据类型"(zh)、"Homepage schema types"(en),只做文本级替换,unit 保持不变。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 20: 健康分诚实化

**Files:**
- Modify: `lib/diagnosis/pillars-with-data.ts` 及其测试、`app/api/runs/[id]/report/route.ts`、`components/ReportView.tsx`,以及任何依赖旧签名的测试(用 `grep -rn "pillarsWithData(" lib app components` 列全)

**Interfaces:**
- Produces:`pillarsWithData(evidence: { type: string; payload?: unknown }[], confirmedCompetitorCount: number): Pillar[]`;`evidenceUsable(type, payload): boolean`

- [ ] **Step 1: 写失败测试**
  - 只有 psi 证据且 payload 全为空(旧数据形态)→ 不含 P1;psi 有 CrUX 数据 → 含 P1。
  - 没有 gsc/labs 证据,即使存在 P3 的 finding → 不含 P3(取消"有 finding 即入分")。
  - P4 的影子闸门保持原样。
  - 用 metadocu 本次运行的证据类型集合复算 → 结果为 `['P1', 'P2', 'P5']`。P1 由 site_audit 与 page_fetch 支撑,不依赖 PSI。
- [ ] **Step 2: 运行确认失败** → **Step 3: 实现**

```ts
// 证据"可用"= 采集成功且非空(SP-A §5.4);失败不再写证据,本函数主要防御历史数据。
export function evidenceUsable(type: string, payload: unknown): boolean {
  if (payload == null || (typeof payload === 'object' && Object.keys(payload as object).length === 0)) return false
  if (type === 'psi') {
    const p = payload as { crux?: { hasFieldData?: boolean }; lighthouse?: { performanceScore?: number | null } }
    return Boolean(p.crux?.hasFieldData) || typeof p.lighthouse?.performanceScore === 'number'
  }
  return true
}

export function pillarsWithData(evidence: { type: string; payload?: unknown }[], confirmedCompetitorCount: number): Pillar[] {
  const set = new Set<Pillar>()
  for (const e of evidence) {
    if (!evidenceUsable(e.type, e.payload)) continue
    const p = EVIDENCE_PILLAR[e.type as EvidenceType]
    if (!p) continue
    if (p === 'P4' && confirmedCompetitorCount <= 0) continue
    set.add(p)
  }
  return PILLARS.filter((p) => set.has(p))
}
```

  两个调用方改为传入 `evidence.map((e) => ({ type: e.type, payload: e.payload }))`,并删除 findings 参数。
- [ ] **Step 4: 运行测试确认通过** → **Step 5: 记录检查点**(不提交)

### Task 21: rules_v10、真实形态夹具、两条铁律测试与回放测试

**Files:**
- Modify: `lib/diagnosis/types.ts`(`RULES_VERSION = 'rules_v10'`),以及规则变更日志所在位置(先 `grep -rn "rules_v9" docs lib` 找到既有 changelog;找不到时写入实现笔记的"规则变更"节)
- Modify: `lib/test-fixtures/real-shapes.ts`(补充:`normalizeDomain` 输出、市场 code、DataForSEO 官方文档形态的 seed_serp/labs/backlinks 成功与 40101 失败样本、PSI 成功与 429 样本、Reddit 403、MediaWiki 存在/缺失/消歧义样本)
- Create: `lib/inngest/collect-evidence.failure-matrix.test.ts`、`lib/diagnosis/replay-metadocu.test.ts`、`lib/test-fixtures/metadocu-run-d12cceaf.json`(脱敏导出)

- [ ] **Step 1: 导出回放夹具**

  在 scratchpad 写一个只读导出脚本:从 `veris.db` 读取 `run_d12cceaf` 的 evidence(除 ai_answer 外全部保留;ai_answer 只保留 parse 所需字段)、findings、项目、`site_pages`,写入 `lib/test-fixtures/metadocu-run-d12cceaf.json`。确认其中不含任何凭据或 token。文件大小记入实现笔记,超过 2MB 时裁剪 rawHtml 中与规则无关的部分,并记录裁剪方式。

- [ ] **Step 2: 写失败测试**
  - **failure-matrix**:沿用 `collect-evidence.test.ts` 的 deps 工厂,对以下每个采集器注入失败:PSI(429、空)、Wikipedia(500)、Reddit(403)、CSE(抛错)、DataForSEO 各子阶段(http_402、task_40101、网络错误)、GSC(invalid_grant)。完整跑完 handler 后,用 `buildRuleContext` 加 `evaluateRules(ctx, allRules)` 求值,断言:
    1. 对应子阶段的状态为 failed,且 reason 非空;
    2. 不存在 evidenceRefs 指向失败来源的 hit,也就是不存在由失败来源产生的证据;
    3. G07、SP01、SP02、T09a/b/c、K01/K02/K06 均未命中。
  - **replay**:载入回放夹具,用新的 context 和规则求值,断言:
    - 没有任何描述包含"无法生成";
    - 存在 C05c 的 required 命中,其 `detail.examples` 中包含 SoftwareApplication;
    - 存在 Article 的 recommended 命中;
    - 没有 T14 命中;
    - `pillarsWithData` 不含 P3;
    - G05 的描述包含 `n=1`。
- [ ] **Step 3: 运行确认失败**(如有必要,先回退到对应修复之前验证);若已经通过,记录"为什么它们在改动前会失败"的推理依据(项目陷阱:新写的失败测试在改动前就通过了)。
- [ ] **Step 4: 补齐实现中遗漏的部分,直到通过** → **Step 5: 记录检查点**(不提交)

### Task 22: 环境、文档、全量门禁与真实运行验收

**Files:**
- Create: `docs/runbooks/local-env.md`、`docs/plans/2026-10-04-claude-md-update-proposal.md`(只是提案,不改 CLAUDE.md)
- Modify: `.env.example`

- [ ] **Step 1: 本地库**
  1. 备份:`cp veris.db veris.db.bak-2026-10-04`。
  2. 只读确认当前缺哪些表和约束:`sqlite3 veris.db ".schema evidence_raw"`、`.schema evidence_artifacts`。
  3. 写幂等脚本 `scripts/apply-local-migrations.ts`(若仓库不允许新增 scripts 目录,就放进 scratchpad 执行):对本地库补执行 0015(UPDATE 语句可重复执行)与 0016(`CREATE TABLE IF NOT EXISTS`)。
  4. 执行后核对:`select market, industry, language from projects`,以及 evidence_raw 表已存在。
  5. `social_presence` 的 CHECK 约束缺失不影响本次验收,因为 CSE 未配置。是否完整重建本地库留给用户决定,写入操作手册。
- [ ] **Step 2: 操作手册与提案**
  - 操作手册写明:固定 dev 端口;`GOOGLE_OAUTH_REDIRECT_URI` 与 Google Cloud 控制台中回调地址的同步步骤(**需要用户操作**);inngest 的启动方式;`PAGESPEED_API_KEY` 的作用。
  - CLAUDE.md 更新提案写进单独文件,等用户批准后再改。
- [ ] **Step 3: 全量门禁**:`pnpm test`、`pnpm lint`、`pnpm build`,把输出摘要写入实现笔记。任何失败都必须修到通过,不得降低门禁标准。
- [ ] **Step 4: 真实运行验收**(spec §7.6)
  1. 起服务:`next dev` 使用固定端口,外加 `inngest-cli dev`(按操作手册);先检查端口占用与 `.next/dev/lock`。
  2. 在 metadocu 项目上把品类设为 `document metadata removal tool`、市场设为 `global-en` 后实跑一次。若用户还没有重新授权 GSC,GSC 会显示为 failed(invalid_grant),这本身也是验收项之一。
  3. 逐项核对:
     - 30 条探针问题中不含旧默认品类(SQL 计数);
     - seed_serp 的 request 里每个种子都带来源标签,且不含问句;
     - 竞品候选清单(人工判断是否为同类工具);
     - 每个子阶段的状态与 evidence_raw 的原文一致(抽查 3 条);
     - 每条 finding 都用 curl 或浏览器独立复核,按"真且可操作 / 真但价值低 / 误报"三档计数。
  4. 误报数不为 0 时,修复后重跑。
  5. 验收完成后,关闭自己启动的服务:按端口取 PID 后 kill,再确认端口已空。
- [ ] **Step 5: 最终审查**
  - 派一个只读审查代理审查 A 的全部改动,对照 spec 逐节核验;收口后对比 git 快照。
  - 实现笔记与 memory 中记下:改动文件清单、测试数、验收结论、未完成项。
  - 向用户汇报:改了什么、验证了什么、验收数据、需要用户手动做的事(Google 控制台回调地址、是否批准 CLAUDE.md 提案、是否重建本地库)。

---

## 自检记录(writing-plans Self-Review)

1. **spec 覆盖**:
   - §3.1 → Task 1;§3.2 → Task 2、3、6;§3.3 → Task 4;§3.4 → Task 6;§3.5 → Task 5;§3.6 → Task 7
   - §4.1 → Task 8、10–13;§4.2 → Task 8、11–13、15;§4.3 → Task 9;§4.4 → Task 11、12;§4.5 → Task 14;§4.6 → Task 13;§4.7 → Task 22
   - §5.1 → Task 16;§5.2 → Task 17、18;§5.3 → Task 19;§5.4 → Task 20;§5.5 → Task 21
   - §7 → Task 21、22;§8 → Task 22;§9 → 各任务的 Step 1;§11 → Task 22
   - 偏离一处:§4.5 中"建 run 时写入预检状态"简化为只做闸门,已在 Task 14 写明理由。
2. **占位扫描**:没有 TBD 或"以后实现"。需要核实外部事实的地方,都写明了核实方法和结果的去处(实现笔记)。
3. **类型一致**:`Seed`、`CollectResult`、`RawResponse`、`SubStageOutcome`、`PreflightItem`、`WikipediaCheck`、`RedditCheck` 在定义它的任务与使用它的任务之间名称一致;`subSourceKey` 的冒号格式贯穿 Task 8、11–13、15。
4. **Review Focus**:5 条均已落到对应任务的测试中(Task 5、3、13、9、11)。
