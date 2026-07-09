# 重新分析双入口 + 全站 Header/Footer 实现计划

> **For agentic workers:** 本计划按编排者模式执行:每个任务由编排者派发给 sonnet-executor 子代理,任务间按波次推进(波次内并行、波次间串行)。每个任务自带 pass/fail 验收。执行者在动手写代码前必须先用 Skill 工具加载 `veris-coding`。

**Goal:** 项目列表/详情提供按状态分流的「重新分析」入口(同协议回测 / 预填重配置),全站导航与 Footer 从"每页自包 Shell"改为 layout 统一渲染。

**Architecture:** Shell 拆为 SiteHeader + SiteFooter(进 `app/[locale]/layout.tsx`)+ 瘦身 Shell(向导上下文条,仅 `/new`、`/runs/*` 使用);后端为 `POST /api/runs` 与 `POST /api/runs/[id]/retest` 增加同项目并发 409 保护;`listProjectsWithSummary` 扩展出 `activeRun` 与 `retestAnchor` 字段驱动前端三态按钮。

**Tech Stack:** Next.js 16 App Router、React 19、next-intl 4、Drizzle/libSQL、vitest + @testing-library/react。

**规范文档:** `docs/superpowers/specs/2026-07-08-reanalyze-nav-footer-design.md`(含 2026-07-09 状态判定修订)

## Global Constraints

- 写任何 .ts/.tsx 前先加载 `veris-coding` skill(项目铁律:React 19 / Next 16 写法)。
- UI 文案中文为主,`messages/zh.json` 与 `messages/en.json` 同步增改;代码标识符英文。
- 错误返回惯例:`{ error: '<snake_case_code>' }`,409=状态冲突;成功 201 返回实体。
- 测试与被测文件同目录同名 `.test.ts(x)`;API route 测试模式参照 `app/api/runs/route.test.ts`(vi.mock db/client、repositories、inngest/client,全部 mock 先于 import route)。
- 提交信息中文,每任务完成即提交;基线 796 测试必须保持全绿(`pnpm test`)。
- run 状态划分(全项目统一,见 spec §2.1 修订):active=`{draft,collecting,collected,diagnosing}`,completed=`{reviewing,output}`,failed 独立终态。

---

## 波次 1(并行,文件集不相交)

### Task T1: 后端并发保护 + 项目摘要扩展

**Files:**
- Create: `lib/runs/status.ts`、`lib/runs/status.test.ts`
- Modify: `lib/repositories/index.ts`(新增 `findActiveRun`)、`lib/projects/summary.ts`(新增纯函数)、`lib/projects/summary.test.ts`、`app/api/runs/route.ts`、`app/api/runs/route.test.ts`、`app/api/runs/[id]/retest/route.ts`、`app/api/runs/[id]/retest/route.test.ts`、`lib/repositories/index.ts` 中 `listProjectsWithSummary`

**Interfaces(后续任务依赖,签名必须一致):**

```ts
// lib/runs/status.ts
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] // ['draft','collecting','collected','diagnosing']
export const COMPLETED_RUN_STATUSES: readonly RunStatus[] // ['reviewing','output']
export const isActiveRunStatus = (s: string): boolean
export const isCompletedRunStatus = (s: string): boolean

// lib/projects/summary.ts(纯函数,输入 run 行数组)
export const pickActiveRun = (runs) => Run | null          // 按 startedAt 取最新的 active run
export const pickRetestAnchor = (runs) => Run | null       // 最新的 runType='baseline' 且 completed 的 run

// lib/repositories/index.ts
export const findActiveRun = (projectId: string) => Promise<Run | undefined>

// listProjectsWithSummary 每项新增字段:
//   activeRun: { id: string; status: string } | null
//   retestAnchor: { id: string } | null
```

**API 行为:**
- `POST /api/runs` 与 `POST /api/runs/[id]/retest`:插入前调 `findActiveRun(projectId)`,命中则 `409 { error: 'run_in_progress', runId: <进行中 run id> }`,不插入、不发事件。
- 其余行为(422/404/503、201 返回体)保持不变,现有测试断言不得改语义。

**验收(pass/fail):**
1. 单测覆盖:两条 route 各有"存在 active run → 409 且未 insert 未 send"用例;`pickActiveRun`/`pickRetestAnchor` 覆盖空数组、只有 failed、latest 是 retest 但存在早期完成 baseline(应返回该 baseline)、reviewing 视为完成。
2. `pnpm test` 全绿。

### Task T2: /new 预填补齐(引擎多选)

