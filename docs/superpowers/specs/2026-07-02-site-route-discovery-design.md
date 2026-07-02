# 全站路由发现 + 动态路由去重采样分析 — 设计文档

日期：2026-07-02
状态：待用户评审
前置：SP3 探针链已落地（`lib/inngest/collect-evidence.ts`）；findings/recommendations 生成链路尚未实现，本设计只需保证产物可被将来的 findings 以 `evidence_refs` 引用。

## 1. 问题与目标

当前一次诊断 run 只采集 `project.domain` 这一个入口 URL（抓取 → robots → schema → 渲染对比 → AI 探针），完全没有站点级视角：没有 sitemap 解析、没有内链提取、没有多页概念，数据模型里也没有页面维度。

目标：一次 run 能回答「这个**站点**在 SEO/GEO 视角下健康吗」，而不仅是「这个**页面**健康吗」，同时把成本锁死在可控范围（Cloudflare 渲染按次计费、AI 探针按 token 计费、Vercel/Inngest 有时长限制）。

### 用户已确认的决策

- **分析深度分三层**：全站轻检（廉价 HTTP fetch，不渲染）→ 按 URL 模板聚类后每模板代表页深检（渲染对比 + schema）→ 重点页 AI 探针归属。
- **路由发现**：sitemap 优先（robots.txt 声明 + `/sitemap.xml` 回退，sitemap index 递归），内链 BFS 爬取补充，两者合并去重。「在 sitemap 但站内无入口」的孤岛页本身就是诊断信号。

### 代替用户拍板的默认值（用户离开时按最佳判断选定，可推翻）

- **规模上限可配置**，`projectSettings` 新增 `crawlMaxPages`（默认 200）、`crawlMaxDepth`（默认 3）。超上限的 URL 仍记入清单但不做轻检，UI 明示「已截断」。
- **每模板代表页默认 1 页**，选择规则：该模板下初始 HTML 正文字符数（mainTextChars）取中位数的页面（最「典型」），用户可在 UI 手动更换。
- **重点页第三层的 V0 范围**：不改 20-prompt 固定探针协议（避免破坏同协议重测原则）。V0 做两件事：① 探针 citations（`ai_probe_results.cited_urls`）与站点页面清单匹配，得出每页「被 AI 引用次数」；② 用户标记的重点页强制进入深检（即使不是模板代表页）。针对单页主题生成定向探针 prompt 留到 V1。
- **爬取范围**：只爬与入口同 host 的 URL（www 前缀归一化后），跨子域链接记录但不爬。

## 2. 方案对比

| 方案 | 概述 | 取舍 |
|---|---|---|
| A. 最小侵入 | 不建新表，爬取+轻检结果整体作为一条 evidence 的 JSON payload | 最快，但代表页调整、重点页标记、retest 对比、UI 查询都没有落点，后续必然重构 |
| **B. 站点页面模型（推荐，采用）** | 新增 `site_pages` + `url_templates` 两张表；爬取/轻检/聚类/深检作为 collect 流程的分批 steps；evidence 扩两个类型 | 结构清晰，支撑 UI 交互与同协议重测；迁移量适中 |
| C. 完整链接图谱 | 在 B 之上再加 `page_links` 边表，支持链接深度/PageRank 类分析 | 信息最全但 V0 过度；孤岛检测用聚合列（inboundLinkCount）即可覆盖 |

采用 **B**。内链入度以聚合列存在 `site_pages`，不建边表。

## 3. 数据模型

### 3.1 新表 `site_pages`（页面当前状态，可变）

| 列 | 说明 |
|---|---|
| id | `sp_` + uuid |
| projectId | FK projects，级联删除 |
| firstSeenRunId | 首次发现于哪次 run |
| url | 归一化后的绝对 URL，项目内唯一 |
| discoveredVia | `entry` / `sitemap` / `crawl` / `both` |
| depth | BFS 深度（入口=0；仅 sitemap 发现的为 null） |
| httpStatus / finalUrl | 轻检结果；有重定向时 finalUrl ≠ url |
| title / canonicalUrl / metaRobots / mainTextChars / contentHash | 轻检解析结果 |
| inboundLinkCount | 站内入链数（爬取过程聚合） |
| checkStatus | `checked` / `discovered_only`（超 cap 未检）/ `blocked_by_robots` / `error` |
| errorReason | checkStatus=error 时的原因 |
| templateId | FK url_templates，nullable |
| isKeyPage | 用户标记的重点页 |
| lastCheckedAt / createdAt | 时间戳 |

