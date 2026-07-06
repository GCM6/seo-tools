import type { Rule, RuleHitDraft, RuleSeverity } from '../types'
import { analyzeCwv, lighthouseClues, ttfbConcern, TTFB_SLOW_MS } from '@/lib/collection/psi-analyze'

// P1 技术健康规则组（确定性、纯函数，消费已落库证据）。
// —— 阈值均为启发式经验值，随 RULES_VERSION 版本化，非行业硬标准 ——
const HTTP_ERROR_WARN_RATIO = 0.05 // 4xx+5xx 占已检页比例的告警线
const HTTP_ERROR_ERROR_RATIO = 0.15 // 超过此比例升级为 error
export const RENDER_DEPENDENCY_RATIO = 0.3 // 初始正文/渲染后正文 低于此值判为渲染依赖
const KEY_PAGE_MIN_INBOUND = 3 // 关键/聚合页最低内链入度
const MAX_DEPTH = 3 // 点击深度上限：超过 3 层视为过深（权重传导与抓取效率下降）

// 渲染依赖判定：computeMainContentDelta 语义下 delta = renderedChars - initialChars，
// 「初始 HTML 正文占渲染后正文 <30%」等价于 initialChars/renderedChars < 0.3。
// renderedChars<=0 表示渲染后也无正文，不构成「依赖 JS 才出现」，不判定。
export function isRenderDependent(rc: { initialChars: number; renderedChars: number }): boolean {
  if (rc.renderedChars <= 0) return false
  return rc.initialChars / rc.renderedChars < RENDER_DEPENDENCY_RATIO
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

// T01：入口/关键页被 robots.txt 屏蔽（Googlebot 不可抓）。
const T01: Rule = {
  id: 'T01',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const blockedUrls: string[] = []
    const blockedKeyUrls: string[] = []
    const entryBlocked = ctx.entryPage?.robotsAllowed === false
    if (ctx.entryPage && entryBlocked) refs.push(ctx.entryPage.id)
    const audit = ctx.siteAudit
    if (audit) {
      const blocked = audit.payload.pages.filter((p) => p.checkStatus === 'blocked_by_robots')
      if (blocked.length > 0) {
        refs.push(audit.id)
        for (const p of blocked) {
          blockedUrls.push(p.url)
          if (p.isKeyPage) blockedKeyUrls.push(p.url)
        }
      }
    }
    if (refs.length === 0) return null
    return {
      title: '入口/关键页被 robots.txt 屏蔽（Googlebot 不可抓）',
      description:
        '检测到页面对 Googlebot 处于 robots.txt Disallow 状态，搜索引擎无法抓取与收录，属技术健康最高优先级问题。',
      evidenceRefs: refs,
      scope: 'site',
      detail: {
        entryBlocked,
        blockedCount: blockedUrls.length,
        blockedKeyUrls,
        blockedUrls: blockedUrls.slice(0, 10),
      },
    }
  },
}

// T02：4xx/5xx 错误比例超阈值（比例升级 severity）。
const T02: Rule = {
  id: 'T02',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const { checked, http4xx, http5xx } = audit.payload.stats
    if (checked <= 0) return null
    const bad = http4xx + http5xx
    const ratio = bad / checked
    if (ratio <= HTTP_ERROR_WARN_RATIO) return null
    const severity: RuleSeverity = ratio > HTTP_ERROR_ERROR_RATIO ? 'error' : 'warning'
    const examples = audit.payload.pages
      .filter((p) => (p.httpStatus ?? 0) >= 400)
      .map((p) => ({ url: p.url, status: p.httpStatus }))
      .slice(0, 10)
    return {
      title: '页面 4xx/5xx 错误比例偏高',
      description: `已检 ${checked} 页中 ${bad} 页返回 4xx/5xx（占比 ${(ratio * 100).toFixed(1)}%），浪费抓取预算并影响用户可达性。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      severity,
      detail: { checked, http4xx, http5xx, ratio, examples },
    }
  },
}

// T03：noindex 误用。
const T03: Rule = {
  id: 'T03',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const n = audit.payload.stats.noindex
    if (n <= 0) return null
    const examples = audit.payload.pages
      .filter((p) => p.checkStatus === 'checked' && (p.metaRobots ?? '').toLowerCase().includes('noindex'))
      .map((p) => p.url)
      .slice(0, 10)
    return {
      title: '页面存在 noindex 误用',
      description: `检测到 ${n} 个已检页面带 noindex，将被搜索引擎排除收录，请确认是否为有意为之。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples },
    }
  },
}

