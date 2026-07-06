import type { FindingSide } from '@/lib/types'
import type { ValidationSpec } from './validation-spec'

// 建议模板层：按 ruleId 钉死「怎么修 / 怎么验证 / 工作量档位 / prompt 通道」。
// 技术类模板带 fixSnippet（静态示例，非 LLM 生成）；内容类模板注入 google-seo-expert 的 BLOCKERS 否定约束。
// 真源：spec §4.2 与 .claude/skills/google-seo-expert（S3/S4/S7 清单 + BLOCKERS）。

export type Effort = 'low' | 'mid' | 'high'
export type PromptType = 'content' | 'technical'

export interface RecommendationTemplate {
  // 可执行的修复动作（中文），会作为 recommendation.what 落库并进入 prompt。
  what: string
  // 追加到 finding.description 之后的因果补充（why），不重复描述。
  whyHint: string
  // 模板声明的固定工作量档位，参与 Impact×Effort 四象限定级。
  effort: Effort
  // 如何验证修复生效（中文），落库为 validation_method。
  validationMethod: string
  // 决定该建议走哪条 prompt 通道。
  promptType: PromptType
  // 技术类静态修复示例（正确的 canonical/robots/meta 等），随 what 一起进入 prompt。绝非 LLM 生成。
  fixSnippet?: string
  // 内容类专属：追加到全局 BLOCKERS 之外的规则级否定约束。
  negativeConstraints?: string[]
  // 覆盖默认风险话术；缺省按 promptType 派生。
  risk?: string
  // 覆盖按支柱派生的默认 validation_spec（spec §5.1-2）；缺省由 deriveValidationSpec 兜底。
  // 位次类（K02/K06）宜覆盖为 {metricSource:'gsc',metric:'position',direction:'decrease'}。
  validationSpec?: ValidationSpec
}

// google-seo-expert BLOCKERS 蒸馏为内容类 prompt 的全局否定约束（每条内容 prompt 必带）。
// 来源：skill §7 BLOCKERS + spec §4.2 / §207（FAQ 富摘要官方勘误）。
export const GLOBAL_CONTENT_BLOCKERS: string[] = [
  '禁止关键词堆砌 / 刻意拉高核心词密度（seo06 §27/§15/§38）',
  '禁止大量使用精准关键词锚文本做外链（docs/seo.md 三.2 / §15）',
  '禁止短时间批量上外链或用工具自动跑外链（§15/§25）',
  '禁止一键批量生成、无人工终审的 AI 内容；AI 初稿必须人工终审并补充可验证的第一手 E-E-A-T 证据（视频五/§39/§14）',
  '禁止用翻译插件泛滥生成小语种页（§26/§16/§22）',
  '禁止 FAQ/Schema 结构化数据与前端展示内容不一致（§20）',
  '禁止为获取富摘要而新增 FAQ/HowTo 标记：Google 2026-05-07 起已对所有站点停展 FAQ 富摘要（官方 changelog），此类标记不预期富摘要收益（spec §207）',
  '禁止跨域名设置 canonical（§32）',
  '禁止放任同一关键词多页内部竞争（蚕食）不处理（§8/§23/§32）',
  '禁止引用「2026 年 E-E-A-T 权重提升 / 扩展到所有竞争性查询」等无官方依据的行业叙事（spec §203）',
  '不得编造未提供的数字、事实或客户案例；所有数据须标注可追溯来源',
]

