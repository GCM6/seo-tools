import type { Rule, RuleHitDraft } from '../types'
import { isRenderDependent } from './technical'
import { parseRobotsAllowed } from '@/lib/collection/robots'
import { isWebSearchEnabledEngine } from '@/lib/probes/engine-capability'

// P5 GEO 规则组：AI 抓取可见性与探针可见度。
// —— 阈值为启发式经验值，随 RULES_VERSION 版本化 ——
const AI_VISIBILITY_MIN_RATIO = 0.3 // 无品牌提问中主动召回品牌的占比低于此判为低可见（n=5 仅方向性，D5）
// G07：Reddit 近 N 月自然讨论 mentions 低于此阈值视为「第三方语料不足」（启发式，随 RULES_VERSION 固化）。
const THIRD_PARTY_REDDIT_MIN_MENTIONS = 3
// G09：含品牌样本中负面占比达到此比例即判「负面方向偏高」（启发式，随 RULES_VERSION 固化；n=5 恒方向性）。
const SENTIMENT_NEGATIVE_MIN_RATIO = 0.3
// G10：branded 层 speculative 占比达到此比例即判「疑似编造」（词表启发式，随 RULES_VERSION 固化）。
const AI_FABRICATION_MIN_RATIO = 0.3
// G10：branded 回答总数（跨引擎合计）低于此值视为样本太薄，不出结论。
const AI_FABRICATION_MIN_SAMPLES = 3

// GEO 规则组内的引擎联网能力判定（D6）：真源已收口到 lib/probes/engine-capability.ts 的
// isWebSearchEnabledEngine（Wave 3 消除 summary.ts / geo.ts / components 三份复制）。

// —— AI 爬虫 UA 注册表（ai_crawler_ua_registry，随 spec §11.1 版本化维护）——
// 检索型：为 ChatGPT/Perplexity/Claude/Gemini 的即时检索取答供数，被屏蔽 = 放弃 AI 引用资格（error）。
const SEARCH_CRAWLER_UAS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended'] as const
// 训练型：仅用于模型训练语料，屏蔽是品牌合理选择，仅作说明（notice）。
const TRAINING_CRAWLER_UAS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider'] as const

// 实体消歧权威节点：sameAs 指向这些域名才被视为可锚定实体身份（wikidata 最强，其余为业务/官方社媒权威）。
const AUTHORITY_HOSTS = [
  'wikidata.org',
  'linkedin.com',
  'crunchbase.com',
  // 官方社媒（official social）：用于确认品牌身份
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
] as const
// 被视为「组织实体」的 schema 类型。
const ORG_TYPES = ['Organization', 'Brand'] as const

function hostOfUrl(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isAuthoritySameAs(u: string): boolean {
  const h = hostOfUrl(u)
  if (!h) return false
  return AUTHORITY_HOSTS.some((a) => h === a || h.endsWith(`.${a}`))
}

// G03：渲染依赖内容对不执行 JS 的 AI 抓取链路不可见（与 T10 同证据，GEO 措辞）。
const G03: Rule = {
  id: 'G03',
  pillar: 'P5',
  side: 'geo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const hits = ctx.renderChecks.filter(isRenderDependent).map<RuleHitDraft>((rc) => ({
      title: '渲染依赖内容对 AI 抓取链路不可见',
      description: `该页正文依赖 JS 渲染（初始 ${rc.initialChars} / 渲染后 ${rc.renderedChars} 字符），对不执行 JS 的 AI 抓取链路不可见，将无法被 AI 引擎引用。`,
      evidenceRefs: [rc.id],
      scope: rc.source,
      detail: { initialChars: rc.initialChars, renderedChars: rc.renderedChars },
    }))
    return hits.length ? hits : null
  },
}

