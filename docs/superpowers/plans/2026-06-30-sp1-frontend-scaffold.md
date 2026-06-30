# SP1：前端骨架 + 数据底座 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **每个写 .ts/.tsx 的任务开始前，先读 `veris-coding` skill。** 本计划所有前端代码已按 Next 16 / React 19 写法编写。

**Goal:** 用 Next.js 16 全栈初始化 Veris，交付可 `dev` 跑起来的 4 屏 UI（en/zh 双语）、libSQL 数据模型（§6 表 + §6.2 约束）、与 §7 契约一致的 API 桩，全部由类型化 seed 数据驱动。

**Architecture:** 单一 TypeScript 全栈，部署 Vercel。Server Component 默认渲染，交互下沉到客户端叶子组件。Server Component 与 API Route 共用 `lib/repositories` 数据访问层；本轮 repositories 读 libSQL seed 数据。证据等级（L0–L4）与 `claim_type` 贯穿数据约束与 UI 标签，是产品护城河。

**Tech Stack:** Next.js 16（App Router）· React 19 · TypeScript 5.x · Tailwind v4 · libSQL（`@libsql/client`）+ Drizzle ORM · next-intl（en/zh）· Vitest + @testing-library/react。

## Global Constraints

- 前端固定 **Next.js 16 App Router + React 19**：`params`/`searchParams`/`cookies()`/`headers()` 一律 `await`；转发 ref 用普通 `ref` prop，**禁止 `forwardRef`**；默认 Server Component，`'use client'` 只下沉到交互叶子；`package.json` 脚本**不加** `--turbopack`；变更数据用 Server Action + `revalidatePath`，不另起 `/api` 提交。
- Context Provider 写 `<Ctx value={x}>`，不写 `<Ctx.Provider>`；表单状态用 `useActionState`/`useFormStatus`/`useOptimistic`。
- 运行环境 Node ≥ 20.9、TypeScript ≥ 5.1。
- **证据先于结论**：finding 必须带非空 `evidence_refs` + `claim_type`；`measured_hard` 必须有 ≥1 个 L4 证据；`measured_sample` 必须有关联 probe/SERP 样本。
- **人在环内**：只有 `recommendations.status ∈ {accepted, edited}` 才能生成 `generated_prompts`。
- **证据不可变**：写入即存原始 payload + `captured_at` + 工具版本 + hash，无更新路径；删项目级联删除（FK `ON DELETE CASCADE`）。
- §6.2 约束写进 schema（CHECK/FK）+ 数据访问层校验器，不靠 UI 兜底。
- 文案：`实测`=L3/L4，`推断`=L2，`疑似`=L1/L2；禁止把 L2 写成确定因果。全部 UI 文案外置到 `messages/{en,zh}.json`，组件不写死中文。
- 默认 locale = `zh`，支持 `en`；路由走 `app/[locale]/`。

---

### Task 1: 脚手架、依赖、配置与文档同步

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `drizzle.config.ts`, `vitest.config.ts`, `app/[locale]/layout.tsx`(占位), `app/[locale]/page.tsx`(占位)
- Modify: `CLAUDE.md`, `docs/plan-ux.md`（§4.1 技术栈表）, `.claude/skills/veris-coding/SKILL.md`

**Interfaces:**
- Produces: 可构建的 Next 16 工程；脚本 `dev`/`build`/`start`/`test`/`db:push`/`db:seed`。

- [ ] **Step 1: 初始化工程**

在仓库根（`/Users/gongchunming/Public/website/seo-tools`）执行。先确认 Node ≥ 20.9（`node -v`）。

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm
```
若交互提示已存在文件，保留现有 `docs/`、`CLAUDE.md`、`.claude/`、`.git/`。

- [ ] **Step 2: 安装依赖**

```bash
npm i drizzle-orm @libsql/client next-intl
npm i -D drizzle-kit vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: 写 `package.json` scripts**（不加 `--turbopack`）

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx db/seed.ts"
  }
}
```
补装 `npm i -D tsx`。

- [ ] **Step 4: `next.config.ts` 接 next-intl 插件**

```ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
const nextConfig: NextConfig = {}
export default withNextIntl(nextConfig)
```

- [ ] **Step 5: `.env.example` 与 `drizzle.config.ts`**

```bash
# .env.example
LIBSQL_URL=file:./veris.db
LIBSQL_AUTH_TOKEN=
```
```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'turso',
  dbCredentials: { url: process.env.LIBSQL_URL!, authToken: process.env.LIBSQL_AUTH_TOKEN },
})
```
把 `veris.db`、`.env` 加进 `.gitignore`。

- [ ] **Step 6: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'] },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
})
```
`vitest.setup.ts`：`import '@testing-library/jest-dom'`。

- [ ] **Step 7: 同步文档与 skill 的技术栈**

修改三处，把 Python/FastAPI/PostgreSQL 改为本项目实际栈：
- `docs/plan-ux.md` §4.1 表：前端→`Next.js 16 全栈`；后端→`同前端（Next Route Handlers / Server Actions）`；异步→`Inngest（Vercel）`；数据库→`libSQL (Turso)`；页面检测→`托管浏览器 API（Vercel 不能自带 chromium）`。加一行注：「技术栈已于 SP1 收敛为单一 TS 全栈 + Vercel，详见 `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md`」。
- `CLAUDE.md`「Planned architecture」段：后端由 Python+FastAPI 改为 Next 全栈；DB 由 PostgreSQL 改为 libSQL；新增 Vercel 部署约束。
- `.claude/skills/veris-coding/SKILL.md`：标题与「后端 FastAPI 规范」整段替换为「后端 = Next Route Handlers / Server Actions（TS）；数据库 libSQL；渲染走托管浏览器 API；长任务用 Inngest」。保留 Next 16 / React 19 规范与项目铁律。