// —— 技术类 fixSnippet（静态示例常量）——
const CANONICAL_SNIPPET = '<!-- 每页 <head> 内，指向自身规范 URL（同域、绝对路径、与 sitemap/hreflang 一致） -->\n<link rel="canonical" href="https://example.com/current-page/" />'
const META_INDEX_SNIPPET = '<!-- 需被收录的重点页/模板页，移除 noindex；如需显式允许： -->\n<meta name="robots" content="index, follow" />'
const ROBOTS_ALLOW_SNIPPET = '# robots.txt —— 放开被误屏蔽的重点路径（不要 Disallow 收录页）\nUser-agent: Googlebot\nAllow: /\n# 仅屏蔽真正无价值路径，如：\nDisallow: /cart\nDisallow: /*?sort='
const AI_CRAWLER_SNIPPET = '# robots.txt —— 放开检索型 AI 爬虫（影响 ChatGPT/Perplexity 可发现性）\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\n# 训练型爬虫（GPTBot/ClaudeBot/Google-Extended）是否放开按品牌策略自定，仅影响语料收录'
const VIEWPORT_SNIPPET = '<!-- 移动优先索引必备，置于 <head> 首部 -->\n<meta name="viewport" content="width=device-width, initial-scale=1" />'
const HREFLANG_SNIPPET = '<!-- 各语言版本互指 + x-default；语言-地区用 ISO 639-1 + ISO 3166-1（en-gb 而非 en-uk） -->\n<link rel="alternate" hreflang="en" href="https://example.com/" />\n<link rel="alternate" hreflang="zh-cn" href="https://example.com/zh/" />\n<link rel="alternate" hreflang="x-default" href="https://example.com/" />'
const JSONLD_SNIPPET = '<!-- 有效 JSON-LD 示例（类型/属性须存在于 schema.org，值须与前端正文一致） -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "示例产品",\n  "offers": { "@type": "Offer", "price": "99.00", "priceCurrency": "USD" }\n}\n</script>'
const SAMEAS_SNIPPET = '<!-- Organization sameAs 关联官方社媒/维基/权威目录，强化实体识别 -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "品牌名",\n  "url": "https://example.com/",\n  "sameAs": ["https://www.linkedin.com/company/...", "https://www.crunchbase.com/organization/..."]\n}\n</script>'