// G05：AI 答案可见度偏低——D5 改用 unbranded 层口径：无品牌提问中，AI 是否「主动召回」品牌，
// 而非 branded 问题里模型复述问题文本自带的品牌名（那类命中不算真实可见度信号，见 spec §1）。
// 缺陷3修复：品牌名与行业词同形时（如 brand='crm' 且行业含 CRM），生成的探针问题字面必然全部
// 命中品牌名，导致 unbranded.total 恒为 0——旧实现直接 return null，让整组 GEO 可见度诊断静默
// 消失。只要探针确实跑过（promptsTotal>0），改为降级产出一条 inferred 说明（不伪造召回数字，
// 只说明"当前无法评估"），而不是无声消失。
const G05: Rule = {
  id: 'G05',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const { probe, probeEvidenceId } = ctx
    if (!probe || !probeEvidenceId) return null
    const { unbranded } = probe
    if (unbranded.total <= 0) {
      if (probe.promptsTotal <= 0) return null
      return {
        title: '无法评估无品牌主动召回（探针问题疑似全部含品牌词）',
        description: `全部 ${probe.promptsTotal} 个探针问题均被判定为含品牌词，无 unbranded 分母可用于评估「无品牌提问中 AI 是否主动召回品牌」。品牌名疑似与行业/品类词同形，建议配置品牌别名或检查品牌词后重新生成探针问题集。`,
        evidenceRefs: [probeEvidenceId],
        scope: 'site',
        claimType: 'inferred',
        detail: { promptsTotal: probe.promptsTotal, unbrandedTotal: 0, directional: true },
      }
    }
    const ratio = unbranded.present / unbranded.total
    if (ratio >= AI_VISIBILITY_MIN_RATIO) return null
    return {
      title: 'AI 答案可见度偏低',
      description: `无品牌提问中，AI 主动召回品牌仅 ${unbranded.present}/${unbranded.total} 次（占比 ${(ratio * 100).toFixed(0)}%，低于 30%；Wilson 95% 下限 ${(unbranded.wilsonLow * 100).toFixed(0)}%）。当前 n=5 为方向性样本，非硬指标。`,
      evidenceRefs: [probeEvidenceId],
      scope: 'site',
      detail: {
        present: unbranded.present,
        total: unbranded.total,
        ratio,
        wilsonLow: unbranded.wilsonLow,
        directional: true,
      },
    }
  },
}

// G06：目标域在 AI 答案中零引用——D5 改为只对 webSearchEnabled=true 的检索型引擎评估。
// DeepSeek 等记忆型引擎结构上恒无引用能力（deepseek.ts:3-5），把它算进「零引用」会不公平地
// 触发/加重本规则；只统计检索型引擎自己的样本，无检索型引擎数据时规则整体 no-op。
// 缺陷1修复：门控改用 unbranded 口径的召回计数（perEngine[].unbrandedPresent）而非全集
// promptsPresent——品牌题必然复述品牌名使全集 promptsPresent 恒非零，旧口径下「if (promptsPresent
// !== 0) return null」令本规则结构性死亡（永远判定为已达标）。
// 缺陷2修复：分母改用去重后的问题数（probe.unbranded.total，问题级去重），不是把各联网引擎的
// promptsTotal 相加（引擎×问题配对数会把分母膨胀成 N倍，如 3 引擎×30 题=90，但描述却写"全部 90 个
// 探针问题"）；引擎×问题配对数如需追溯放 detail.enginePromptPairs，不进描述文案。
const G06: Rule = {
  id: 'G06',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const { probe, probeEvidenceId } = ctx
    if (!probe || !probeEvidenceId) return null
    const onlineEngines = probe.perEngine.filter((e) => isWebSearchEnabledEngine(probe, e.engine))
    if (onlineEngines.length === 0) return null
    const promptsTotal = probe.unbranded.total
    if (promptsTotal <= 0) return null
    const unbrandedPresent = onlineEngines.reduce((sum, e) => sum + e.unbrandedPresent, 0)
    if (unbrandedPresent !== 0) return null
    const enginePromptPairs = onlineEngines.reduce((sum, e) => sum + e.promptsTotal, 0)
    return {
      title: '目标域在 AI 答案中零引用',
      description: `检索型 AI 引擎（${onlineEngines.map((e) => e.engine).join('、')}）针对全部 ${promptsTotal} 个无品牌探针问题的答案中，品牌/目标域均未被主动召回或引用（记忆型引擎如 DeepSeek 不计入本判定；含品牌探针问题里模型复述问题文本自带品牌名，不计入本判定）。当前 n=5 为方向性样本。`,
      evidenceRefs: [probeEvidenceId],
      scope: 'site',
      detail: { promptsTotal, enginePromptPairs, engines: onlineEngines.map((e) => e.engine), directional: true },
    }
  },
}

