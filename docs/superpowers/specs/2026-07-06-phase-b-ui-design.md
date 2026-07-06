# Phase B UI — 设计（设置页 + 关键词现状 tab + avgRank 通真）

> 上位方法论：`2026-07-03-diagnosis-v3-methodology-design.md` §8.3 Phase B「GSC 接入」的 UI 交付项（设置页 §7.4-6、avgRank 卡通真、关键词现状 tab）。Phase B 的**数据链已落地**（GSC OAuth + Search Analytics 拉数 + keyword_metrics 落库 + PSI + T09a-c），本设计只补**看得见、可操作**的 UI 层。
>
> **决策状态（2026-07-06）**：用户离开期间按其一贯「按推荐来」意向拍板三项（见 §7），**均可推翻**，待用户复审本 spec 后确认。

## 0. 目标与判据

Phase B 的数据已接通但「看不见、连不上」：无处从 UI 连接 GSC、无关键词视图、avgRank 卡因证据 payload 缺字段恒 pending。本切片补齐三块 UI，让已接通的数据可见可操作。

**交付判据**：
1. 有一个设置页，能看数据源连接状态矩阵（GSC/DataForSEO/PSI/AI 探针/公开语料）、一键发起 GSC OAuth、连接后设置 GSC 站点 URL（闭合采集器所需 `siteUrl`）。
2. 有一个「关键词现状」tab，连 GSC 后显示真实关键词指标（L4）、配 DataForSEO 后显示缺口词；空态引导接数据源。
3. avgRank 卡在有 GSC 数据时显示真实**展示量加权平均排名**（measured L4，带证据抽屉），无数据时照旧 pending。

## 1. 现状锚点（代码摸底，2026-07-06）

- **导航**：`components/Shell.tsx`（server，props `{active:1|2|3|4, locale, runId?, domain?}`）+ `components/Stepper.tsx`（4 步）。子页 `/site` `/competitors` `/facts` `/report` 走内联 `<Link>`。**无任何设置入口**。
- **avgRank 卡已存在且已接线**：`lib/diagnostics.ts` `deriveAvgRank(evidence)` 找 `type='gsc'` 证据的 `payload.avgPosition`（number）→ measured；否则 pending（hint `screen2.configHint.gsc`）。`StatStrip` 用在 `runs/[id]/page.tsx:164`。**卡饿是因为采集器写的 gsc 证据 payload 是 `{dimension,rows}`，无 `avgPosition`**。
- **关键词渲染已存在于报告页**：`report/page.tsx:387-452` §4 已渲染 keyword_metrics 表（query/clicks/impressions/ctr/position/source）+ gaps 表；keyword 文本经 `keywords` join 解析。仓库读函数 `getKeywords(projectId)`、`getRunKeywordMetrics(runId)`、`getRunKeywordGaps(runId)` 均在。**Screen 2 完全不加载关键词**。
- **settings 数据模型**：`project_settings`（每项目一行）有 `gscConnected`、`gscRefreshToken`、`gscSiteUrl`、`dataforseoConfigured`(死标，实际由 env `isDataforseoConfigured()` 决定)、`seedKeywordLimit`、`probeN`、`marketLocation`、`crawl*` 等。读 `getProjectSettings(projectId)`；写 `setGscConnection(projectId,{gscConnected,gscRefreshToken?,gscSiteUrl?})`。**无 `setDataforseoConfig` / 无通用 setProjectSettings**。
- **GSC 路由**：`GET /api/gsc/auth?projectId=`（`isGscConfigured()` 否则 400；redirect `buildAuthUrl(projectId)`，projectId 作 OAuth state）；`GET /api/gsc/callback?code=&state=`（换 token → `setGscConnection(projectId,{gscConnected:true,gscRefreshToken})`，**不设 gscSiteUrl**）→ 现 redirect `/?gsc=connected&projectId=`。
- **i18n**：顶层命名空间 `common/screen1-4/findings/facts/evidence/competitors/site/report/retest/rulesAdmin`。**无 settings、无 keywords 命名空间**。`screen2.stats.avgRank`、`screen2.configHint.gsc`、`report.keywords.*` 已存在。

## 2. Piece 1 — 设置页

**路由**：`app/[locale]/settings/page.tsx`（Server Component，全局单项目作用域，非 per-run）。

**入口**：`Shell` 顶栏加设置链接（齿轮/文字，紧邻 `<LocaleSwitch/>`），全屏可达。因 Shell 跨屏复用，一处生效。