**Files:**
- Modify: `components/NewAnalysisForm.tsx`、`components/NewAnalysisForm.test.tsx`、`app/[locale]/new/page.tsx`

**现状(已核实):** domain/industry/market/competitors 已从 `project` prop 回填;`engines` state 恒为 `DEFAULT_ENGINES`(`NewAnalysisForm.tsx:66`),项目已保存的 `projectSettings.defaultModels` 被忽略。`new/page.tsx` 已在第 32 行读 settings(`gscConnected`)。

**改法:**
- `NewAnalysisForm` 新增可选 prop `savedEngines?: string[] | null`;`engines` state 初始化:`savedEngines` 非空时按其构造 Record(存在于 ENGINES 列表的 key 置 true,其余 false),否则用 `DEFAULT_ENGINES`。先核实 `defaultModels` 存的值与 `ENGINES` 的 key 同一命名(提交链路 `start()` 是把 engines state 的开启 key PATCH 进 `defaultModels`,应当同名;若不同名,以提交链路为准做映射)。
- `new/page.tsx` 把 `settings?.defaultModels ?? null` 传入。

**验收:** 新增测试:传 `savedEngines=['perplexity']`(以实际 key 为准)时,仅该引擎 chip 选中;不传时维持默认 4 开 1 关。`pnpm test` 全绿。提交。

---

## 波次 2(单任务)

### Task T3: 布局重构 —— SiteHeader / SiteFooter / layout / Shell 瘦身

**Files:**
- Create: `components/SiteHeader.tsx`、`components/SiteHeader.test.tsx`、`components/SiteFooter.tsx`、`components/SiteFooter.test.tsx`
- Modify: `app/[locale]/layout.tsx`、`components/Shell.tsx`、`app/[locale]/projects/page.tsx`、`app/[locale]/projects/[id]/page.tsx`、`app/[locale]/settings/page.tsx`、`app/[locale]/runs/[id]/page.tsx`(去掉 dataHealth/projectId 传参)、`messages/zh.json`、`messages/en.json`、`app/globals.css`

**要点:**
1. `SiteHeader`(Server Component,props `{ locale: string }`):品牌 logo(`Ver<i>s` 样式沿用 `.brand`,链 `/${locale}/`)+ 导航「项目 `/projects`、规则库 `/rules`、设置 `/settings`」+ 黑底 CTA「新建分析」(`.run-btn`,链 `/new`)+ `DataSourceHealth` pill + `LocaleSwitch`。dataHealth 数据:参照 `app/[locale]/runs/[id]/page.tsx` 现在怎么构造 `dataHealth`(找到其 loader,预计在 `lib/settings/data-source-health`),在 SiteHeader 内自行加载(不传 projectId,GSC 项链接自然落到 `/settings#source-gsc` 分支)。
2. `SiteFooter`(Server Component,props `{ locale: string }`):三栏(产品定位 / 导航链接 / 方法论:L0–L4 简述、同协议回测一句、`RULES_VERSION`(from `@/lib/diagnosis/types`)与协议版本 `v2` 展示)+ 底行 `© 2026 Veris · v{version}`(version 从 `package.json` import)。内容文案见 spec §3,全部走 i18n。
3. `app/[locale]/layout.tsx`:`NextIntlClientProvider` 内渲染 `<SiteHeader locale={locale} /><main className="shell">{children}</main><SiteFooter locale={locale} />`(SiteHeader 内含 client 组件,必须在 Provider 内)。header/footer 各自用全宽背景 + 内部限宽容器,与 `.shell`(max-width 容器,globals.css:305)对齐。
4. `Shell` 瘦身:props 变为 `{ active, locale, runId?, domain?, children }`,只渲染向导条(「分析目标」域名徽章 + `Stepper`)+ children,**不再渲染** topbar/品牌/项目设置链接/LocaleSwitch/DataSourceHealth,也不再输出外层 `.shell` div(由 layout 的 `<main>` 提供)。
5. 页面调整:`/projects`、`/projects/[id]`、`/settings` 三页去掉 Shell 包裹(内容直接返回,原 `<section className="screen show">` 结构保留);`/new` 与 `runs/*` 9 页保持 `<Shell>`(props 不变,仅 `runs/[id]/page.tsx` 删去 `dataHealth`/`projectId` 两个已废弃入参)。`/rules` 与 `/share` 不动。
6. i18n:新增顶层 `nav`(projects/rules/settings/newAnalysis)与 `footer` 命名空间(zh/en 同步);`common` 里现有 key 不删(Shell 瘦身后 targetLabel 仍用)。
7. CSS:新增 `.site-header` / `.site-footer` 体系,风格延续 `--ds-*` token、手写 class;footer 用 `--ds-surface-1` 底 + 细上边框;移动端 footer 三栏纵向堆叠;`.topbar` 旧样式若不再被引用可清理。