### 3.2 新表 `url_templates`（project 级持久，保障同协议重测）

| 列 | 说明 |
|---|---|
| id | `tpl_` + uuid |
| projectId | FK projects，级联删除 |
| pattern | 如 `/products/{slug}`、`/blog/{date}/{slug}` |
| pageCount | 命中页面数（每次 run 后更新） |
| representativePageId | FK site_pages；默认启发式选定，用户可改 |
| source | `heuristic` / `user`（用户改过代表页或确认过模板后置 user，之后启发式不再覆盖） |
| createdAt / updatedAt | 时间戳 |

### 3.3 evidence 扩展

- `evidence_artifacts.type` check 枚举增加 `'sitemap'` 与 `'site_audit'`（**SQLite 改 check 约束需要重建表**，走 drizzle-kit 迁移，spec 实现时注意）。
- 增加 nullable 列 `site_page_id`（FK site_pages），深检 evidence（page_fetch/render_check/schema）挂到具体页面；现有行不受影响。
- **`sitemap`**：每个抓到的 sitemap 文件一条，rawText=原文 XML，claimLevel L4。
- **`site_audit`**：每次 run 一条聚合快照（immutable），payload = 全部页面轻检结果数组 + 统计（总数、404 数、noindex 数、canonical 异常数、孤岛页数、截断数）+ 当时的模板集合快照（含代表页），claimLevel L4（逐项均为直接 HTTP 测量）。findings 引用它，retest 用两条 site_audit 对比。

`site_pages` 是「当前状态」查询模型（可变），`site_audit` 是「某次 run 的不可变快照」——两者并存以同时满足 UI 查询与证据不可变原则。

### 3.4 `project_settings` 新增

`crawlMaxPages`（int，默认 200）、`crawlMaxDepth`（int，默认 3）、`crawlEnabled`（bool，默认 true；关闭即退回现状单页模式，保证向后兼容）。

## 4. 采集流程（Inngest 编排）

在现有 `collectEvidenceHandler` 中扩展 steps（沿用 deps 注入模式，新模块同样注入以便 handler 级测试）：

```
validate-url
→ google-site-visibility（现有，不变）
→ discover-sitemap          # robots.txt 的 Sitemap 声明 + /sitemap.xml 回退；index 递归；存 sitemap evidence
→ crawl-batch-{n}           # BFS + 轻检合一：每批 ~20 页一个 step.run，批内并发 ≤4
→ cluster-templates         # 纯计算：URL 模板聚类 + 代表页选定/更新
→ deep-check:{templateId}   # 每模板代表页 + 重点页：fetch-page / extract-schema / render-check（复用现有单页步骤）
→ run-probes                # 现有探针，不变
→ attribute-citations       # citations ↔ site_pages 匹配，更新引用计数
→ mark-collected
```

要点：

- **爬取与轻检合一**：BFS 本身就要 fetch 页面，顺带解析出轻检全部字段与出链（linkedom，复用 page-parser 的解析基础）。仅 sitemap 发现、未被爬到的 URL 在 cap 内补一次 fetch。
- **分批与断点**：每个 `crawl-batch-{n}` 是独立 serverless 调用，frontier/visited 状态通过 step 返回值在批间传递（200 页元数据约几十 KB，JSON 序列化安全）；Inngest 重试天然按批恢复。
- **礼貌爬取**：遵守 robots.txt disallow（被禁路径记 `blocked_by_robots` 不 fetch）；并发 ≤4；复用现有 SSRF guard 校验每个 URL。
- **URL 归一化**：去 fragment、去常见 tracking 参数（utm_* 等）、尾斜杠归一、www 归一。
- **成本模型**：渲染调用次数 = 模板数 + 额外重点页数（典型站点 5–15 次，而非 200 次）；AI 探针成本与现状完全相同。
- **进度事件**：`RunProgressMessage` 扩展 `phase`（discover / light_check / cluster / deep_check / probes）与页面计数，SSE 前端展示「已检 87/200 页」。