**单项目解析**：V0 单项目（seed teamflow.cn）。新增仓库读 `getPrimaryProject()`（取第一/唯一 project；无则 null）。页无 project → 空态「先在首页创建分析」。

**数据源状态矩阵**（server 端 env + DB 判定，只读展示）：

| 源 | 状态判定 | 可操作 |
|---|---|---|
| GSC | `settings.gscConnected` → 已连接 `{gscSiteUrl}` / 未连接；`isGscConfigured()` 为假 → 「环境未配 OAuth client」 | 见下 GSC 连接流 |
| DataForSEO | `isDataforseoConfigured()`（env）→ 已配置(env) / 未配置 | 只读（BYOK via env） |
| PageSpeed/PSI | 恒 → 可用(免费) | 只读 |
| AI 探针 | 按 provider（Perplexity/OpenAI/Anthropic/Google）env key 在否 → 逐个 已配/未配 | 只读（BYOK via env） |
| 公开语料 | Wikipedia/Reddit 恒 → 可用(免费) | 只读 |

env 判定函数在 server 组件里直接调（`isGscConfigured`/`isDataforseoConfigured`/PSI 恒真/各 provider `isConfigured`）。**不新增可编辑 project_settings 字段**（probeN/market/crawl 只读展示或不展示）。

**GSC 连接流（唯一可操作控件）**：
- `[连接 GSC]` 按钮（client 组件）→ 跳 `/api/gsc/auth?projectId=<primaryProjectId>`。
- **callback redirect 改**：`/?gsc=connected` → `/settings?gsc=connected`（next-intl 中间件本地化 locale 前缀）。设置页读 `?gsc=connected` 显成功 flash。
- **站点 URL 设置**（闭合采集器所需 `siteUrl`）：连接后展示一个站点 URL 输入框（默认建议 `sc-domain:<project.domain>`，helper 说明可填 `sc-domain:...` 或完整 URL）→ 新路由 `POST /api/gsc/site` `{projectId, siteUrl}` → `setGscConnection(projectId,{gscConnected:true, gscSiteUrl})`。**不做 Search Console sites.list 自动发现**（手填，记后续）。

## 3. Piece 2 — 关键词现状 tab

**路由**：`app/[locale]/runs/[id]/keywords/page.tsx`（Server Component，`active={2}`，site/competitors 的同级兄弟）。

**入口链接**：Screen 2 work-summary 链接行（`runs/[id]/page.tsx`）加 `keywordsLink` → `/runs/${id}/keywords`（新 i18n `screen2.keywordsLink`）。

**DRY 重构**：把 `report/page.tsx` §4 的关键词渲染抽成共享 `components/KeywordTable.tsx`（Server Component），**报告页与新 tab 同用**（报告页改为调用该组件，删内联渲染）。组件入参：已解析的 metrics 行、gaps 行、keyword 文本 Map；列标签复用既有 `report.keywords.*`（组件内 `getTranslations('report')`）。

**内容**：
- 关键词指标表（复用报告 §4 列：query / clicks / impressions / CTR / position / source-L4）——来自 `getRunKeywordMetrics(runId)` + `getKeywords(projectId)` 文本解析。
- 缺口词表（missing/weak/winning + opportunityScore）——来自 `getRunKeywordGaps(runId)`。
- **空态**：两者皆空 → CTA「连接 GSC 拿关键词实测 / 配 DataForSEO 拿缺口分析」（链接到设置页）。

**i18n**：新增 `keywords` 顶层命名空间（页 title/subtitle/空态 CTA）；表列标签复用 `report.keywords.*`（组件读 report 命名空间）。

## 4. Piece 3 — avgRank 卡通真

**问题**：GSC 采集写的 gsc 证据 payload 是 `{dimension,rows}`，`deriveAvgRank` 找 `payload.avgPosition` 落空 → 卡恒 pending。

**修法**（后端小改 + 纯函数）：
1. 新纯函数 `impressionWeightedAvgPosition(rows): number | null`——按 `sum(position_i * impressions_i) / sum(impressions_i)`（GSC「平均排名」的标准口径，展示量加权）；`impressions` 全 0 或空 → null。放 `lib/gsc/` 或 `lib/diagnostics` 附近，纯函数可单测。
2. GSC 采集步骤（`lib/inngest/collect-evidence.ts` 拉 query 维 rows 后）：算 `avgPosition = impressionWeightedAvgPosition(queryRows)`，写进 query 维 gsc 证据 payload → `payload = {dimension:'query', rows, avgPosition}`。
3. `deriveAvgRank` 保持读 `payload.avgPosition`；确保它 pick 到带 `avgPosition` 的 gsc 证据（若有多条 gsc 证据，优先取含 `avgPosition` 的那条）。

