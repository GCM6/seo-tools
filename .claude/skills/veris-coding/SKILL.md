---
name: veris-coding
description: Use when writing, editing, or reviewing ANY code in this repository (the Veris SEO+GEO diagnostic project) — every .ts/.tsx change, frontend or backend, new file or edit. The stack is a single TypeScript fullstack: React 19 + Next.js 16 App Router, backend = Next Route Handlers / Server Actions, libSQL (Turso) via Drizzle, deployed on Vercel. Triggers include: creating components/pages/routes, server actions, data fetching, API endpoints, AI probes, evidence/finding/recommendation logic.
---

# Veris 编码规范（React 19 · Next.js 16 · TS 全栈）

## 概述

本仓库（代号 **Veris**，证据化 SEO + GEO 诊断台）的所有编码都必须命中本规范。整套是**单一 TypeScript 全栈**：前端固定 **React 19 + Next.js 16（App Router）**，后端就是同一个 Next 应用（Route Handlers / Server Actions），数据库 **libSQL (Turso) + Drizzle**，部署在 **Vercel**。模型训练数据里大量是 Next.js ≤14 / React ≤18 的旧写法，**默认会写错版本** —— 编码前先对照本规范。

技术栈与数据模型的权威来源是 `docs/plan-ux.md` 与根目录 `CLAUDE.md`，本 skill 不重复，只补「怎么写代码」。

## 何时使用

- 新建或修改任意 `.tsx` / `.ts` 文件
- 写页面、组件、Server Action、Route Handler、API、AI 探针、证据/finding/建议逻辑
- review 已有代码是否符合版本约定

## 仓库真实结构（写新代码前先对号入座，别凭想象编路径）

仓库已是**实现中的真实代码库**（600+ vitest 测试），不是空脚手架。新写任何东西之前，先看同层邻居文件和 `lib/repositories/`，**很多函数已经存在，别重复造**（例：`assertCanGeneratePrompt` / `assertFindingClaimEvidence` / `assertInputFactsVerified` 都在 `lib/repositories/validators.ts`）。

| 位置 | 放什么 |
|---|---|
| `app/[locale]/…` | 页面（next-intl 路由，locales `['zh','en']`，默认 `zh`；文案在 `messages/zh.json` `en.json`） |
| `app/api/**/route.ts` | Route Handlers |
| `components/` | 组件**平铺**，不建子目录；`PascalCase.tsx` + 同名 `*.test.tsx` |
| `db/schema.ts` `db/client.ts` `db/migrations/` | Drizzle schema（CHECK 约束写在 schema 的 `check()` 里）/ libSQL client / SQL 迁移 |
| `lib/repositories/index.ts` | **所有 DB 读写函数集中在这**；route/Inngest 里优先复用，不散落裸 `db.query` |
| `lib/repositories/validators.ts` | 铁律校验器：**手写 assert 函数，校验失败直接 `throw new Error`**。本项目**没装 Zod**，别 import zod |
| `lib/diagnosis/` | 规则引擎纯函数层：输入 `RuleContext`（纯数据，由证据派生），无 IO；规则分组在 `lib/diagnosis/rules/{technical,content,keywords,authority,geo,competitors}.ts` |
| `lib/probes/providers/` | AI 探针 provider 适配器（openai/gemini/perplexity/deepseek） |
| `lib/inngest/` | 长任务函数 + `client.ts`（带 realtime middleware）+ `channels.ts`（进度广播消息类型） |
| `lib/{collection,crawl,gsc,search,render,…}` | 证据采集工具层，纯函数 + `*.test.ts` 同层共存 |

## 项目铁律（编码时同样适用）

来自 `docs/plan-ux.md`，违反即返工：

1. **证据先于结论**:任何 finding 必须带 `evidence_refs` 和 `claim_type`,代码层面体现为「没有 evidence artifact 就不能落库为 measured finding」。
2. **测量与推断分层**:`claim_type ∈ {hypothesis, inferred, measured_sample, measured_hard}`,类型与 UI 标签一一对应,不得混用。
3. **Agent 是受约束的编排器,不是聊天框**:LLM 只读证据、归纳、起草,**绝不自己补数字**,输出必须过 schema 校验。
4. **人在环内**:只有 `recommendations.status ∈ {accepted, edited}` 才能生成 prompt;默认不自动发布。
5. **证据不可变**:原始响应 + 采集时间 + 工具版本 + hash 一起存,删项目级联删除。
6. 数据库约束(`findings.evidence_refs` 非空、`measured_hard` 必须有 L4 证据等)写进 schema/migration,不靠应用层兜底;应用层的 `validators.ts` 只是快速失败。

## Next.js 16 必守规范

