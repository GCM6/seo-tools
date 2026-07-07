# SP-A1 后端 backlog 小批量设计

> 「A 档」backlog 精修的第一批。经三路 Explore 摸底，A 档实为 **1 个小批量 + 3 个较大项**：本 spec 只做**四个小、可测、无 migration/无解析版本风险**的项；其余三项各自开 SP：
> - **#2 忠实群内邻接图（TA01/TA02）** —— 中型：`internalLinks[]` 在 `crawler.ts` 算完 `inboundLinkCount` 即丢弃，`SiteAuditPage`（规则可见）不带它；需先把 internalLinks 穿进 site-audit payload 再重写规则。
> - **#6 分引擎 SoV 拆分** —— 大型：confirmed 竞品的 mention 在探针时冻结（仅按 project.competitors 名字），需重解析原始回答 + **bump `PROBE_PARSER_VERSION`**（跨版回测不可比）+ 扩 `ProbeSummary` + 改 Q02 + UI。
> - **#7 Q03 竞品轻检采集器 + content_brief** —— 中大型：`reevaluate-competitors` 新增采集阶段 + 证据 + context 解析 + brief 接线。

## 范围（本批四项）

### 1. K02(低CTR) / K06(蚕食) 回测接位次语义

**现状**（`lib/diagnosis/rules/keywords.ts`）：K02 已按 `position` + `ctr`（对位次 CTR 基准）计算、K06 已按 query 聚合并逐页带 `position`；规则逻辑无需动。缺口在回测标量：两者 `validationSpec` 都继承 P3 默认 `{gsc, impressions, increase}`（`validation-spec.ts:27`），而 `templates.ts:29` 早已注明「位次类宜覆盖为 position/decrease」，只是没接。

**改动**：
- `lib/diagnosis/templates.ts`：K02、K06 模板各加 `validationSpec: { metricSource: 'gsc', metric: 'position', direction: 'decrease' }`。
- `lib/diagnosis/retest-metrics.ts` `extractRunMetric`：新增 `gsc + position` 分支——按 `target.keywords` 匹配 `run.gscKeywords`，**取匹配词 position 的平均**（`RunMetrics.gscKeywords` 已带 `position`）；无匹配 → null（回退四态）。`buildMetricPair`/`computeOutcome` 不改（已支持 direction）。
- **决策**：位次用平均而非加权（回测方向性指标，均值足够；避免引入展示量权重的语义混淆）。direction=decrease → position 变小=改善。

### 2. GSC 站点自动发现（`sites.list`）

**现状**：`lib/gsc/search-analytics.ts` 的 `listSites(accessToken)` 已实现且有单测，**零调用方**；用户当前在 `GscConnectCard` 手打 `sc-domain:<域名>`。

**改动**：
- 新增 `GET /api/gsc/sites?projectId=...`：`getProjectSettings` → `readGscToken`（解密，`lib/gsc/token-crypto`）→ 无 token/未连接返回 `{ sites: [] }`（不报错，优雅降级）→ `refreshAccessToken` → `listSites` → `{ sites: string[] }`。异常（token 失效等）→ 502 `{ error: 'gsc_sites_failed' }`。错误码 snake_case。
- `components/GscConnectCard.tsx`：已连接时挂载后 `fetch('/api/gsc/sites?projectId')`，把返回站点渲染为 `<select>`（选中即填入 siteUrl input）；**保留手输 input** 作为兜底（listSites 失败/空则仅手输）。select 变更 → setSiteUrl。
- **决策**：不自动保存选中的站点（仍走既有「保存站点 URL」按钮，人保留确认），只做「填充」，避免误改。

### 3. release 原子化 + 版本单调守卫

**现状**（`lib/repositories/index.ts` `releaseApprovedProposals`）：循环里逐条 `update` artifact + 逐条 stamp proposal，**无事务**（中途失败半提交）；`newVersion` 盲写，**无守卫**（可重发已发布版本或发布更低版本）。release 路由只校验版本**格式**，不校验单调。

**改动**：
- 新增纯函数 `assertReleasableVersion(newVersion, releasedVersions)`（`lib/diagnosis/rule-proposals.ts`）：newVersion 已在 released 集合 → throw；或其数值 ≤ 已发布最大值 → throw（复用 `^rules_v(\d+)$` 解析，与 `deriveNextRulesVersion` 同源）。返回 void 或 throw `Error`（校验器风格）。
- `releaseApprovedProposals`：入口先 `getReleasedVersions()` → `assertReleasableVersion` → 再把「artifact 更新 + proposal stamp」循环包进 **`db.transaction(async (tx) => {...})`**（drizzle libSQL 客户端支持；本仓库首次用事务，注释标注）。事务内所有读写走 `tx`。
- **决策**：守卫放仓库层（release 路由与任何未来调用方都受保护），纯校验逻辑抽成可单测函数；事务用交互式 `db.transaction`（循环内有「读 artifact→写」交织，`db.batch` 不适合）。

### 4. G2b 健康度抽屉 GSC「去连接」锚点修正

**现状**（`components/DataSourceHealth.tsx:55`）：down 源的「去连接」一律 `/{locale}/settings#source-{key}`。GSC 连接已按项目移到项目详情页（SP-G1b），settings 的 gsc 行已无连接按钮 → 锚点落空。

**改动**：
- `DataSourceHealth` 加可选 `projectId?: string` prop；`key === 'gsc'` 且有 projectId 时链接改 `/{locale}/projects/{projectId}`，其余源仍指 settings 锚点（aiProbe/dataforseo 等是全局，settings 正确）。
- Shell 加可选 `projectId?` 透传给 `DataSourceHealth`；run 页（health pill 唯一挂载处，`run.projectId` 在手）传入。无 projectId 时 gsc 回退 settings 锚点（不回归）。

## 测试（TDD）

- `retest-metrics.test.ts`：新增 gsc/position 抽取用例（平均、无匹配→null）；`templates` 断言 K02/K06 带 position/decrease validationSpec。
- `rule-proposals.test.ts`：`assertReleasableVersion` 重复版本/更低版本 throw、更高版本通过。
- `releaseApprovedProposals`：repo 测试（migration-bootstrap，沿用 Phase F 配方）——重发/降版抛错；成功发布原子完成（stamp 全部 + artifact 更新）。
- `GscConnectCard.test.tsx`：mock `/api/gsc/sites` 返回站点 → 渲染 select；空/失败 → 仅手输。
- `/api/gsc/sites` route 测试：未连接→`{sites:[]}`；连接→listSites 结果。
- `DataSourceHealth`：gsc + projectId → 链接指项目详情；无 projectId → settings 锚点。
- 验收：`pnpm test` / `tsc` / `lint` / `build` 全绿。

## 不做（YAGNI / 边界）

本批不碰：#2 群内邻接图、#6 分引擎 SoV（含 parser 版本 bump）、#7 Q03 采集器（各自 SP）；不做 GSC 站点自动保存、不做多 property 批量授权、不改 release 的代码常量同步流程（仍手动部署 RULES_VERSION）。

关联：路线图 backlog（Phase C/D/E/F 局限）、`veris-v3-methodology-redesign` 各期取舍。
