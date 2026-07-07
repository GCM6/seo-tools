# SP-G1b 多项目 + 项目/run 历史列表 设计

> 商业化路线图 Phase G1 项。目标：消除单项目模型，SEO 顾问可管多个客户站并找回历史报告——这是 G3 种子招募（一个顾问跑多个站）的前提。零依赖、无外部凭据阻塞。

## 现状（代码摸底结论）

- **run 相关页已经 project-agnostic**：`app/[locale]/runs/[id]/**` 全部由 URL 的 `runId` 解析 run→project，无单项目假设。
- **GSC 令牌数据层本就 per-project**：`project_settings.gscRefreshToken/gscConnected/gscSiteUrl` 按 `projectId` 存；`/api/gsc/auth?projectId=&returnTo=` + callback 用 OAuth `state` 编码 `projectId::returnTo` 原样带回。**多项目无需改数据层**。
- **`POST /api/projects` 已创建全新项目**（`proj_<uuid>`），不强制单项目；单项目是**约定**：`NewAnalysisForm.upsertProject()` 有 `projectId` 就 PATCH、否则 POST，而 `/` 页用 `getPrimaryProject()` 预填「那一个」项目。
- **仅三处用 `getPrimaryProject()`**：`app/[locale]/page.tsx`（首页向导）、`app/[locale]/settings/page.tsx`、`lib/settings/load-statuses.ts`。这就是要拆的「取第一个」假设。

## 路由模型（Approach A）

| 路由 | 变化 | 内容 |
|---|---|---|
| `/`（home） | **改** | 有项目 → `redirect('/projects')`；无项目 → `redirect('/new')`。薄壳，无 UI。 |
| `/projects` | **新增** | 项目列表：每行 域名 · 最近 run 状态/类型 · 发现数 · 下次回测。「新建分析」→ `/new`；行 → `/projects/[id]`。 |
| `/projects/[id]` | **新增** | 项目详情：run 历史表（时间/run_type/findings 数/状态/→run 或 report）+ 最新报告直达 + **该项目 GSC 连接**（状态 pill + 连接/重连按钮 + 站点 URL 表单）。 |
| `/new` | **新增（迁移）** | 现 `NewAnalysisForm` 向导，从 `/` 迁来。**始终新鲜项目**（`project={null}`）。 |
| `/settings` | **收窄** | 全局 BYOK 凭据 + 全局数据源矩阵。GSC 行降为 app 级就绪提示（连接在项目页）。移除 `getPrimaryProject`。 |

**GSC 归项目详情页**：数据层本就 per-project，`/api/gsc/auth` 已接受 `projectId`+`returnTo`。项目详情页的连接按钮 `window.location = /api/gsc/auth?projectId=<id>&returnTo=/<locale>/projects/<id>`，callback 自动附 `gsc=connected` 跳回。**满足验收「GSC 授权按项目独立」，且不需给 settings 加项目切换器**。

### `/new` 向导的 GSC 往返闭环（唯一有状态迁移的点）

现向导 `returnTo=/<locale>?step=connect`；多项目后 `/` 是列表，会丢失在建项目上下文。改为：
- `connectGsc()` 的 `returnTo = /<locale>/new?step=connect&projectId=<projectId>`（此时 step-1 已 POST 出项目，`projectId` 已在 state）。
- callback 原样带回并附 `&gsc=connected` → `/new` 页从 `searchParams.projectId` **显式载入该项目**（非 `getPrimaryProject`），`initialStep=2` 续起。
- `sanitizeReturnTo` 已允许同源带 query 路径（现 `?step=connect` 即走此路）。

## 仓库层（`lib/repositories/index.ts`）

- **新增 `listProjectsWithSummary()`**：返回 `{ id, domain, market, latestRun: {status,runType,startedAt,findingCount} | null, nextRetestDueAt }[]`。实现：`projects` 全量（按 createdAt 降序）+ 每项目最近 run（`runs` by projectId order startedAt desc limit 1）+ 该 run findings count。为避免 N+1，用一次 runs 查询 + 分组，或对 V0 少量项目直接逐项目查（V0 项目数个位数，逐项目可接受，注释标注）。
- **复用**：`getProject(id)`、`getProjectRuns(projectId)`（已存在，用于详情页 run 历史）、`getProjectSettings`、`getFindings`（数 finding）。
- **删除 `getPrimaryProject()`**：三处调用点改造后无引用（grep 确认仅这三处 + 其测试）。

## 页面/组件

