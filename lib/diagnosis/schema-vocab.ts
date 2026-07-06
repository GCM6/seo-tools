// Google 富摘要字段规则表（C05c 真源）——静态、版本化快照。
//
// 只收录「2026 年仍产出 Google 富摘要」的类型；已弃用的 FAQPage / HowTo 一律不入表
// （Google 2026-05-07 起对所有站点停展 FAQ 富摘要，HowTo 亦已停展，见 spec §207）。
//
// 字段口径蒸馏自 Google 结构化数据功能文档（developers.google.com/search/docs/appearance/structured-data）：
//   - required：缺失则该富摘要无法生成 / 会被判无效（Google 标 Required，或 spec 明确要求，如 Article 的 datePublished）。
//   - recommended：Google 标 Recommended，补齐可提升富摘要完整度但非硬门槛。
// 一次只能表达「必填/推荐」两档，无法表达「offers/review/aggregateRating 三选一」这类 one-of 约束，
// 此类字段统一放入 recommended 并在此说明；C05c 仅对 required 缺失告警，避免误报。
//
// 版本随 RULES_VERSION 一并固化；改动此表即需 bump（spec §11.3 / 数据源刷新表 google_rich_results_rules）。
export const SCHEMA_VOCAB_VERSION = 'google_rich_results_2026-07'

export interface SchemaTypeRule {
  required: string[]
  recommended: string[]
}

// key = schema.org @type。Article 家族（Article/NewsArticle/BlogPosting）共用同一套字段。
export const SCHEMA_VOCAB: Record<string, SchemaTypeRule> = {
  // 商品：name+image 为 Google 必填；offers/review/aggregateRating 三选一（放 recommended）。
  Product: {
    required: ['name', 'image'],
    recommended: ['offers', 'review', 'aggregateRating', 'brand', 'sku', 'gtin', 'description'],
  },
  // 文章族：Google 技术上标为 Recommended，但 headline+datePublished 是富摘要成型的实际门槛（spec §4 C05c 例）。
  Article: {
    required: ['headline', 'datePublished'],
    recommended: ['image', 'dateModified', 'author', 'publisher'],
  },
  NewsArticle: {
    required: ['headline', 'datePublished'],
    recommended: ['image', 'dateModified', 'author', 'publisher'],
  },
  BlogPosting: {
    required: ['headline', 'datePublished'],
    recommended: ['image', 'dateModified', 'author', 'publisher'],
  },
  // 面包屑：itemListElement 必填（每个 ListItem 需 name+item+position，此处只校验顶层）。
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  // 组织/实体：name 必填；url/logo/sameAs 强化实体识别。
  Organization: {
    required: ['name'],
    recommended: ['url', 'logo', 'sameAs', 'contactPoint', 'description'],
  },
  // 食谱：name+image 必填。
  Recipe: {
    required: ['name', 'image'],
    recommended: ['recipeIngredient', 'recipeInstructions', 'author', 'datePublished', 'aggregateRating', 'nutrition', 'totalTime'],
  },
  // 活动：name+startDate+location 必填。
  Event: {
    required: ['name', 'startDate', 'location'],
    recommended: ['endDate', 'offers', 'image', 'description', 'performer', 'organizer'],
  },
  // 单条评论：itemReviewed+author+reviewRating 必填。
  Review: {
    required: ['itemReviewed', 'author', 'reviewRating'],
    recommended: ['datePublished', 'publisher'],
  },
  // 聚合评分：ratingValue 必填；reviewCount/ratingCount 二选一（放 recommended）。
  AggregateRating: {
    required: ['ratingValue'],
    recommended: ['reviewCount', 'ratingCount', 'bestRating', 'itemReviewed'],
  },
  // 视频：name+description+thumbnailUrl+uploadDate 必填。
  VideoObject: {
    required: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['duration', 'contentUrl', 'embedUrl', 'expires'],
  },
  // 课程：name+description 必填；provider 强推荐。
  Course: {
    required: ['name', 'description'],
    recommended: ['provider', 'offers', 'hasCourseInstance'],
  },
  // 招聘：title+description+datePosted+hiringOrganization+jobLocation 均必填。
  JobPosting: {
    required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'],
    recommended: ['baseSalary', 'employmentType', 'validThrough', 'applicantLocationRequirements'],
  },
}

// 判定某 @type 是否在富摘要词表内（C05c 只对表内类型校验必填字段）。
export function schemaRuleFor(type: string): SchemaTypeRule | null {
  return SCHEMA_VOCAB[type] ?? null
}
