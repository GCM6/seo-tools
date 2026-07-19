import { describe, it, expect } from 'vitest'
import { parseProbeAnswer, competitorsInText, PROBE_PARSER_VERSION } from './parse'

const base = {
  brand: 'metadocu',
  domain: 'metadocu.com',
  competitors: ['Notion', 'Confluence'],
}

describe('parseProbeAnswer', () => {
  it('detects brand presence with word boundaries (latin, case-insensitive)', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'I recommend Metadocu for docs.', citedUrls: [] })
    expect(r.brandPresent).toBe(true)
  })

  it('does not match the brand inside another word', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'try metadocumentation tools', citedUrls: [] })
    expect(r.brandPresent).toBe(false)
  })

  it('counts a domain mention in the text as brand presence', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'see metadocu.com for details', citedUrls: [] })
    expect(r.brandPresent).toBe(true)
  })

  it('matches CJK brand names by substring', () => {
    const r = parseProbeAnswer({
      brand: '飞书',
      domain: 'feishu.cn',
      competitors: [],
      answerText: '推荐使用飞书文档协作。',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
  })

  it('flags targetDomainCited when a citation URL is on the target domain (incl. subdomain)', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'no brand mention',
      citedUrls: ['https://docs.metadocu.com/guide', 'https://other.com/'],
    })
    expect(r.targetDomainCited).toBe(true)
    expect(r.brandPresent).toBe(false)
    expect(r.citedUrls).toEqual(['https://docs.metadocu.com/guide', 'https://other.com/'])
  })

  it('does not flag targetDomainCited for lookalike domains', () => {
    const r = parseProbeAnswer({ ...base, answerText: '', citedUrls: ['https://notmetadocu.com/'] })
    expect(r.targetDomainCited).toBe(false)
  })

  it('lists mentioned competitors, preserving configured casing', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Popular picks are notion and Confluence.',
      citedUrls: [],
    })
    expect(r.competitorsMentioned).toEqual(['Notion', 'Confluence'])
  })

  it('exposes a parser version for protocol provenance', () => {
    expect(PROBE_PARSER_VERSION).toBe('v6') // 引用口径拆分修复：citedUrls 只认正文引用，不再混入 retrievedUrls
  })

  it('competitorsInText 复用同一匹配口径（拉丁词边界 / CJK 子串 / 空集）', () => {
    expect(competitorsInText('use Notion and confluence today', ['Notion', 'Confluence', 'Coda'])).toEqual(['Notion', 'Confluence'])
    expect(competitorsInText('metadocu 对比 语雀 更轻', ['语雀'])).toEqual(['语雀']) // CJK 子串
    expect(competitorsInText('no notionally related term', ['Notion'])).toEqual([]) // 词边界避免 notionally
    expect(competitorsInText('anything', [])).toEqual([])
  })

  it('classifies a positive brand mention as positive', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a reliable and recommended docs tool.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
    expect(r.sentiment).toBe('positive')
  })

  it('classifies a comparison mention as comparison (highest priority)', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a great alternative compared to Notion.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('comparison')
  })

  it('classifies a negative brand mention as negative', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu feels outdated and lacks key features.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('negative')
  })

  it('classifies a neutral brand mention as neutral', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a documentation product.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('neutral')
  })

  it('treats a negated positive word as non-positive', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is not recommended for large teams.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('neutral')
  })

  it('defaults sentiment to neutral when the brand is absent', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'The best docs tools are excellent and recommended.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(false)
    expect(r.sentiment).toBe('neutral')
  })

  it('classifies a CJK positive brand mention as positive', () => {
    const r = parseProbeAnswer({
      brand: '飞书',
      domain: 'feishu.cn',
      competitors: [],
      answerText: '飞书是一款非常靠谱、值得推荐的协作工具。',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('positive')
  })
})

