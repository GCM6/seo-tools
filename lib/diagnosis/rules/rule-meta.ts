import type { SourceRequirement } from '../sources'

// 规则元数据（spec 2026-10-09 §6.4）：判定逻辑版本 + 必需数据源。
// version：改哪条规则的判定就只升那一条（rule-meta.test.ts 的快照守卫会拦住忘记升版本）。
// requiredSources：缺了就无法评估的硬依赖；数组元素为数组时表示「其中任一可用即可」。
// 依据：2026-10-09 只读代理逐条核对 87 条规则读取的 ctx 字段（见计划 Task 2 说明）。
type Meta = { version: number; requiredSources: SourceRequirement[] }
const v1 = (...requiredSources: SourceRequirement[]): Meta => ({ version: 1, requiredSources })

export const RULE_META: Record<string, Meta> = {
  // technical.ts
  T01: v1('entry'),
  T02: v1('crawl'),
  T03: v1('crawl'),
  T04: { version: 2, requiredSources: ['crawl'] },
  T05: { version: 2, requiredSources: ['crawl'] },
  T07: v1('crawl'),
  T10: v1('render'),
  T11: { version: 2, requiredSources: ['crawl'] },
  T12: v1('crawl'),
  T06: v1('crawl'),
  T08: v1('crawl'),
  T13: v1('crawl'),
  T14: v1('crawl'),
  T15: v1('crawl', 'gsc'),
  T09a: v1('psi'),
  T09b: v1('psi'),
  T09c: v1('psi'),
  // links.ts
  L01: { version: 2, requiredSources: ['crawl'] },
  L02: { version: 2, requiredSources: ['crawl'] },
  L03: { version: 2, requiredSources: ['crawl'] },
  L04: { version: 2, requiredSources: ['crawl'] },
  L05: { version: 2, requiredSources: ['crawl'] },
  L06: { version: 2, requiredSources: ['crawl'] },
  L07: { version: 2, requiredSources: ['crawl'] },
  // equity.ts
  W01: { version: 2, requiredSources: ['crawl'] },
  W02: { version: 2, requiredSources: ['crawl'] },
  W03: { version: 2, requiredSources: ['crawl'] },
  W04: { version: 2, requiredSources: ['crawl'] },
  // content.ts
  C01: v1('entry'),
  C02: v1('entry'),
  C03: v1('entry'),
  C05a: v1('entry'),
  C04: v1('crawl'),
  C05b: v1('entry'),
  C05c: v1('entry'),
  C05d: v1('render', 'entry'),
  C06: v1('entry'),
  C07: { version: 2, requiredSources: ['entry'] },
  C08: v1('entry'),
  C10: v1('crawl'),
  C09: v1('crawl'),
  C11: v1('crawl'),
  TA01: v1('crawl'),
  TA02: v1('crawl'),
  // eeat.ts
  AR01: { version: 2, requiredSources: ['crawl'] },
  AR02: { version: 2, requiredSources: ['crawl'] },
  AR03: { version: 2, requiredSources: ['crawl'] },
  AR04: { version: 2, requiredSources: ['crawl'] },
  AR05: { version: 2, requiredSources: ['crawl'] },
  TR06: { version: 2, requiredSources: ['crawl'] },
  SO01: { version: 2, requiredSources: ['crawl'] },
  SO02: { version: 2, requiredSources: ['crawl', 'entry'] },
  // geo.ts
  G03: v1('render'),
  G05: v1('ai_probe'),
  G06: { version: 2, requiredSources: ['ai_probe'] },
  G01: v1('entry'),
  E01: v1('entry'),
  G02: v1('ua_probe'),
  G07: v1('third_party:wikipedia', 'third_party:reddit'),
  G08: v1('ua_probe'),
  G09: v1('ai_probe'),
  G10: { version: 2, requiredSources: ['ai_probe'] },
  G11: { version: 2, requiredSources: ['ai_probe'] },
  // keywords.ts
  K01: v1('gsc'),
  K02: v1('gsc'),
  K06: v1('gsc'),
  K03: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  K04: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  K05: v1('dataforseo:brand_serp'),
  K07: v1('dataforseo:seed_serp', 'dataforseo:labs'),
  IPF01: v1(['gsc', 'dataforseo:seed_serp']),
  IPF02: v1('gsc'),
  IPF03: v1(['gsc', 'dataforseo:seed_serp']),
  IPF04: v1('crawl', ['gsc', 'dataforseo:seed_serp']),
  // competitors.ts
  Q01: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  Q02: v1('ai_probe', 'confirmed_competitors'),
  Q03: v1('dataforseo:seed_serp', 'confirmed_competitors'),
  // authority.ts
  A01: v1('dataforseo:backlinks'),
  A02: { version: 2, requiredSources: ['dataforseo:backlinks'] },
  A03: { version: 2, requiredSources: ['dataforseo:backlinks'] },
  G04: v1('dataforseo:bing_index'),
  E02: v1('dataforseo:brand_serp'),
  E03: v1('dataforseo:labs', 'confirmed_competitors'),
  // trust.ts
  TR04: v1('crawl', 'entry'),
  TR05: v1('crawl', 'entry'),
  // reputation.ts
  SP01: v1('social_presence:youtube'),
  SP02: v1('social_presence:g2', 'social_presence:trustpilot', 'social_presence:capterra'),
}