// T04：canonical 指向站外。
const T04: Rule = {
  id: 'T04',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const n = audit.payload.stats.canonicalOffsite
    if (n <= 0) return null
    const domainHost = hostOf(`https://${ctx.project.domain}`) ?? ctx.project.domain
    const examples = audit.payload.pages
      .filter((p) => {
        if (!p.canonicalUrl) return false
        const h = hostOf(p.canonicalUrl)
        return h !== null && h !== domainHost
      })
      .map((p) => ({ url: p.url, canonical: p.canonicalUrl }))
      .slice(0, 10)
    return {
      title: 'canonical 指向站外',
      description: `检测到 ${n} 个页面的 canonical 指向本站以外域名，可能导致收录归属与权重流失。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples },
    }
  },
}

// T05：孤岛页（sitemap 声明但内链入度 0）。
const T05: Rule = {
  id: 'T05',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const n = audit.payload.stats.orphanPages
    if (n <= 0) return null
    const examples = audit.payload.pages
      .filter((p) => p.discoveredVia === 'sitemap' && p.inboundLinkCount === 0 && p.checkStatus === 'checked')
      .map((p) => p.url)
      .slice(0, 10)
    return {
      title: '存在孤岛页（sitemap 声明但无内链入口）',
      description: `检测到 ${n} 个页面仅在 sitemap 中声明、站内无任何内链指向，抓取发现与内链传权受限。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples },
    }
  },
}

// T07：sitemap 缺失/偏差（保守启发式：全站多页却无一页来自 sitemap）。
const T07: Rule = {
  id: 'T07',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const { totalDiscovered } = audit.payload.stats
    const sitemapPages = audit.payload.pages.filter((p) => p.discoveredVia === 'sitemap').length
    // 有 sitemap 来源页 → 视为存在 sitemap，不判定；单页站点无从判定，跳过。
    if (sitemapPages > 0) return null
    if (totalDiscovered <= 1) return null
    return {
      title: '未发现有效 sitemap',
      description: `全站发现 ${totalDiscovered} 个页面，但无任何页面来自 sitemap，疑似 sitemap 缺失或未被抓取到，影响新页面发现效率。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { totalDiscovered, sitemapPages },
    }
  },
}

// T10：渲染依赖——初始 HTML 正文占渲染后 <30%（每受影响页一条）。
const T10: Rule = {
  id: 'T10',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const hits = ctx.renderChecks.filter(isRenderDependent).map<RuleHitDraft>((rc) => ({
      title: '页面正文依赖 JS 渲染（初始 HTML 缺正文）',
      description: `初始 HTML 正文 ${rc.initialChars} 字符、渲染后 ${rc.renderedChars} 字符，占比 ${((rc.initialChars / rc.renderedChars) * 100).toFixed(0)}%（<30%），不执行 JS 的抓取链路将拿不到正文。`,
      evidenceRefs: [rc.id],
      scope: rc.source,
      detail: {
        initialChars: rc.initialChars,
        renderedChars: rc.renderedChars,
        ratio: rc.initialChars / rc.renderedChars,
      },
    }))
    return hits.length ? hits : null
  },
}

// T11：关键/聚合页内链支撑不足（每页一条）。
const T11: Rule = {
  id: 'T11',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const low = audit.payload.pages.filter(
      (p) => p.isKeyPage && p.checkStatus === 'checked' && p.inboundLinkCount < KEY_PAGE_MIN_INBOUND,
    )
    if (low.length === 0) return null
    return low.map<RuleHitDraft>((p) => ({
      title: '关键/聚合页内链支撑不足',
      description: `关键页 ${p.url} 仅有 ${p.inboundLinkCount} 条站内内链（阈值 ${KEY_PAGE_MIN_INBOUND}），权重传导与抓取优先级受限。`,
      evidenceRefs: [audit.id],
      scope: p.url,
      detail: { url: p.url, inboundLinkCount: p.inboundLinkCount, threshold: KEY_PAGE_MIN_INBOUND },
    }))
  },
}

// T12：点击深度过深（depth > 3，聚合计数 + 样例）。
const T12: Rule = {
  id: 'T12',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const deep = audit.payload.pages.filter((p) => p.depth != null && p.depth > MAX_DEPTH)
    if (deep.length === 0) return null
    const examples = deep.map((p) => ({ url: p.url, depth: p.depth })).slice(0, 10)
    return {
      title: '页面点击深度过深',
      description: `检测到 ${deep.length} 个页面点击深度超过 ${MAX_DEPTH} 层，权重传导与抓取效率随深度递减，重点页应压到 ${MAX_DEPTH} 层内。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { maxDepth: MAX_DEPTH, count: deep.length, examples },
    }
  },
}

