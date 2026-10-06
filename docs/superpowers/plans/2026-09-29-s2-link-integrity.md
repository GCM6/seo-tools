# S2 断链与断层诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 S1 链接图谱,诊断站内断链、链向跳转/noindex、首页不可达、仅 nofollow 可达、死胡同页与站外链接失效,并在站点结构页展示。

**Architecture:** 纯函数 `analyzeLinkIntegrity(payload)` 统一产出各类清单 → 规则 L01–L07 只做格式化 → 站点结构页复用同一函数出计数;站外链接由新 step 分批 HEAD/GET 抽检,结果写入 `site_audit.payload.externalChecks`。

**Tech Stack:** 同 S1(TypeScript、Next 16、Inngest、linkedom、vitest、pnpm)。

**Spec:** `docs/superpowers/specs/2026-09-29-s2-link-integrity-design.md`(依赖 `2026-09-29-s1-link-graph-foundation-design.md`)

## Global Constraints

- 同 S1 计划的 Global Constraints(pnpm、同层测试、不引入 zod、中文注释标 spec 出处、不 commit、只改计划内文件)。
- 收口基线 = S1 收口:171 文件 / 1359 用例全绿、tsc 0 错、lint 0 错 4 警告(S1 审查修复后以实际数为准)。
- 所有 L 规则:无图谱 → no-op;入口零站内出链 → no-op;只对**已抓**目标下结论。
- `RULES_VERSION = 'rules_v7'`。

## Review Focus

1. **首页按语言跳转**(`/` → `/en/`,导航 logo 链回 `/`):L02 不应把全站 logo 链接都报成"指向跳转" —— 期望入口 URL 不参与 L02。→ Task 1 测试。
2. **大部分页面靠 JS 输出导航**(多数页 outInternal=0):L06 应判为抽取失败而不报死胡同 —— 期望 ≥50% 死胡同时 no-op。→ Task 1 测试。
3. **站外目标全是 LinkedIn/X 等反爬平台**:不应发请求也不应报失效 —— 期望计入 skipped。→ Task 3 测试。
4. **站外 HEAD 被拒(405)但 GET 正常**:不应报失效 —— 期望回退 GET 取真实状态。→ Task 3 测试。
5. **noindex 页首页不可达**:有意隐藏的页不应报孤岛 —— 期望 L04/L05 排除 noindex。→ Task 1 测试。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `lib/crawl/link-graph.ts` | 新增 `reachableViaAnyLink(view)` | 改 |
| `lib/crawl/link-integrity.ts` | 纯分析:各类清单 + 守卫 | 新建 |
| `lib/crawl/external-check.ts` | 站外目标选择 + 状态检测 | 新建 |
| `lib/crawl/site-audit.ts` | payload 挂 `externalChecks` 与协议 | 改 |
| `lib/diagnosis/rules/links.ts` + `rules/index.ts` | L01–L07 规则与注册 | 新建/改 |
| `lib/diagnosis/templates.ts` | L01–L07 建议模板 | 改 |
| `lib/diagnosis/types.ts` | `RULES_VERSION = 'rules_v7'` | 改 |
| `lib/inngest/collect-evidence.ts` | 外链抽检 step;传入审计 | 改 |
| `app/[locale]/runs/[id]/site/page.tsx` + `messages/{zh,en}.json` | 按快照过滤、深度/入链列、链接结构卡片 | 改 |
| `lib/crawl/site-view.ts` | 站点结构页纯函数(快照过滤、深度标签) | 新建 |

---

### Task 1: `reachableViaAnyLink` + `analyzeLinkIntegrity`

**Files:** Modify `lib/crawl/link-graph.ts`;Create `lib/crawl/link-integrity.ts`、`lib/crawl/link-integrity.test.ts`

**Interfaces:**
- Produces:
  - `reachableViaAnyLink(view: LinkGraphView): { urls: Set<string>; complete: boolean }` —— 沿全部边(含 nofollow)从入口 BFS;`complete` = 到达的节点全部已解析。
  - `analyzeLinkIntegrity(payload: SiteAuditPayload): LinkIntegrity | null`
  - `LinkIntegrity { graph: LinkGraphView; broken: TargetRow[]; redirects: TargetRow[]; nonIndexable: TargetRow[]; islands: string[]; islandsExact: boolean; nofollowOnly: string[]; nofollowOnlyExact: boolean; deadEnds: string[]; deadEndSuspect: boolean; unverifiedTargets: number; externalBroken: ExternalBrokenRow[] }`
  - `TargetRow { url: string; httpStatus: number | null; finalUrl?: string | null; reason?: 'noindex' | 'canonical'; edges: LinkGraphEdge[] }`(按 edges.length 降序)
  - `ExternalBrokenRow { url: string; status: number; sources: LinkGraphExternal[] }`