## 5. 模板聚类算法（推断层，非实测）

纯函数，输入 URL 列表，输出模板分组：

1. 按 path segment 逐段归一化：纯数字段 → `{id}`；uuid → `{uuid}`；日期形态（`2026`、`2026-07`）→ `{date}`。
2. 同一父路径下高基数尾段聚类：兄弟段 ≥3 个且互不相同 → `{slug}`（阈值 3，避免把 `/about` `/pricing` 这类低基数导航页误聚）。
3. 多语言前缀（`/en/`、`/zh/`）保留为字面段，不聚类（不同语言版本是不同模板）。
4. 未命中任何规则的 URL 各自成单页「模板」（pageCount=1），入口页永远单独成组。

**声明纪律**：模板聚类结论的 claim_type 是 `inferred`，UI 标「推断模板」，绝不标「实测」。轻检与深检的逐项结果是 L4 直接测量。「代表页的深检结果」推广到「该模板所有页面」时属于 `measured_sample`（采样测量），findings 生成时必须按此措辞，不得写成全站实测。

## 6. UI（run 详情新增「站点结构」面板，文案全中文）

- **全站健康统计卡**：总页数、404 数、noindex 数、canonical 指向异常数、孤岛页数（sitemap 有但内链入度为 0）、被 AI 引用页数；截断时明示「已达 200 页上限，另有 N 个 URL 未检查」。
- **模板列表**：pattern、页数、代表页（可更换）、代表页深检摘要（渲染 delta、schema 类型）。
- **页面清单表**：可按 checkStatus / 模板 / 异常类型筛选；行操作「标记为重点页」。
- 更换代表页或标记重点页后，提示「下次 run 生效」（不即时重跑深检，保持 run 的不可变性）。

## 7. 同协议重测（retest）

- 模板集与代表页持久在 project 级 `url_templates`，`source='user'` 的条目启发式不再覆盖 → 基线与重测用同一组代表页。
- retest 对比 = 两条 `site_audit` evidence 快照 diff：404/noindex/孤岛/引用数变化、新增/消失的模板（新模板标「新发现」，不参与本次对比结论）。
- crawl 参数（maxPages/maxDepth）写入 site_audit payload，参数不同的两次 run 不做直接对比（UI 提示协议不一致）。

## 8. 错误处理

| 情况 | 处理 |
|---|---|
| 单页轻检失败（超时/5xx/解析错） | 该页记 `checkStatus='error'` + errorReason，run 继续 |
| sitemap 缺失或 XML 损坏 | 降级为纯内链爬取，site_audit 里记 warning |
| 超页面上限 | 剩余 URL 记 `discovered_only`，UI 明示截断 |
| 某模板深检失败 | 该模板标记失败，其余模板继续；重试由 Inngest step 机制承担 |
| 渲染 provider 未配置 | 跳过渲染步骤（与现状一致），深检退化为 fetch+schema |
| robots.txt 全站 disallow | 不爬内链，仅 sitemap 清单 + 入口页；这本身产出一条高严重度信号 |

## 9. 测试策略

- **纯函数单测**：URL 归一化；模板聚类（数字 id / uuid / 日期 / 多语言前缀不误聚 / 低基数导航页不误聚）；sitemap 解析（index 递归、malformed XML、超大文件截断）。
- **爬虫逻辑单测**（mock fetch）：BFS 深度与 cap 截断、robots disallow 遵守、跨域不爬、重定向归一。
- **handler 级测试**：沿用现有 `collectEvidenceHandler` 的 deps 注入模式，断言 step 顺序、site_audit evidence 形状与 claimLevel、失败分支。
- **citations 归属单测**：citedUrls 与 site_pages 的 URL 归一化匹配。

## 10. 范围外（明确不做）

- 页面级定向 AI 探针（针对单页主题生成 prompt）→ V1。
- 内链边表 / PageRank / 链接深度分析 → V1+。
- JS 渲染后才出现的链接的爬取（爬虫只解析初始 HTML 的 `<a href>`）→ 接受漏收，sitemap 补偿。
- 自动定时重爬、增量爬取 → V1。
- 对 200 页上限外页面的任何检查。
