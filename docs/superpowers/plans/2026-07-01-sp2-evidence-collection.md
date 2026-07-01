# SP2：证据采集 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **每个写 .ts/.tsx 的任务开始前，先读 `veris-coding` skill。** 本计划所有代码已按 Next 16 / React 19 写法编写，风格（无分号、单引号）照现有文件。

**Goal:** 把 `/runs/{id}/events` 从 SP1 的桩事件流换成真实证据采集：单入口 URL 的页面抓取 + Cloudflare Browser Rendering 渲染对比 + robots/meta/schema 检测，经 Inngest 编排写入 `evidence_artifacts`，前端经 Inngest Realtime 收到真实 SSE 进度；屏1「开始诊断」接通端到端真实链路。

**Architecture:** Next Route Handler 收到屏1提交 → 建 project/run（`run.status=collecting`）→ 发 Inngest 事件 → Inngest 函数按 5 步跑（SSRF 校验 → page_fetch → schema → render_check → `collected`），每步经 Inngest Realtime `publish()` 广播进度 → `/runs/{id}/events` `subscribe()` 转发成 SSE。除 Inngest/Realtime 编排壳外，所有业务逻辑（SSRF 判断、HTML 解析、robots 规则、正文差值、hash）都写成纯函数，单测直接调用，不依赖框架运行时。

**Tech Stack:** 沿用 SP1 全栈（Next 16 · React 19 · TS · libSQL/Drizzle · Vitest）；新增 `inngest`（长任务编排）、`@inngest/realtime`（SSE 用的 pub/sub）、`linkedom`（服务端解析 HTML，取 DOM API 但比完整浏览器轻）。

## Global Constraints

- 前端固定 Next.js 16 App Router + React 19：`params` 一律 `Promise<...>` 并 `await`；转发 ref 用普通 `ref` prop，禁止 `forwardRef`；默认 Server Component，`'use client'` 只下沉到交互叶子。
- **变更数据走客户端 `fetch` 调用既有 REST API 路由**（不是 Server Action）——这是本仓库既有约定（`RecCard` 的 PATCH 已如此），本轮 `NewAnalysisForm` 照此模式，不引入新模式。
- Node ≥ 20.9、TypeScript ≥ 5.1；代码风格：无分号、单引号（照现有 `lib/`、`app/api/` 文件）。
- **证据不可变**：三类新证据（`page_fetch`/`schema`/`render_check`）写入即存原始内容 + `raw_hash` + `captured_at`，无更新路径。
- **证据先于结论**：本轮只写 `evidence_artifacts`，不生成 `findings`/`recommendations`（那是 SP5），因此不涉及 `evidence_refs`/`claim_type` 校验路径。
- 三类新证据 `claim_level` 一律 `'L4'`（确定性工具直接测量）。
- **SSRF 防护非协商项**：任何对用户提交域名的我方服务端 fetch（page_fetch、robots.txt）必须先过 `assertPublicUrl`；Cloudflare Rendering 的调用不受此限（它在 CF 基础设施上发起，不在我方网络边界内）。
- `run.status` 新增 `'collected'`，CHECK 约束同步更新；SP2 结束时 run 停在 `collected`，不擅自推进到 `diagnosing`。
- 测试沿用既有约定：**只对纯函数/组件做单测，不新增触达真实 db 的测试**（现有代码库里连 §6.2 的 DB CHECK 都是靠肉眼审查 schema.ts，不是靠插入测试触发；本轮不引入新的测试基础设施）。数据库/Inngest/Realtime 的真实联调用 `npm run dev` + 手动 curl 验证（任务 15）。
- Git commit message 用中文（照 `CLAUDE.md` 最新语言规范）；代码里的变量名/函数名/路由/字段仍用英文。

参考文档：`docs/plan-ux.md` §5（真实性协议）§6（数据模型）§7（API）；本轮设计 `docs/superpowers/specs/2026-07-01-sp2-evidence-collection-design.md`。

---

### Task 1：依赖、env、`collected` 状态

**Files:**
- Modify: `package.json`（新增依赖）、`db/schema.ts`（`runs_status` CHECK 加 `'collected'`）、`lib/types.ts`（`RunStatus` 加 `'collected'`）、`.env`、`.env.example`

**Interfaces:**
- Produces: `RunStatus` 类型新增 `'collected'`，供任务 9/11/12 使用；`inngest`/`@inngest/realtime`/`linkedom` 包可用，供后续任务 import。

- [ ] **Step 1: 安装新依赖**

```bash
cd /Users/gongchunming/Public/website/seo-tools
npm install inngest @inngest/realtime linkedom
```

- [ ] **Step 2: `runs_status` CHECK 加入 `collected`**

在 `db/schema.ts` 里找到 `runs` 表定义，把：

```ts
  check('runs_status', sql`${t.status} in ('draft','collecting','diagnosing','reviewing','output','failed')`),
```

改成：

```ts
  check('runs_status', sql`${t.status} in ('draft','collecting','collected','diagnosing','reviewing','output','failed')`),
```

- [ ] **Step 3: `lib/types.ts` 同步 `RunStatus`**

把：

```ts
export type RunStatus = 'draft' | 'collecting' | 'diagnosing' | 'reviewing' | 'output' | 'failed'
```

改成：

```ts
export type RunStatus = 'draft' | 'collecting' | 'collected' | 'diagnosing' | 'reviewing' | 'output' | 'failed'
```

- [ ] **Step 4: 推送 schema 变更到本地库**

```bash
npm run db:push
```

Expected: drizzle-kit 报告 `runs` 表的 CHECK 约束变更并应用成功（本地 `file:./veris.db`，会提示是否要重建约束，选择接受）。

- [ ] **Step 5: 补 `.env` / `.env.example`**

在 `.env.example` 末尾追加：

```bash
# Cloudflare Browser Rendering（SP2 render_check 用，REST API 无需部署 Worker）
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Inngest（长任务编排）。本地开发用 Inngest Dev Server，跑：
#   npx inngest-cli@latest dev
# 生产部署前再从 Inngest 控制台取 INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY。
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

在本地 `.env` 里同步加上（本地开发先留空，走 Inngest Dev 模式即可，`inngest` SDK 在未设置这两个 key 时默认走本地开发协议）：

```bash
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

- [ ] **Step 6: 回归验证**

```bash
npm test
npx tsc --noEmit
```

Expected: 两者都无报错（现有测试全绿，类型检查通过；本任务未新增测试文件）。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json db/schema.ts lib/types.ts .env.example
git commit -m "feat(sp2): 新增 collected run 状态与采集依赖（inngest/realtime/linkedom）"
```

---

### Task 2：SSRF 守卫

**Files:**
- Create: `lib/security/ssrf-guard.ts`
- Test: `lib/security/ssrf-guard.test.ts`

**Interfaces:**
- Produces: `assertPublicUrl(rawUrl: string): Promise<URL>`、`class SsrfBlockedError extends Error`。供任务 3（safeFetch）与任务 11（编排）使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/security/ssrf-guard.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertPublicUrl, SsrfBlockedError } from './ssrf-guard'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'

afterEach(() => vi.mocked(lookup).mockReset())

describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('rejects private IPv4 ranges', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '10.0.0.5', family: 4 })
    await expect(assertPublicUrl('http://internal.example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('rejects loopback and link-local (incl. cloud metadata)', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '169.254.169.254', family: 4 })
    await expect(assertPublicUrl('http://metadata.example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('accepts a public IPv4 address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 })
    const url = await assertPublicUrl('https://example.com/page')
    expect(url.hostname).toBe('example.com')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/security/ssrf-guard.test.ts
```

