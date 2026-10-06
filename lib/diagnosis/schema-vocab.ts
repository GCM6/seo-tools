// Google 富媒体结果字段口径（C05c 真源）——静态、版本化快照。
//
// 2026-10-04 逐类型核对 Google 结构化数据文档（developers.google.com/search/docs/appearance/structured-data/*，
// 各页"最后更新"均在 2026-09；merchant-listing 页未显示日期），核对记录见 SP-A 实现笔记 Task 16。
// 只收录仍产出 Google 富媒体结果的类型；FAQPage / HowTo 已停展，一律不入表（spec §207）。
//   - required：Google 标 Required——缺失则该类型不具备富媒体结果资格。
//   - oneOf：每组至少出现一项（如 Product 的 review / aggregateRating / offers）。
//   - recommended：Google 标 Recommended，节选对多数站点适用的项——补齐提升完整度，非硬门槛。
// 字段路径支持点路径（如 offers.price，见 hasField）；同页 {"@id"} 引用按被引用节点判断，完整嵌套校验留到子项目 E（spec §5.1）。
// 改动此表即需 bump 版本，并随 RULES_VERSION 发布。
export const SCHEMA_VOCAB_VERSION = 'google_rich_results_2026-10'

const DOC = 'https://developers.google.com/search/docs/appearance/structured-data/'

export interface SchemaTypeRule {
  required: string[]
  oneOf?: string[][]
  recommended: string[]
  // 该口径的 Google 文档页。
  source: string
}

// 文章族（Article/NewsArticle/BlogPosting）：Google 原文 "There are no required properties"，全部为推荐。
const ARTICLE: SchemaTypeRule = {
  required: [],
  recommended: ['headline', 'image', 'datePublished', 'dateModified', 'author'],
  source: `${DOC}article`,
}

// 软件应用：offers.price 必填（免费应用写 0），评分/评论二选一。
const SOFTWARE_APP: SchemaTypeRule = {
  required: ['name', 'offers.price'],
  oneOf: [['aggregateRating', 'review']],
  recommended: ['applicationCategory', 'operatingSystem'],
  source: `${DOC}software-app`,
}

// 本地商家：aggregateRating/review 仅适用于"收录他人商家评价"的站点（自评不具备星级资格），不作通用推荐。
const LOCAL_BUSINESS: SchemaTypeRule = {
  required: ['name', 'address'],
  recommended: ['telephone', 'url', 'openingHoursSpecification', 'geo', 'priceRange'],
  source: `${DOC}local-business`,
}

// key = schema.org @type。
export const SCHEMA_VOCAB: Record<string, SchemaTypeRule> = {
  Article: ARTICLE,
  NewsArticle: ARTICLE,
  BlogPosting: ARTICLE,
  // 商品摘要口径（product-snippet）：name 必填 + review/aggregateRating/offers 三选一；
  // image 只是 merchant listing 的必填项，这里作推荐。
  Product: {
    required: ['name'],
    oneOf: [['review', 'aggregateRating', 'offers']],
    recommended: ['image', 'description', 'brand', 'sku'],
    source: `${DOC}product-snippet`,
  },
  SoftwareApplication: SOFTWARE_APP,
  // Google 原文："For mobile applications and web applications, Google also supports MobileApplication and WebApplication."
  // VideoGame 单独使用不出富媒体结果，不映射。
  MobileApplication: SOFTWARE_APP,
  WebApplication: SOFTWARE_APP,
  LocalBusiness: LOCAL_BUSINESS,
  VideoObject: {
    required: ['name', 'thumbnailUrl', 'uploadDate'],
    recommended: ['description', 'contentUrl', 'embedUrl', 'duration'],
    source: `${DOC}video`,
  },
  // 全远程岗位：有 applicantLocationRequirements 时 jobLocation 可省（job-posting 原文）。
  JobPosting: {
    required: ['title', 'description', 'datePosted', 'hiringOrganization'],
    oneOf: [['jobLocation', 'applicantLocationRequirements']],
    recommended: ['validThrough', 'baseSalary', 'employmentType'],
    source: `${DOC}job-posting`,
  },
  Recipe: {
    required: ['name', 'image'],
    recommended: ['description', 'author', 'datePublished', 'recipeIngredient', 'recipeInstructions', 'totalTime'],
    source: `${DOC}recipe`,
  },
  Event: {
    required: ['name', 'startDate', 'location'],
    recommended: ['description', 'endDate', 'eventStatus', 'image', 'offers', 'organizer'],
    source: `${DOC}event`,
  },
  // 实体根上的 Review / AggregateRating 必须写 itemReviewed（嵌在被评对象内时可省，那种不是实体根，不在此校验）。
  Review: {
    required: ['author', 'itemReviewed', 'reviewRating.ratingValue'],
    recommended: ['datePublished'],
    source: `${DOC}review-snippet`,
  },
  AggregateRating: {
    required: ['itemReviewed', 'ratingValue'],
    oneOf: [['ratingCount', 'reviewCount']],
    recommended: [],
    source: `${DOC}review-snippet`,
  },
  Course: {
    required: ['name', 'description'],
    recommended: ['provider'],
    source: `${DOC}course`,
  },
  // Organization 原文同样 "There are no required properties"。
  Organization: {
    required: [],
    recommended: ['name', 'url', 'logo', 'sameAs', 'description'],
    source: `${DOC}organization`,
  },
  // ListItem 的 position/name/item 属嵌套校验，留到 E。
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
    source: `${DOC}breadcrumb`,
  },
}