// —— 轻检扩展字段规则组（消费 siteAudit.payload.pages[].lightCheckExtra；旧证据无此字段则跳过该页）——
const C09_ALT_MISSING_RATIO = 0.3 // 站级图片 alt 缺失率告警线（启发式）
const SCANNABILITY_PARA_WORDS = 150 // 平均段落词数上限，超过判为不易扫描（启发式）
// hreflang 语言-地区代码校验白名单（常见 ISO 3166-1 alpha-2 子集；命中错误码即告警）。
// uk 是最常见误用（应为 gb）；本表只做「已知错误码」拦截，非完整 ISO 全表（随 RULES_VERSION 保鲜）。
const INVALID_REGION_CODES = new Set(['uk', 'eu', 'en', 'us_en'])

const pagesWithExtra = (ctx: Parameters<Rule['evaluate']>[0]) =>
  (ctx.siteAudit?.payload.pages ?? [])
    .filter((p) => p.checkStatus === 'checked' && p.lightCheckExtra)
    .map((p) => ({ url: p.url, x: p.lightCheckExtra! }))

// T06：重定向（跳转链/循环的方向性信号——本期仅凭 redirected 标志，非完整链路追踪）。
const T06: Rule = {
  id: 'T06',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const redirected = pagesWithExtra(ctx).filter((p) => p.x.redirected)
    if (redirected.length === 0) return null
    return {
      title: '存在页面跳转（重定向）',
      description: `检测到 ${redirected.length} 个页面发生重定向；过多跳转消耗抓取预算，长链/循环会稀释权重，建议核对是否可直连目标地址。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: redirected.length, examples: redirected.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T08：HTTPS / 混合内容（http 页或 https 页上引用 http:// 资源）。
const T08: Rule = {
  id: 'T08',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const bad = pagesWithExtra(ctx).filter((p) => !p.x.isHttps || p.x.mixedContentCount > 0)
    if (bad.length === 0) return null
    const nonHttps = bad.filter((p) => !p.x.isHttps).length
    return {
      title: 'HTTPS 缺失或混合内容',
      description: `检测到 ${bad.length} 个页面存在协议问题（其中 ${nonHttps} 个非 HTTPS，其余为 https 页引用了 http:// 资源）；混合内容触发浏览器拦截并损害信任与索引。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: bad.length, nonHttps, examples: bad.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T13：移动端适配缺失（viewport meta 缺失）——移动优先索引下为必查项。
const T13: Rule = {
  id: 'T13',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const noViewport = pagesWithExtra(ctx).filter((p) => !p.x.hasViewport)
    if (noViewport.length === 0) return null
    return {
      title: '移动端适配缺失（无 viewport）',
      description: `检测到 ${noViewport.length} 个页面缺少 viewport meta 标签；移动优先索引下会直接影响移动端可用性与排名。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: noViewport.length, examples: noViewport.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T14：hreflang 检查组（仅在存在 hreflang 声明的多语言站触发；单语言站跳过）。
const T14: Rule = {
  id: 'T14',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const withHreflang = pagesWithExtra(ctx).filter((p) => p.x.hreflangEntries.length > 0)
    if (withHreflang.length === 0) return null // 单语言站：无 hreflang，跳过

    const invalidCodes: string[] = []
    let hasXDefault = false
    for (const p of withHreflang) {
      for (const e of p.x.hreflangEntries) {
        const code = e.hreflang.toLowerCase()
        if (code === 'x-default') { hasXDefault = true; continue }
        const region = code.includes('-') ? code.split('-')[1] : ''
        if (INVALID_REGION_CODES.has(code) || (region && INVALID_REGION_CODES.has(region))) {
          invalidCodes.push(e.hreflang)
        }
      }
    }
    const problems: string[] = []
    if (invalidCodes.length) problems.push(`无效语言-地区代码 ${[...new Set(invalidCodes)].join('、')}（如 en-uk 应为 en-gb）`)
    if (!hasXDefault) problems.push('缺少 x-default 声明')
    if (problems.length === 0) return null
    return {
      title: 'hreflang 配置存在问题',
      description: `多语言站的 hreflang 声明存在问题：${problems.join('；')}。错误的 hreflang 会导致错误地区版本被索引。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { invalidCodes: [...new Set(invalidCodes)], hasXDefault, affectedPages: withHreflang.length },
    }
  },
}

// —— P1 性能检查组 T09a-c（证据源：PSI）。定级见 spec §「性能检查组定位说明」 ——
// CWV 指标展示格式：LCP/INP 为毫秒（取整），CLS 为比值（3 位小数）。
function fmtCwv(metric: string, value: number): string {
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`
}

// T09a：CWV 字段数据（CrUX，真实用户）未达标。仅在有字段数据时产出 → measured_hard（L4）。
const T09a: Rule = {
  id: 'T09a',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const failing: { metric: string; value: number; strategy: string }[] = []
    for (const c of ctx.psiChecks) {
      const fails = analyzeCwv(c.result).filter((m) => !m.passes)
      if (fails.length) {
        refs.push(c.id)
        for (const f of fails) failing.push({ metric: f.metric, value: f.value, strategy: f.strategy })
      }
    }
    if (failing.length === 0) return null
    return {
      title: 'Core Web Vitals 字段数据未达标（真实用户）',
      description: `CrUX 真实用户数据存在未达标的核心网页指标（${failing
        .map((f) => `${f.metric} ${fmtCwv(f.metric, f.value)} @${f.strategy}`)
        .join('、')}），影响页面体验信号与移动优先索引下的可见性。`,
      evidenceRefs: refs,
      scope: 'site',
      detail: { failing },
    }
  },
}

// T09b：Lighthouse 实验室修复线索。恒标「实验室模拟，非排名输入」→ notice / inferred。
const T09b: Rule = {
  id: 'T09b',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const byTitle = new Map<string, number | undefined>() // title → 最大 savingsMs
    for (const c of ctx.psiChecks) {
      const top = lighthouseClues(c.result, 5)
      if (top.length) refs.push(c.id)
      for (const t of top) {
        const prev = byTitle.get(t.title)
        const next = t.savingsMs
        if (!byTitle.has(t.title) || (next ?? 0) > (prev ?? 0)) byTitle.set(t.title, next)
      }
    }
    if (byTitle.size === 0) return null
    const clues: { title: string; savingsMs?: number }[] = [...byTitle.entries()]
      .map(([title, savingsMs]) => (savingsMs !== undefined ? { title, savingsMs } : { title }))
      .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
      .slice(0, 8)
    return {
      title: '性能修复线索（Lighthouse 实验室模拟，非 Google 排名输入）',
      description:
        '基于 Lighthouse 实验室审计的 top 优化机会，作为 CWV 改进的修复清单。Lighthouse 分数为实验室模拟值，Google 排名不使用该分数，仅作诊断参考。',
      evidenceRefs: refs,
      scope: 'site',
      detail: { clues },
    }
  },
}

// T09c：服务器响应过慢（TTFB > 阈值）影响抓取效率。有 CrUX 时 measured_hard，否则降 inferred（spec 降级链）。
const T09c: Rule = {
  id: 'T09c',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    let worstTtfb = 0
    let anyFieldData = false
    for (const c of ctx.psiChecks) {
      const t = ttfbConcern(c.result)
      if (t?.slow) {
        refs.push(c.id)
        worstTtfb = Math.max(worstTtfb, t.ttfbMs)
        if (c.result.crux.hasFieldData) anyFieldData = true
      }
    }
    if (refs.length === 0) return null
    return {
      title: '服务器响应过慢，影响抓取效率',
      description: `检测到服务器响应时间偏慢（TTFB 约 ${Math.round(worstTtfb)}ms，超过 ${TTFB_SLOW_MS}ms 阈值）。Google 官方指引：响应速度影响抓取预算与抓取速率，进而影响收录覆盖与时效，对大站尤甚。`,
      evidenceRefs: refs,
      scope: 'site',
      // 无 CrUX 字段数据时，性能对排名的实测依据不足，claim 上限降为 inferred（spec §性能降级链）。
      claimType: anyFieldData ? 'measured_hard' : 'inferred',
      detail: { ttfbMs: Math.round(worstTtfb) },
    }
  },
}

export const technicalRules: Rule[] = [T01, T02, T03, T04, T05, T06, T07, T08, T10, T11, T12, T13, T14, T09a, T09b, T09c]

// C09/C11 复用轻检扩展的取数逻辑（内容支柱，但证据同为 site_audit 轻检）。
export { pagesWithExtra, C09_ALT_MISSING_RATIO, SCANNABILITY_PARA_WORDS }