Expected: FAIL，报 `Cannot find module './ssrf-guard'`。

- [ ] **Step 3: 实现**

```ts
// lib/security/ssrf-guard.ts
import { lookup } from 'node:dns/promises'

export class SsrfBlockedError extends Error {}

const PRIVATE_V4_RANGES: [number, number][] = [
  [ipToInt('10.0.0.0'), ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'), ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'), ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')],
  [ipToInt('0.0.0.0'), ipToInt('0.255.255.255')],
]

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateV4(address: string): boolean {
  const n = ipToInt(address)
  return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi)
}

function isPrivateV6(address: string): boolean {
  const a = address.toLowerCase()
  return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError(`invalid URL: ${rawUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new SsrfBlockedError(`unsupported scheme: ${url.protocol}`)

  const { address, family } = await lookup(url.hostname)
  const blocked = family === 4 ? isPrivateV4(address) : isPrivateV6(address)
  if (blocked) throw new SsrfBlockedError(`blocked private/reserved address: ${address}`)

  return url
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/security/ssrf-guard.test.ts
```

Expected: PASS（4 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/security/ssrf-guard.ts lib/security/ssrf-guard.test.ts
git commit -m "feat(sp2): SSRF 守卫——拒绝私有网段/保留地址/非 http(s) scheme"
```

---

### Task 3：safeFetch（SSRF 守卫 + 重定向复检 + 超时）

**Files:**
- Create: `lib/security/safe-fetch.ts`
- Test: `lib/security/safe-fetch.test.ts`

**Interfaces:**
- Consumes: `assertPublicUrl(rawUrl: string): Promise<URL>`（任务 2）。
- Produces: `safeFetch(url: string, init?: SafeFetchInit): Promise<Response>`。供任务 4、5（page-parser、robots）注入使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/security/safe-fetch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeFetch } from './safe-fetch'

vi.mock('./ssrf-guard', () => ({
  assertPublicUrl: vi.fn(async (u: string) => new URL(u)),
  SsrfBlockedError: class extends Error {},
}))

describe('safeFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates the URL before fetching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://example.com')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ redirect: 'manual' }))
  })

  it('re-validates each redirect hop and follows up to maxRedirects', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }))
      .mockResolvedValueOnce(new Response('final', { status: 200 }))
    const res = await safeFetch('https://example.com/start')
    expect(await res.text()).toBe('final')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exceeding maxRedirects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } }),
    )
    await expect(safeFetch('https://example.com/start', { maxRedirects: 2 })).rejects.toThrow(/too many redirects/i)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/security/safe-fetch.test.ts
```

Expected: FAIL，`Cannot find module './safe-fetch'`。

- [ ] **Step 3: 实现**

```ts
// lib/security/safe-fetch.ts
import { assertPublicUrl } from './ssrf-guard'

export interface SafeFetchInit extends RequestInit {
  maxRedirects?: number
  timeoutMs?: number
}

