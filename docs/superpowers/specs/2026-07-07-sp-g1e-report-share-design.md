# SP-G1e 只读分享链接 + PDF 导出 —— 设计

> 上游范围：`docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` §SP-G1e。
> 目标：报告能正式交付给客户——无登录态浏览器打开分享链接可看完整报告。
> 依赖：SP-G1a（Cloudflare PDF 需生产 URL 可达）——**故本期先交付分享链接 + 打印回退，Cloudflare `/pdf` 端点顺延到 G1a 上线**。

## 背景与既有资产

- `app/[locale]/runs/[id]/report/page.tsx` —— 报告页，把「取数 + buildReport + 渲染 8 段」全部内联（~300 行）。SP-G2d 也要求「report 与分享页共用同一套渲染」——**本期把报告主体抽成共享组件 `components/ReportView.tsx`**，一举两得。
- `PrintButton.tsx`（`window.print()`）+ 报告页已有 `.no-print` 工具栏。
- `db/schema.ts`（drizzle sqliteTable，`check()` 约束）+ `db/migrations/*.sql`（drizzle-kit generate 产物，journal 记录）。`db:push` 直推 schema。
- 中间件 `middleware.ts` matcher 拦截除 `api/_next/_vercel/带扩展名` 外的一切 → 会给 `/share/*` 强加 locale 前缀。**须把 `share` 加入排除**，分享路由才落在 `app/share/[token]`（无 locale）。
- next-intl：`setRequestLocale(locale)` 决定 `getTranslations` 用哪个语言 + 载哪份 messages。

## 决策

1. **共享渲染**：抽 `components/ReportView.tsx`（async server component，入参 `runId`，内部取数 + `buildReport` + 渲染 `.report-layout`：toc + 8 段主体）。报告页 = `Shell + 工具栏 + <ReportView>`；分享页 = 极简壳 + `<ReportView>` + 页脚。语言由**调用方** `setRequestLocale` 决定，ReportView 只 `getTranslations('report')`，不含任何 `/[locale]` 内部导航链接。
2. **分享路由无 locale**：`app/share/[token]/page.tsx`；locale 存在 share 行里（创建时定），分享页 `setRequestLocale(share.locale)`。`share` 加入中间件排除。
3. **PDF**：Cloudflare 打 PDF 需生产可达 URL（G1a），**本期顺延**；先做打印回退（PrintButton 在报告页与分享页都可用）+ `@media print` 打磨。留 TODO 注记。

## 交付面

### 1. DB：`report_shares` 表（`db/schema.ts` + 迁移）

```ts
export const reportShares = sqliteTable('report_shares', {
  id: text('id').primaryKey(),                 // share_<uuid>
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),     // urlsafe 随机
  locale: text('locale').notNull().default('zh'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  expiresAt: text('expires_at'),               // 可空 = 永不过期
}, (t) => [uniqueIndex('report_shares_token').on(t.token)])
```

- 迁移：`drizzle-kit generate` 产 `0005_*.sql` + 更新 journal（离线可跑）；`db:push` 兜底。
- 证据不可变/级联删除铁律：`onDelete: 'cascade'`（删 run/项目连带删分享）。

### 2. 纯函数（TDD 主战场）

- `lib/share/token.ts` `generateShareToken(): string` —— `crypto.randomBytes` → base64url，够长防猜测。
- `lib/share/expiry.ts` `isShareExpired(expiresAt: string | null, now: Date): boolean` —— null 永不过期；否则比较。

### 3. 仓库函数（`lib/repositories/index.ts`）

- `createReportShare(runId, locale, expiresAt?)` → 插入（显式 `share_<uuid>` id + `generateShareToken`）。
- `getReportShareByToken(token)` → 查单条。
- `getActiveShareForRun(runId, now)` → 复用未过期分享（API 幂等，避免每次点都新建）。

### 4. API：`POST /api/runs/[id]/share`

- run 不存在 404；存在则复用未过期分享或新建，返回 `{ token, url }`（`url = /share/<token>`，相对路径，前端拼 origin）。locale 从 query/body（默认 run 项目语言或 'zh'）。错误码 snake_case。

### 5. 公开分享页 `app/share/[token]/page.tsx`

- 解析 token → share 行 → run；缺失/过期 → `notFound()`（过期文案可后续细化，V0 直接 404）。
- `setRequestLocale(share.locale)`；渲染 `<ReportView runId={share.runId} />`；页脚「由 Veris 生成 · <日期>」。
- `export const metadata`：`robots: { index: false, follow: false }`——分享链接不进搜索引擎。
- 无 Shell、无工具栏、无操作按钮（只读）。

### 6. 报告页工具栏「生成分享链接」

- `components/ShareButton.tsx`（client leaf）：点按 `POST /api/runs/[id]/share` → 展示只读 URL + 「复制」。文案 props 传入（i18n-free）或用 `useTranslations`（client）。
- 报告页工具栏在既有 exportMd / PrintButton 旁加 ShareButton。

### 7. 打印样式打磨（`@media print`）

- 隐藏 `.no-print`（已用）、分享页页脚保留；`.report-section` 避免跨页断裂（`break-inside: avoid`）；表格/卡片打印友好；中文字体沿用现有 `--font-noto-sans-sc` 栈避免缺字。

### 8. 中间件排除 `share`

`matcher: ['/((?!api|_next|_vercel|share|.*\\..*).*)']`

### 9. i18n（`report` 扩展 zh/en）

`share`「生成分享链接」、`shareCopy`「复制」、`shareCopied`「已复制 ✓」、`shareReady`「只读链接已生成」、`generatedBy`「由 Veris 生成」、`shareExpired`（备用）。

## 不做（YAGNI / 依赖未满足）

- **Cloudflare `/pdf` 端点顺延**（依赖 G1a 生产 URL）；本期打印即 PDF 路径。
- 不做过期时间选择 UI（表支持 `expiresAt`，API 暂不设，默认永不过期；UI 留 V1）。
- 不做分享撤销/列表管理（V1）。
- 不做白标（G4d）。

## 测试

- `lib/share/token.test.ts`（唯一性/长度/urlsafe 字符集）、`lib/share/expiry.test.ts`（null / 未过期 / 已过期 / 边界）。
- ReportView 抽取后：`lib/diagnosis/report*.test.ts` 及报告页 build 不回归。
- 全量 `pnpm test` / tsc / lint / build 绿。
- 分享页/仓库 DB 路径无独立单测（无 repo 测试 harness）——靠 build + 类型 + 后续实机（G1a 上线）验证。

## 验收对照

生成分享链接 → 无登录态新标签打开 `/share/<token>` 看到完整报告（无导航/按钮，有「由 Veris 生成」页脚）；打印/PDF 分页正常、中文不缺字；分享页 noindex。