// 映射到 LocalBusiness 规则的子类型：非完整 schema.org 继承树，覆盖常见子类型。
export const LOCAL_BUSINESS_SUBTYPES: readonly string[] = [
  'Restaurant', 'Store', 'AutoDealer', 'Dentist', 'MedicalBusiness', 'LegalService', 'ProfessionalService',
  'FinancialService', 'FoodEstablishment', 'HealthAndBeautyBusiness', 'HomeAndConstructionBusiness',
  'LodgingBusiness', 'RealEstateAgent', 'TravelAgency', 'AutomotiveBusiness', 'EntertainmentBusiness',
  'SportsActivityLocation',
]

// 判定某 @type 是否在富媒体结果词表内（C05c 只对表内类型校验）。
export function schemaRuleFor(type: string): SchemaTypeRule | null {
  return SCHEMA_VOCAB[type] ?? (LOCAL_BUSINESS_SUBTYPES.includes(type) ? LOCAL_BUSINESS : null)
}

// offers.price 的等价写法（product-snippet：price 或 priceSpecification.price；AggregateOffer 用 lowPrice）。
const PRICE_PATHS = ['offers.price', 'offers.priceSpecification.price', 'offers.lowPrice']

// 同页 JSON-LD 节点索引：@id → 节点定义（同一页所有块、任意层级；同一 @id 多处定义时浅合并）。
// 只收定义（除 @id 外还有别的键）；纯引用 {"@id": X} 不入索引（第二波审查 I6）。
export type SchemaIdIndex = Map<string, Record<string, unknown>>
export function buildSchemaIdIndex(raw: unknown[]): SchemaIdIndex {
  const index: SchemaIdIndex = new Map()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk)
      return
    }
    if (v === null || typeof v !== 'object') return
    const obj = v as Record<string, unknown>
    const id = obj['@id']
    if (typeof id === 'string' && Object.keys(obj).some((k) => k !== '@id')) index.set(id, { ...index.get(id), ...obj })
    Object.values(obj).forEach(walk)
  }
  walk(raw)
  return index
}

// 纯引用 {"@id": X} → 换成索引里的定义；本页找不到（悬空引用）就原样返回，下钻时按缺失处理。
function deref(v: unknown, refs: SchemaIdIndex | undefined): unknown {
  if (!refs || v === null || typeof v !== 'object' || Array.isArray(v)) return v
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length === 1 && typeof obj['@id'] === 'string') return refs.get(obj['@id']) ?? v
  return v
}

function valueAt(root: Record<string, unknown>, path: string, refs?: SchemaIdIndex): unknown {
  let cur: unknown = root
  for (const key of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[0]
    cur = deref(cur, refs)
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

// 字段是否有值：缺失 / null / 空串 / 空数组都算缺；点路径逐层下钻，遇数组取第一个元素，遇 {"@id"} 引用换成被引用节点。
export function hasField(root: Record<string, unknown>, path: string, refs?: SchemaIdIndex): boolean {
  if (path === 'offers.price') return PRICE_PATHS.some((p) => isPresent(valueAt(root, p, refs)))
  return isPresent(valueAt(root, path, refs))
}

function isPresent(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}