export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 5, timeoutMs = 10_000, ...requestInit } = init
  let currentUrl = (await assertPublicUrl(rawUrl)).toString()

  for (let hop = 0; ; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(currentUrl, { ...requestInit, redirect: 'manual', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) return res

    if (hop >= maxRedirects) throw new Error(`too many redirects fetching ${rawUrl}`)
    const nextUrl = new URL(res.headers.get('location')!, currentUrl).toString()
    currentUrl = (await assertPublicUrl(nextUrl)).toString()
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/security/safe-fetch.test.ts
```

Expected: PASS（3 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/security/safe-fetch.ts lib/security/safe-fetch.test.ts
git commit -m "feat(sp2): safeFetch——每跳重定向都重新过 SSRF 守卫 + 硬超时"
```

---

### Task 4：正文抽取 + 页面元信息解析

**Files:**
- Create: `lib/collection/page-parser.ts`
- Test: `lib/collection/page-parser.test.ts`

**Interfaces:**
- Consumes: `safeFetch`（任务 3）。
- Produces: `extractMainTextChars(html: string): number`（任务 8 的 Cloudflare provider 会复用它）、`parsePageFacts(html: string): { mainTextChars: number; canonicalUrl: string | null; metaRobots: string | null }`、`fetchPageFacts(url: string, fetchImpl?: typeof safeFetch): Promise<PageFacts>`，`PageFacts = { rawHtml: string; mainTextChars: number; canonicalUrl: string | null; metaRobots: string | null }`。供任务 11 编排使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/collection/page-parser.test.ts
import { describe, it, expect, vi } from 'vitest'
import { extractMainTextChars, parsePageFacts, fetchPageFacts } from './page-parser'

const HTML = `<!doctype html><html><head>
  <title>Team Flow</title>
  <link rel="canonical" href="https://teamflow.cn/" />
  <meta name="robots" content="index,follow" />
</head><body><main><h1>Team Flow</h1><p>协作工具，帮团队更快交付。</p></main></body></html>`

describe('extractMainTextChars', () => {
  it('counts visible text, ignoring tags/scripts/styles', () => {
    const html = '<html><body><script>var x=1</script><style>.a{}</style><p>Hello world</p></body></html>'
    expect(extractMainTextChars(html)).toBe('Hello world'.length)
  })
})

describe('parsePageFacts', () => {
  it('extracts main text length, canonical, and meta robots', () => {
    const facts = parsePageFacts(HTML)
    expect(facts.canonicalUrl).toBe('https://teamflow.cn/')
    expect(facts.metaRobots).toBe('index,follow')
    expect(facts.mainTextChars).toBeGreaterThan(0)
  })

  it('returns null canonical/meta robots when absent', () => {
    const facts = parsePageFacts('<html><body><p>no meta here</p></body></html>')
    expect(facts.canonicalUrl).toBeNull()
    expect(facts.metaRobots).toBeNull()
  })
})

describe('fetchPageFacts', () => {
  it('fetches the URL and returns rawHtml alongside parsed facts', async () => {
    const fetchImpl = vi.fn(async () => new Response(HTML, { status: 200 }))
    const result = await fetchPageFacts('https://teamflow.cn', fetchImpl as never)
    expect(result.rawHtml).toBe(HTML)
    expect(result.canonicalUrl).toBe('https://teamflow.cn/')
    expect(fetchImpl).toHaveBeenCalledWith('https://teamflow.cn')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/collection/page-parser.test.ts
```

Expected: FAIL，`Cannot find module './page-parser'`。

- [ ] **Step 3: 实现**

```ts
// lib/collection/page-parser.ts
import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'

export interface PageFacts {
  rawHtml: string
  mainTextChars: number
  canonicalUrl: string | null
  metaRobots: string | null
}

export function extractMainTextChars(html: string): number {
  const { document } = parseHTML(html)
  document.querySelectorAll('script, style').forEach((el) => el.remove())
  return (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim().length
}

export function parsePageFacts(html: string): Omit<PageFacts, 'rawHtml'> {
  const { document } = parseHTML(html)
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  return { mainTextChars: extractMainTextChars(html), canonicalUrl, metaRobots }
}

export async function fetchPageFacts(
  url: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<PageFacts> {
  const res = await fetchImpl(url)
  const rawHtml = await res.text()
  return { rawHtml, ...parsePageFacts(rawHtml) }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/collection/page-parser.test.ts
```

Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/collection/page-parser.ts lib/collection/page-parser.test.ts
git commit -m "feat(sp2): 正文字符数抽取 + canonical/meta robots 解析"
```

---

### Task 5：robots.txt 规则解析与抓取

**Files:**
- Create: `lib/collection/robots.ts`
- Test: `lib/collection/robots.test.ts`

**Interfaces:**
- Consumes: `safeFetch`（任务 3）。
- Produces: `parseRobotsAllowed(robotsTxt: string, path: string): boolean`、`fetchRobotsCheck(entryUrl: string, fetchImpl?: typeof safeFetch): Promise<RobotsCheck>`，`RobotsCheck = { allowed: boolean; rawText: string }`。供任务 11 使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/collection/robots.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parseRobotsAllowed, fetchRobotsCheck } from './robots'

describe('parseRobotsAllowed', () => {
  it('allows everything when there is no matching Disallow', () => {
    expect(parseRobotsAllowed('User-agent: *\nAllow: /', '/pricing')).toBe(true)
  })

  it('disallows a path blocked for User-agent: *', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /admin\n'
    expect(parseRobotsAllowed(robotsTxt, '/admin/users')).toBe(false)
    expect(parseRobotsAllowed(robotsTxt, '/pricing')).toBe(true)
  })

  it('treats an empty robots.txt as allow-all', () => {
    expect(parseRobotsAllowed('', '/anything')).toBe(true)
  })
})

describe('fetchRobotsCheck', () => {
  it('treats a 404 robots.txt as allowed with empty rawText', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    const result = await fetchRobotsCheck('https://teamflow.cn/', fetchImpl as never)
    expect(result).toEqual({ allowed: true, rawText: '' })
    expect(fetchImpl).toHaveBeenCalledWith('https://teamflow.cn/robots.txt')
  })

  it('parses a fetched robots.txt against the entry path', async () => {
    const fetchImpl = vi.fn(async () => new Response('User-agent: *\nDisallow: /', { status: 200 }))
    const result = await fetchRobotsCheck('https://teamflow.cn/pricing', fetchImpl as never)
    expect(result.allowed).toBe(false)
    expect(result.rawText).toContain('Disallow: /')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/collection/robots.test.ts
```

Expected: FAIL，`Cannot find module './robots'`。

- [ ] **Step 3: 实现**

```ts
// lib/collection/robots.ts
import { safeFetch } from '@/lib/security/safe-fetch'

export interface RobotsCheck {
  allowed: boolean
  rawText: string
}

export function parseRobotsAllowed(robotsTxt: string, path: string, userAgent = '*'): boolean {
  const lines = robotsTxt.split('\n').map((l) => l.trim())
  let inRelevantGroup = false
  let matchedGroup = false
  const disallowRules: string[] = []
  const allowRules: string[] = []

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (key === 'user-agent') {
      inRelevantGroup = value === '*' || value.toLowerCase() === userAgent.toLowerCase()
      if (inRelevantGroup) matchedGroup = true
      continue
    }
    if (!inRelevantGroup) continue
    if (key === 'disallow' && value) disallowRules.push(value)
    if (key === 'allow' && value) allowRules.push(value)
  }

  if (!matchedGroup) return true
  const longestMatch = (rules: string[]) =>
    rules.filter((rule) => path.startsWith(rule)).sort((a, b) => b.length - a.length)[0]

  const disallow = longestMatch(disallowRules)
  const allow = longestMatch(allowRules)
  if (!disallow) return true
  if (allow && allow.length >= disallow.length) return true
  return false
}

export async function fetchRobotsCheck(
  entryUrl: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<RobotsCheck> {
  const url = new URL(entryUrl)
  const robotsUrl = `${url.origin}/robots.txt`
  const res = await fetchImpl(robotsUrl)
  if (res.status === 404) return { allowed: true, rawText: '' }
  const rawText = await res.text()
  return { allowed: parseRobotsAllowed(rawText, url.pathname || '/'), rawText }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/collection/robots.test.ts
```

Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/collection/robots.ts lib/collection/robots.test.ts
git commit -m "feat(sp2): robots.txt 解析（User-agent:* 分组 + Allow/Disallow 最长匹配）"
```

---

### Task 6：JSON-LD / schema.org 抽取

**Files:**
- Create: `lib/collection/schema-extractor.ts`
- Test: `lib/collection/schema-extractor.test.ts`

**Interfaces:**
- Produces: `extractSchema(html: string): SchemaExtraction`，`SchemaExtraction = { types: string[]; raw: unknown[] }`。供任务 11 使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/collection/schema-extractor.test.ts
import { describe, it, expect } from 'vitest'
import { extractSchema } from './schema-extractor'

describe('extractSchema', () => {
  it('extracts @type from a single JSON-LD block', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Team Flow"}
    </script></head><body></body></html>`
    const result = extractSchema(html)
    expect(result.types).toEqual(['Organization'])
    expect(result.raw).toHaveLength(1)
  })

  it('handles multiple script blocks and @graph arrays', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"WebSite"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"Product"},{"@type":"FAQPage"}]}</script>
    </head><body></body></html>`
    const result = extractSchema(html)
    expect(result.types.sort()).toEqual(['FAQPage', 'Product', 'WebSite'])
  })

  it('returns empty result when there is no structured data', () => {
    const result = extractSchema('<html><body><p>no schema here</p></body></html>')
    expect(result).toEqual({ types: [], raw: [] })
  })

  it('skips a malformed JSON-LD block instead of throwing', () => {
    const html = '<html><head><script type="application/ld+json">{not valid json</script></head></html>'
    expect(() => extractSchema(html)).not.toThrow()
    expect(extractSchema(html)).toEqual({ types: [], raw: [] })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/collection/schema-extractor.test.ts
```

Expected: FAIL，`Cannot find module './schema-extractor'`。

- [ ] **Step 3: 实现**

```ts
// lib/collection/schema-extractor.ts
import { parseHTML } from 'linkedom'

export interface SchemaExtraction {
  types: string[]
  raw: unknown[]
}

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out))
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj['@type'] === 'string') out.push(obj['@type'])
    else if (Array.isArray(obj['@type'])) out.push(...(obj['@type'] as string[]))
    if (obj['@graph']) collectTypes(obj['@graph'], out)
  }
}

export function extractSchema(html: string): SchemaExtraction {
  const { document } = parseHTML(html)
  const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')]
  const raw: unknown[] = []
  const types: string[] = []

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.textContent ?? '')
      raw.push(parsed)
      collectTypes(parsed, types)
    } catch {
      // 单个 JSON-LD 块解析失败不应中断整页解析，跳过即可。
    }
  }

  return { types, raw }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/collection/schema-extractor.test.ts
```

Expected: PASS（4 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/collection/schema-extractor.ts lib/collection/schema-extractor.test.ts
git commit -m "feat(sp2): JSON-LD/schema.org 抽取，兼容 @graph 与多 script 块"
```

---

### Task 7：正文差值计算 + 内容哈希

**Files:**
- Create: `lib/collection/readability-risk.ts`, `lib/collection/hash.ts`
- Test: `lib/collection/readability-risk.test.ts`, `lib/collection/hash.test.ts`

**Interfaces:**
- Produces: `computeMainContentDelta(initialChars: number, renderedChars: number): number`、`sha256Hex(input: string): string`。供任务 8、11 使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/collection/readability-risk.test.ts
import { describe, it, expect } from 'vitest'
import { computeMainContentDelta } from './readability-risk'

describe('computeMainContentDelta', () => {
  it('is positive when rendering reveals more text than the initial HTML', () => {
    expect(computeMainContentDelta(0, 1200)).toBe(1200)
  })
  it('is zero when initial and rendered text match', () => {
    expect(computeMainContentDelta(500, 500)).toBe(0)
  })
  it('can be negative when rendering strips text (rare but valid)', () => {
    expect(computeMainContentDelta(500, 300)).toBe(-200)
  })
})
```

```ts
// lib/collection/hash.test.ts
import { describe, it, expect } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('is deterministic for the same input', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'))
  })
  it('matches the known sha256 of "hello"', () => {
    expect(sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/collection/readability-risk.test.ts lib/collection/hash.test.ts
```

Expected: FAIL，两个模块都不存在。

- [ ] **Step 3: 实现**

```ts
// lib/collection/readability-risk.ts
export function computeMainContentDelta(initialChars: number, renderedChars: number): number {
  return renderedChars - initialChars
}
```

```ts
// lib/collection/hash.ts
import { createHash } from 'node:crypto'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/collection/readability-risk.test.ts lib/collection/hash.test.ts
```

Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/collection/readability-risk.ts lib/collection/readability-risk.test.ts lib/collection/hash.ts lib/collection/hash.test.ts
git commit -m "feat(sp2): main_content_delta 计算 + 证据原文 sha256 哈希"
```

---

### Task 8：RenderProvider 接口 + Cloudflare 实现

**Files:**
- Create: `lib/render/render-provider.ts`, `lib/render/cloudflare-provider.ts`
- Test: `lib/render/cloudflare-provider.test.ts`

**Interfaces:**
- Consumes: `extractMainTextChars(html: string): number`（任务 4）。
- Produces: `interface RenderProvider { renderMainText(url: string): Promise<RenderResult> }`，`RenderResult = { html: string; mainTextChars: number }`；`createCloudflareRenderProvider(config: CloudflareProviderConfig): RenderProvider`。供任务 11 使用。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/render/cloudflare-provider.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createCloudflareRenderProvider } from './cloudflare-provider'

describe('createCloudflareRenderProvider', () => {
  it('calls the CF content REST endpoint and returns rendered main text length', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc_123/browser-rendering/content')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer token_abc' })
      expect(JSON.parse(init?.body as string)).toEqual({ url: 'https://teamflow.cn' })
      return new Response(
        JSON.stringify({ success: true, result: '<html><body><p>Rendered text</p></body></html>' }),
        { status: 200 },
      )
    })
    const provider = createCloudflareRenderProvider({
      accountId: 'acc_123',
      apiToken: 'token_abc',
      fetchImpl: fetchImpl as never,
    })
    const result = await provider.renderMainText('https://teamflow.cn')
    expect(result.mainTextChars).toBe('Rendered text'.length)
    expect(result.html).toContain('Rendered text')
  })

  it('throws when the CF API responds with success: false', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'bad url' }] }), { status: 200 }))
    const provider = createCloudflareRenderProvider({ accountId: 'a', apiToken: 't', fetchImpl: fetchImpl as never })
    await expect(provider.renderMainText('https://teamflow.cn')).rejects.toThrow(/bad url/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/render/cloudflare-provider.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// lib/render/render-provider.ts
export interface RenderResult {
  html: string
  mainTextChars: number
}

export interface RenderProvider {
  renderMainText(url: string): Promise<RenderResult>
}
```

```ts
// lib/render/cloudflare-provider.ts
import { extractMainTextChars } from '@/lib/collection/page-parser'
import type { RenderProvider, RenderResult } from './render-provider'

export interface CloudflareProviderConfig {
  accountId: string
  apiToken: string
  fetchImpl?: typeof fetch
}

interface CfContentResponse {
  success: boolean
  result?: string
  errors?: { message: string }[]
}

export function createCloudflareRenderProvider(config: CloudflareProviderConfig): RenderProvider {
  const fetchImpl = config.fetchImpl ?? fetch

  return {
    async renderMainText(url: string): Promise<RenderResult> {
      const res = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/content`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        },
      )
      const body = (await res.json()) as CfContentResponse
      if (!body.success || typeof body.result !== 'string')
        throw new Error(`Cloudflare Browser Rendering failed: ${body.errors?.[0]?.message ?? 'unknown error'}`)

      return { html: body.result, mainTextChars: extractMainTextChars(body.result) }
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/render/cloudflare-provider.test.ts
```

Expected: PASS（2 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/render/render-provider.ts lib/render/cloudflare-provider.ts lib/render/cloudflare-provider.test.ts
git commit -m "feat(sp2): RenderProvider 接口 + Cloudflare Browser Rendering REST 实现"
```

---

### Task 9：证据/run 数据访问层扩展

**Files:**
- Modify: `lib/repositories/index.ts`

**Interfaces:**
- Produces: `createEvidenceArtifact(input: NewEvidenceArtifact): Promise<EvidenceArtifact[]>`、`markRunStatus(runId: string, status: RunStatus, extra?: { finishedAt?: string }): Promise<unknown>`。供任务 11 使用。`NewEvidenceArtifact` 字段对齐 `db/schema.ts` 的 `evidenceArtifacts` insert 形状。

本任务是薄的 db 包装（沿用现有 `lib/repositories/index.ts` 的写法），本仓库既有约定里这类薄包装不单独出真实 db 测试（§6.2 的 CHECK 约束靠 schema.ts 里的 `check(...)` 声明本身保证，不是靠插入测试触发）；`npx tsc --noEmit` 通过即视为本任务的验证。

- [ ] **Step 1: 在 `lib/repositories/index.ts` 追加**

```ts
import { runs, findings, recommendations, evidenceArtifacts, projects, brandFacts, retestSnapshots } from '@/db/schema'
import type { EvidenceType, EvidenceLevel, RunStatus } from '@/lib/types'
```

（`import` 行与现有的合并，不要重复 import 语句）在文件末尾、`export * from './validators'` 之前追加：

```ts
export interface NewEvidenceArtifact {
  id: string
  projectId: string
  runId: string
  type: EvidenceType
  claimLevel: EvidenceLevel
  source: string
  payload: unknown
  rawText: string
  rawHash: string
}

export const createEvidenceArtifact = (input: NewEvidenceArtifact) =>
  db.insert(evidenceArtifacts).values(input).returning()

export const markRunStatus = (runId: string, status: RunStatus, extra?: { finishedAt?: string }) =>
  db.update(runs).set({ status, ...extra }).where(eq(runs.id, runId))
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/index.ts
git commit -m "feat(sp2): repositories 新增 createEvidenceArtifact / markRunStatus"
```

---

### Task 10：Inngest client、channel、事件定义

**Files:**
- Create: `lib/inngest/client.ts`, `lib/inngest/channels.ts`, `lib/inngest/events.ts`
- Test: `lib/inngest/events.test.ts`

**Interfaces:**
- Produces: `inngest: Inngest`（client.ts）；`runProgressChannel(runId: string)`、`type RunProgressMessage`（channels.ts）；`COLLECT_REQUESTED_EVENT`、`buildCollectRequestedEvent(run: {id,projectId}, url: string)`、`type CollectRequestedEventData`（events.ts）。供任务 11、12、13 使用。

- [ ] **Step 1: 写失败的测试（只测纯函数 `buildCollectRequestedEvent`）**

```ts
// lib/inngest/events.test.ts
import { describe, it, expect } from 'vitest'
import { COLLECT_REQUESTED_EVENT, buildCollectRequestedEvent } from './events'

describe('buildCollectRequestedEvent', () => {
  it('builds an Inngest event payload from a run and its entry URL', () => {
    const event = buildCollectRequestedEvent({ id: 'run_1', projectId: 'proj_1' }, 'https://teamflow.cn')
    expect(event).toEqual({
      name: COLLECT_REQUESTED_EVENT,
      data: { runId: 'run_1', projectId: 'proj_1', url: 'https://teamflow.cn' },
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/inngest/events.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// lib/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'veris' })
```

```ts
// lib/inngest/channels.ts
import { channel, topic } from '@inngest/realtime'

export type RunProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: 'page_fetch' | 'schema' | 'render_check' }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export const runProgressChannel = channel((runId: string) => `run:${runId}`).addTopic(
  topic('progress').type<RunProgressMessage>(),
)
```

```ts
// lib/inngest/events.ts
export const COLLECT_REQUESTED_EVENT = 'veris/run.collect.requested' as const

export interface CollectRequestedEventData {
  runId: string
  projectId: string
  url: string
}

export function buildCollectRequestedEvent(run: { id: string; projectId: string }, url: string) {
  return {
    name: COLLECT_REQUESTED_EVENT,
    data: { runId: run.id, projectId: run.projectId, url } satisfies CollectRequestedEventData,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/inngest/events.test.ts
npx tsc --noEmit
```

Expected: 测试 PASS；类型检查无报错。

- [ ] **Step 5: Commit**

```bash
git add lib/inngest/client.ts lib/inngest/channels.ts lib/inngest/events.ts lib/inngest/events.test.ts
git commit -m "feat(sp2): Inngest client + run 进度 realtime channel + 采集事件定义"
```

---

### Task 11：采集编排函数（Inngest function）

**Files:**
- Create: `lib/inngest/collect-evidence.ts`
- Test: `lib/inngest/collect-evidence.test.ts`

**Interfaces:**
- Consumes（全部来自前面任务，签名照原样）：
  - `assertPublicUrl(rawUrl: string): Promise<URL>`、`SsrfBlockedError`（任务 2）
  - `fetchPageFacts(url: string): Promise<PageFacts>`（任务 4）
  - `fetchRobotsCheck(entryUrl: string): Promise<RobotsCheck>`（任务 5）
  - `extractSchema(html: string): SchemaExtraction`（任务 6）
  - `computeMainContentDelta(initialChars: number, renderedChars: number): number`、`sha256Hex(input: string): string`（任务 7）
  - `RenderProvider`（任务 8）
  - `createEvidenceArtifact(input: NewEvidenceArtifact)`、`markRunStatus(runId, status, extra?)`（任务 9）
  - `inngest`、`runProgressChannel`、`RunProgressMessage`、`COLLECT_REQUESTED_EVENT`、`CollectRequestedEventData`（任务 10）
- Produces: `collectEvidenceHandler(args, deps?): Promise<{status:'collected'}>`（纯逻辑，供测试直接调用）；`collectEvidence`（`inngest.createFunction` 注册的真正 Inngest 函数，供任务 13 的 `app/api/inngest/route.ts` serve）。

- [ ] **Step 1: 写失败的测试**

```ts
// lib/inngest/collect-evidence.test.ts
import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { collectEvidenceHandler } from './collect-evidence'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { NewEvidenceArtifact } from '@/lib/repositories'
import type { RunStatus } from '@/lib/types'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    assertPublicUrl: vi.fn(async (u: string) => new URL(u)),
    fetchPageFacts: vi.fn(async (_url: string) => ({
      rawHtml: '<html><body>hi</body></html>',
      mainTextChars: 2,
      canonicalUrl: 'https://teamflow.cn/',
      metaRobots: 'index,follow',
    })),
    fetchRobotsCheck: vi.fn(async (_url: string) => ({ allowed: true, rawText: '' })),
    extractSchema: vi.fn((_html: string) => ({ types: ['Organization'], raw: [{ '@type': 'Organization' }] })),
    renderProvider: {
      renderMainText: vi.fn(async (_url: string) => ({ html: '<html>rendered</html>', mainTextChars: 400 })),
    },
    createEvidenceArtifact: vi.fn(async (_input: NewEvidenceArtifact) => [_input]),
    markRunStatus: vi.fn(async (_runId: string, _status: RunStatus, _extra?: { finishedAt?: string }) => undefined),
    ...overrides,
  }
}

// deps 保留 vi.fn() 的 Mock 类型（断言里要用 .mock.calls），只在传给
// collectEvidenceHandler 时转成它期望的 CollectDeps 形状。
function asCollectDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof collectEvidenceHandler>[1] {
  return deps as unknown as Parameters<typeof collectEvidenceHandler>[1]
}

function makeArgs() {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1', url: 'https://teamflow.cn' } },
      step: { run: async <T,>(_id: string, fn: () => Promise<T> | T) => fn() },
      publish: async (msg: unknown) => {
        published.push(msg)
      },
    },
    published,
  }
}

describe('collectEvidenceHandler', () => {
  it('runs all four checks, persists three L4 evidence artifacts, and marks the run collected', async () => {
    const deps = makeDeps()
    const { args, published } = makeArgs()

    const result = await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(result).toEqual({ status: 'collected' })
    expect(deps.fetchPageFacts).toHaveBeenCalledWith('https://teamflow.cn/')
    expect(deps.fetchRobotsCheck).toHaveBeenCalledWith('https://teamflow.cn/')
    expect(deps.renderProvider.renderMainText).toHaveBeenCalledWith('https://teamflow.cn/')

    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(3)
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(['page_fetch', 'schema', 'render_check'])
    deps.createEvidenceArtifact.mock.calls.forEach((c) => expect(c[0].claimLevel).toBe('L4'))

    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.objectContaining({ finishedAt: expect.any(String) }))

    const progressValues = published.map((m: unknown) => (m as { data: { pct?: number } }).data.pct).filter((v) => v !== undefined)
    expect(progressValues).toEqual([10, 40, 60, 90])
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'done')).toBe(true)
  })

  it('short-circuits on SSRF-blocked URLs: marks failed, publishes failed, throws NonRetriableError', async () => {
    const deps = makeDeps({
      assertPublicUrl: vi.fn(async () => {
        throw new SsrfBlockedError('blocked private/reserved address: 10.0.0.5')
      }),
    })
    const { args, published } = makeArgs()

    await expect(collectEvidenceHandler(args, asCollectDeps(deps))).rejects.toThrow(NonRetriableError)

    expect(deps.fetchPageFacts).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'failed')
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'failed')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/inngest/collect-evidence.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// lib/inngest/collect-evidence.ts
import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { COLLECT_REQUESTED_EVENT, type CollectRequestedEventData } from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { assertPublicUrl, SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { fetchPageFacts } from '@/lib/collection/page-parser'
import { fetchRobotsCheck } from '@/lib/collection/robots'
import { extractSchema } from '@/lib/collection/schema-extractor'
import { computeMainContentDelta } from '@/lib/collection/readability-risk'
import { sha256Hex } from '@/lib/collection/hash'
import { createCloudflareRenderProvider } from '@/lib/render/cloudflare-provider'
import type { RenderProvider } from '@/lib/render/render-provider'
import { createEvidenceArtifact, markRunStatus } from '@/lib/repositories'

interface CollectStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

interface CollectArgs {
  event: { data: CollectRequestedEventData }
  step: CollectStep
  publish: (msg: unknown) => Promise<void>
}

interface CollectDeps {
  assertPublicUrl: typeof assertPublicUrl
  fetchPageFacts: typeof fetchPageFacts
  fetchRobotsCheck: typeof fetchRobotsCheck
  extractSchema: typeof extractSchema
  renderProvider: RenderProvider
  createEvidenceArtifact: typeof createEvidenceArtifact
  markRunStatus: typeof markRunStatus
}

function defaultDeps(): CollectDeps {
  return {
    assertPublicUrl,
    fetchPageFacts,
    fetchRobotsCheck,
    extractSchema,
    renderProvider: createCloudflareRenderProvider({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
    }),
    createEvidenceArtifact,
    markRunStatus,
  }
}

export async function collectEvidenceHandler(
  { event, step, publish }: CollectArgs,
  deps: CollectDeps = defaultDeps(),
): Promise<{ status: 'collected' }> {
  const { runId, projectId, url } = event.data
  const channel = runProgressChannel(runId)
  const emit = (msg: RunProgressMessage) => publish(channel.progress(msg))

  let validUrl: URL
  try {
    validUrl = await step.run('validate-url', () => deps.assertPublicUrl(url))
  } catch (err) {
    await step.run('mark-failed-ssrf', () => deps.markRunStatus(runId, 'failed'))
    const reason = err instanceof Error ? err.message : 'invalid_url'
    await emit({ type: 'failed', reason })
    if (err instanceof SsrfBlockedError) throw new NonRetriableError(reason)
    throw err
  }
  const entryUrl = validUrl.toString()
  await emit({ type: 'progress', pct: 10 })

  const pageFacts = await step.run('fetch-page', () => deps.fetchPageFacts(entryUrl))
  const robots = await step.run('check-robots', () => deps.fetchRobotsCheck(entryUrl))
  await step.run('persist-page-fetch', () =>
    deps.createEvidenceArtifact({
      id: `ev_${crypto.randomUUID()}`,
      projectId,
      runId,
      type: 'page_fetch',
      claimLevel: 'L4',
      source: entryUrl,
      payload: { canonicalUrl: pageFacts.canonicalUrl, metaRobots: pageFacts.metaRobots, robotsAllowed: robots.allowed },
      rawText: pageFacts.rawHtml,
      rawHash: sha256Hex(pageFacts.rawHtml),
    }),
  )
  await emit({ type: 'evidence_created', evidenceType: 'page_fetch' })
  await emit({ type: 'progress', pct: 40 })

  const schema = await step.run('extract-schema', () => deps.extractSchema(pageFacts.rawHtml))
  await step.run('persist-schema', () =>
    deps.createEvidenceArtifact({
      id: `ev_${crypto.randomUUID()}`,
      projectId,
      runId,
      type: 'schema',
      claimLevel: 'L4',
      source: entryUrl,
      payload: { types: schema.types },
      rawText: JSON.stringify(schema.raw),
      rawHash: sha256Hex(JSON.stringify(schema.raw)),
    }),
  )
  await emit({ type: 'evidence_created', evidenceType: 'schema' })
  await emit({ type: 'progress', pct: 60 })

  const rendered = await step.run('render-check', () => deps.renderProvider.renderMainText(entryUrl))
  const delta = computeMainContentDelta(pageFacts.mainTextChars, rendered.mainTextChars)
  await step.run('persist-render-check', () =>
    deps.createEvidenceArtifact({
      id: `ev_${crypto.randomUUID()}`,
      projectId,
      runId,
      type: 'render_check',
      claimLevel: 'L4',
      source: entryUrl,
      payload: {
        initialHtmlMainTextChars: pageFacts.mainTextChars,
        renderedMainTextChars: rendered.mainTextChars,
        mainContentDelta: delta,
      },
      rawText: rendered.html,
      rawHash: sha256Hex(rendered.html),
    }),
  )
  await emit({ type: 'evidence_created', evidenceType: 'render_check' })
  await emit({ type: 'progress', pct: 90 })

  await step.run('mark-collected', () => deps.markRunStatus(runId, 'collected', { finishedAt: new Date().toISOString() }))
  await emit({ type: 'done' })

  return { status: 'collected' }
}

export const collectEvidence = inngest.createFunction(
  {
    id: 'collect-evidence',
    retries: 3,
    onFailure: async ({ event }) => {
      const original = (event.data as { event: { data: CollectRequestedEventData } }).event
      await markRunStatus(original.data.runId, 'failed')
    },
  },
  { event: COLLECT_REQUESTED_EVENT },
  ({ event, step, publish }) => collectEvidenceHandler({ event, step, publish }),
)
```

> 注：瞬时失败（fetch 超时、CF API 5xx）不在 `collectEvidenceHandler` 里捕获，让它们向上抛出，交给 Inngest 的函数级 `retries: 3` 处理，重试耗尽后由 `onFailure` 把 run 标记为 `failed`。`onFailure` 收到的是 Inngest 内部的 `inngest/function.failed` 事件，触发它的原始事件嵌在 `event.data.event` 里——这层解包依赖 Inngest 运行时的实际事件形状，本仓库现有的纯函数单测手段测不到，任务 15 手动联调时核实一次；若实际形状和这里写的不一致，照 Inngest Dev Server 日志里打印的真实结构改 `original` 那一行取值路径即可，其余逻辑不用动。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/inngest/collect-evidence.test.ts
```

Expected: PASS（2 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/inngest/collect-evidence.ts lib/inngest/collect-evidence.test.ts
git commit -m "feat(sp2): 采集编排函数——SSRF 校验 + page_fetch + schema + render_check + 状态流转"
```

---

### Task 12：`POST /runs` 接入事件派发

**Files:**
- Modify: `app/api/runs/route.ts`
- Create: `app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `buildCollectRequestedEvent`（任务 10）、`inngest`（任务 10）、`collectEvidence`（任务 11）。
- Produces: `POST /runs` 建 run 时 `status` 直接是 `'collecting'` 并向 Inngest 发送采集事件；`app/api/inngest/route.ts` 把 `collectEvidence` 函数 serve 给 Inngest（Dev Server / 生产均需要这个端点才能真正跑函数）。

- [ ] **Step 1: 改 `app/api/runs/route.ts`**

把现有：

```ts
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getProject } from '@/lib/repositories'
```

改成：

```ts
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getProject } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
```

把插入 run 的部分：

```ts
  const [created] = await db
    .insert(runs)
    .values({ id: `run_${crypto.randomUUID()}`, projectId, runType, status: 'draft' })
    .returning()

  return NextResponse.json(created, { status: 201 })
```

改成：

```ts
  const [created] = await db
    .insert(runs)
    .values({ id: `run_${crypto.randomUUID()}`, projectId, runType, status: 'collecting' })
    .returning()

  await inngest.send(buildCollectRequestedEvent(created, project.domain))

  return NextResponse.json(created, { status: 201 })
```

- [ ] **Step 2: 新建 `app/api/inngest/route.ts`**

```ts
// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { collectEvidence } from '@/lib/inngest/collect-evidence'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [collectEvidence],
})
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无报错（现有 `app/api/runs/route.ts` 没有单测，行为改动本身在任务 15 端到端联调里核实）。

- [ ] **Step 4: Commit**

```bash
git add app/api/runs/route.ts app/api/inngest/route.ts
git commit -m "feat(sp2): POST /runs 建 run 即派发采集事件 + serve Inngest 函数端点"
```

---

### Task 13：`/runs/{id}/events` 改为真实 SSE

**Files:**
- Modify: `app/api/runs/[id]/events/route.ts`
- Test: `app/api/runs/[id]/events/route.test.ts`

**Interfaces:**
- Consumes: `getRun(id)`（既有）、`runProgressChannel`（任务 10）、`@inngest/realtime` 的 `subscribe`。

- [ ] **Step 1: 写失败的测试**

```ts
// app/api/runs/[id]/events/route.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/repositories', () => ({
  getRun: vi.fn(async (id: string) => (id === 'run_1' ? { id: 'run_1' } : null)),
}))

vi.mock('@inngest/realtime', () => ({
  subscribe: vi.fn(async () => ({
    [Symbol.asyncIterator]: async function* () {
      yield { data: { type: 'progress', pct: 10 } }
      yield { data: { type: 'done' } }
    },
  })),
}))

import { GET } from './route'

describe('GET /runs/:id/events', () => {
  it('returns 404 for an unknown run', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('streams Realtime messages as SSE frames', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_1' }) })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()
    expect(text).toContain('data: {"type":"progress","pct":10}')
    expect(text).toContain('data: {"type":"done"}')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run app/api/runs/\[id\]/events/route.test.ts
```

Expected: FAIL（现有实现还是桩事件数组，返回的帧内容与断言不符）。

- [ ] **Step 3: 实现**

```ts
// app/api/runs/[id]/events/route.ts
import { subscribe } from '@inngest/realtime'
import { inngest } from '@/lib/inngest/client'
import { runProgressChannel } from '@/lib/inngest/channels'
import { getRun } from '@/lib/repositories'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })

  const messages = await subscribe({ app: inngest, channel: runProgressChannel(id), topics: ['progress'] })
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for await (const message of messages) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(message.data)}\n\n`))
        const type = (message.data as { type?: string }).type
        if (type === 'done' || type === 'failed') break
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run app/api/runs/\[id\]/events/route.test.ts
```

Expected: PASS（2 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add "app/api/runs/[id]/events/route.ts" "app/api/runs/[id]/events/route.test.ts"
git commit -m "feat(sp2): SSE 端点改接 Inngest Realtime，替换 SP1 桩事件流"
```

---

### Task 14：屏1 端到端接线

**Files:**
- Modify: `components/NewAnalysisForm.tsx`, `messages/en.json`, `messages/zh.json`
- Test: `components/NewAnalysisForm.test.tsx`

**Interfaces:**
- Consumes: `POST /projects`（既有，body `{domain, industry, market, language}`）、`POST /runs`（既有，body `{projectId, runType}`）。
- Produces: 表单提交后依次调用上述两个端点，成功后 `router.push('/{locale}/runs/{run.id}')`；失败展示 `t('submitError')`。

- [ ] **Step 1: `messages/zh.json` / `messages/en.json` 加两个 key**

在 `messages/zh.json` 的 `screen1` 里，`"run": "开始诊断 →"` 后面加：

```json
    "starting": "创建中…",
    "submitError": "创建分析失败，请重试。",
```

在 `messages/en.json` 的 `screen1` 里，`"run": "Start diagnosis →"`（沿用既有英文文案，不要改动其原文）后面加：

```json
    "starting": "Starting…",
    "submitError": "Couldn't start the analysis. Please try again.",
```

- [ ] **Step 2: 写失败的测试**

```tsx
// components/NewAnalysisForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NewAnalysisForm } from './NewAnalysisForm'
import zhMessages from '@/messages/zh.json'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

function renderForm() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <NewAnalysisForm locale="zh" />
    </NextIntlClientProvider>,
  )
}

describe('NewAnalysisForm submit', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        if (url === '/api/runs') return new Response(JSON.stringify({ id: 'run_y' }), { status: 201 })
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
  })

  it('creates a project then a run, and navigates to the new run', async () => {
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_y'))

    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0][0]).toBe('/api/projects')
    expect(calls[1][0]).toBe('/api/runs')
    expect(JSON.parse(calls[1][1]?.body as string)).toMatchObject({ projectId: 'proj_x', runType: 'baseline' })
  })

  it('shows an error message when project creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'domain_required' }), { status: 422 })))
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))
    await waitFor(() => expect(screen.getByText('创建分析失败，请重试。')).toBeInTheDocument())
    expect(pushMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run components/NewAnalysisForm.test.tsx
```

Expected: FAIL（当前按钮是 `<Link>`，点击不会触发任何 `fetch`，`pushMock` 不会被调用）。

- [ ] **Step 4: 实现**

把 `components/NewAnalysisForm.tsx` 改成：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, startTransition } from 'react'

// Probe engines are proper nouns (brand names), not translatable copy.
// ChatGPT / Perplexity / Gemini are on by default; Google AI Overviews off —
// mirrors the prototype STEP1 chip state.
const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'Google AI Overviews'] as const
const DEFAULT_ENGINES: Record<string, boolean> = {
  ChatGPT: true,
  Perplexity: true,
  Gemini: true,
  'Google AI Overviews': false,
}

// Screen 1 new-analysis form. Client leaf: chip selection + GSC toggle are
// controlled state; submit creates a real project + run and navigates to it.
export function NewAnalysisForm({ locale }: { locale: string }) {
  const t = useTranslations('screen1')
  const router = useRouter()
  const industryOptions = t.raw('industryOptions') as string[]
  const marketOptions = t.raw('marketOptions') as string[]
  const [engines, setEngines] = useState<Record<string, boolean>>(DEFAULT_ENGINES)
  const [gsc, setGsc] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleEngine(name: string) {
    setEngines((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const domain = String(form.get('url') ?? '')
    const industry = String(form.get('industry') ?? '')
    const market = String(form.get('market') ?? '')

    setError(null)
    setPending(true)
    startTransition(async () => {
      try {
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ domain, industry, market }),
        })
        if (!projectRes.ok) throw new Error('project_create_failed')
        const project = await projectRes.json()

        const runRes = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, runType: 'baseline' }),
        })
        if (!runRes.ok) throw new Error('run_create_failed')
        const run = await runRes.json()

        router.push(`/${locale}/runs/${run.id}`)
      } catch {
        setError(t('submitError'))
        setPending(false)
      }
    })
  }

  return (
    <section className="screen">
      <p className="intro">{t('intro')}</p>

      <form className="card" style={{ padding: '22px' }} onSubmit={handleSubmit}>
        <div className="field">
          <label>{t('urlLabel')}</label>
          <input
            name="url"
            className="url-in"
            defaultValue="https://teamflow.cn"
            aria-label={t('urlLabel')}
          />
        </div>

        <div className="row2">
          <div className="field">
            <label>{t('industryLabel')}</label>
            <select name="industry" className="sel" aria-label={t('industryLabel')}>
              {industryOptions.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('marketLabel')}</label>
            <select name="market" className="sel" aria-label={t('marketLabel')}>
              {marketOptions.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>{t('competitorsLabel')}</label>
          <input className="txt" placeholder={t('competitorsPlaceholder')} />
        </div>

        <div className="field">
          <label>{t('enginesLabel')}</label>
          <div className="chips">
            {ENGINES.map((name) => (
              <label key={name} className={`chip${engines[name] ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={engines[name]}
                  onChange={() => toggleEngine(name)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{t('dataSourceLabel')}</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={gsc}
              onChange={() => setGsc((v) => !v)}
              aria-label={t('gscTitle')}
              style={{ accentColor: 'var(--measured)', width: 17, height: 17 }}
            />
            <div>
              <div className="t">{t('gscTitle')}</div>
              <div className="d">{t('gscDesc')}</div>
            </div>
          </div>
        </div>

        <button type="submit" className="run-btn" disabled={pending}>
          {pending ? t('starting') : t('run')}
        </button>
        {error && <p className="note" style={{ color: 'var(--ds-error, red)' }}>{error}</p>}
      </form>

      <div className="note">{t('note')}</div>
    </section>
  )
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run components/NewAnalysisForm.test.tsx
```

Expected: PASS（2 个用例全绿）。

- [ ] **Step 6: Commit**

```bash
git add components/NewAnalysisForm.tsx components/NewAnalysisForm.test.tsx messages/en.json messages/zh.json
git commit -m "feat(sp2): 屏1 接通端到端真实链路（创建 project/run 后跳转诊断台）"
```

---

### Task 15：全量回归 + 手动端到端验证 + 文档收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md`（路线图表格 SP2 行标注完成状态，可选）

本任务不新增业务代码，是 SP2 的 DoD 收尾检查——把之前几个任务里"留给这里核实"的行为实际跑一遍。

- [ ] **Step 1: 全量自动化测试 + 类型检查 + lint**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: 三者全绿。

- [ ] **Step 2: 起 Inngest Dev Server（另开一个终端）**

```bash
npx inngest-cli@latest dev
```

Expected: 控制台打印本地 Dev Server 地址（默认 `http://localhost:8288`），且发现 `app/api/inngest/route.ts` 暴露的 `collect-evidence` 函数。

- [ ] **Step 3: 起 Next dev server（第二个终端）**

```bash
npm run dev
```

- [ ] **Step 4: 手动跑一次端到端采集（第三个终端）**

```bash
curl -s -X POST http://localhost:3000/api/projects \
  -H 'content-type: application/json' \
  -d '{"domain":"https://example.com","industry":"B2B SaaS","market":"zh"}'
```

记下返回的 `id`（记作 `PROJECT_ID`），再：

```bash
curl -s -X POST http://localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"runType\":\"baseline\"}"
```

记下返回的 `id`（记作 `RUN_ID`）。

- [ ] **Step 5: 核实 SSE 进度**

```bash
curl -N http://localhost:3000/api/runs/$RUN_ID/events
```

Expected: 依次看到 `data: {"type":"progress","pct":10}` → `evidence_created` → `progress":40` → …→ `data: {"type":"done"}`。若卡住不动，去 Inngest Dev Server 的网页 UI（`http://localhost:8288`）看 `collect-evidence` 函数的执行日志定位失败的 step。

- [ ] **Step 6: 核实 run 状态与证据落库**

```bash
curl -s http://localhost:3000/api/runs/$RUN_ID | grep -o '"status":"[a-z]*"'
curl -s http://localhost:3000/api/runs/$RUN_ID/evidence | grep -o '"type":"[a-z_]*"'
```

Expected: `"status":"collected"`；证据列表里出现 `page_fetch`、`schema`、`render_check` 三种 `type`，各一条。

- [ ] **Step 7: 核实 SSRF 守卫生效**

```bash
curl -s -X POST http://localhost:3000/api/projects -H 'content-type: application/json' -d '{"domain":"http://169.254.169.254"}'
# 记下新 PROJECT_ID2，再建一个 run：
curl -s -X POST http://localhost:3000/api/runs -H 'content-type: application/json' -d "{\"projectId\":\"$PROJECT_ID2\",\"runType\":\"baseline\"}"
curl -s http://localhost:3000/api/runs/<刚才返回的 RUN_ID2> | grep -o '"status":"[a-z]*"'
```

Expected: run 最终 `"status":"failed"`（SSRF 守卫拦截了云元数据地址）。

- [ ] **Step 8: 核实屏1 端到端可点**

浏览器打开 `http://localhost:3000/zh`，在表单里填一个真实可访问的域名，点「开始诊断」，确认页面跳转到 `/zh/runs/<新 run id>`。

- [ ] **Step 9: 若 `onFailure` 解包路径与实测不符，按日志修正**

Task 11 里 `onFailure` 从 `event.data.event.data.runId` 取原始 run id，这个嵌套路径是按 Inngest `inngest/function.failed` 事件的通常形状写的。强制制造一次瞬时失败（比如临时把 `CLOUDFLARE_API_TOKEN` 改成无效值触发 render-check 报错，重试 3 次耗尽），观察 Inngest Dev Server 网页 UI（`http://localhost:8288`）里 `collect-evidence` 函数失败事件的 payload 结构：如果字段路径和 `lib/inngest/collect-evidence.ts` 里 `onFailure` 的 `original.data.runId` 不一致，照日志里的真实结构改这一行取值路径，其余逻辑不变。

- [ ] **Step 10: Commit（若第 9 步有改动）**

```bash
git add lib/inngest/collect-evidence.ts
git commit -m "fix(sp2): 修正 onFailure 里原始事件的取值路径"
```

- [ ] **Step 11: SP2 完成，更新 SP1 设计文档的路线图状态（可选）**

在 `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md` 的 §2 路线图表格里，`SP2` 那一行末尾加注 `（已完成，见 2026-07-01-sp2-evidence-collection-design.md）`。

```bash
git add docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md
git commit -m "docs(sp2): 路线图标注 SP2 完成"
```