**结果**：有 GSC 数据 → avgRank 卡 measured **L4**（value=平均排名，带 ProvenanceTag + 证据抽屉，复用既有卡逻辑）；无数据 → 照旧 pending。**证据护城河保持**（值挂在 L4 证据上、可溯源）。

## 5. 组件与文件边界

| 单元 | 文件 | 动作 | 职责 |
|---|---|---|---|
| 平均排名纯函数 | `lib/gsc/avg-position.ts` (+test) | 建 | `impressionWeightedAvgPosition(rows)`——纯函数 |
| avgRank 接线 | `lib/diagnostics.ts`（deriveAvgRank）、`lib/inngest/collect-evidence.ts`（gsc 证据 payload 加 avgPosition） | 改 | 卡读到真值 |
| 主项目读 | `lib/repositories/index.ts` | 改 | `getPrimaryProject()` |
| 环境状态 | `lib/settings/data-sources.ts` (+test) | 建 | `getDataSourceStatuses()`——聚合各源 connected/configured（DB + env 判定），纯/薄可测 |
| 设置页 | `app/[locale]/settings/page.tsx` + `SettingsClient.tsx` | 建 | 状态矩阵 + GSC 连接按钮 + 站点 URL 表单 |
| GSC 站点路由 | `app/api/gsc/site/route.ts` | 建 | POST 设 gscSiteUrl |
| GSC callback redirect | `app/api/gsc/callback/route.ts` | 改 | redirect → `/settings?gsc=connected` |
| Shell 设置入口 | `components/Shell.tsx` + i18n | 改 | 顶栏设置链接 |
| 关键词表组件 | `components/KeywordTable.tsx` | 建 | 抽自报告 §4（metrics + gaps 渲染），报告页与关键词 tab 同用 |
| 报告页重构 | `app/[locale]/runs/[id]/report/page.tsx` | 改 | §4 改调 KeywordTable（删内联） |
| 关键词 tab | `app/[locale]/runs/[id]/keywords/page.tsx` | 建 | 页 chrome + KeywordTable + 空态 CTA |
| Screen 2 链接 | `app/[locale]/runs/[id]/page.tsx` + i18n | 改 | keywordsLink |
| i18n | `messages/{en,zh}.json` | 改 | 新 `settings`、`keywords` 命名空间 + `screen2.keywordsLink` + Shell 设置链接键（集成者 merge，agents 写 scratchpad） |

## 6. 验证标准

tsc 0 / eslint 0 error / 全量 vitest 绿（含 `avg-position`、`data-sources`、deriveAvgRank 新测试；报告页现有测试仍绿——KeywordTable 抽取为等价重构）/ next build 通过（`/[locale]/settings`、`/[locale]/runs/[id]/keywords` 进路由清单）。手动：设置页显状态矩阵、点连接 GSC 走 OAuth、关键词 tab 空态/有数据渲染。

## 7. 三项已拍板决策（推荐默认，待用户复审可推翻）

1. **切片范围**：三块（设置页 + 关键词 tab + avgRank 通真）一个 spec/plan 一起做。
2. **设置页深度**：数据源状态矩阵 + GSC 连接按钮 + 站点 URL 表单；其余 project_settings 字段只读展示，不做内联编辑（不新增 setProjectSettings 写路径）。
3. **关键词 tab 内容**：GSC 实测指标 + DataForSEO 缺口词（复用报告 §4 渲染，抽共享组件）。

## 8. 明确不做（本切片边界）

- **不做 GSC Search Console sites.list 自动发现**（站点 URL 手填，记后续）。
- **不做可编辑 project_settings**（probeN/市场/抓取上限只读；不新增通用写路径）。
- **不做 DataForSEO/探针 key 录入 UI**（env BYOK，只读状态）。
- **不做延后规则**（K08/K09/K10 降权/衰退/ROT、T16 抓取预算、T15 语言泛滥、TA01/TA02 主题权威）——多数需多 run 时序基线，属 item 2/3 独立切片。
- **不做多项目/项目选择器**（V0 单项目，getPrimaryProject 取唯一）。
```
