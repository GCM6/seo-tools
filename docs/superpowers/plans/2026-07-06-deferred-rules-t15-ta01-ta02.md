# 延后规则第 1 组实现计划：T15 / TA01 / TA02

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地三条不依赖时序基线的诊断规则——T15 低价值语言页泛滥、TA01 主题覆盖浅/话题群割裂、TA02 话题群缺 Hub 页——把规则总数从 55 提到 58。

**Architecture:** 纯规则层增量。三条规则全部读**已有** `RuleContext` 字段（`siteAudit.payload.templates`/`pages`、`queryPageMetrics`），复用既有 URL 模板聚类纯函数 `clusterTemplates` 与新抽的语言路径识别函数 `isLanguagePathTemplate`。不改契约层（types/context/collect-evidence/schema），不新建采集器。

**Tech Stack:** TypeScript、Vitest、既有 `lib/diagnosis` 规则引擎。

## Global Constraints

- 上游真源：`docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §101(T15)/§126(TA01)/§127(TA02)；本切片设计：`docs/superpowers/specs/2026-07-06-deferred-rules-t15-ta01-ta02-design.md`。
- 编码前必读 `veris-coding` skill（React 19 + Next.js 16、Next 全栈、libSQL/Drizzle、Vercel 铁律）。
- 三条规则 `claimType` 全部为 `inferred`；`severity`：T15=`warning`，TA01/TA02=`notice`。阈值全部为**启发式、无行业标准**，随 `RULES_VERSION` 固化。
- 话术只作机制性推断，**绝不作排名断言**；主题权威恒作结构性建议。
- 证据先于结论：每条命中 `evidenceRefs` 非空（引擎二次过滤空引用）。
- UI/用户可见文案用中文；变量/函数/字段用英文（CLAUDE.md 语言规范）。
- Commit message 用中文，结尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 验收门槛（每条规则完成时全绿）：`npx tsc --noEmit` 0 error / `npm run lint` 0 error / `npm test` 全绿 / `npm run build` ✓。

## 现有结构锚点（实现者必读）

- `Rule` 对象形状（见 `lib/diagnosis/rules/technical.ts` 内 T14）：`{ id, pillar: 'P1'|'P2'|..., side: 'seo'|'geo'|'technical', severity: 'error'|'warning'|'notice', claimType, evaluate(ctx): RuleHitDraft | RuleHitDraft[] | null }`。
- `RuleHitDraft`：`{ title, description, evidenceRefs: string[], scope: string, detail?: Record<string, unknown>, severity?, claimType? }`。
- `RuleContext` 相关字段：
  - `ctx.siteAudit`：`{ id: string; payload: SiteAuditPayload } | null`。
  - `SiteAuditPayload.templates`：`{ pattern: string; pageCount: number; representativeUrl: string | null }[]`。
  - `SiteAuditPayload.pages`：`SiteAuditPage[]`，每项含 `url`、`inboundLinkCount: number`、`isKeyPage`、`templateId` 等。
  - `ctx.queryPageMetrics`：`{ evidenceId: string | null; page: string; query: string; clicks: number; impressions: number; position: number }[]`（GSC 未连接时为空数组）。
- 规则注册：`technical.ts` 末尾 `export const technicalRules: Rule[] = [...]`；`content.ts` 末尾 `export const contentRules: Rule[] = [...]`。`rules/index.ts` 的 `allRules` 自动汇总，**无需改**。
- 建议模板：`lib/diagnosis/templates.ts` 的 `export const templates: Record<string, RecommendationTemplate>`，按 `ruleId` 加键。`RecommendationTemplate = { what, whyHint, effort: 'low'|'mid'|'high', validationMethod, promptType: 'content'|'technical', fixSnippet?, negativeConstraints?, risk?, validationSpec? }`。
- URL 聚类纯函数：`import { clusterTemplates } from '@/lib/crawl/template-cluster'`，`clusterTemplates(urls: string[], entryUrl?): { pattern: string; urls: string[] }[]`——TA01/TA02 用它从 `pages[].url` 重建「模板→成员 URL」映射（与 `templates[]` 同逻辑，避免 `templateId` 是行 id 无法 join 的问题）。
- 测试 helper：`technical.test.ts` 有 `baseCtx()`/`page()`/`audit(stats, pages)`；`content.test.ts` 有 `baseCtx()`/`page()`/`audit(pages, templates)`。沿用它们构造 ctx。

---

### Task 1: T15 低价值语言页泛滥 + 共享语言路径识别函数

**Files:**
- Modify: `lib/diagnosis/rules/technical.ts`（加 `isLanguagePathTemplate` 导出 + `firstPathSegment` + ISO 639-1 白名单 + `T15` 规则 + 注册进 `technicalRules`）
- Modify: `lib/diagnosis/templates.ts`（加 `T15` 模板键）
- Test: `lib/diagnosis/rules/technical.test.ts`（加 `isLanguagePathTemplate` 与 `T15` 用例）

**Interfaces:**
- Produces: `export function isLanguagePathTemplate(pattern: string): boolean`（Task 2/3 从 `./technical` 导入）。
- Consumes: 既有 `Rule`/`RuleHitDraft`、`ctx.siteAudit`、`ctx.queryPageMetrics`。

- [ ] **Step 1: 写失败测试（isLanguagePathTemplate + T15）**

在 `lib/diagnosis/rules/technical.test.ts` 末尾追加。先在文件顶部 import 处加入 `isLanguagePathTemplate`：

```ts
import { technicalRules, isLanguagePathTemplate } from './technical'
```

追加测试：

```ts
describe('isLanguagePathTemplate', () => {
  it('识别语言首段模板', () => {
    expect(isLanguagePathTemplate('/de/{slug}')).toBe(true)
    expect(isLanguagePathTemplate('/zh-cn/products')).toBe(true)
    expect(isLanguagePathTemplate('https://example.com/fr/a')).toBe(true)
  })
  it('非语言首段返回 false', () => {
    expect(isLanguagePathTemplate('/products/{id}')).toBe(false)
    expect(isLanguagePathTemplate('/blog/{slug}')).toBe(false)
    expect(isLanguagePathTemplate('/')).toBe(false)
  })
})