| 项 | 必须这样 | 不要这样（旧版本） |
|---|---|---|
| 请求级 API | `cookies()` `headers()` `draftMode()` 必须 `await`(16 已彻底移除同步访问) | `const c = cookies()` 直接用 |
| `params` / `searchParams` | 是 `Promise<...>`,组件 `async` 并 `await`(详见示例) | 当成同步对象解构 |
| 启动脚本 | `"dev": "next dev"`、`"build": "next build"`,Turbopack 已是默认 | 加 `--turbopack` 标志 |
| 运行环境 | Node ≥ 20.9、TypeScript ≥ 5.1 | 假设 Node 18 可用 |
| 默认组件 | App Router 下默认 Server Component;只有需要交互/state/浏览器 API 才 `'use client'`,且**下沉到叶子组件** | 顶层就 `'use client'` 一刀切 |
| 数据缓存 | 自 15 起 fetch / GET Route Handler / 客户端导航**默认不缓存**;要缓存显式写 `cache: 'force-cache'` 或 `next: { revalidate: N }` | 以为 fetch 默认缓存 |
| 缓存组件 | 用 `cacheComponents: true`(`next.config.ts`)+ `'use cache'` 指令 | 用已废弃的 `experimental.ppr` / `dynamicIO` |
| 变更数据 | Server Action(`'use server'`)+ `revalidatePath` / `revalidateTag` | 自己写 `/api` 再 fetch 提交表单 |

页面读 `searchParams` + cookie 的标准写法:

```tsx
// app/diagnosis/page.tsx — Server Component（默认，无需 'use client'）
import { cookies } from 'next/headers'

export default async function DiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>   // Next 16：Promise
}) {
  const { domain } = await searchParams          // 必须 await
  const theme = (await cookies()).get('theme')?.value ?? 'light'  // 必须 await
  return <main>{domain} · {theme}</main>
}
```

## React 19 必守规范

| 项 | 必须这样 | 不要这样（React ≤18） |
|---|---|---|
| 转发 ref | `ref` 直接当普通 prop 接收 | `forwardRef(...)`（19 已不需要） |
| 读 Promise / Context | `use(promise)` / `use(Context)`(可在条件分支内) | 只用 `useContext`、`useEffect` 拉数据 |
| 表单/提交状态 | Actions:`useActionState`、`useFormStatus`、`useOptimistic`,`startTransition` 支持 async | `useFormState`(已更名)、手搓 loading 布尔 |
| Context Provider | `<ThemeContext value={x}>` | `<ThemeContext.Provider value={x}>` |
| 记忆化 | 优先靠 React Compiler(若已启用),不手动包一堆 | 到处 `useMemo`/`useCallback` 噪音 |

ref 透传的正确写法(对比基线常见错误):

```tsx
// components/Input.tsx
'use client'
import type { InputHTMLAttributes } from 'react'

// React 19：ref 是普通 prop，不要 forwardRef
export function Input({ ref, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}) {
  return <input ref={ref} {...props} />
}
```

## 组件与 i18n / 样式约定

- **UI 文案不硬编码进组件**。两条路：页面/容器组件用 next-intl 的 `t()`；纯展示组件保持 **i18n-free** —— 由调用方 `t()` 解析后把已翻译字符串当 `label` prop 传入（这样组件不带 hook，可直接用于 Server Component）。参考 `components/ProvenanceTag.tsx`。
- 样式：Tailwind v4 + `app/globals.css` 里的**语义类**（如 `.tag` `.dot`、证据等级色）。已有语义类就复用，别在组件里堆一长串调色板 utility。

## 后端规范（Next Route Handlers / Server Actions · TS）

后端 = 同一个 Next 应用,没有独立 Python 服务。约束:

- 后端逻辑写在 **Route Handlers**(`app/**/route.ts`)或 **Server Actions**(`'use server'`),不另起进程 / 框架。
- **Route Handler 既有风格**（照 `app/api/runs/route.ts` 写）:
  - `NextResponse.json(...)`;错误体是 `{ error: 'snake_case短码' }`(如 `not_found` `project_id_required` `invalid_run_type`),**不是中文句子、不是 SCREAMING_CASE**。参数/校验失败 422,不存在 404,下游派发失败 503。
  - 请求体解析:`(await req.json().catch(() => ({}))) as {...}`,逐字段校验。
  - **主键必须显式给**:`` id: `run_${crypto.randomUUID()}` `` 这类前缀式 id,schema 里 `id` 是必填 text 主键,不给会崩。
  - DB 读写优先复用 `lib/repositories/index.ts` 已有函数;批量插入注意**空数组短路**(drizzle `.values([])` 会抛错)。
- 证据采集走工具层(`lib/collection` `lib/crawl` `lib/gsc` `lib/probes` 等),业务逻辑不直接发外部请求。
- 页面渲染检测走**托管浏览器 API**(Vercel serverless 不能自带 chromium,别 `import playwright` 直接跑)。HTML 解析用已装的 `linkedom`。
- **长任务用 Inngest**(Vercel serverless 有超时):采集 / 多模型探针 / 回测这类长流程别堵在请求里,丢给 `lib/inngest/` 的函数跑;进度经 `@inngest/realtime` channel 广播(消息类型钉在 `lib/inngest/channels.ts`)。
- AI 探针每次落库完整协议字段(provider、model_id、版本、参数、prompts、market、run_idx、raw_response、citations、各 hash、parser_version)。原始响应**原样存**,不要只存解析结果。
- LLM 输出与铁律校验用 `lib/repositories/validators.ts` 的**手写 assert 函数**(失败 `throw new Error`);**本项目没装 Zod**,不要 `import { z } from 'zod'`。校验失败即拒绝入库,不静默补默认值。
- 数据库 **libSQL (Turso) + Drizzle**:import 路径是 `@/db/client`(导出 `db`)和 `@/db/schema`;原始证据用 JSON 列存(`text(..., { mode: 'json' }).$type<...>()`);约束写进 schema `check()` + migration。V0 不引入 Redis。
- GSC 一律 OAuth **read-only**。