// G01：搜索型 AI 爬虫被 robots 屏蔽（检索型=error 放弃引用资格；训练型=notice 仅说明）。
const G01: Rule = {
  id: 'G01',
  pillar: 'P5',
  side: 'geo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const robotsText = ctx.robotsText
    if (!robotsText || !ctx.entryPage) return null
    const evId = ctx.entryPage.id
    const blockedSearch = SEARCH_CRAWLER_UAS.filter((ua) => !parseRobotsAllowed(robotsText, '/', ua))
    const blockedTraining = TRAINING_CRAWLER_UAS.filter((ua) => !parseRobotsAllowed(robotsText, '/', ua))
    const hits: RuleHitDraft[] = []
    if (blockedSearch.length > 0) {
      hits.push({
        title: '搜索型 AI 爬虫被 robots 屏蔽',
        description: `robots.txt 对检索型 AI 爬虫（${blockedSearch.join('、')}）Disallow /，等于放弃在 ChatGPT/Perplexity/Claude 等即时检索答案中被引用的资格。`,
        evidenceRefs: [evId],
        scope: 'geo:robots',
        severity: 'error',
        detail: { kind: 'search', blocked: [...blockedSearch] },
      })
    }
    if (blockedTraining.length > 0) {
      hits.push({
        title: '训练型 AI 爬虫被 robots 屏蔽（合理选择，仅说明）',
        description: `robots.txt 对训练型 AI 爬虫（${blockedTraining.join('、')}）Disallow /。屏蔽训练型爬虫是品牌对语料授权的合理选择，不影响检索型引用资格，仅作说明。`,
        evidenceRefs: [evId],
        scope: 'geo:robots',
        severity: 'notice',
        detail: { kind: 'training', blocked: [...blockedTraining] },
      })
    }
    return hits.length ? hits : null
  },
}

// E01：Organization/品牌 schema 缺 sameAs 或未指向权威消歧节点（notice）。
const E01: Rule = {
  id: 'E01',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const orgSchemas = ctx.schemas.filter((s) => s.types.some((t) => (ORG_TYPES as readonly string[]).includes(t)))
    if (orgSchemas.length === 0) return null
    // 站级实体消歧：任一 Organization schema 的 sameAs 指向权威节点即视为已消歧。
    const disambiguated = orgSchemas.some((s) => s.sameAs.some(isAuthoritySameAs))
    if (disambiguated) return null
    // 取一条待整改的 Organization schema：优先 sameAs 完全缺失者。
    const target = orgSchemas.find((s) => s.sameAs.length === 0) ?? orgSchemas[0]
    const reason = target.sameAs.length === 0 ? 'missing_sameas' : 'no_authority'
    return {
      title: 'Organization/品牌 schema 缺权威 sameAs 消歧节点',
      description:
        'Organization/品牌结构化数据未通过 sameAs 指向 wikidata/linkedin/crunchbase/官方社媒等权威消歧节点，搜索与 AI 引擎更难将品牌锚定为确定实体。实体消歧机制有 Bing 官方确认（sameAs 用于实体识别），但对可见性/引用的效果不做量化断言。',
      evidenceRefs: [target.id],
      scope: 'geo:entity',
      detail: { reason, sameAs: target.sameAs, authorityHosts: [...AUTHORITY_HOSTS] },
    }
  },
}