- [ ] **Step 1: 写失败测试** —— 用 S1 的 `buildLinkGraph` + `buildSiteAudit` 构造 payload,覆盖:
  - broken:目标 404 且有入链 → 入 `broken`;目标未抓(只作链接目标)→ 不入,计入 `unverifiedTargets`。
  - redirects:目标 `finalUrl ≠ url` 且 < 400 → 入;**入口 URL 跳转不入**(Review Focus 1)。
  - nonIndexable:目标 200 + `noindex` → reason noindex;canonical 指向本站他页 → reason canonical;只计可跟随边。
  - islands:sitemap + 200 + 非 noindex + 任何边都到不了 + inAll>0 → 入;inAll=0 → 不入(归 T05);noindex → 不入(Review Focus 5);`islandsExact` = `reachableViaAnyLink(...).complete`。
  - nofollowOnly:可跟随不可达但任意边可达 → 入;`nofollowOnlyExact` = `graph.closureComplete`。
  - deadEnds:200 且 `mainTextChars > 0` 且 outInternal=0 → 入;≥50% 已抓 200 页是死胡同 → `deadEndSuspect=true` 且 `deadEnds=[]`(Review Focus 2)。
  - externalBroken:`externalChecks` 中 404/410 → 入,sources 取自 `graph.external`;其他错误不入。
  - 无 linkGraph → null;入口零出链 → null。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现** —— `link-graph.ts` 追加:

```ts
// 沿全部边（含 nofollow、含 meta nofollow 源页）从入口 BFS（spec S2 §3，L04/L05 用）。
export function reachableViaAnyLink(view: LinkGraphView): { urls: Set<string>; complete: boolean } {
  const out = new Map<string, string[]>()
  for (const e of view.edges) {
    const l = out.get(e.from) ?? []
    l.push(e.to)
    out.set(e.from, l)
  }
  const urls = new Set([view.entryUrl])
  const queue = [view.entryUrl]
  for (let i = 0; i < queue.length; i++) {
    for (const v of out.get(queue[i]) ?? []) {
      if (urls.has(v)) continue
      urls.add(v)
      queue.push(v)
    }
  }
  const complete = [...urls].every((u) => view.nodeByUrl.get(u)?.resolved ?? false)
  return { urls, complete }
}
```

`link-integrity.ts` 按 Interfaces 实现:入口守卫;`incoming` 按 `to` 分组;`isNoindex = /(^|[\s,])(noindex|none)([\s,]|$)/i`;canonical 用 `normalizeUrl(canonical, page.url)` 与 `normalizeUrl(page.finalUrl ?? page.url)` 比较且 `isSameSite`;`DEAD_END_SUSPECT_RATIO = 0.5`;清单排序:边数降序、URL 升序。
- [ ] **Step 4: 跑测试确认通过。**

### Task 2: 规则 L01–L07 + 模板 + 版本

**Files:** Create `lib/diagnosis/rules/links.ts`、`links.test.ts`;Modify `rules/index.ts`(注册 `linkRules`,导出)、`templates.ts`(L01–L07)、`types.ts`(rules_v7 + 变更注释)、`rules/geo.test.ts`(版本断言)

**Interfaces:** Consumes `analyzeLinkIntegrity`。Produces `linkRules: Rule[]`(id L01–L07,pillar P1,side technical)。

- [ ] **Step 1: 写失败测试**:每条规则命中时的 title/severity/claimType/detail 形状;不命中返回 null;L01 严重度分档(nav/footer 来源或来源 ≥5 → error);L04/L05 精确与否两种 claimType;L07 无 externalChecks → null。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**:每条规则 `evaluate` 调 `analyzeLinkIntegrity(ctx.siteAudit.payload)`,空清单返回 null;样例最多 10 条,每条 sources 最多 3 条 `{ from, anchor, regions }`;描述措辞按 spec §3 表格(L04/L05 非精确时用"在已抓取范围内未发现……")。模板按 spec §6。`RULES_VERSION = 'rules_v7'`,注释写明 v6→v7 新增 L01–L07。
- [ ] **Step 4: 跑 `pnpm vitest run lib/diagnosis`。**

### Task 3: 站外链接抽检

**Files:** Create `lib/crawl/external-check.ts`、`external-check.test.ts`

**Interfaces:**
- `ExternalCheckResult { url: string; status: number | null; error: 'timeout' | 'dns' | 'blocked_private' | 'other' | null }`
- `selectExternalTargets(pages: { externalLinks: ExternalLinkDetail[] | null }[], cap = 100): { urls: string[]; skippedUrls: number }`
- `checkExternalLinks(urls: string[], opts?: { concurrency?: number; timeoutMs?: number }, fetchImpl = safeFetch): Promise<ExternalCheckResult[]>`
- 常量 `EXTERNAL_CHECK_CAP = 100`、`EXTERNAL_CHECK_BATCH = 25`、`BOT_HOSTILE_HOSTS`