## 测试与命令（包管理器是 pnpm，别用 npm/npx/yarn）

- 测试框架 **vitest**(jsdom + @testing-library/react),测试文件与源码**同层共存**:`foo.ts` 旁边 `foo.test.ts`,组件 `Foo.tsx` 旁边 `Foo.test.tsx`。**不建 `__tests__/` 目录**。
- 命令:`pnpm test`(= vitest run)/ `pnpm test:watch` / `pnpm lint` / `pnpm build` / `pnpm db:push` / `pnpm db:seed`。单测某文件:`pnpm vitest run lib/xxx.test.ts`。
- 业务逻辑优先写成**纯函数**(参考 `lib/diagnosis/` 的规则引擎:纯数据输入,无 IO),让单测不用 mock DB。
- 注释风格:中文业务注释,关键决策标注 spec 出处(如 `// …（spec §5.1-6）`);简单注释可英文。

## 速查表（每次编码前自检）

- [ ] 这个函数/校验器 `lib/repositories/` 里是不是已经有了?先搜再写。
- [ ] 这是 Server Component 还是 Client Component?默认 Server,`'use client'` 只在必要叶子节点。
- [ ] 用到 `params`/`searchParams`/`cookies`/`headers`/`draftMode` 了吗?**都 await**。
- [ ] 写组件转发 ref 了吗?**用 prop,不用 `forwardRef`**。
- [ ] 提交/变更数据?用 Server Action + revalidate,不另起 `/api`。
- [ ] 组件里有没有硬编码 UI 文案?走 `t()` 或调用方传 label。
- [ ] LLM 产出的字段有没有过 validators 校验、带 `evidence_refs` + `claim_type`?
- [ ] 证据有没有原样存原始响应 + hash?
- [ ] 插入行给 `id` 了吗?错误码是 snake_case 短码吗?测试文件放同层了吗?

## 红旗 —— 出现即停下改写

- 代码里出现 `forwardRef(` → React 19 不需要,改成 `ref` prop。
- `cookies()` / `params` 没有 `await` → Next 16 会直接报错。
- `import { z } from 'zod'` → 项目没装 zod,用 `lib/repositories/validators.ts` 风格的手写 assert。
- `@/lib/db` 这类臆造 import 路径 → 真实是 `@/db/client` `@/db/schema`;写 import 前先看邻居文件。
- route 里裸写一大段 `db.query` → 先查 `lib/repositories/index.ts` 有没有现成函数。
- `npm ` / `npx ` / `yarn ` 开头的命令 → 本仓库用 **pnpm**。
- `components/xxx/` 子目录、`__tests__/` 目录 → 组件平铺,测试同层共存。
- 错误响应写中文句子(`{ error: '不存在' }`)→ snake_case 错误码。
- `package.json` 里加了 `--turbopack` → 16 已默认,删掉。
- `<X.Provider>` → 改 `<X value=…>`。
- LLM 返回值直接写进数字字段、或 finding 没有 `evidence_refs` → 违反「证据先于结论」。
- 注释里写「若你用 Next 14/15…」这种版本含糊措辞 → 本项目就是 Next 16 + React 19,钉死。

## 常见错误对照（基线实测命中）

| 旧写法/臆造写法（会被写出来） | 本项目正确写法 |
|---|---|
| `const Input = forwardRef<HTMLInputElement, P>((props, ref) => …)` | `function Input({ ref, ...props })`,`ref` 当 prop |
| `searchParams: { domain?: string }`（同步） | `searchParams: Promise<{ domain?: string }>` + `await` |
| `const c = cookies(); c.get(...)` | `const c = await cookies()` |
| 顶层 `'use client'` 包整页 | Server Component 默认,交互下沉到子组件 |
| `useFormState` | `useActionState` |
| `GeneratedPromptSchema.safeParse(...)`(Zod) | `assertCanGeneratePrompt(...)` 等手写 assert(已在 validators.ts) |
| 自建 `lib/prompts/guards.ts` 重写状态校验 | 复用 `lib/repositories/validators.ts` 现成函数 |
| `{ error: 'recommendation 不存在', code: 'STATUS_NOT_ALLOWED' }` | `{ error: 'not_found' }` / `{ error: 'status_not_allowed' }`(422) |
| `db.insert(t).values({...})` 不给 id | `` id: `rec_${crypto.randomUUID()}` `` 显式前缀 id |