// G02：CDN/WAF 层误封搜索型 AI 爬虫（用各爬虫 UA 实测状态码，403/429/challenge=blocked）。
// 与 G01 区分：G01 是 robots.txt 声明性屏蔽；G02 是传输层（CDN/WAF）状态码封禁——即使 robots 放行也可能命中。
// 训练型爬虫被封是品牌合理选择，不报（与 G01 训练型仅 notice 的取向一致，此处直接忽略以免噪音）。
const G02: Rule = {
  id: 'G02',
  pillar: 'P5',
  side: 'geo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const { uaProbe } = ctx
    if (!uaProbe) return null
    const blockedSearch = uaProbe.crawlers.filter((c) => c.kind === 'search' && c.blocked)
    if (blockedSearch.length === 0) return null
    const uas = blockedSearch.map((c) => c.ua).join('、')
    return {
      title: 'CDN/WAF 层误封搜索型 AI 爬虫',
      description: `以检索型 AI 爬虫 UA（${uas}）实测请求时，被 CDN/WAF 以 403/429/challenge 等状态码封禁（区别于 robots.txt 声明性屏蔽，见 G01）——即使 robots 放行，传输层封禁同样使 ChatGPT/Perplexity/Claude 等无法抓取取答。`,
      evidenceRefs: [uaProbe.evidenceId],
      scope: 'geo:cdn',
      detail: {
        blocked: blockedSearch.map((c) => ({ ua: c.ua, url: c.url, status: c.status })),
      },
    }
  },
}

// G07：第三方语料缺失——无 Wikipedia 条目「且」Reddit 自然讨论不足（品牌提及与 AI 可见性相关 0.664，§2）。
// 决策：只有当两路信号「都」不达标才报（无 wiki 且 reddit mentions 低于阈值）；任一达标即 null，避免噪音。
const G07: Rule = {
  id: 'G07',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const { thirdParty } = ctx
    if (!thirdParty) return null
    const wikiPresent = thirdParty.wikipedia.exists
    const redditEnough = thirdParty.reddit.mentions >= THIRD_PARTY_REDDIT_MIN_MENTIONS
    // 任一权威语料信号达标 → 不报（只 wiki 或只 reddit 达标视为已有第三方存在度）。
    if (wikiPresent || redditEnough) return null
    return {
      title: '品牌第三方网络语料缺失',
      description: `品牌第三方网络提及不足：无 Wikipedia 条目，Reddit 近 ${thirdParty.reddit.windowDays} 天自然讨论仅 ${thirdParty.reddit.mentions} 条（低于 ${THIRD_PARTY_REDDIT_MIN_MENTIONS}）。AI 引擎主要引用第三方权威语料（品牌提及与 AI 可见性相关 0.664，§2），第三方存在度不足会削弱被引用概率。`,
      evidenceRefs: [thirdParty.evidenceId],
      scope: 'geo:thirdparty',
      detail: {
        wikipediaExists: wikiPresent,
        redditMentions: thirdParty.reddit.mentions,
        redditWindowDays: thirdParty.reddit.windowDays,
        redditThreshold: THIRD_PARTY_REDDIT_MIN_MENTIONS,
      },
    }
  },
}

// G08：llms.txt 存在性——只记录不建议。存在性是硬事实（measured_hard），但有效性无证据。
// 决策：只有「检测到」才出一条 notice 记录；未检测到返回 null（避免对全站普遍不存在的项刷噪音）。
const G08: Rule = {
  id: 'G08',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const { uaProbe } = ctx
    if (!uaProbe) return null
    if (!uaProbe.llmsTxt.exists) return null
    return {
      title: '检测到 llms.txt（仅记录，不建议投入）',
      description: `在 ${uaProbe.llmsTxt.url} 检测到 llms.txt。当前无证据支持其对 AI 可见性有效（Ahrefs 研究：约 97% 从未被读取；Google 将其类比为已弃用的 keywords meta），此处仅作存在性记录，不据此提出优化建议。`,
      evidenceRefs: [uaProbe.evidenceId],
      scope: 'geo:llmstxt',
      detail: { exists: true, url: uaProbe.llmsTxt.url },
    }
  },
}

