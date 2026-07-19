import type { Rule, RuleHitDraft } from '../types'

// P5 社媒/第三方评价站声誉规则组。消费 ctx.socialPresence（social_presence 证据，L2，前台检索结果，
// 非平台 API 全量数据）。未采集（ctx.socialPresence === null）时两条规则整组 no-op（全仓约定，
// 同 G07/G08 对 ctx.thirdParty / ctx.uaProbe 的处理）。
//
// claimType 铁律：social_presence 是 L2 证据，应用层校验 measured_sample 需 L3+ 证据（见
// lib/repositories/validators.ts assertFindingClaimEvidence），故本组两条规则均只能标 inferred，
// 不得越级标 measured_sample。

// SP01：前台检索未发现品牌相关 YouTube 内容。只在「确实检索过 youtube」时判定——platforms 里找不到
// youtube 条目视为未采集该维度，no-op（不能把「没查」当成「查了发现没有」）。
const SP01: Rule = {
  id: 'SP01',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const { socialPresence } = ctx
    if (!socialPresence) return null
    const youtube = socialPresence.platforms.find((p) => p.platform === 'youtube')
    if (!youtube) return null
    if (youtube.resultCount !== 0) return null
    return {
      title: '前台检索未发现品牌相关 YouTube 内容',
      description: `以「${youtube.query}」在 YouTube 前台检索未返回相关结果。此为前台检索口径（非 YouTube 平台 API 全量数据），仅供方向性参考。`,
      evidenceRefs: [socialPresence.evidenceId],
      scope: 'geo:social-youtube',
      detail: { platform: 'youtube', query: youtube.query, resultCount: youtube.resultCount },
    }
  },
}

// SP02：前台检索未发现品牌在主流第三方评价站（G2/Trustpilot/Capterra）的收录。三站均需已检索
// （platforms 中都存在对应条目）且结果数全为 0 才判定；任一未检索/未配置则 no-op。
const SP02_PLATFORMS = ['g2', 'trustpilot', 'capterra'] as const

const SP02: Rule = {
  id: 'SP02',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const { socialPresence } = ctx
    if (!socialPresence) return null
    const entries = SP02_PLATFORMS.map((platform) => socialPresence.platforms.find((p) => p.platform === platform))
    if (entries.some((e) => !e)) return null // 任一站未检索：数据不完整，不判定
    const checked = entries as NonNullable<(typeof entries)[number]>[]
    if (checked.some((e) => e.resultCount !== 0)) return null
    return {
      title: '前台检索未发现品牌在主流第三方评价站的收录',
      description: `以品牌名在 G2、Trustpilot、Capterra 前台检索均未返回相关结果。此为前台检索口径（非平台 API 全量数据），仅供方向性参考。`,
      evidenceRefs: [socialPresence.evidenceId],
      scope: 'geo:social-review-sites',
      detail: { platforms: checked.map((e) => ({ platform: e.platform, query: e.query, resultCount: e.resultCount })) },
    }
  },
}

export const reputationRules: Rule[] = [SP01, SP02]