**验收:**
1. 组件测试:SiteHeader 渲染出 4 个导航入口与品牌链接;SiteFooter 渲染三栏、RULES_VERSION 文本与版本号(mock next-intl server 参照现有测试惯例;若 server component 测试不便,允许把纯展示部分拆成可测的同步子组件)。
2. `pnpm test` 全绿(含既有 12 页相关测试的连带修复)。
3. `pnpm build` 通过。
4. 手工核验(执行者用 `pnpm dev` + curl/浏览器):`/zh/rules` 出现 header+footer;`/zh/projects` 无 Stepper;`/zh/new` 仍有 Stepper;`/zh/settings` 无 Stepper;分享页 `/share/*` 无 header/footer。

---

## 波次 3(单任务,依赖 T1+T3)

### Task T4: 重新分析入口(前端三态)

**Files:**
- Create: `components/RetestButton.tsx`、`components/RetestButton.test.tsx`
- Modify: `components/ProjectList.tsx`、`components/ProjectList.test.tsx`、`components/RunHistory.tsx`、`components/RunHistory.test.tsx`、`app/[locale]/projects/page.tsx`、`app/[locale]/projects/[id]/page.tsx`、`messages/zh.json`、`messages/en.json`

**Interfaces(消费 T1 产物):** `listProjectsWithSummary` 每项已有 `activeRun`/`retestAnchor`;`lib/projects/summary.ts` 的 `pickActiveRun`/`pickRetestAnchor` 可对项目详情页的 runs 数组复用;retest API 409 返回 `{ error: 'run_in_progress', runId }`。

**要点:**
1. `RetestButton`('use client',参照 `components/RetestBanner.tsx` 模式):props `{ locale, baselineRunId, labels: { cta, starting, error, inProgress }, className? }`;点击 `POST /api/runs/${baselineRunId}/retest`,201 → `router.push('/${locale}/runs/${retest.id}')`;409 → 显示 `labels.inProgress` 并链到返回的 `runId`;其他失败显示 `labels.error`。pending 期间禁用。
2. `ProjectList`:表格加「操作」列,三态(spec §2.1):`activeRun` → 链接「诊断中…」到 `/runs/{activeRun.id}`;`retestAnchor` → `RetestButton`(发起回测)+ 次级链接「重新配置」到 `/new?projectId={id}`;否则 → 链接「配置并分析」到 `/new?projectId={id}`。保持哑组件模式:文案全部经 labels props 传入。
3. `/projects/[id]` 页头:同三态按钮组(数据用已取的 runs 数组 + `pickActiveRun`/`pickRetestAnchor` 计算);原「新建分析」`<a>` 保留但改为 `next/link`。
4. `RunHistory`:每行 `runType='baseline'` 且 completed(用 `isCompletedRunStatus`)→ 操作列加「以此回测」`RetestButton`;新增 prop `hasActiveRun: boolean`,为 true 时这些按钮渲染为禁用态。
5. i18n:`projects` 命名空间加 `colAction / actionRunning / actionRetest / actionReconfigure / actionConfigure`;`projectDetail` 加 `retestThis`;RetestButton 的 starting/error/inProgress 复用/扩展 `retest` 命名空间(`retest.inProgress` 新增)。zh/en 同步。
6. 【顺手修正,一行】`components/RunHistory.tsx` 的「报告」链接条件 `r.status === 'output'` 保持不动(不属本任务范围,勿改)。

**验收:**
1. 组件测试:ProjectList 三态各渲染正确操作(fixture 直接造 `activeRun`/`retestAnchor` 字段);RetestButton 201 跳转、409 显示进行中链接、5xx 显示错误(mock fetch + next/navigation);RunHistory 完成态 baseline 行出现「以此回测」、`hasActiveRun=true` 时禁用、retest 行不出现。
2. `pnpm test` 全绿,`pnpm build` 通过。

---

## 波次 4:集成验收(编排者执行)

1. `pnpm test` + `pnpm build` 全绿。
2. 抽验关键 diff:409 保护先查后插的时序、layout 的 Provider 包裹关系、`/new?projectId=` 端到端(项目列表「重新配置」→ 表单预填全部字段)。
3. `pnpm dev` 冒烟:按 spec §5 的 7 条验收标准逐条过。
4. 汇报 + 收尾提交。