- [ ] **Step 8: 验证构建**

Run: `npm run build`
Expected: 构建成功（占位首页）。

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(sp1): scaffold Next 16 fullstack + libSQL/i18n tooling, sync stack docs"
```

---

### Task 2: CSS 变量主题与全局样式

**Files:**
- Modify: `app/globals.css`
- Create: `app/[locale]/layout.tsx`（字体 + 外壳）

**Interfaces:**
- Produces: CSS 变量 `--measured/--inferred/--gap/--good`（含 `-bg`）、`--ink*`、`--line*`、`--radius`、字体变量，供全部组件用。

- [ ] **Step 1: 写主题变量到 `globals.css`**（照 `docs/plan-d.md` `:root`）

```css
@import "tailwindcss";

:root{
  --paper:#EEF2F4; --surface:#FFFFFF; --surface-2:#F5F8F9;
  --ink:#15191F; --ink-soft:#5C6672; --ink-faint:#8B96A3;
  --line:#D9E0E6; --line-soft:#E8EDF1;
  --measured:#0B6E74; --measured-bg:#E2F1F1;
  --inferred:#B26B16; --inferred-bg:#F7EEDF;
  --gap:#B23A48; --gap-bg:#F8E7E9;
  --good:#2E7D56; --good-bg:#E3F1E9;
  --radius:10px;
  --display:'Space Grotesk','Noto Sans SC',sans-serif;
  --body:'Inter','Noto Sans SC',sans-serif;
  --mono:'JetBrains Mono','Noto Sans SC',monospace;
}
body{background:var(--paper);color:var(--ink);font-family:var(--body);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--display);font-weight:600;letter-spacing:-.01em}
.mono{font-family:var(--mono)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```

- [ ] **Step 2: `app/[locale]/layout.tsx` 引字体 + 外壳**

用 `next/font/google` 引 Space Grotesk / Inter / JetBrains Mono / Noto Sans SC，挂到 `<body>`。注意 Next 16：`params` 是 Promise。

```tsx
import type { ReactNode } from 'react'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import './globals.css'

export default async function LocaleLayout({
  children, params,
}: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 验证**：`npm run dev`，页面背景为 `--paper` 灰。Commit：`style(sp1): prototype theme tokens + fonts shell`。

---

### Task 3: i18n 配置与文案目录

**Files:**
- Create: `i18n/routing.ts`, `i18n/request.ts`, `middleware.ts`, `messages/en.json`, `messages/zh.json`
- Create: `components/LocaleSwitch.tsx`

**Interfaces:**
- Produces: `routing`（`{locales:['zh','en'], defaultLocale:'zh'}`）；`messages` 命名空间 `common/screen1/screen2/screen3/screen4/evidence`。
- Consumes（后续任务）：`useTranslations(ns)` / `getTranslations`。

- [ ] **Step 1: `i18n/routing.ts`**

```ts
import { defineRouting } from 'next-intl/routing'
export const routing = defineRouting({ locales: ['zh', 'en'], defaultLocale: 'zh' })
```

- [ ] **Step 2: `i18n/request.ts`**

```ts
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  return { locale, messages: (await import(`../messages/${locale}.json`)).default }
})
```

- [ ] **Step 3: `middleware.ts`**

```ts
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
export default createMiddleware(routing)
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] }
```

- [ ] **Step 4: 写 `messages/zh.json` 与 `messages/en.json`**

把 4 屏所有可见文案外置。**§5.3 文案修正在两套语言都要落实**。示例（节选，需补全 4 屏）：

```jsonc
// messages/zh.json
{
  "common": { "appName": "Veris", "tagline": "SEO · GEO 诊断台",
    "steps": { "new": "新建分析", "diagnose": "诊断", "recommend": "优化建议", "output": "输出" },
    "tag": { "measured": "实测", "inferred": "推断", "gap": "差距", "good": "已具备", "directional": "方向性样本" } },
  "screen2": {
    "findingJsRender": "核心落地页 /features 内容靠 JS 渲染，非渲染抓取链路读不到初始正文",
    "findingLowCtr": "12 个词已有曝光但 CTR 异常低，疑似受 AI Overviews / SERP 特性影响" }
}
```
```jsonc
// messages/en.json
{
  "common": { "appName": "Veris", "tagline": "SEO · GEO Diagnostics",
    "steps": { "new": "New analysis", "diagnose": "Diagnose", "recommend": "Recommendations", "output": "Output" },
    "tag": { "measured": "Measured", "inferred": "Inferred", "gap": "Gap", "good": "OK", "directional": "Directional sample" } },
  "screen2": {
    "findingJsRender": "Key landing page /features renders via JS; the non-rendered crawl path can't read its initial body text",
    "findingLowCtr": "12 queries have impressions but abnormally low CTR; suspected SERP/AIO influence" }
}
```

- [ ] **Step 5: `components/LocaleSwitch.tsx`**（客户端叶子，用 next-intl 导航）

```tsx
'use client'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'

export function LocaleSwitch() {
  const locale = useLocale(); const pathname = usePathname(); const router = useRouter()
  const next = locale === 'zh' ? 'en' : 'zh'
  const swap = () => router.push(pathname.replace(`/${locale}`, `/${next}`))
  return <button className="ghost" onClick={swap}>{next.toUpperCase()}</button>
}
```

- [ ] **Step 6: 验证 + Commit**：`/zh` 与 `/en` 都可访问，切换按钮工作。`feat(sp1): next-intl en/zh routing + message catalogs`。

---

### Task 4: 领域类型 `lib/types.ts`

**Files:**
- Create: `lib/types.ts`, `lib/types.test.ts`

**Interfaces:**
- Produces: `ClaimType`、`EvidenceLevel`、`RunStatus`、`RecommendationStatus`、`FindingSide`、`EvidenceType`、`BrandFactStatus`，以及 §6 各实体的 TS interface（`Project`/`Run`/`Finding`/`Recommendation`/`EvidenceArtifact`/`AiProbeResult`/`BrandFact`/`GeneratedPrompt`/`Prompt`/`RetestSnapshot`）。

- [ ] **Step 1: 写失败测试 `lib/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { CLAIM_TYPES, EVIDENCE_LEVELS, isMeasured } from '@/lib/types'

describe('domain types', () => {
  it('claim types match the spec set', () => {
    expect(CLAIM_TYPES).toEqual(['hypothesis', 'inferred', 'measured_sample', 'measured_hard'])
  })
  it('evidence levels are L0..L4', () => {
    expect(EVIDENCE_LEVELS).toEqual(['L0', 'L1', 'L2', 'L3', 'L4'])
  })
  it('only measured_* claim types count as measured', () => {
    expect(isMeasured('measured_sample')).toBe(true)
    expect(isMeasured('measured_hard')).toBe(true)
    expect(isMeasured('inferred')).toBe(false)
    expect(isMeasured('hypothesis')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**：`npm run test -- lib/types.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 写 `lib/types.ts`**

```ts
export const CLAIM_TYPES = ['hypothesis', 'inferred', 'measured_sample', 'measured_hard'] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const EVIDENCE_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'] as const
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]

export const RECOMMENDATION_STATUSES = ['draft', 'accepted', 'edited', 'rejected'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export type RunStatus = 'draft' | 'collecting' | 'diagnosing' | 'reviewing' | 'output' | 'failed'
export type FindingSide = 'seo' | 'geo' | 'technical'
export type EvidenceType = 'gsc' | 'ai_answer' | 'page_fetch' | 'render_check' | 'schema' | 'serp_snapshot' | 'manual'
export type BrandFactStatus = 'verified' | 'draft' | 'retired'

export const isMeasured = (c: ClaimType): boolean => c === 'measured_sample' || c === 'measured_hard'

// §6 实体（字段照 plan-ux.md §6.1；JSON 字段在 TS 侧是已解析对象/数组）
export interface EvidenceArtifact {
  id: string; projectId: string; runId: string; type: EvidenceType
  claimLevel: EvidenceLevel; source: string; capturedAt: string
  request: unknown; payload: unknown; rawText: string; rawHash: string; parserVersion: string
}
export interface Finding {
  id: string; runId: string; side: FindingSide; title: string; description: string
  severity: 'high' | 'mid' | 'ok'; claimType: ClaimType; confidence: string
  evidenceRefs: string[]; status: 'open' | 'dismissed' | 'converted'
}
export interface Recommendation {
  id: string; runId: string; findingId: string
  what: string; why: string; expectedImpact: string; effort: string; risk: string
  validationMethod: string; priority: string; confidence: string
  status: RecommendationStatus; editedPayload: unknown | null; evidenceRefs: string[]
}
export interface BrandFact {
  id: string; projectId: string; factType: string; factText: string
  sourceUrl: string | null; sourceNote: string | null; status: BrandFactStatus
}
export interface GeneratedPrompt {
  id: string; recommendationId: string; promptType: 'content' | 'technical' | 'brief' | 'cms'
  promptText: string; inputFactRefs: string[]; evidenceRefs: string[]
}
export interface Project { id: string; domain: string; industry: string; market: string; language: string; ownerId: string }
export interface Run { id: string; projectId: string; runType: 'baseline' | 'retest'; status: RunStatus; protocolVersion: string }
export interface AiProbeResult {
  id: string; runId: string; promptId: string; evidenceId: string
  provider: string; modelId: string; runIdx: number
  brandPresent: boolean; targetDomainCited: boolean
  competitorsMentioned: string[]; citedUrls: string[]; sentiment: string
  rawAnswerHash: string; parserVersion: string
}
```

- [ ] **Step 4: 跑测试确认通过**：`npm run test -- lib/types.test.ts` → PASS。

- [ ] **Step 5: Commit**：`feat(sp1): domain types for claim/evidence/§6 entities`。

---

### Task 5: 证据等级 ↔ UI 标签映射 `lib/evidence.ts`

**Files:**
- Create: `lib/evidence.ts`, `lib/evidence.test.ts`

**Interfaces:**
- Consumes: `ClaimType`, `EvidenceLevel`（Task 4）。
- Produces: `provenanceForClaim(claim): {variant:'m'|'i'|'g'|'ok', labelKey:string}`、`labelForLevel(level)`、`assertNoFalseCausal`。变体 `m`=实测(L3/L4)、`i`=推断(L2)、其余按规则。

- [ ] **Step 1: 写失败测试 `lib/evidence.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { provenanceForClaim, labelKeyForLevel } from '@/lib/evidence'

describe('evidence ↔ label mapping (§5.1)', () => {
  it('measured_* → 实测(m)', () => {
    expect(provenanceForClaim('measured_hard').variant).toBe('m')
    expect(provenanceForClaim('measured_sample').variant).toBe('m')
  })
  it('inferred → 推断(i)', () => {
    expect(provenanceForClaim('inferred').variant).toBe('i')
  })
  it('hypothesis → 疑似(i)，不得标实测', () => {
    expect(provenanceForClaim('hypothesis').variant).not.toBe('m')
  })
  it('L3/L4 → measured label key; L2 → inferred', () => {
    expect(labelKeyForLevel('L4')).toBe('common.tag.measured')
    expect(labelKeyForLevel('L2')).toBe('common.tag.inferred')
  })
})
```

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写 `lib/evidence.ts`**

```ts
import type { ClaimType, EvidenceLevel } from './types'

type Variant = 'm' | 'i' | 'g' | 'ok'

export function provenanceForClaim(claim: ClaimType): { variant: Variant; labelKey: string } {
  switch (claim) {
    case 'measured_hard':
    case 'measured_sample': return { variant: 'm', labelKey: 'common.tag.measured' }
    case 'inferred': return { variant: 'i', labelKey: 'common.tag.inferred' }
    case 'hypothesis': return { variant: 'i', labelKey: 'common.tag.suspected' }
  }
}

export function labelKeyForLevel(level: EvidenceLevel): string {
  if (level === 'L4' || level === 'L3') return 'common.tag.measured'
  if (level === 'L2') return 'common.tag.inferred'
  return 'common.tag.suspected'
}
```
补 `messages/*.json` 的 `common.tag.suspected`（zh:「疑似」/ en:「Suspected」）。

- [ ] **Step 4: 跑确认通过。Commit**：`feat(sp1): evidence-level to UI label mapping`。

---

### Task 6: libSQL Drizzle schema（§6 全部表）

**Files:**
- Create: `db/schema.ts`, `db/client.ts`

**Interfaces:**
- Produces: Drizzle 表对象 `projects/projectSettings/brandFacts/runs/prompts/evidenceArtifacts/aiProbeResults/findings/recommendations/generatedPrompts/retestSnapshots`；`db`（Drizzle 实例）。

- [ ] **Step 1: `db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const client = createClient({ url: process.env.LIBSQL_URL ?? 'file:./veris.db', authToken: process.env.LIBSQL_AUTH_TOKEN })
export const db = drizzle(client, { schema })
```

- [ ] **Step 2: `db/schema.ts`**（§6.1 全部表 + §6.2 的 CHECK/FK；JSON 用 `text({mode:'json'})`）

```ts
import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  industry: text('industry').notNull().default(''),
  market: text('market').notNull().default(''),
  language: text('language').notNull().default(''),
  ownerId: text('owner_id').notNull().default('local'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})

export const projectSettings = sqliteTable('project_settings', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  gscConnected: integer('gsc_connected', { mode: 'boolean' }).notNull().default(false),
  defaultModels: text('default_models', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  probeN: integer('probe_n').notNull().default(5),
  marketLocation: text('market_location').notNull().default(''),
  cachePolicy: text('cache_policy').notNull().default('default'),
})

export const brandFacts = sqliteTable('brand_facts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  factType: text('fact_type').notNull(),
  factText: text('fact_text').notNull(),
  sourceUrl: text('source_url'),
  sourceNote: text('source_note'),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [check('brand_facts_status', sql`${t.status} in ('verified','draft','retired')`)])

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  runType: text('run_type').notNull().default('baseline'),
  status: text('status').notNull().default('draft'),
  protocolVersion: text('protocol_version').notNull().default('v2'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
}, (t) => [
  check('runs_type', sql`${t.runType} in ('baseline','retest')`),
  check('runs_status', sql`${t.status} in ('draft','collecting','diagnosing','reviewing','output','failed')`),
])

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  intent: text('intent').notNull().default(''),
  source: text('source').notNull().default(''),
  market: text('market').notNull().default(''),
  language: text('language').notNull().default(''),
  priority: integer('priority').notNull().default(0),
})

export const evidenceArtifacts = sqliteTable('evidence_artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  claimLevel: text('claim_level').notNull(),
  source: text('source').notNull().default(''),
  capturedAt: text('captured_at').notNull().default(sql`(current_timestamp)`),
  request: text('request', { mode: 'json' }),
  payload: text('payload', { mode: 'json' }),
  rawText: text('raw_text').notNull().default(''),
  rawHash: text('raw_hash').notNull(),
  parserVersion: text('parser_version').notNull().default('v0'),
}, (t) => [
  check('evidence_type', sql`${t.type} in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual')`),
  check('evidence_level', sql`${t.claimLevel} in ('L1','L2','L3','L4')`),
])

