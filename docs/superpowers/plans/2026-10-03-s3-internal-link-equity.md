# S3 内链权重诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 S1 链接图上算站内 PageRank,对照 GSC 有流量页与人工重点页,诊断"权重是否给到了该给的页"(W01–W04),并在站点结构页显示每页内链权重百分位。

**Architecture:** 纯函数 `analyzeLinkEquity({ payload, queryPageMetrics })`(`lib/crawl/link-equity.ts`)统一产出 PageRank、百分位、高价值页集合、低价值页原因;规则 `lib/diagnosis/rules/equity.ts` 只做格式化;站点结构页用 `equityPercentileFor` 出列值。

**Tech Stack:** 同 S1/S2。

**Spec:** `docs/superpowers/specs/2026-09-29-s3-internal-link-equity-design.md`(依赖 S1 spec §12、S2 spec §10 的口径)

## Global Constraints

- 同 S1/S2 计划的 Global Constraints(pnpm、同层测试、不引入 zod、中文注释标 spec 出处、不 commit、只改计划内文件;改 messages/*.json 用文本级插入)。
- 收口基线:175 文件 / 1459 用例全绿、tsc 0 错、lint 0 错 4 警告。
- W01/W02/W04 一律 `inferred`(PageRank 是模型);W03 锚文本分布是实测事实 → `measured_hard`。
- `RULES_VERSION = 'rules_v8'`。

## Review Focus

1. **GSC 页面 URL 与爬取 URL 写法不同**(www、末尾斜杠、跳转前地址):高价值页必须能对齐到图谱节点 —— 期望经 `normalizeUrl` + `nodeFor` 对齐。→ Task 1 测试。
2. **站点很小(<10 个 HTML 页)**:百分位无意义 —— 期望 W 规则整组不判定。→ Task 1 测试。
3. **没有 GSC 也没有人工重点页**:不能猜哪些页重要 —— 期望 W01/W03/W04 不判定,W02 照常(只依赖低价值页识别)。→ Task 2 测试。
4. **图谱是抽样(闭包不完整、覆盖率低)**:PageRank 偏向首页附近 —— 期望 detail 带 coverage,覆盖率 < 50% 时描述追加提示。→ Task 2 测试。
5. **锚文本带标点/箭头/大小写**("Read more »"、"了解更多>"):应识别为泛化锚文本 —— 期望归一化后匹配。→ Task 1 测试。

---

### Task 1: `link-equity.ts` 计算层

**Files:** Create `lib/crawl/link-equity.ts`、`link-equity.test.ts`;Modify `lib/crawl/link-integrity.ts`(导出 `canonicalElsewhere`、`isNoindex`)

**Interfaces:**
- `internalPageRank(view: LinkGraphView): Map<string, number>` —— 可跟随边上的经典 PageRank(阻尼 0.85,均匀跳转,悬挂节点质量均匀重分配,迭代至 L1 变化 < 1e-6 或 100 轮),总和为 1。
- `isGenericAnchor(anchor: string): boolean`
- `analyzeLinkEquity(input: { payload: Pick<SiteAuditPayload, 'pages' | 'linkGraph'>; queryPageMetrics: { page: string; clicks: number; impressions: number }[] }): LinkEquity | null`
- `LinkEquity { graph; rank: Map<string, number>; percentile: Map<string, number>; htmlCount: number; coverage: number; valuePages: ValuePage[]; lowValue: Map<string, LowValueReason[]>; hasGsc: boolean }`
- `ValuePage { url: string; source: 'key' | 'gsc' | 'both'; clicks: number; impressions: number }`
- `LowValueReason = 'noindex' | 'canonical' | 'utility' | 'pagination' | 'zero_impressions'`
- `equityPercentileFor(payload): (url: string) => number | null`(UI 用,不需要 GSC)
- 常量 `MIN_HTML_PAGES = 10`、`VALUE_TOP_SHARE = 0.2`

- [ ] **Step 1: 写失败测试**:PageRank 与手算一致(三节点环每点 1/3;星形中心最高)、总和为 1、悬挂节点重分配、nofollow 边不传递;百分位在已抓 HTML 节点中计算;GSC 聚合(同页多查询求和、`https://www.ex.com/p/` 对齐到 `https://ex.com/p`、跳转前 URL 经 nodeFor 对齐)、取前 20% 且点击 ≥1 或展现 ≥50;人工重点页并入(source=both);低价值页五类原因;HTML 页 < 10 → null;入口零出链 → null;泛化锚文本(中英、标点箭头、大小写)。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 跑测试确认通过。**

### Task 2: 规则 W01–W04 + 模板 + 版本

**Files:** Create `lib/diagnosis/rules/equity.ts`、`equity.test.ts`;Modify `rules/index.ts`、`templates.ts`、`types.ts`、`rules/geo.test.ts`

- [ ] **Step 1: 写失败测试**:W01 命中/不命中/无高价值页 no-op、覆盖率提示;W02 前 10 中低价值 ≥3 命中、<3 不命中;W03 泛化占比 ≥50% 且入链 ≥3 命中、入链 <3 不判;W04 正文区入链占比 <20% 命中。claimType:W01/W02/W04 inferred,W03 measured_hard。
- [ ] **Step 2–4:** 实现、注册、模板(W01:"为高价值页增加来自正文与相关页的可跟随内链"…)、`rules_v8`,跑 `pnpm vitest run lib/diagnosis`。

### Task 3: 站点结构页"内链权重"列

**Files:** Modify `lib/crawl/site-view.ts`(`equityCellsFor`)、`site-view.test.ts`、`app/[locale]/runs/[id]/site/page.tsx`、`messages/{zh,en}.json`(`site.linkEquity`、`terms.linkEquity`,文本级插入)

- [ ] 测试:有图谱且 HTML 页 ≥10 → 已抓 HTML 页返回百分位,其余 null;否则全 null。
- [ ] 页面加列,表头带术语解释:"站内 PageRank 模型估算,仅反映本次抓取的链接结构,不是搜索引擎的真实权重"。

### Task 4: 端到端 + 全量 + 审查

- [ ] 新建 `lib/crawl/link-equity.e2e.test.ts`:假站点 15 页(首页导航链 12 页,"/pricing" 只在第 3 层被 1 页链接),真实 light-check → 爬虫 → 图谱 → site_audit → `buildRuleContext`(注入 GSC 页面数据:/pricing 点击最高)→ 断言 W01 命中 /pricing。
- [ ] 全量 `pnpm test` / tsc / lint 不低于基线。
- [ ] 真实站点冒烟(metadocu.com):打印前 10 名 PageRank 与 W 规则命中,人工核对合理性。
- [ ] S3 与 S4 完成后合并派一次独立只读审查。
