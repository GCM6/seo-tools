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

## 项目铁律（编码时同样适用）

来自 `docs/plan-ux.md`，违反即返工：

1. **证据先于结论**:任何 finding 必须带 `evidence_refs` 和 `claim_type`,代码层面体现为「没有 evidence artifact 就不能落库为 measured finding」。
2. **测量与推断分层**:`claim_type ∈ {hypothesis, inferred, measured_sample, measured_hard}`,类型与 UI 标签一一对应,不得混用。
3. **Agent 是受约束的编排器,不是聊天框**:LLM 只读证据、归纳、起草,**绝不自己补数字**,输出必须过 schema 校验。
4. **人在环内**:只有 `recommendations.status ∈ {accepted, edited}` 才能生成 prompt;默认不自动发布。
5. **证据不可变**:原始响应 + 采集时间 + 工具版本 + hash 一起存,删项目级联删除。
6. 数据库约束(`findings.evidence_refs` 非空、`measured_hard` 必须有 L4 证据等)写进 migration,不靠应用层兜底。

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

## 后端规范（Next Route Handlers / Server Actions · TS）

后端 = 同一个 Next 应用,没有独立 Python 服务。约束:

- 后端逻辑写在 **Route Handlers**(`app/**/route.ts`)或 **Server Actions**(`'use server'`),不另起进程 / 框架。
- 证据采集走工具层(`fetch_page` / `render_check` / `parse_schema` / `gsc_query` / `ai_probe` / `serp_snapshot`),业务逻辑不直接发外部请求。
- 页面渲染检测走**托管浏览器 API**(Vercel serverless 不能自带 chromium,别 `import playwright` 直接跑)。
- **长任务用 Inngest**(Vercel serverless 有超时):采集 / 多模型探针 / 回测这类长流程别堵在请求里,丢给 Inngest 跑。
- AI 探针每次落库完整协议字段(provider、model_id、版本、参数、prompts、market、run_idx、raw_response、citations、各 hash、parser_version)。原始响应**原样存**,不要只存解析结果。
- 用 **Zod**(或等价 schema)校验 LLM 输出;校验失败即拒绝入库,不静默补默认值。
- 数据库 **libSQL (Turso) + Drizzle**:原始证据用 JSON 列存,关系表 + migration 做约束;V0 不引入 Redis。约束(`findings.evidence_refs` 非空、`measured_hard` 必须有 L4 证据等)写进 Drizzle migration,不靠应用层兜底。
- GSC 一律 OAuth **read-only**。

## 速查表（每次编码前自检）

- [ ] 这是 Server Component 还是 Client Component?默认 Server,`'use client'` 只在必要叶子节点。
- [ ] 用到 `params`/`searchParams`/`cookies`/`headers`/`draftMode` 了吗?**都 await**。
- [ ] 写组件转发 ref 了吗?**用 prop,不用 `forwardRef`**。
- [ ] 提交/变更数据?用 Server Action + revalidate,不另起 `/api`。
- [ ] LLM 产出的字段有没有过 schema 校验、带 `evidence_refs` + `claim_type`?
- [ ] 证据有没有原样存原始响应 + hash?

## 红旗 —— 出现即停下改写

- 代码里出现 `forwardRef(` → React 19 不需要,改成 `ref` prop。
- `cookies()` / `params` 没有 `await` → Next 16 会直接报错。
- `package.json` 里加了 `--turbopack` → 16 已默认,删掉。
- `<X.Provider>` → 改 `<X value=…>`。
- LLM 返回值直接写进数字字段、或 finding 没有 `evidence_refs` → 违反「证据先于结论」。
- 注释里写「若你用 Next 14/15…」这种版本含糊措辞 → 本项目就是 Next 16 + React 19,钉死。

## 常见错误对照（基线实测命中）

| 旧写法（会被写出来） | 本项目正确写法 |
|---|---|
| `const Input = forwardRef<HTMLInputElement, P>((props, ref) => …)` | `function Input({ ref, ...props })`,`ref` 当 prop |
| `searchParams: { domain?: string }`（同步） | `searchParams: Promise<{ domain?: string }>` + `await` |
| `const c = cookies(); c.get(...)` | `const c = await cookies()` |
| 顶层 `'use client'` 包整页 | Server Component 默认,交互下沉到子组件 |
| `useFormState` | `useActionState` |