- `app/[locale]/projects/page.tsx`（Server Component）：调 `listProjectsWithSummary()`，渲染共享展示组件 `components/ProjectList.tsx`（i18n-free，接已翻译 label + 数据 props；行链接 `/<locale>/projects/<id>`）。空态不会出现（home 已重定向到 `/new`），但列表页仍兜底空态文案。
- `app/[locale]/projects/[id]/page.tsx`（Server Component）：`getProject` 不存在 → `notFound()`；渲染 `components/RunHistory.tsx`（i18n-free run 历史表）+ GSC 连接区（复用现 SettingsClient 的 GSC 片段思路，抽 `components/GscConnectCard.tsx` client leaf：连接按钮 + 站点 URL 表单，调用现有 `/api/gsc/auth` 与 `POST /api/gsc/site`）。
- `app/[locale]/new/page.tsx`：由现 `app/[locale]/page.tsx` 迁移。`searchParams: { step?, gsc?, projectId? }`。有 `projectId` → `getProject(projectId)` 显式载入并预填（GSC 往返续起）；否则 `project={null}` 新鲜开始。
- `app/[locale]/page.tsx`：改为薄重定向（见上）。
- `NewAnalysisForm`：`connectGsc()` 的 `returnTo` 改为 `/<locale>/new?step=connect&projectId=<projectId>`。其余逻辑不变（upsert POST/PATCH 已支持新鲜项目）。
- **Shell 顶栏**：加「项目」入口（`/<locale>/projects`）。`settings-link` 保留。Stepper 的 `active` 语义：列表/详情页非四步工作流，`active` 传占位（沿用 settings 页 `active={1}` 装饰惯例）。

## `/settings` 收窄

- `SettingsPage` 去掉 `getPrimaryProject`：全局 BYOK 凭据录入（`buildCredentialRows`，不依赖项目）+ 数据源矩阵（`loadDataSourceStatuses()` 无项目版）。
- `loadDataSourceStatuses(projectId?)`：签名加**可选** projectId。省略（settings 全局）→ `gscConnected:false`，GSC 行 detail 显示「按项目在项目页连接」提示；传 projectId（项目详情/run 页）→ 真 per-project GSC。**向后兼容**：现调用点不传即全局语义。
- `SettingsClient` 去掉 GSC 连接 UI（移到项目详情页的 `GscConnectCard`），保留凭据矩阵与录入。若移除 GSC 片段影响 `justConnected`/props，一并清理。

## i18n（zh + en）

新增命名空间 `projects`（列表页：标题/新建按钮/列头/空态/最近 run 状态标签）、`projectDetail`（run 历史列头/GSC 连接卡/无 run 空态）。复用现有 `screen1`（向导）、`settings`（凭据）、`common`（顶栏「项目」入口）。

## 测试（TDD）

- 纯逻辑优先：`listProjectsWithSummary` 若含分组/挑最近 run 的纯函数（如 `pickLatestRun`），抽出单测。
- 展示组件 RTL：`ProjectList.test.tsx`（多项目区分、最近 run 状态、行链接 href）、`RunHistory.test.tsx`（run 行渲染、空态）、`GscConnectCard.test.tsx`（未连接显按钮、已连接显 ✓ + 站点表单）。
- `data-sources`/`load-statuses`：补「无项目全局版 GSC 未连接」用例。
- 现有 `NewAnalysisForm`/settings 测试按 props 变更同步。
- 验收（对齐路线图）：创建 2 个项目各跑 1 次诊断，`/projects` 能区分并回访各自 run；两项目 GSC 授权互相独立。`pnpm test`/`tsc`/`lint`/`build` 全绿。

## 不做（YAGNI / 边界）

多租户/登录/行级隔离（G4a）、项目删除 UI（数据层级联删已具备，UI 另议）、项目编辑页（改域名/竞品——V1）、跨项目聚合仪表盘、settings 项目切换器（GSC 已归项目页，不需要）。

## 决策记录

- **GSC 放项目详情页而非 settings 切换器**：读代码后确认数据层已 per-project、auth 路由已带 projectId，项目页直接连接比给 settings 加项目上下文**更少改动、G2b 数据源健康度代码零伤害**。较初始「settings 全局」表述更精确。
- **home 用 redirect 而非渲染列表**：保持 home 薄壳，列表单一真源在 `/projects`，避免两处重复渲染。
- **listProjectsWithSummary V0 逐项目查可接受**：项目数个位数，不提前优化 N+1，注释标注 V1 再批量化。

关联路线图 `docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` §SP-G1b。