export const aiProbeResults = sqliteTable('ai_probe_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  promptId: text('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  evidenceId: text('evidence_id').notNull().references(() => evidenceArtifacts.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  runIdx: integer('run_idx').notNull(),
  brandPresent: integer('brand_present', { mode: 'boolean' }).notNull().default(false),
  targetDomainCited: integer('target_domain_cited', { mode: 'boolean' }).notNull().default(false),
  competitorsMentioned: text('competitors_mentioned', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  citedUrls: text('cited_urls', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  sentiment: text('sentiment').notNull().default('neutral'),
  rawAnswerHash: text('raw_answer_hash').notNull(),
  parserVersion: text('parser_version').notNull().default('v0'),
})

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  side: text('side').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  severity: text('severity').notNull().default('mid'),
  claimType: text('claim_type').notNull(),
  confidence: text('confidence').notNull().default(''),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status').notNull().default('open'),
}, (t) => [
  check('findings_side', sql`${t.side} in ('seo','geo','technical')`),
  check('findings_claim', sql`${t.claimType} in ('hypothesis','inferred','measured_sample','measured_hard')`),
  check('findings_status', sql`${t.status} in ('open','dismissed','converted')`),
  // §6.2：evidence_refs 非空（JSON 数组长度 > 0）
  check('findings_evidence_nonempty', sql`json_array_length(${t.evidenceRefs}) > 0`),
])