- [ ] **Step 1: 写失败测试**:同页重复 URL 只计 1 个来源;按来源页数降序;平台主机(含子域 `m.facebook.com`)跳过并计数(Review Focus 3);上限截断;HEAD 405 → GET 取真实状态并取消响应体(Review Focus 4);`AbortError` → timeout;`code: 'ENOTFOUND'` → dns;`SsrfBlockedError` → blocked_private;单个抛错不影响其他;并发不超过 `concurrency`。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**(worker 池;`checkOne` 先 HEAD,403/405/501 回退 GET 并 `await res.body?.cancel().catch(() => {})`)。
- [ ] **Step 4: 跑测试确认通过。**

### Task 4: 编排与快照接线

**Files:** Modify `lib/crawl/site-audit.ts`(输入/payload 增 `externalChecks?: ExternalCheckResult[]`、`protocol.externalCheck?: { cap: number; checked: number; skippedUrls: number }`)、`lib/inngest/collect-evidence.ts`、对应测试

- [ ] **Step 1: 写失败测试**(`collect-evidence.test.ts`):`getRunSitePages` 返回带 30 条站外链接的页 → `checkExternalLinks` 被分 2 批调用(25+5),step id 为 `check-external-links-0/1`;site_audit payload 含 `externalChecks` 与 `protocol.externalCheck`;无站外链接 → 不调用且协议 `checked: 0`。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**:`CollectDeps` 增 `checkExternalLinks`;`update-inbound-counts` 之后:

```ts
    // 站外链接抽检（spec S2 §4）：分批 step，结果小（仅 url/status/error），可跨 step 传递。
    const externalTargets = await step.run('select-external-targets', async () =>
      selectExternalTargets(await deps.getRunSitePages(projectId, runId)),
    )
    for (let i = 0; i * EXTERNAL_CHECK_BATCH < externalTargets.urls.length; i++) {
      const chunk = externalTargets.urls.slice(i * EXTERNAL_CHECK_BATCH, (i + 1) * EXTERNAL_CHECK_BATCH)
      externalChecks.push(...(await step.run(`check-external-links-${i}`, () => deps.checkExternalLinks(chunk))))
    }
```

`externalChecks` / `externalTargets` 在 `crawlEnabled` 块外以 `let` 声明;`build-site-audit` 传入 `externalChecks` 与 `externalCheckProtocol`。
- [ ] **Step 4: 跑测试确认通过。**

### Task 5: 站点结构页

**Files:** Create `lib/crawl/site-view.ts`、`site-view.test.ts`;Modify `app/[locale]/runs/[id]/site/page.tsx`、`messages/zh.json`、`messages/en.json`

**Interfaces:**
- `filterToSnapshot<T extends { url: string }>(rows: T[], payload: SiteAuditPayload | null): T[]` —— 有快照只保留快照 URL;无快照原样返回。
- `depthCellsFor(payload: SiteAuditPayload | null): (url: string) => { kind: 'exact' | 'upper' | 'unreachable' | 'no_path_found' | 'unknown'; depth: number | null; inAll: number | null }` —— `upper` 表示图谱深度只是上界(真实深度 ≤ N);深度为空且闭包完整 → `unreachable`,闭包不完整 → `no_path_found`。
- `linkStructureCounts(payload): { reachable: number; unreachableSitemap: number; brokenTargets: number; deadEnds: number; exhaustive: boolean } | null`(来自 `analyzeLinkIntegrity` 与 `graph.summary`)

- [ ] **Step 1: 写失败测试**(`site-view.test.ts`)覆盖三个函数的各分支。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现纯函数;页面接线**:`visiblePages = filterToSnapshot(pages, payload)` 再按状态过滤;表头加"点击深度""入链";深度单元格:exact → `N`,upper → `≤N`(实现时纠正:非精确深度是上界),unreachable → `t('unreachable')`,no_path_found → `t('noPathFound')`,unknown → `—`;统计区后加"链接结构"卡片,`exhaustive=false` 时显示 `t('linkPartialNotice')`。文案新增(zh/en 同步):`linkStructureTitle`、`reachablePages`、`unreachableSitemapPages`、`brokenTargets`、`deadEndPages`、`linkPartialNotice`、`clickDepth`、`inboundLinks`、`unreachable`、`noPathFound`、`entryNoLinksNotice`。
- [ ] **Step 4: 跑测试 + `pnpm exec tsc --noEmit -p .`。**

### Task 6: 端到端 + 全量验证 + 审查

- [ ] **Step 1: 扩展 `link-graph.e2e.test.ts`**:假站点加 `/moved`(301 → `/a`,由 `/en/` 链接)与一个页面链到的站外 404;以真实 `analyzeLinkIntegrity` + `linkRules` 断言 L01(`/broken`)、L02(`/moved`)、L04(`/x`、`/y`)、L05(`/nf`)、L06(`/lonely`、`/e`、`/nf` 等无出链页)、L07(注入的 externalChecks)真实触发。
- [ ] **Step 2: 全量** `pnpm test`、tsc、lint,不低于基线。
- [ ] **Step 3: 并发改动检查**(对比 S2 开工前快照)。
- [ ] **Step 4: 独立只读审查代理**(只给 spec + 改动清单),确认问题回到对应 Task 修复。
- [ ] **Step 5: 更新项目 memory。**