describe('T15 低价值语言页泛滥', () => {
  // 造 2 种语言各 6 页共 12 页语言页，其中 11 页零展示（>10 且占比 >0.7）。
  const langPages = () => {
    const ps: ReturnType<typeof page>[] = []
    for (const lang of ['de', 'fr']) {
      for (let i = 0; i < 6; i++) ps.push(page({ url: `https://example.com/${lang}/p${i}` }))
    }
    return ps
  }
  const langTemplates = [
    { pattern: '/de/{slug}', pageCount: 6, representativeUrl: null },
    { pattern: '/fr/{slug}', pageCount: 6, representativeUrl: null },
  ]
  const withTemplates = (
    saPages: ReturnType<typeof page>[],
    templates = langTemplates,
  ): RuleContext['siteAudit'] => {
    const sa = audit({}, saPages)!
    sa.payload.templates = templates
    return sa
  }

  it('GSC 未连接时 no-op', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withTemplates(langPages())
    // queryPageMetrics 为空 => 无 GSC
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })

  it('命中：2 种语言 + 零展示占比达标', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withTemplates(langPages())
    // 只有 /de/p0 有展示，其余 11 页零展示
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/de/p0', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    const hit = rule('T15').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1', 'gsc1'])
    expect(hit.detail!.zeroImpressionCount).toBe(11)
    expect((hit.detail!.langCodes as string[]).sort()).toEqual(['de', 'fr'])
  })

  it('单语言（<2 种）no-op', () => {
    const ctx = baseCtx()
    const ps = Array.from({ length: 12 }, (_, i) => page({ url: `https://example.com/de/p${i}` }))
    ctx.siteAudit = withTemplates(ps, [{ pattern: '/de/{slug}', pageCount: 12, representativeUrl: null }])
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/de/p0', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })

  it('零展示未达绝对数下限 no-op', () => {
    const ctx = baseCtx()
    // 2 种语言各 2 页 = 4 页，即使全零展示也 <10
    const ps = ['de', 'fr'].flatMap((l) => [0, 1].map((i) => page({ url: `https://example.com/${l}/p${i}` })))
    ctx.siteAudit = withTemplates(ps, langTemplates)
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/other', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/rules/technical.test.ts`
Expected: FAIL —— `isLanguagePathTemplate` 未导出 / `rule('T15')` 为 undefined。

- [ ] **Step 3: 实现 isLanguagePathTemplate + T15**

在 `lib/diagnosis/rules/technical.ts` 顶部常量区（现有阈值常量附近）加入：

```ts
// —— T15 低价值语言页泛滥（启发式阈值，随 RULES_VERSION 固化，非行业硬标准）——
const T15_MIN_LANG_CODES = 2 // 至少 2 种语言路径才判定多语言泛滥
const T15_ZERO_IMPRESSION_RATIO = 0.7 // 语言页零展示占比告警线
const T15_MIN_ZERO_PAGES = 10 // 零展示语言页绝对数下限

// ISO 639-1 语言码白名单（语言路径首段匹配用）。
const ISO_639_1_CODES = new Set([
  'aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs',
  'ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff',
  'fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id',
  'ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku',
  'kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my',
  'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu',
  'rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv',
  'sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo',
  'wa','wo','xh','yi','yo','za','zh','zu',
])

// 取 URL 或模板 pattern 的首段路径（小写、剥前导斜杠）。
function firstPathSegment(urlOrPattern: string): string {
  let path = urlOrPattern
  try {
    path = new URL(urlOrPattern).pathname
  } catch {
    // pattern 形如 '/de/{slug}'（相对路径），直接用原串
  }
  return (path.replace(/^\/+/, '').split('/')[0] ?? '').toLowerCase()
}

// 判断模板 pattern（或 URL）首段是否为语言路径（/de/*、/zh-cn/*）。
export function isLanguagePathTemplate(pattern: string): boolean {
  const first = firstPathSegment(pattern)
  if (!first) return false
  const lang = first.includes('-') ? first.split('-')[0] : first
  return ISO_639_1_CODES.has(lang)
}
```

在规则定义区（T14 之后、`technicalRules` 数组之前）加入 T15：

```ts
// T15：低价值语言页泛滥（语言路径模板 × GSC 零展示交叉）。
// 「低价值」核心证据是 GSC 零展示实测，无 GSC 不可验证 → 整条 no-op（宁缺毋滥）。
const T15: Rule = {
  id: 'T15',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const gscEvidenceId = ctx.queryPageMetrics.find((m) => m.evidenceId)?.evidenceId
    if (!gscEvidenceId) return null // 无 GSC：不可验证「低价值」

    const langCodes = new Set(
      audit.payload.templates
        .filter((t) => isLanguagePathTemplate(t.pattern))
        .map((t) => {
          const first = firstPathSegment(t.pattern)
          return first.includes('-') ? first.split('-')[0] : first
        }),
    )
    if (langCodes.size < T15_MIN_LANG_CODES) return null

    const langPages = audit.payload.pages.filter((p) => isLanguagePathTemplate(p.url))
    if (langPages.length === 0) return null

    const stripSlash = (u: string) => u.replace(/\/$/, '')
    const impressed = new Set(
      ctx.queryPageMetrics.filter((m) => m.impressions > 0).map((m) => stripSlash(m.page)),
    )
    const zeroPages = langPages.filter((p) => !impressed.has(stripSlash(p.url)))
    const zeroRatio = zeroPages.length / langPages.length
    if (zeroPages.length < T15_MIN_ZERO_PAGES || zeroRatio < T15_ZERO_IMPRESSION_RATIO) return null

    return {
      title: '低价值语言页泛滥',
      description: `识别到 ${langCodes.size} 种语言路径下共 ${zeroPages.length} 页在 GSC 近 90 天零展示（占语言页 ${Math.round(zeroRatio * 100)}%），疑似翻译插件批量生成、耗抓取预算并稀释权重（推断）。`,
      evidenceRefs: [audit.id, gscEvidenceId],
      scope: 'site',
      detail: {
        langCodes: [...langCodes],
        langPageCount: langPages.length,
        zeroImpressionCount: zeroPages.length,
        zeroRatio: Number(zeroRatio.toFixed(2)),
        sampleUrls: zeroPages.slice(0, 5).map((p) => p.url),
      },
    }
  },
}
```

把 `T15` 加进数组（保持既有顺序风格，追加到 T14 之后）：

```ts
export const technicalRules: Rule[] = [T01, T02, T03, T04, T05, T06, T07, T08, T10, T11, T12, T13, T14, T15, T09a, T09b, T09c]
```

- [ ] **Step 4: 加 T15 建议模板**

在 `lib/diagnosis/templates.ts` 的 `templates` 对象中，`T14` 键之后加入：

```ts
  T15: {
    what: '核实语言页价值：对 GSC 零展示的语言路径页评估合并或加 noindex，翻译插件批量生成页按价值取舍，把抓取预算释放给主力页。',
    whyHint: '大量零展示语言页耗抓取预算、稀释权重（翻译插件泛滥的常见成因）。',
    effort: 'mid',
    validationMethod: '重新采集 + GSC 观察语言页展示是否回升，或抓取预算是否集中到主力页。',
    promptType: 'technical',
  },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/rules/technical.test.ts`
Expected: PASS（新增 6 个用例全绿）。

- [ ] **Step 6: 全量门槛**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc 0 error / lint 0 error / 全部测试绿。

- [ ] **Step 7: Commit**

```bash
git add lib/diagnosis/rules/technical.ts lib/diagnosis/rules/technical.test.ts lib/diagnosis/templates.ts
git commit -m "feat(rules): T15 低价值语言页泛滥——语言路径模板×GSC零展示交叉

抽 isLanguagePathTemplate 共享纯函数（ISO 639-1 首段白名单）；无 GSC 整条 no-op
（低价值不可离线验证）；warning/inferred，阈值启发式。规则 55→56。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: TA01 主题覆盖浅/话题群割裂

**Files:**
- Modify: `lib/diagnosis/rules/content.ts`（加 import + TA 阈值常量 + `TA01` 规则 + 注册进 `contentRules`）
- Modify: `lib/diagnosis/templates.ts`（加 `TA01` 模板键）
- Test: `lib/diagnosis/rules/content.test.ts`（加 `TA01` 用例）

**Interfaces:**
- Consumes: `isLanguagePathTemplate`（从 `./technical`）、`clusterTemplates`（从 `@/lib/crawl/template-cluster`）、`SiteAuditPage` 类型（`content.test.ts` 已 import）。
- Produces: `contentRules` 含 `TA01`。

- [ ] **Step 1: 写失败测试**

在 `lib/diagnosis/rules/content.test.ts` 末尾追加。`content.test.ts` 顶部已 import `SiteAuditPage`/`SiteAuditTemplate` 与 `audit(pages, templates)` helper：

```ts
describe('TA01 主题覆盖浅 / 话题群割裂', () => {
  it('命中：浅覆盖群 + 孤立群', () => {
    const ctx = baseCtx()
    // /blog 群 5 页但入度全 0（孤立）；/about 群 1 页（浅）
    const pages = [
      ...Array.from({ length: 5 }, (_, i) => page({ url: `https://example.com/blog/p${i}`, inboundLinkCount: 0 })),
      page({ url: 'https://example.com/about/x', inboundLinkCount: 8 }),
    ]
    ctx.siteAudit = audit(pages)
    const hit = rule('TA01').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1'])
    const detail = hit.detail as { shallowClusters: unknown[]; isolatedClusters: unknown[] }
    expect(detail.shallowClusters.length).toBeGreaterThanOrEqual(1) // /about 1 页
    expect(detail.isolatedClusters.length).toBeGreaterThanOrEqual(1) // /blog 入度 0
  })

  it('语言路径群不计入话题群', () => {
    const ctx = baseCtx()
    // 只有 /de 语言群 1 页，应被排除 => 无话题群 => null
    ctx.siteAudit = audit([page({ url: 'https://example.com/de/p0', inboundLinkCount: 0 })])
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })

  it('深且互链的话题群不命中', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 6 }, (_, i) =>
      page({ url: `https://example.com/guide/p${i}`, inboundLinkCount: 5 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })

  it('无 siteAudit 时 no-op', () => {
    const ctx = baseCtx()
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/rules/content.test.ts`
Expected: FAIL —— `rule('TA01')` 为 undefined。

- [ ] **Step 3: 实现 TA01**

在 `lib/diagnosis/rules/content.ts` 顶部 import 区，扩展既有 `./technical` import 并新增 `clusterTemplates`、`SiteAuditPage`：

```ts
import { pagesWithExtra, C09_ALT_MISSING_RATIO, SCANNABILITY_PARA_WORDS, isLanguagePathTemplate } from './technical'
import { clusterTemplates } from '@/lib/crawl/template-cluster'
import type { SiteAuditPage } from '@/lib/crawl/site-audit'
```

在常量区加入 TA 阈值：

```ts
// —— TA01/TA02 主题权威（结构性建议、恒 inferred/notice；阈值启发式，无行业标准）——
// 「群内内链密度」以站内全站入度均值近似，非严格群内邻接（见切片设计 §2）。
const TA01_SHALLOW_MAX_PAGES = 2 // 话题群页数 ≤ 此值视为「有话题无深度」
const TA01_ISOLATED_AVG_INBOUND = 1 // 群内页站内入度均值 < 此值视为孤立
```

在规则区（`contentRules` 数组之前）加入 TA01：

```ts
// TA01：主题覆盖浅/话题群割裂。用 clusterTemplates 从页面 URL 重建话题群（排除语言路径群），
// 群内内链密度以站内入度均值近似（非严格群内邻接）。恒结构性建议、不作排名断言。
const TA01: Rule = {
  id: 'TA01',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const auditCtx = ctx.siteAudit
    if (!auditCtx) return null
    const byUrl = new Map(auditCtx.payload.pages.map((p) => [p.url, p]))
    const clusters = clusterTemplates(auditCtx.payload.pages.map((p) => p.url)).filter(
      (c) => !isLanguagePathTemplate(c.pattern),
    )
    if (clusters.length === 0) return null

    const stripSlash = (u: string) => u.replace(/\/$/, '')
    const impressionOf = (url: string) =>
      ctx.queryPageMetrics
        .filter((m) => stripSlash(m.page) === stripSlash(url))
        .reduce((s, m) => s + m.impressions, 0)

    type ClusterRow = { pattern: string; pageCount: number; avgInbound: number; gscImpressions: number }
    const shallow: ClusterRow[] = []
    const isolated: ClusterRow[] = []
    for (const c of clusters) {
      const pages = c.urls.map((u) => byUrl.get(u)).filter((p): p is SiteAuditPage => !!p)
      if (pages.length === 0) continue
      const avgInbound = pages.reduce((s, p) => s + p.inboundLinkCount, 0) / pages.length
      const row: ClusterRow = {
        pattern: c.pattern,
        pageCount: pages.length,
        avgInbound: Number(avgInbound.toFixed(1)),
        gscImpressions: c.urls.reduce((s, u) => s + impressionOf(u), 0),
      }
      if (pages.length <= TA01_SHALLOW_MAX_PAGES) shallow.push(row)
      if (avgInbound < TA01_ISOLATED_AVG_INBOUND) isolated.push(row)
    }
    if (shallow.length === 0 && isolated.length === 0) return null

    const parts: string[] = []
    if (shallow.length) parts.push(`${shallow.length} 个话题群仅 1-2 页（有话题无深度）`)
    if (isolated.length) parts.push(`${isolated.length} 个话题群站内入度均值近乎为 0（话题群孤立）`)
    return {
      title: '主题覆盖浅 / 话题群割裂',
      description: `${parts.join('；')}。（群内内链密度以站内入度均值近似，非严格群内邻接。）主题权威系行业经验框架、非官方排名因子，此处仅作结构性建议。`,
      evidenceRefs: [auditCtx.id],
      scope: 'site',
      detail: { shallowClusters: shallow, isolatedClusters: isolated },
    }
  },
}
```

把 `TA01` 追加进数组：

```ts
export const contentRules: Rule[] = [C01, C02, C03, C05a, C04, C05b, C05c, C05d, C06, C07, C08, C09, C10, C11, TA01]
```

- [ ] **Step 4: 加 TA01 建议模板**

在 `lib/diagnosis/templates.ts` 的 `templates` 对象末尾（内容类模板区）加入：

```ts
  TA01: {
    what: '补足浅覆盖话题群的内容深度（围绕核心话题扩展子主题页），并在孤立话题群之间建立主题内链，形成话题网络。',
    whyHint: '话题群仅 1-2 页或群内近乎无站内入度，主题覆盖浅且割裂（结构性推断，非排名断言）。',
    effort: 'high',
    validationMethod: '重新统计话题群页数与群内入度均值是否提升；GSC 观察该话题聚合展示是否上升。',
    promptType: 'content',
  },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/rules/content.test.ts`
Expected: PASS（新增 4 个用例全绿）。

- [ ] **Step 6: 全量门槛**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add lib/diagnosis/rules/content.ts lib/diagnosis/rules/content.test.ts lib/diagnosis/templates.ts
git commit -m "feat(rules): TA01 主题覆盖浅/话题群割裂

clusterTemplates 重建话题群（排语言群），浅覆盖(≤2页)/孤立(入度均值<1)两类命中；
群内内链密度以站内入度均值近似（诚实声明）；notice/inferred、恒结构性建议。规则 56→57。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: TA02 话题群缺 Hub 页

**Files:**
- Modify: `lib/diagnosis/rules/content.ts`（加 TA02 阈值常量 + `TA02` 规则 + 注册进 `contentRules`）
- Modify: `lib/diagnosis/templates.ts`（加 `TA02` 模板键）
- Test: `lib/diagnosis/rules/content.test.ts`（加 `TA02` 用例）

**Interfaces:**
- Consumes: 同 Task 2 的 import（`clusterTemplates`、`isLanguagePathTemplate`、`SiteAuditPage` 已在 Task 2 引入，本任务直接复用）。
- Produces: `contentRules` 含 `TA02`。

- [ ] **Step 1: 写失败测试**

在 `lib/diagnosis/rules/content.test.ts` 末尾追加：

```ts
describe('TA02 话题群缺 Hub 页', () => {
  it('命中：大话题群无高入度中心页', () => {
    const ctx = baseCtx()
    // /docs 群 5 页，最高入度 3（<5）=> 缺 hub
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: i === 0 ? 3 : 1 }),
    )
    ctx.siteAudit = audit(pages)
    const hit = rule('TA02').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1'])
    const detail = hit.detail as { clustersWithoutHub: { pattern: string; maxInbound: number }[] }
    expect(detail.clustersWithoutHub[0].maxInbound).toBe(3)
  })

  it('有 Hub 页（高入度中心）不命中', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: i === 0 ? 9 : 1 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })

  it('小话题群（<4 页）跳过', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 3 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: 0 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })

  it('无 siteAudit 时 no-op', () => {
    const ctx = baseCtx()
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- lib/diagnosis/rules/content.test.ts`
Expected: FAIL —— `rule('TA02')` 为 undefined。

- [ ] **Step 3: 实现 TA02**

在 `lib/diagnosis/rules/content.ts` 的 TA 阈值常量区（TA01 阈值之后）加入：

```ts
const TA02_HUB_CLUSTER_MIN_PAGES = 4 // 话题群 ≥ 此页数才谈得上需要 Hub
const TA02_HUB_MIN_INBOUND = 5 // 群内最高入度 < 此值视为缺 Hub 页
```

在规则区（TA01 之后、`contentRules` 数组之前）加入 TA02：

```ts
// TA02：话题群缺 Hub 页（Pillar-Cluster 结构缺失）。群内最大站内入度 < 阈值即判缺中心页。
// 「主题权威」系行业经验框架、非官方排名因子，恒作结构性建议、不作排名断言。
const TA02: Rule = {
  id: 'TA02',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const auditCtx = ctx.siteAudit
    if (!auditCtx) return null
    const byUrl = new Map(auditCtx.payload.pages.map((p) => [p.url, p]))
    const clusters = clusterTemplates(auditCtx.payload.pages.map((p) => p.url)).filter(
      (c) => !isLanguagePathTemplate(c.pattern),
    )
    const noHub: { pattern: string; pageCount: number; maxInbound: number; representativeUrl: string }[] = []
    for (const c of clusters) {
      const pages = c.urls.map((u) => byUrl.get(u)).filter((p): p is SiteAuditPage => !!p)
      if (pages.length < TA02_HUB_CLUSTER_MIN_PAGES) continue
      const maxInbound = Math.max(...pages.map((p) => p.inboundLinkCount))
      if (maxInbound < TA02_HUB_MIN_INBOUND) {
        noHub.push({ pattern: c.pattern, pageCount: pages.length, maxInbound, representativeUrl: pages[0].url })
      }
    }
    if (noHub.length === 0) return null

    return {
      title: '话题群缺 Hub 页（Pillar-Cluster 结构缺失）',
      description: `${noHub.length} 个话题群（≥${TA02_HUB_CLUSTER_MIN_PAGES} 页）无高入度中心页，缺 Pillar-Cluster 结构。建议建支柱页并从各子页内链指向（结构性建议，非排名断言）。`,
      evidenceRefs: [auditCtx.id],
      scope: 'site',
      detail: { clustersWithoutHub: noHub },
    }
  },
}
```

把 `TA02` 追加进数组：

```ts
export const contentRules: Rule[] = [C01, C02, C03, C05a, C04, C05b, C05c, C05d, C06, C07, C08, C09, C10, C11, TA01, TA02]
```

- [ ] **Step 4: 加 TA02 建议模板**

在 `lib/diagnosis/templates.ts` 的 `templates` 对象中，`TA01` 键之后加入：

```ts
  TA02: {
    what: '为大话题群建立 Pillar（Hub）页作为主题中心，并从各子页内链指向该 Hub，形成 Pillar-Cluster 结构。',
    whyHint: '大话题群无高入度中心页，缺 Pillar-Cluster 结构（结构性推断，非排名断言）。',
    effort: 'mid',
    validationMethod: '重新统计目标话题群是否出现 inboundLinkCount 达标的 Hub 页。',
    promptType: 'content',
  },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- lib/diagnosis/rules/content.test.ts`
Expected: PASS（新增 4 个用例全绿）。

- [ ] **Step 6: 全量门槛 + 构建**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tsc 0 / lint 0 / 测试全绿（预计 592 → ~606）/ build ✓。

- [ ] **Step 7: Commit**

```bash
git add lib/diagnosis/rules/content.ts lib/diagnosis/rules/content.test.ts lib/diagnosis/templates.ts
git commit -m "feat(rules): TA02 话题群缺 Hub 页（Pillar-Cluster 结构缺失）

大话题群(≥4页)最大入度<5 判缺 hub；notice/inferred、恒结构性建议不作排名断言。
规则 57→58，延后规则第 1 组落地完成。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage：**
- 切片设计 §4.1 T15 → Task 1 ✓（语言路径识别 + GSC 零展示交叉 + 无 GSC no-op + 阈值）。
- §4.2 TA01 → Task 2 ✓（浅覆盖 + 孤立 + 近似声明 + GSC 可选增强 gscImpressions）。
- §4.3 TA02 → Task 3 ✓（≥4 页群 + 最大入度<5 缺 hub）。
- §5 三条模板 → 各 Task Step 4 ✓。
- §6 注册（technicalRules/contentRules）→ 各 Task Step 3 ✓；无契约层改动 ✓。
- §7 共享 `isLanguagePathTemplate` → Task 1 导出、Task 2/3 复用 ✓。
- §8 测试矩阵 → 各 Task Step 1 覆盖命中/no-op/边界 ✓。

**2. Placeholder scan：** 无 TBD/TODO；每个 code step 均含完整代码。✓

**3. Type consistency：**
- `isLanguagePathTemplate(pattern: string): boolean` 在 Task 1 导出、Task 2/3 一致引用 ✓。
- `clusterTemplates(urls): { pattern; urls }[]` 与 `TemplateCluster` 形状一致 ✓。
- TA01/TA02 均 `pillar:'P2' side:'seo' severity:'notice' claimType:'inferred'`，T15 `pillar:'P1' side:'technical' severity:'warning' claimType:'inferred'` ✓。
- 测试里 `page()` 来自各自 test 文件 helper，`audit()` 签名分别为 `audit(stats, pages)`（technical）/`audit(pages, templates)`（content）——用法与 helper 一致 ✓。
- Task 1 T15 测试用 `sa.payload.templates = ...` 覆盖（technical 的 `audit` helper 不接受 templates 参数），与 helper 实际签名一致 ✓。