export const recommendations = sqliteTable('recommendations', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  findingId: text('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
  what: text('what').notNull(),
  why: text('why').notNull().default(''),
  expectedImpact: text('expected_impact').notNull().default(''),
  effort: text('effort').notNull().default(''),
  risk: text('risk').notNull().default(''),
  validationMethod: text('validation_method').notNull().default(''),
  priority: text('priority').notNull().default('P2'),
  confidence: text('confidence').notNull().default(''),
  status: text('status').notNull().default('draft'),
  editedPayload: text('edited_payload', { mode: 'json' }),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull(),
}, (t) => [check('rec_status', sql`${t.status} in ('draft','accepted','edited','rejected')`)])

export const generatedPrompts = sqliteTable('generated_prompts', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id').notNull().references(() => recommendations.id, { onDelete: 'cascade' }),
  promptType: text('prompt_type').notNull(),
  promptText: text('prompt_text').notNull(),
  inputFactRefs: text('input_fact_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  evidenceRefs: text('evidence_refs', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, (t) => [check('gp_type', sql`${t.promptType} in ('content','technical','brief','cms')`)])

export const retestSnapshots = sqliteTable('retest_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  baselineRunId: text('baseline_run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  retestRunId: text('retest_run_id').references(() => runs.id, { onDelete: 'cascade' }),
  metricName: text('metric_name').notNull(),
  baselineValue: text('baseline_value').notNull().default(''),
  retestValue: text('retest_value').notNull().default(''),
  delta: text('delta').notNull().default(''),
  interpretation: text('interpretation').notNull().default(''),
})
```

- [ ] **Step 3: 生成并应用 schema**

Run: `npm run db:push`（先 `cp .env.example .env`）
Expected: 表创建成功，无报错。

- [ ] **Step 4: Commit**：`feat(sp1): libSQL schema for §6 tables + §6.2 CHECK/FK`。

---

### Task 7: 数据访问层 + §6.2 不变量校验器（含护城河单测）

**Files:**
- Create: `lib/repositories/index.ts`, `lib/repositories/validators.ts`, `lib/repositories/validators.test.ts`

**Interfaces:**
- Consumes: `db`（Task 6）、类型（Task 4）。
- Produces:
  - `getRun(id)`, `getFindings(runId)`, `getRecommendations(runId)`, `getEvidence(id)`, `getProject(id)`, `getBrandFacts(projectId)`。
  - 校验器（写入前调用，违反即 `throw`）：
    - `assertFindingClaimEvidence({claimType, evidenceLevels})` — `measured_hard` 需含 `L4`；`measured_sample` 需含 `L3|L4`（probe/SERP 样本）。
    - `assertCanGeneratePrompt(recStatus)` — 仅 `accepted|edited` 通过。
    - `assertInputFactsVerified(facts)` — 全部 `status==='verified'`。

- [ ] **Step 1: 写失败测试 `lib/repositories/validators.test.ts`**（护城河，**必须先写**）

```ts
import { describe, it, expect } from 'vitest'
import { assertCanGeneratePrompt, assertFindingClaimEvidence, assertInputFactsVerified } from '@/lib/repositories/validators'

describe('§6.2 invariants', () => {
  it('non accepted/edited recommendation cannot generate prompt', () => {
    expect(() => assertCanGeneratePrompt('draft')).toThrow()
    expect(() => assertCanGeneratePrompt('rejected')).toThrow()
    expect(() => assertCanGeneratePrompt('accepted')).not.toThrow()
    expect(() => assertCanGeneratePrompt('edited')).not.toThrow()
  })
  it('measured_hard finding requires an L4 evidence', () => {
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_hard', evidenceLevels: ['L2', 'L3'] })).toThrow()
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_hard', evidenceLevels: ['L4'] })).not.toThrow()
  })
  it('measured_sample finding requires a sampled (L3/L4) evidence', () => {
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_sample', evidenceLevels: ['L1'] })).toThrow()
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_sample', evidenceLevels: ['L3'] })).not.toThrow()
  })
  it('generated prompt input facts must all be verified', () => {
    expect(() => assertInputFactsVerified([{ status: 'verified' }, { status: 'draft' }])).toThrow()
    expect(() => assertInputFactsVerified([{ status: 'verified' }])).not.toThrow()
  })
})
```

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写 `lib/repositories/validators.ts`**

```ts
import type { ClaimType, EvidenceLevel, RecommendationStatus, BrandFactStatus } from '@/lib/types'

export function assertCanGeneratePrompt(status: RecommendationStatus): void {
  if (status !== 'accepted' && status !== 'edited')
    throw new Error(`recommendation status "${status}" cannot generate prompt (need accepted|edited)`)
}

export function assertFindingClaimEvidence(
  { claimType, evidenceLevels }: { claimType: ClaimType; evidenceLevels: EvidenceLevel[] },
): void {
  if (claimType === 'measured_hard' && !evidenceLevels.includes('L4'))
    throw new Error('measured_hard finding requires at least one L4 evidence')
  if (claimType === 'measured_sample' && !evidenceLevels.some((l) => l === 'L3' || l === 'L4'))
    throw new Error('measured_sample finding requires a sampled (L3/L4) evidence')
}

export function assertInputFactsVerified(facts: { status: BrandFactStatus }[]): void {
  if (!facts.every((f) => f.status === 'verified'))
    throw new Error('generated_prompts.input_fact_refs must reference verified brand_facts only')
}
```

- [ ] **Step 4: 跑确认通过。**

- [ ] **Step 5: 写 `lib/repositories/index.ts`**（读取函数，Drizzle 查询）

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, evidenceArtifacts, projects, brandFacts } from '@/db/schema'

export const getRun = (id: string) => db.query.runs.findFirst({ where: eq(runs.id, id) })
export const getProject = (id: string) => db.query.projects.findFirst({ where: eq(projects.id, id) })
export const getFindings = (runId: string) => db.select().from(findings).where(eq(findings.runId, runId))
export const getRecommendations = (runId: string) => db.select().from(recommendations).where(eq(recommendations.runId, runId))
export const getEvidence = (id: string) => db.query.evidenceArtifacts.findFirst({ where: eq(evidenceArtifacts.id, id) })
export const getBrandFacts = (projectId: string) => db.select().from(brandFacts).where(eq(brandFacts.projectId, projectId))
export * from './validators'
```

- [ ] **Step 6: Commit**：`feat(sp1): data-access layer + §6.2 invariant validators (tested)`。

---

### Task 8: seed 数据（teamflow.cn 完整一套 run）

**Files:**
- Create: `db/seed.ts`, `lib/fixtures.ts`

**Interfaces:**
- Consumes: schema（Task 6）、validators（Task 7）。
- Produces: 一个 project `teamflow`、一个 baseline run `run_demo`、20 prompts、若干 evidence/finding/recommendation/brand_fact，与原型 `plan-d.md` 数据一致。`lib/fixtures.ts` 导出 `DEMO_RUN_ID = 'run_demo'`、`DEMO_PROMPTS`（20 条出现地图数据）。

- [ ] **Step 1: `lib/fixtures.ts`** —— 把原型 `<script>` 里的 20 条 prompts 数组（含 `[问题, 是否出现]`）与 SoV 数据搬成类型化常量。

```ts
export const DEMO_RUN_ID = 'run_demo'
export const DEMO_PROJECT_ID = 'teamflow'
export const DEMO_PROMPTS: { text: string; present: boolean }[] = [
  { text: '适合小团队的项目管理工具推荐', present: false },
  { text: 'best project management tool for small teams', present: false },
  // …补全 20 条，照 plan-d.md prompts 数组
]
export const DEMO_SOV = [
  { name: 'teamflow', pct: 30, you: true }, { name: 'Asana', pct: 70, you: false },
  { name: 'Notion', pct: 55, you: false }, { name: 'Monday.com', pct: 45, you: false },
]
```

- [ ] **Step 2: `db/seed.ts`** —— 幂等插入（先 `delete` 再 `insert`）。每条 finding 带非空 `evidenceRefs`；写入前对 measured finding 跑 `assertFindingClaimEvidence`。至少覆盖原型 4 条 finding：
  - JS 渲染（`technical`, `measured_hard`, evidence=render_check L4）
  - 选型类缺席（`geo`, `measured_sample`, evidence=ai_answer L3）
  - 高曝光低 CTR（`seo`, `inferred`, evidence=gsc L2 — 注意文案「疑似受 SERP 特性影响」）
  - 品牌词正面（`geo`, `measured_sample`, evidence=ai_answer L3, severity ok）

  3 条 recommendation（P1 SSR 改造=accepted、P1 选型内容=edited、P2 FAQ schema=draft）。brand_facts 含 verified 的 teamflow 事实（免费档 10 人 / 看板+甘特 / ¥29 起）。

```ts
import { db } from './client'
import { projects, runs, findings, recommendations, evidenceArtifacts, brandFacts, prompts } from './schema'
import { assertFindingClaimEvidence } from '@/lib/repositories/validators'
import { DEMO_PROJECT_ID, DEMO_RUN_ID, DEMO_PROMPTS } from '@/lib/fixtures'
// … 构造行对象；measured finding 入库前：
//   assertFindingClaimEvidence({ claimType:'measured_hard', evidenceLevels:['L4'] })
// 全部 insert 包在一次性 delete→insert，保证可重复执行。
```

- [ ] **Step 3: 跑 seed**：`npm run db:seed` → 无报错；`npm run test` 仍全绿。Commit：`feat(sp1): seed teamflow.cn demo run`。

---

### Task 9: 共享 UI 组件

**Files:**
- Create: `components/ProvenanceTag.tsx`, `components/Stepper.tsx`, `components/Shell.tsx`

**Interfaces:**
- Consumes: `provenanceForClaim`（Task 5）、`useTranslations`（Task 3）。
- Produces: `<ProvenanceTag variant labelKey />`、`<Stepper active />`、`<Shell>`（顶栏 + LocaleSwitch + Stepper）。

- [ ] **Step 1: 写 `ProvenanceTag` 冒烟测试 `components/ProvenanceTag.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import { ProvenanceTag } from './ProvenanceTag'

const msgs = { common: { tag: { measured: '实测' } } }
describe('ProvenanceTag', () => {
  it('renders the measured label and variant class', () => {
    render(<NextIntlClientProvider locale="zh" messages={msgs}>
      <ProvenanceTag variant="m" labelKey="common.tag.measured" /></NextIntlClientProvider>)
    expect(screen.getByText('实测')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写 `components/ProvenanceTag.tsx`**（纯展示，可 Server Component；用 `useTranslations` 则需 client——这里用 `getTranslations` 不便于复用，改为接已翻译文本更简单：传 `labelKey` 由父用 `t()` 解析后传 `label`）。最终接口定为：

```tsx
// 由调用方传入已翻译 label，组件本身无 i18n 依赖，可在 Server Component 用
export function ProvenanceTag({ variant, label }: { variant: 'm' | 'i' | 'g' | 'ok'; label: string }) {
  return (
    <span className={`tag ${variant}`}>
      <span className="dot" />{label}
    </span>
  )
}
```
对应 `globals.css` 补 `.tag`/`.tag.m`/`.tag.i`/`.tag.g`/`.tag.ok`/`.dot`（照 `plan-d.md`）。
> 更新 Task 9 Interfaces：`<ProvenanceTag variant label />`，调用方用 `t(provenanceForClaim(x).labelKey)` 得 label。

- [ ] **Step 4: 写 `Stepper`（客户端，路由高亮）与 `Shell`**

```tsx
// components/Stepper.tsx
'use client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
export function Stepper({ active, runId, locale }: { active: 1|2|3|4; runId: string; locale: string }) {
  const t = useTranslations('common.steps')
  const items = [
    { n: 1, key: 'new', href: `/${locale}` },
    { n: 2, key: 'diagnose', href: `/${locale}/runs/${runId}` },
    { n: 3, key: 'recommend', href: `/${locale}/runs/${runId}/recommendations` },
    { n: 4, key: 'output', href: `/${locale}/runs/${runId}/output` },
  ] as const
  return <div className="stepper">{items.map(it =>
    <Link key={it.n} href={it.href} className={`step${it.n===active?' active':''}`}>
      <span className="n">{it.n}</span>{t(it.key)}</Link>)}</div>
}
```
`Shell` 渲染顶栏（brand + 目标域名 + `LocaleSwitch`）+ `Stepper`，`globals.css` 补 `.shell/.topbar/.brand/.stepper/.step` 等（照 `plan-d.md`）。

- [ ] **Step 5: 跑测试通过。Commit**：`feat(sp1): shared shell/stepper/provenance-tag components`。

---

### Task 10: §7 API 桩（Route Handlers）

**Files:**
- Create: `app/api/runs/[id]/route.ts`, `app/api/runs/[id]/findings/route.ts`, `app/api/runs/[id]/recommendations/route.ts`, `app/api/recommendations/[id]/route.ts`, `app/api/recommendations/[id]/prompt/route.ts`, `app/api/evidence/[id]/route.ts`, `app/api/runs/[id]/events/route.ts`
- Create: `app/api/recommendations/[id]/prompt/route.test.ts`

**Interfaces:**
- Consumes: repositories + validators（Task 7）、seed（Task 8）。
- Produces: §7 端点形状。Route Handler 默认不缓存（Next 16），动态读 DB。`POST /recommendations/{id}/prompt` 入库前调 `assertCanGeneratePrompt` + `assertInputFactsVerified`，违反返回 422。

- [ ] **Step 1: 写 prompt 端点契约测试**（Next 16：`params` 是 Promise）

```ts
import { describe, it, expect } from 'vitest'
import { assertCanGeneratePrompt } from '@/lib/repositories/validators'
// 端点级集成测试在无 DB 环境下从 validators 层验证契约：
describe('POST /recommendations/:id/prompt contract', () => {
  it('rejects when recommendation not accepted/edited', () => {
    expect(() => assertCanGeneratePrompt('draft')).toThrow()
  })
})
```

- [ ] **Step 2: 写 `app/api/runs/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getRun } from '@/lib/repositories'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(run)
}
```

- [ ] **Step 3: 写 findings / recommendations / evidence GET 端点**（同构：`await params` → repo → json）。`PATCH /recommendations/[id]` 接收 `{status}`，校验枚举后更新。

- [ ] **Step 4: 写 `app/api/recommendations/[id]/prompt/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { recommendations, brandFacts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { assertCanGeneratePrompt, assertInputFactsVerified } from '@/lib/repositories'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    assertCanGeneratePrompt(rec.status as never)
    // 本轮：input facts 取该项目 verified brand_facts；真实拼装留 SP5
    return NextResponse.json({ ok: true, recommendationId: id, promptType: 'content', promptText: '<stub>' })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
```

- [ ] **Step 5: 写 SSE 桩 `app/api/runs/[id]/events/route.ts`** —— 返回 `text/event-stream`，依次推 `progress`→`finding_created`×N→`done`，间隔 `setTimeout`。

```ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(c) {
      const events = [
        { type: 'progress', pct: 20 }, { type: 'finding_created', side: 'technical' },
        { type: 'progress', pct: 70 }, { type: 'done' },
      ]
      let i = 0
      const tick = () => { if (i >= events.length) return c.close()
        c.enqueue(enc.encode(`data: ${JSON.stringify(events[i++])}\n\n`)); setTimeout(tick, 600) }
      tick()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
}
```

- [ ] **Step 6: 跑测试 + Commit**：`feat(sp1): §7 API route stubs with human-gate enforcement + SSE`。

---

### Task 11: 屏1 新建分析

**Files:**
- Create: `app/[locale]/page.tsx`, `components/NewAnalysisForm.tsx`

**Interfaces:**
- Consumes: `useTranslations('screen1')`、`Shell`。
- Produces: 表单 UI（URL/行业/市场/竞品/探测引擎 chips/GSC toggle/预计耗时与成本/开始诊断）。本轮「开始诊断」`Link` 到 `/${locale}/runs/run_demo`。

- [ ] **Step 1: `app/[locale]/page.tsx`**（Server Component，`params` await）

```tsx
import { Shell } from '@/components/Shell'
import { NewAnalysisForm } from '@/components/NewAnalysisForm'
export default async function NewAnalysisPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return <Shell active={1} locale={locale} runId="run_demo"><NewAnalysisForm locale={locale} /></Shell>
}
```

- [ ] **Step 2: `components/NewAnalysisForm.tsx`** —— 照 `plan-d.md` STEP1 结构（`.url-in/.row2/.chips/.toggle-row/.run-btn`），文案走 `t()`，chips 为受控 `'use client'`。`globals.css` 补对应类。

- [ ] **Step 3: 验证 4 屏外壳渲染 + Commit**：`feat(sp1): screen 1 new-analysis`。

---

### Task 12: 屏2 诊断仪表台

**Files:**
- Create: `app/[locale]/runs/[id]/page.tsx`, `components/StatStrip.tsx`, `components/PresenceMap.tsx`, `components/SovBar.tsx`, `components/FindingList.tsx`, `components/EvidenceDrawer.tsx`
- Create: `components/FindingList.test.tsx`

**Interfaces:**
- Consumes: `getRun/getFindings`（repo）、`getEvidence`、`provenanceForClaim`、`DEMO_PROMPTS/DEMO_SOV`。
- Produces: 4 stat 卡、出现地图（hover tooltip）、SoV 条、问题清单（GEO/SEO tab + 可展开证据抽屉）。

- [ ] **Step 1: 写 `FindingList` 展开测试 `components/FindingList.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FindingCard } from './FindingList'
describe('FindingCard', () => {
  it('toggles evidence drawer on click', () => {
    render(<FindingCard title="t" provVariant="m" provLabel="实测" confidence="" severity="hi">
      <div>evidence-body</div></FindingCard>)
    expect(screen.queryByText('evidence-body')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('evidence-body')).toBeVisible()
  })
})
```

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写组件**（`FindingCard` 用 `'use client'` + `useState(open)`，照 `plan-d.md` `.find/.find-head/.evidence`；`PresenceMap` 照 `<script>` 生成 cell + tooltip；`StatStrip`/`SovBar` 照 STEP2）。stat/finding 文案与证据等级标签走 `provenanceForClaim` + `t()`。

- [ ] **Step 4: `app/[locale]/runs/[id]/page.tsx`**（Server Component，`await params`，从 repo 取 run+findings，传入组件）。

- [ ] **Step 5: 跑测试 + 验证屏2 渲染 + Commit**：`feat(sp1): screen 2 diagnosis dashboard`。

---

### Task 13: 屏3 优化建议（状态机）

**Files:**
- Create: `app/[locale]/runs/[id]/recommendations/page.tsx`, `components/RecCard.tsx`
- Create: `components/RecCard.test.tsx`

**Interfaces:**
- Consumes: `getRecommendations`（repo）、`PATCH /recommendations/[id]`。
- Produces: 建议卡（做什么/为什么/证据/影响/工作量/风险/验证 + 接受/编辑/否决）。`accept`/`reject` 互斥；`edit` 切编辑态。状态变更 `fetch` PATCH + 乐观更新（`useOptimistic`）。

- [ ] **Step 1: 写 `RecCard` 状态机测试 `components/RecCard.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RecCard } from './RecCard'
describe('RecCard accept/reject', () => {
  it('accept and reject are mutually exclusive', () => {
    render(<RecCard id="r1" priority="P1" title="t" fields={{ why:'', evidence:'', impact:'', confidence:'' }} initialStatus="draft" />)
    fireEvent.click(screen.getByRole('button', { name: /接受|accept/i }))
    expect(screen.getByRole('button', { name: /已接受|accepted/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /否决|reject/i }))
    expect(screen.queryByRole('button', { name: /已接受|accepted/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写 `components/RecCard.tsx`**（`'use client'`，`useOptimistic` 管 status，照 `plan-d.md` STEP3 `.rec/.rec-top/.rec-actions/.act`；编辑态显示 `textarea`）。PATCH 到 `/api/recommendations/${id}`。

- [ ] **Step 4: 写 page（Server Component 取 recommendations）。跑测试 + Commit**：`feat(sp1): screen 3 recommendations with human-gate state machine`。

---

### Task 14: 屏4 输出

**Files:**
- Create: `app/[locale]/runs/[id]/output/page.tsx`, `components/PromptCard.tsx`, `components/ReportPanel.tsx`
- Create: `components/PromptCard.test.tsx`

**Interfaces:**
- Consumes: `getRecommendations`（仅 `accepted|edited`）、`getBrandFacts`。
- Produces: 提示词卡（复制按钮，`navigator.clipboard`）、报告面板（摘要 + 导出占位）。**只渲染 accepted/edited 建议对应的提示词**——体现人在环内。

- [ ] **Step 1: 写 `PromptCard` 复制测试**（mock `navigator.clipboard.writeText`，点按钮后文案变「已复制 ✓」）。

- [ ] **Step 2: 跑确认失败。**

- [ ] **Step 3: 写组件**（照 `plan-d.md` STEP4 `.prompt-card/.copy/.report`）。page 过滤 `status ∈ {accepted,edited}` 才出提示词卡。提示词文本本轮取 seed 的样例（含注入的 verified brand facts）。

- [ ] **Step 4: 跑测试 + Commit**：`feat(sp1): screen 4 output prompts + report`。

---

### Task 15: 部署配置与整体验收

**Files:**
- Create: `README.md`（运行/部署说明）, `vercel.json`（如需）
- Modify: `.env.example`（补 Turso 远程示例注释）

**Interfaces:**
- Produces: 可在 Vercel 部署的工程；本地 `dev` 全流程可点通。

- [ ] **Step 1: 写 `README.md`** —— 本地：`cp .env.example .env && npm i && npm run db:push && npm run db:seed && npm run dev`；部署：Vercel 接 Turso（`LIBSQL_URL`/`LIBSQL_AUTH_TOKEN` 环境变量），说明「SP1 不含渲染/长任务，SP2 起需 Node runtime 限制由托管浏览器 API + Inngest 解除」。

- [ ] **Step 2: 全量验收**

Run: `npm run test`（全绿）、`npm run build`（成功）、`npm run dev` 手点 4 屏 + en/zh 切换。
Expected: 满足 spec §8 DoD 全部 6 条。

- [ ] **Step 3: Commit**：`docs(sp1): readme + deploy notes; SP1 done`。

---

## Self-Review（已对照 spec）

- **§1 栈/约束**：Task 1（脚手架 + 文档/skill 同步）、Vercel 约束写进 README（Task 15）。✓
- **§4 数据模型 + §6.2 约束**：Task 6（schema/CHECK/FK）+ Task 7（校验器 + 护城河单测）。✓
- **§5 UI + 多语言**：Task 2/3/9–14；§5.3 文案修正在 Task 3 messages 落实，两语言。✓
- **§5.4 状态机**：Task 13（accept/reject 互斥、仅 accepted/edited 进输出）+ Task 14（输出过滤）。✓
- **§6 API 桩 + 强制状态校验**：Task 10（prompt 端点 422）。✓
- **§7 测试**：Task 4/5/7/9/12/13/14 均 TDD。✓
- **§8 DoD / §9 非目标**：Task 15 验收；真实采集/GSC/探针均未排入，符合非目标。✓
- 类型一致性：`provenanceForClaim` 返回 `{variant,labelKey}`，`ProvenanceTag` 接口在 Task 9 Step 3 明确收敛为 `{variant,label}`（调用方解析 labelKey→label）。✓