// G09：AI 引用情感方向——含品牌样本中负面占比偏高（分类器为测量层解析器，可抽查原文，非 agent 结论）。
// claim=inferred：负面「方向」在 n=5 下只作方向性推断，不下硬结论。
const G09: Rule = {
  id: 'G09',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const { probe, probeEvidenceId } = ctx
    if (!probe || !probeEvidenceId) return null
    const { sentiment } = probe
    if (sentiment.total <= 0) return null
    const negativeRatio = sentiment.negative / sentiment.total
    if (negativeRatio < SENTIMENT_NEGATIVE_MIN_RATIO) return null
    return {
      title: 'AI 引用情感负面占比偏高',
      description: `AI 答案中品牌提及的负面/比较劣势占比偏高（负面 ${sentiment.negative}/${sentiment.total}，占 ${(negativeRatio * 100).toFixed(0)}%）。当前 n=5 为方向性样本，情感分类为测量层解析器结果（随 parser_version 版本化），可抽查原文复核。`,
      evidenceRefs: [probeEvidenceId],
      scope: 'geo:sentiment',
      detail: {
        positive: sentiment.positive,
        neutral: sentiment.neutral,
        negative: sentiment.negative,
        comparison: sentiment.comparison,
        total: sentiment.total,
        negativeRatio,
        directional: true,
      },
    }
  },
}

// G10：AI 疑似在编造品牌事实——branded 层回答里，无引用依据且带猜测措辞（speculative）占比过高，
// 说明模型很可能在缺乏权威语料时基于品牌名字面联想式编造（spec §1 DeepSeek "likely a portmanteau..."
// 实例）。跨引擎合计口径（含记忆型引擎 undetermined 计入分母但不计入分子，天然不会被它拉高比例）。
// claim=inferred：判定基于确定性词表（hedged 词表），非 LLM 结论，但词表查全率未知（无先例可校准），
// 模型「自信编造却不带猜测措辞」时无法识别——本规则只能标「疑似」，不能反向证明「无编造」。
const G10: Rule = {
  id: 'G10',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const { probe, probeEvidenceId } = ctx
    if (!probe || !probeEvidenceId) return null
    const totals = probe.branded.perEngine.reduce(
      (acc, e) => ({
        grounded: acc.grounded + e.grounded,
        speculative: acc.speculative + e.speculative,
        unknown: acc.unknown + e.unknown,
        unverified: acc.unverified + e.unverified,
        undetermined: acc.undetermined + e.undetermined,
      }),
      { grounded: 0, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 },
    )
    const total = totals.grounded + totals.speculative + totals.unknown + totals.unverified + totals.undetermined
    if (total < AI_FABRICATION_MIN_SAMPLES) return null
    const ratio = totals.speculative / total
    if (ratio < AI_FABRICATION_MIN_RATIO) return null
    return {
      title: 'AI 疑似在编造品牌事实',
      description: `品牌类探针回答中，疑似臆测（无引用依据且带猜测措辞，如 likely/probably/推测/顾名思义）占比 ${(ratio * 100).toFixed(0)}%（${totals.speculative}/${total}），高于 30%。此判定为确定性词表启发式，存在漏检：若模型自信编造却未使用任何猜测措辞，本规则无法识别，仅供方向性参考。`,
      evidenceRefs: [probeEvidenceId],
      scope: 'geo:brand-fabrication',
      detail: {
        grounded: totals.grounded,
        speculative: totals.speculative,
        unknown: totals.unknown,
        unverified: totals.unverified,
        undetermined: totals.undetermined,
        total,
        ratio,
        directional: true,
      },
    }
  },
}

export const geoRules: Rule[] = [G03, G05, G06, G01, E01, G02, G07, G08, G09, G10]