export const templates: Record<string, RecommendationTemplate> = {
  // ——— P1 技术健康（technical）———
  T01: {
    what: '解除入口/重点页在 robots.txt 中对 Googlebot 的屏蔽，仅保留真正无价值路径的 Disallow。',
    whyHint: '被 robots 屏蔽的页面无法被抓取与收录，直接切断自然流量入口。',
    effort: 'low',
    validationMethod: '改后用 GSC「网址检查」确认「已允许抓取」，并观察该模板收录数回升。',
    promptType: 'technical',
    fixSnippet: ROBOTS_ALLOW_SNIPPET,
  },
  T02: {
    what: '定位并修复 4xx/5xx 页面：有价值的旧链 301 到现行页，无价值的从内链/sitemap 移除。',
    whyHint: '高错误占比浪费抓取预算并损伤站点质量信号。',
    effort: 'mid',
    validationMethod: '重新全站轻检确认错误占比回落至阈值内；GSC 覆盖率报告错误数下降。',
    promptType: 'technical',
  },
  T03: {
    what: '移除重点页/模板级误用的 noindex，仅对 tag/参数/分类等无价值页保留 noindex。',
    whyHint: 'noindex 会让页面被主动排除索引，重点页误标等于自我封杀。',
    effort: 'low',
    validationMethod: '重新抓取确认 meta robots 不含 noindex；GSC 观察该模板收录数恢复。',
    promptType: 'technical',
    fixSnippet: META_INDEX_SNIPPET,
  },
  T04: {
    what: '修正 canonical：改为同域自指、绝对路径，且与 sitemap/hreflang 一致；补齐缺失的 canonical。',
    whyHint: 'canonical 指向站外或缺失/自指不一致会让排名信号错配或被稀释。',
    effort: 'low',
    validationMethod: '重新抓取确认 canonical 指向自身且与最终 URL 一致。',
    promptType: 'technical',
    fixSnippet: CANONICAL_SNIPPET,
  },
  T05: {
    what: '为 sitemap 声明但内链入度为 0 的孤岛页补内链：从相关聚合页/正文自然链入。',
    whyHint: '无内链支撑的孤岛页得不到权重传递，长期难以获得排名。',
    effort: 'mid',
    validationMethod: '重新计算内链入度确认 >0；GSC 观察该页展示/抓取频次提升。',
    promptType: 'technical',
  },
  T06: {
    what: '拉直重定向链/消除重定向循环：把多跳链改为一次性 301 指向最终 URL。',
    whyHint: '过长/循环的重定向浪费抓取预算并稀释权重传递。',
    effort: 'mid',
    validationMethod: '重新跟踪 redirect chain 确认单跳直达最终 200 页。',
    promptType: 'technical',
  },
  T07: {
    what: '补齐/修正 sitemap，使其与实际可收录页面集一致（移除已删/noindex 页，补漏收录页）。',
    whyHint: 'sitemap 缺失或与实际偏差大会拖慢新页发现与收录。',
    effort: 'low',
    validationMethod: '在 GSC 重新提交 sitemap，确认已发现/已收录数量匹配。',
    promptType: 'technical',
  },
  T08: {
    what: '统一 HTTPS 并消除混合内容：把页面内 http 资源（图片/脚本/样式）改为 https。',
    whyHint: 'HTTP 或混合内容触发不安全提示，损伤信任与收录。',
    effort: 'mid',
    validationMethod: '重新抓取确认全站 https 且无 mixed-content 告警。',
    promptType: 'technical',
  },
  T10: {
    what: '让重点模板的正文在初始 HTML 中可见（SSR / 预渲染 / 静态化），初始正文占比提升到 30% 以上。',
    whyHint: '初始 HTML 正文占比过低意味着内容重度依赖 JS 渲染，抓取与索引不稳定。',
    effort: 'high',
    validationMethod: '重新做渲染对比，确认初始 HTML 正文/渲染后正文占比 ≥30%。',
    promptType: 'technical',
    fixSnippet: '// 关键正文走服务端渲染，避免仅在客户端 useEffect 后注入\n// Next.js 16 App Router：默认 Server Component，直接在服务端产出正文 HTML',
  },
  T11: {
    what: '为重点/聚合页补足内链支撑：配 5-6 篇相关内容自然链入核心转化页。',
    whyHint: '核心转化页内链入度不足，权重与抓取优先级偏低。',
    effort: 'mid',
    validationMethod: '重新统计 inboundLinkCount 达标；GSC 观察该页排名/展示提升。',
    promptType: 'technical',
  },
  T12: {
    what: '把重点页点击深度压到 3 层内：在导航/聚合页增加直达入口，缩短路径。',
    whyHint: '点击深度过深使权重传递与抓取效率下降。',
    effort: 'mid',
    validationMethod: '重新抓取确认重点页 depth ≤3。',
    promptType: 'technical',
  },
  T13: {
    what: '补齐移动端适配：加 viewport meta 并修复 PSI 移动端异常项。',
    whyHint: '移动优先索引下，缺 viewport 或移动端异常直接影响收录与排名。',
    effort: 'low',
    validationMethod: '重新抓取确认存在 viewport meta；PSI 移动端通过。',
    promptType: 'technical',
    fixSnippet: VIEWPORT_SNIPPET,
  },
  T14: {
    what: '修正 hreflang：各语言版本互指、补 x-default、修正无效语言-地区代码，并保证 canonical 与 hreflang 不冲突。',
    whyHint: 'hreflang 声明缺失/互指不一致/代码无效会导致多市场版本错配（Ahrefs：67% 使用 hreflang 的域名至少一处错误）。',
    effort: 'mid',
    validationMethod: '重新抓取校验 hreflang 互指闭合、含 x-default、代码合法且存在于初始 HTML。',
    promptType: 'technical',
    fixSnippet: HREFLANG_SNIPPET,
  },
  T15: {
    what: '核实语言页价值：对 GSC 零展示的语言路径页评估合并或加 noindex，翻译插件批量生成页按价值取舍，把抓取预算释放给主力页。',
    whyHint: '大量零展示语言页耗抓取预算、稀释权重（翻译插件泛滥的常见成因）。',
    effort: 'mid',
    validationMethod: '重新采集 + GSC 观察语言页展示是否回升，或抓取预算是否集中到主力页。',
    promptType: 'technical',
  },
  T09a: {
    what: '按 CrUX 未达标指标定向优化 Core Web Vitals：LCP（压缩首屏图片/预加载关键资源/优化服务器响应）、INP（拆分长任务/减少主线程阻塞）、CLS（为图片和广告位预留尺寸）。',
    whyHint: 'CrUX 字段数据是 Google 排名实际使用的真实用户体验信号，未达标削弱页面体验维度与移动优先索引下的竞争力。',
    effort: 'mid',
    validationMethod: '优化后等待 CrUX 数据滚动更新（约 28 天窗口），复测确认 LCP≤2.5s / INP≤200ms / CLS≤0.1。',
    promptType: 'technical',
  },
  T09b: {
    what: '按 Lighthouse top 机会逐项修复（渲染阻塞资源、图片体积、未用 JS/CSS、主线程工作量），作为 CWV 改进的执行清单。',
    whyHint: 'Lighthouse 为实验室模拟诊断，非 Google 排名输入；其机会清单可指导 CWV 的具体修复方向，但分数本身不作排名依据。',
    effort: 'mid',
    validationMethod: '重新运行 PSI 确认目标机会项的预估节省下降；最终以 CrUX 字段数据的 CWV 改善为准。',
    promptType: 'technical',
  },
  T09c: {
    what: '降低服务器响应时间（TTFB）：启用/校准 CDN 与缓存、优化数据库与后端渲染、就近部署，将 TTFB 压到阈值内。',
    whyHint: 'Google 官方：响应速度影响抓取预算与抓取速率，进而影响收录覆盖与时效，对大站尤甚。',
    effort: 'high',
    validationMethod: '复测 PSI/轻检响应耗时确认 TTFB 下降；观察 GSC 抓取统计的平均响应时间与已抓取页数。',
    promptType: 'technical',
  },
  // ——— P2 内容与页面（content）———
  C01: {
    what: '为缺失/过长/模板级重复的 title 重写：一页一意图，含核心词，控制在 60 字符内，模板级去重。',
    whyHint: 'title 是最强的页面级相关性信号，缺失/重复/过长都削弱点击与相关性。',
    effort: 'low',
    validationMethod: '重新抓取确认 title 唯一、含词、长度达标；GSC 观察该模板 CTR。',
    promptType: 'content',
  },
  C02: {
    what: '补齐/去重 meta description：每页独立撰写，概括价值并含核心词，引导点击。',
    whyHint: 'meta description 缺失或重复会让 SERP 摘要失控、影响点击。',
    effort: 'low',
    validationMethod: '重新抓取确认 description 唯一且非空。',
    promptType: 'content',
  },
  C03: {
    what: '规范 H1：每页唯一 H1，与 title 有区分、承载页面主题。',
    whyHint: 'H1 缺失/多个/与 title 完全重复会弱化主题表达。',
    effort: 'low',
    validationMethod: '重新抓取确认单一 H1 且与 title 有别。',
    promptType: 'content',
  },
  C04: {
    what: '扩充薄内容模板：围绕搜索意图补齐必答子话题、实体与第一手数据，达到有竞争力的正文深度。',
    whyHint: '承载商业意图的模板正文过薄，难以覆盖意图、难获排名。',
    effort: 'high',
    validationMethod: 'GSC 观察该模板展示量与平均排名；正文覆盖目标子话题清单。',
    promptType: 'content',
  },
  C05a: {
    what: '选用 2026 年仍产出富摘要的结构化类型（Product / Article / Organization / Breadcrumb）；已用 FAQPage/HowTo 的可保留（仍是有效 schema.org 类型，利于 AI 理解问答结构），但不要为富摘要而新增 FAQ/HowTo。',
    whyHint: 'schema 缺失或仍以弃用类型（FAQ/HowTo）为主，拿不到 2026 年仍展示的富摘要收益。',
    effort: 'mid',
    validationMethod: '用 Google 富媒体结果测试确认目标类型可通过；GSC 增强报告出现对应富摘要。',
    promptType: 'content',
    fixSnippet: JSONLD_SNIPPET,
    negativeConstraints: ['不要为富摘要而新增 FAQPage/HowTo（Google 已停展其富摘要），仅在确有问答内容且与前端一致时保留'],
  },
  C05b: {
    what: '修复 JSON-LD 语法与词汇错误：保证 JSON 可解析、@context 正确、类型/属性均存在于 schema.org 词汇表。',
    whyHint: 'JSON 解析失败或用了不存在的类型/属性，结构化数据整体失效。',
    effort: 'low',
    validationMethod: '用富媒体结果测试/Schema 校验确认无语法与词汇错误。',
    promptType: 'content',
    fixSnippet: JSONLD_SNIPPET,
  },
  C05c: {
    what: '补齐 Google 富摘要必填/推荐字段（如 Product 的 offers/aggregateRating、Article 的 datePublished）。',
    whyHint: '必填字段缺失会让富摘要无法生成。',
    effort: 'mid',
    validationMethod: '富媒体结果测试确认必填字段齐备、无警告。',
    promptType: 'content',
    fixSnippet: JSONLD_SNIPPET,
  },
  C05d: {
    what: '让 JSON-LD 中的文本值（问答/名称/价格）与渲染后前端正文完全一致，消除结构化数据与页面不符。',
    whyHint: '结构化数据与前端内容不一致违反 Google 规范、有处罚风险。',
    effort: 'mid',
    validationMethod: '重新抓取渲染后正文，逐值确认 JSON-LD 文本可在正文中找到。',
    promptType: 'content',
    negativeConstraints: ['结构化数据的任何文本值都必须与前端渲染后正文逐字一致，不得只在 JSON-LD 中出现'],
  },
  C06: {
    what: '补 E-E-A-T 代理信号：作者署名+背景、发布/更新日期、关于/联系页，并补充可验证的第一手经验证据（实拍/实操截图、操作步骤、案例数据）。',
    whyHint: 'E-E-A-T 代理信号缺失（作者/日期/关于页）会削弱可信度——注意这些是代理指标，非官方排名因子。',
    effort: 'mid',
    validationMethod: '人工确认作者/日期/关于页齐备且经验证据可追溯来源。',
    promptType: 'content',
    negativeConstraints: ['第一手经验证据必须真实可核验，不得编造署名、案例或数据'],
  },
  C07: {
    what: '强化 GEO 内容特征：为重点页补统计数据、引述与来源引用，并给出可独立成答的原创数据点。',
    whyHint: '重点页缺统计/引述/来源引用，AI 引擎更难提取与引用（KDD 2024 三强项启发式）。',
    effort: 'mid',
    validationMethod: '重新探针观察品牌被引率/引用位置；正文含带来源的数据点。',
    promptType: 'content',
  },
  C08: {
    what: '重点页正文前 30% 增加可独立成答的段落（直接回答目标问题，再展开）。',
    whyHint: '答案未前置，AI 与精选摘要更难摘取。',
    effort: 'low',
    validationMethod: '人工确认前段含独立成答段落；观察探针/精选摘要引用。',
    promptType: 'content',
  },
  C09: {
    what: '为缺 alt 的图片补描述性 alt（含语义、非堆词），按模板批量补齐。',
    whyHint: '图片 alt 缺失率过高损伤可访问性与图片检索。',
    effort: 'low',
    validationMethod: '重新轻检确认 imgAltMissing 率回落。',
    promptType: 'content',
  },
  C10: {
    what: '处理内容同质化/关键词蚕食：按质量与数据表现，选 canonical（两页都有价值）或 301（彻底合并差页跳好页）。',
    whyHint: '同一意图多页内部竞争会交替波动、分散权重。',
    effort: 'mid',
    validationMethod: '导出 GSC「搜索词↔页面」确认单页收敛；观察该词排名企稳。',
    promptType: 'content',
    negativeConstraints: ['合并只在站内做，禁止跨域名 canonical；不得放任多页争同一词'],
  },
  C11: {
    what: '提升可扫描性：合理分段（短段落）、加小标题/列表/表格，把长段拆成结构化模块。',
    whyHint: '结构可扫描性差，用户与 AI 都更难提取要点。',
    effort: 'low',
    validationMethod: '重新轻检确认段落长度/列表/表格等结构指标改善。',
    promptType: 'content',
  },
  // ——— P5 权威与实体（content）———
  E01: {
    what: '补齐 Organization sameAs：在结构化数据中关联官方社媒/维基/权威目录，强化实体识别。',
    whyHint: '实体 sameAs 关联缺失，搜索与 AI 引擎更难把品牌识别为确定实体。',
    effort: 'low',
    validationMethod: '重新抓取确认 Organization 含 sameAs；观察知识面板/实体识别改善。',
    promptType: 'content',
    fixSnippet: SAMEAS_SNIPPET,
  },
  // ——— GEO 可达/渲染（technical）———
  G01: {
    what: '在 robots.txt 放开检索型 AI 爬虫（OAI-SearchBot / PerplexityBot / Claude-SearchBot），训练型爬虫按品牌策略自定。',
    whyHint: '检索型 AI 爬虫被屏蔽会直接切断 ChatGPT/Perplexity 的可发现性。',
    effort: 'low',
    validationMethod: '改后用对应 UA 请求确认返回 200；探针观察品牌可见性。',
    promptType: 'technical',
    fixSnippet: AI_CRAWLER_SNIPPET,
  },
  G03: {
    what: '让重点正文在初始 HTML 可见（同 T10 措施），使不执行 JS 的 AI 抓取链路也能读到内容。',
    whyHint: '正文重度依赖 JS 渲染，对不执行 JS 的 AI 抓取链路不可见。',
    effort: 'high',
    validationMethod: '渲染对比确认初始 HTML 正文占比达标；探针观察 AI 引用改善。',
    promptType: 'technical',
    fixSnippet: '// 关键正文服务端渲染，勿仅客户端注入（Next.js 16 Server Component 默认服务端产出 HTML）',
  },
  // ——— P3 关键词（seo，证据源 GSC）———
  K01: {
    what: '锁定这批「排名 4-20、有展示量」的机会词，逐个优化落地页：补足内容深度与信息增益、加内链指向、对齐搜索意图，把它们推上首页前列。',
    whyHint: '这些词已有展示、排名逼近首页，是投产比最高的增长点——优化少量高潜力页比新造内容见效快。',
    effort: 'mid',
    validationMethod: '4-6 周后在 GSC 复测这批词的平均排名与点击，确认上移。',
    promptType: 'content',
  },
  K02: {
    what: '优化这批「高排名却低点击」词的标题与描述（更贴合意图、增加吸引力与差异化）；同时排查该 SERP 是否被 AI 摘要/精选摘要/图片包挤压。',
    whyHint: '排名靠前但点击率异常低，通常是标题描述吸引力不足或 SERP 特性抢走了点击——恒为假设，需 SERP 特性证据才能确认归因。',
    effort: 'low',
    validationMethod: 'GSC 复测该词 CTR 是否回升至位置基准附近；如仍偏低，配 DataForSEO 的 SERP 特性证据再定因。',
    promptType: 'content',
    risk: '不得断言「被 AI Overview 压制」——无 SERP 时序证据前只能表述为疑似受 SERP 特性影响。',
  },
  K06: {
    what: '按决策表处理蚕食：两页均有独立价值 → 在次要页设 canonical 指向主页；应彻底合并 → 用 301 把弱页重定向到强页并合并内容。跨域名 canonical 无效。',
    whyHint: '同一词多页争抢会分散权重与点击、拉低整体排名，收敛到单一权威页更利于集中信号。',
    effort: 'mid',
    validationMethod: '处理后 GSC 复测该词是否收敛到单页承接、排名与点击是否提升。',
    promptType: 'technical',
    fixSnippet: '<!-- 次要页 <head>：canonical 指向主承接页（同域绝对路径） -->\n<link rel="canonical" href="https://example.com/primary-page/" />\n<!-- 或彻底合并：服务端 301 弱页 → 强页 -->',
  },
  // ——— P3 关键词缺口（seo，证据源 DataForSEO SERP/Labs，第三方估算 L3）———
  K03: {
    what: '针对这批「≥2 个确认竞品排 Top10 而本站无排名」的缺口词，按 搜索量×意图×难度可及性 排序，优先为高可及性词新建或补强承接页（对齐意图、覆盖竞品页已含的实体与子话题）。',
    whyHint: '竞品在这些词上占位而本站缺席，是可量化的市场份额流失；先攻难度低、意图明确的词投产比最高。',
    effort: 'high',
    validationMethod: '4-6 周后复测这批缺口词的本站排名是否进入 Top20/Top10（同市场同协议）。',
    promptType: 'content',
    risk: '搜索量/难度为第三方估算（L3），排序仅作方向性优先级，不作确定性流量承诺。',
  },
  K04: {
    what: '优化这批「本站 11-30 名、竞品 Top10」的弱势词承接页：补内容深度与信息增益、加内链、提升页面权威信号，把已有排名推进首页。',
    whyHint: '已有排名基础、距首页一步之遥，比从零起步的缺口词更易见效。',
    effort: 'mid',
    validationMethod: 'GSC/SERP 复测这批词是否从第 2-3 页进入首页。',
    promptType: 'content',
  },
  K05: {
    what: '巩固品牌词 SERP 首页：确保官网+官方资产（社媒/知识面板/权威目录）占据品牌词首页，挤走第三方占位；必要时补 Organization schema 与 sameAs。',
    whyHint: '品牌词首页被第三方占位会稀释品牌流量与信任，也削弱 AI 引擎对品牌实体的识别。',
    effort: 'mid',
    validationMethod: '复测品牌词 SERP 首页官网占位数与知识面板出现情况。',
    promptType: 'content',
  },
  K07: {
    what: '修正搜索意图错位：让承接页类型匹配目标词 SERP 前排的主流页面类型（信息文/产品页/榜单）——如目标是榜单意图却用产品页承接，则改造或新建对应意图的页面。',
    whyHint: 'SERP 前排页面类型代表 Google 判定的主流意图；页型不匹配很难挤进前排，无论内容多好。',
    effort: 'mid',
    validationMethod: '按匹配意图改造/新建页面后，复测该词排名是否上移。',
    promptType: 'content',
  },
  // ——— P4 竞品对比（seo，证据源 DataForSEO SERP + 探针）———
  Q01: {
    what: '对照确认竞品的 Share of SERP 差距，锁定竞品覆盖而本站薄弱的词群与页型，制定针对性内容与内链补强计划。',
    whyHint: 'SERP 份额差距量化了自然搜索竞争力落差，指明优先补强的战场。',
    effort: 'mid',
    validationMethod: '复测本站与竞品在共同词集上的 Share of SERP 是否缩小差距。',
    promptType: 'content',
    risk: 'SERP 份额基于第三方 SERP 抽样（L3），作对比参考非绝对市场份额。',
  },
  Q03: {
    what: '参照确认竞品在缺口词上的内容形态（页面类型/字数量级/schema 使用），为本站对应承接页设定内容规格基线，避免形态性劣势。',
    whyHint: '竞品排前的内容形态揭示了该词的内容期望，形态达标是进入竞争的前提。',
    effort: 'mid',
    validationMethod: '按形态基线产出/改造页面后复测排名与被引用。',
    promptType: 'content',
  },
  // ——— P5 权威（seo，证据源 DataForSEO Backlinks，第三方估算 L3）———
  A01: {
    what: '对照确认竞品的引荐域中位数补外链：优先争取行业权威站、真实媒体报道与自然提及；不追求数量堆砌，追求高质量引荐域覆盖。',
    whyHint: '引荐域数量与质量落后竞品会限制整体权重上限；权威站的自然引荐是最稳的信任信号。',
    effort: 'high',
    validationMethod: '3-6 个月后复测引荐域数与竞品中位数的差距（外链见效慢）。',
    promptType: 'content',
    negativeConstraints: ['禁止购买链接、批量低质外链或短期外链激增（触发非自然增长风险）'],
    risk: '外链数据为第三方估算（L3），仅作概况对比，不做逐链质量断言。',
  },
  A02: {
    what: '纠偏锚文本结构：降低精准关键词锚文本占比，增加品牌锚、裸链与自然长尾锚的比例，让 dofollow/nofollow 结构更自然。',
    whyHint: '精准锚文本占比过高是典型的过度优化画像，有处罚风险；自然的锚文本分布更安全。',
    effort: 'mid',
    validationMethod: '复测锚文本分布是否趋向自然（品牌/裸链占比上升）。',
    promptType: 'content',
    negativeConstraints: ['禁止继续用精准关键词锚文本批量做外链（seo.md 三.2）'],
  },
  A03: {
    what: '排查短窗口内外链激增来源：确认是否自然获得；如为低质/非自然来源，评估拒绝链接（disavow）并转向自然外链节奏。',
    whyHint: '外链短期激增易被判为操纵，回撤自然节奏可降低风险。',
    effort: 'mid',
    validationMethod: '复测 new/lost 外链曲线是否回归平稳自然节奏。',
    promptType: 'technical',
    risk: '增长节奏异常为推断（inferred），需人工核对来源真实性后再决定是否 disavow。',
  },
  // ——— P5 AI 就绪 / 实体（证据源 DataForSEO Bing SERP / 品牌 SERP）———
  G04: {
    what: '补齐 Bing 收录：向 Bing Webmaster Tools 提交站点与 sitemap，修复阻碍 Bing 抓取的问题（robots/渲染/状态码），提升 Bing 索引覆盖。',
    whyHint: 'ChatGPT 检索主要依赖 Bing 索引，Bing 收录缺失会直接削弱 ChatGPT 可发现性。',
    effort: 'low',
    validationMethod: '复测 Bing `site:` 收录量是否上升。',
    promptType: 'technical',
    fixSnippet: '<!-- 提交 Bing：https://www.bing.com/webmasters —— 提交 sitemap.xml，检查 robots 未屏蔽 bingbot -->\nUser-agent: bingbot\nAllow: /',
  },
  E02: {
    what: '建设品牌实体以争取 Knowledge Panel：完善 Organization schema（含 sameAs 指向 Wikidata/LinkedIn/Crunchbase/官方社媒）、保持 NAP 一致、争取权威第三方对品牌的收录与提及。',
    whyHint: '有知识面板代表 Google 已识别品牌实体；实体清晰也利于 AI 引擎消歧与引用。',
    effort: 'high',
    validationMethod: '复测品牌词 SERP 是否出现 Knowledge Panel。',
    promptType: 'content',
    risk: '无知识面板不作处罚性结论，仅作实体建设方向。',
  },
  E03: {
    what: '提升品牌搜索量与网络提及：通过内容营销、社区讨论（Reddit）、评测站收录、媒体报道扩大品牌自然提及面（品牌提及与 AI 可见性强相关）。',
    whyHint: '品牌搜索量与第三方网络提及是 AI 可见性最强的相关因子（相关 0.664，强于外链），也是信任代理指标。',
    effort: 'high',
    validationMethod: '复测 GSC 品牌词展示量与 DataForSEO 品牌词搜索量相对竞品的变化。',
    promptType: 'content',
    risk: '品牌提及与 AI 可见性为相关非因果，只做度量对比不下因果结论。',
  },
  TA01: {
    what: '补足浅覆盖话题群的内容深度（围绕核心话题扩展子主题页），并在孤立话题群之间建立主题内链，形成话题网络。',
    whyHint: '话题群仅 1-2 页或群内近乎无站内入度，主题覆盖浅且割裂（结构性推断，非排名断言）。',
    effort: 'high',
    validationMethod: '重新统计话题群页数与群内入度均值是否提升；GSC 观察该话题聚合展示是否上升。',
    promptType: 'content',
  },
}

// 缺省模板：按 finding.side 兜底（技术/内容两档），保证任意规则命中都能出可用建议。
export function genericTemplate(side: FindingSide): RecommendationTemplate {
  if (side === 'technical' || side === 'seo') {
    return {
      what: '按证据定位并修复该技术问题，改后重新抓取验证。',
      whyHint: '该技术问题会影响抓取、收录或权重传递。',
      effort: 'mid',
      validationMethod: '重新全站轻检/抓取确认该问题不再命中。',
      promptType: 'technical',
    }
  }
  return {
    what: '根据证据优化该内容页，围绕搜索意图补齐深度并保证与前端一致。',
    whyHint: '该内容问题影响相关性、可提取性或可信度。',
    effort: 'mid',
    validationMethod: 'GSC/探针观察该页展示、排名或被引用情况改善。',
    promptType: 'content',
  }
}

export const TEMPLATE_COUNT = Object.keys(templates).length