// D2：hedged / unknownAdmission 词表检测（v4，零 LLM，词表校准见交付报告 20 条真实样例）。
describe('parseProbeAnswer — hedged / unknownAdmission (D2)', () => {
  it('flags hedged when the brand sentence guesses at identity ("likely a portmanteau")', () => {
    // 真实校准样例（本地库 DeepSeek 回答，略作缩短）
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Based on the term MetaDocu (likely a portmanteau of "Meta" and "Documentation"), it is best suited for structured docs.',
      citedUrls: [],
    })
    expect(r.hedged).toBe(true)
    expect(r.unknownAdmission).toBe(false)
  })

  it('flags unknownAdmission when the model admits it cannot identify the brand', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'I am sorry, I cannot provide a specific assessment of "metadocu" as I do not have verified, up-to-date information.',
      citedUrls: [],
    })
    expect(r.unknownAdmission).toBe(true)
  })

  it('flags the CJK hedge/unknown wordlists', () => {
    const hedge = parseProbeAnswer({ ...base, answerText: 'Metadocu 顾名思义应该是一款文档相关的工具。', citedUrls: [] })
    expect(hedge.hedged).toBe(true)
    const unknown = parseProbeAnswer({ ...base, answerText: '关于 Metadocu，没有找到相关信息，无法确认其口碑。', citedUrls: [] })
    expect(unknown.unknownAdmission).toBe(true)
  })

  it('does NOT flag hedged when the guess-word appears in a sentence unrelated to the brand', () => {
    // 校准发现的误伤：generic "likely" 出现在与品牌无关的建议句里（如预算团队规模）不应计入 hedged。
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a documentation tool. For a tight-budget team (likely under 20 people), pick something cheap.',
      citedUrls: [],
    })
    expect(r.hedged).toBe(false)
  })

  it('does not flag hedged/unknownAdmission when the brand never appears', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'The best docs tools are likely Notion or Confluence.', citedUrls: [] })
    expect(r.hedged).toBe(false)
    expect(r.unknownAdmission).toBe(false)
  })

  it('D7: matches hedged/unknownAdmission via an alias when the primary brand token is absent', () => {
    const r = parseProbeAnswer({
      ...base,
      aliases: ['MetaDoc'],
      answerText: 'MetaDoc is likely a portmanteau, and I do not have verified information about it.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
    expect(r.hedged).toBe(true)
    expect(r.unknownAdmission).toBe(true)
  })

  it('D7: brandPresent matches via alias even when brand token is absent', () => {
    const r = parseProbeAnswer({ ...base, aliases: ['MetaDoc', 'Meta Docu'], answerText: 'Try MetaDoc for your docs.', citedUrls: [] })
    expect(r.brandPresent).toBe(true)
  })

  // 缺陷 1 回归：sentiment 此前只传主品牌词给 classifyProbeSentiment，别名句情感恒判 neutral，
  // G09 负面预警分子被系统性清零。brand 不在句中，只有 alias 命中，情感应仍被正确分类。
  it('缺陷1回归: 别名句的负面情感被正确分类为 negative（brand 不在句中，alias 命中）', () => {
    const r = parseProbeAnswer({
      ...base,
      aliases: ['MetaDoc'],
      answerText: 'MetaDoc is outdated and lacks key features.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
    expect(r.sentiment).toBe('negative')
  })

  // 缺陷 2 回归：诚实拒答常见整句不提品牌名（如"我没有找到相关信息，无法评价这家公司"）。
  // 此前 unknownAdmission 限定品牌句检测，导致这类回答 unknownAdmission=false，
  // 在 engine-capability.ts 被归为 unverified（断言式回答无依据）——方向恰好相反。
  it('缺陷2回归: 不复述品牌名的诚实拒答，unknownAdmission 判 true（英文）', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: "I'm sorry, I could not find any relevant information to assess this company.",
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(false)
    expect(r.unknownAdmission).toBe(true)
  })

  it('缺陷2回归: 不复述品牌名的诚实拒答，unknownAdmission 判 true（中文）', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: '抱歉，我没有找到相关信息，无法评价这家公司。',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(false)
    expect(r.unknownAdmission).toBe(true)
  })

  // v5 升版留痕：解析结果需能标注当前解析协议版本，保证跨版本回填脚本可比对（协议留痕）。
  it('缺陷2/1修复伴随 PROBE_PARSER_VERSION 升版（v4→v5），解析结果的版本号与常量一致', () => {
    expect(PROBE_PARSER_VERSION).toBe('v6')
  })

  // v6：引用口径拆分——retrievedUrls 是独立的弱一档信号，不进 citedUrls/targetDomainCited。
  it('retrievedUrls 默认为空数组（旧调用方不传时不影响既有行为）', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'no brand mention', citedUrls: [] })
    expect(r.retrievedUrls).toEqual([])
    expect(r.targetDomainRetrieved).toBe(false)
  })

  it('retrievedUrls 原样透传，且不计入 targetDomainCited（只有 citedUrls 才算"有依据"）', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'no brand mention',
      citedUrls: [],
      retrievedUrls: ['https://docs.metadocu.com/guide', 'https://other.com/'],
    })
    expect(r.retrievedUrls).toEqual(['https://docs.metadocu.com/guide', 'https://other.com/'])
    expect(r.targetDomainCited).toBe(false) // citedUrls 为空——即便 retrievedUrls 命中目标域，也不算"有依据"
  })

  it('flags targetDomainRetrieved when a retrieved-only URL is on the target domain (incl. subdomain)', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'no brand mention',
      citedUrls: [],
      retrievedUrls: ['https://docs.metadocu.com/guide'],
    })
    expect(r.targetDomainRetrieved).toBe(true)
  })

  it('does not flag targetDomainRetrieved for lookalike domains', () => {
    const r = parseProbeAnswer({ ...base, answerText: '', citedUrls: [], retrievedUrls: ['https://notmetadocu.com/'] })
    expect(r.targetDomainRetrieved).toBe(false)
  })

  it('citedUrls 与 retrievedUrls 相互独立——citedUrls 命中目标域，targetDomainRetrieved 仍可为 false', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'no brand mention',
      citedUrls: ['https://docs.metadocu.com/guide'],
      retrievedUrls: ['https://other.com/'],
    })
    expect(r.targetDomainCited).toBe(true)
    expect(r.targetDomainRetrieved).toBe(false)
  })
})
