# S4 文章页识别 + 文章级 E-E-A-T 与数据支撑 + 社媒链接 设计

> 状态:用户授权连续推进(2026-09-29)。依赖 S1 的逐页链接明细(区域、站外链接)与 S2 的功能页识别。
> 对应用户原话:"EEAT 权威是否够""社媒相关链接是否有",以及追加的"博客内容识别时能识别数据支撑等信息"。

## 1. 现状(observed,2026-09-29)

- C06(E-E-A-T 代理信号)与 C07(统计/引用/引述)**只看首页**;博客/文章页从未被分析。
- C07 口径粗:正文里任何数字都算"统计",任何站外链接都算"引用"(页脚社媒图标也算)。
- 社媒:只有站外前台检索(SP01/SP02)与首页 schema `sameAs`(E01);站内是否链接了社媒主页从未检查。
- 抓取阶段(light-check)拿到了每页 HTML,但除链接外只抽了少量结构信号,文章级信号全部缺失。

## 2. 目标

1. 抓取阶段为**每个已抓 HTML 页**抽取文章信号,写入 `lightCheckExtra.article`(JSON 列,无需迁移)。
2. 识别文章页(博客/新闻/指南),按文章页集合做站级聚合判定,替代"只看首页"。
3. 数据支撑识别只看**正文区域**,并区分"带来源归属的数据"与"孤立数字"。
4. 站内社媒主页链接识别(页眉/页脚/导航区域),并与 schema `sameAs` 对照。
5. 站级信任页(关于/联系/隐私/条款)存在且首页可达。

**非目标**:不评判内容质量/真实性,不调用 LLM,不抓社媒平台本身(反爬,见 S2 BOT_HOSTILE_HOSTS)。E-E-A-T 信号一律是**代理指标**,描述明示"非 Google 官方排名因子"(沿用 C06 措辞)。

## 3. 文章信号抽取(`lib/crawl/article-signals.ts`,纯函数,light-check 调用)

```ts
interface ArticleSignals {
  isArticle: boolean                 // 判定结果
  articleReasons: ('schema' | 'og_article' | 'article_tag_with_date' | 'url_pattern')[]
  author: string | null              // 作者名(截断 80)
  authorSource: 'schema' | 'meta' | 'rel_author' | 'byline' | null
  authorUrl: string | null           // 作者页链接(rel=author / schema author.url / 署名内链接)
  datePublished: string | null       // ISO
  dateModified: string | null
  mainWords: number                  // 正文词数(中文按字计)
  stats: { total: number; attributed: number }   // 带单位/百分比的数据;attributed=同句或相邻句有来源归属语
  citations: { total: number; authoritative: number }  // 正文区站外链接(排除社媒/分享链接);authoritative=.gov/.edu/.gov.cn/.edu.cn/.int/wikipedia/知名统计与学术源
  quotes: number                     // blockquote / q
  tables: number
  hasReferencesSection: boolean      // 标题匹配 References/Sources/参考资料/参考文献/数据来源
}
```

- **文章判定**(任一):JSON-LD `@type ∈ {Article, BlogPosting, NewsArticle, TechArticle, Report}`;`og:type=article`;`<article>` 内含 `<time datetime>`;URL 路径段匹配 `blog|news|article|articles|post|posts|insights|guides|resources|资讯|新闻|博客`(仅作弱证据:需同时正文 ≥ 300 词/字)。
- **正文范围**:优先 `<article>`,其次 `<main>`,再次 `body` 去掉 `nav/header/footer/aside`。
- **数据识别**:数字 + (`%`、`倍`、`万`、`亿`、货币符号、`USD|EUR|RMB|元`、常见计量单位),排除日期、电话、年份单独出现。**归属语**(中英):according to、source:、data from、survey、study、report、research shows、据…(统计|报告|调查|研究|数据)、来源[:：]、数据显示、研究表明、调查显示、引自。
- **权威来源**:域名后缀 `.gov .edu .int .gov.cn .edu.cn .ac.cn .org.cn` 与白名单(wikipedia.org、who.int、worldbank.org、oecd.org、statista.com、stats.gov.cn、nature.com、sciencedirect.com、ncbi.nlm.nih.gov、arxiv.org),白名单随 RULES_VERSION 版本化。
- 页数 × 信号体积很小(每页 < 300 字节),不影响 S1 的体积预算。

## 4. 社媒链接识别(`lib/crawl/social-links.ts`)

平台主机表:linkedin、facebook、x/twitter、instagram、youtube、tiktok、pinterest、github、weibo、zhihu、xiaohongshu(xhslink)、bilibili、douyin、wechat(mp.weixin.qq.com)。从 S1 图谱的 `external` 里取 `region ∈ {header, footer, nav}` 且主机命中的链接,按平台去重;只认**主页形态**(排除分享链接 `sharer`、`intent/tweet`、`share?url=`)。

## 5. 规则

公共守卫:无 site_audit / 文章页 < 3 → 文章类规则 no-op(样本太小)。所有比例规则 detail 带 `articleCount`、`sampleUrls`。

| 规则 | 命中条件 | 严重度 | claim_type | 说明 |
|---|---|---|---|---|
| AR01 文章缺作者署名 | 文章页中无作者的占比 ≥ 50% | notice | measured_hard(检测结果);描述声明是代理指标 | 替代 C06 的作者项 |
| AR02 文章缺作者页 | 有作者但无作者页链接的占比 ≥ 70% | notice | measured_hard | 作者页是 E-E-A-T 经验证据的常见载体(代理指标) |
| AR03 文章缺发布/更新日期 | 无可见或结构化日期的占比 ≥ 50% | notice | measured_hard | |
| AR04 文章缺数据支撑 | 文章页中"带归属的数据 = 0 且正文引用 = 0"的占比 ≥ 50% | warning | inferred(识别是启发式,图片/图表内数据识别不到) | 用户追加需求的核心 |
| AR05 引用来源权威性不足 | 有引用的文章中,权威来源引用为 0 的占比 ≥ 70% | notice | inferred | |
| TR06 信任页缺失或首页不可达 | 关于/联系/隐私/条款任一类在本 run 未发现已抓 200 页,或已抓但首页不可达 | notice | 闭包完整 → measured_hard;否则 inferred | 替代 C06 的关于/联系项 |
| SO01 站内未链接社媒主页 | 已抓页的页眉/页脚/导航中未发现任何社媒主页链接 | notice | measured_hard(已抓页范围内) | |
| SO02 站内社媒链接与 schema sameAs 不一致 | sameAs 中的社媒主页未在站内链接,或站内社媒主页不在 sameAs | notice | measured_hard | 与 E01 互补 |

C06 / C07 保留(首页口径,历史可比),但当本 run 有 ≥ 3 个文章页时,C06 的作者/日期项与 C07 让位于 AR 规则:在 C06/C07 的 detail 标 `superseded_by`,且不再对作者/日期重复命中(避免同一问题报两次)。

## 6. 版本

`RULES_VERSION` → `rules_v9`(新增 AR01–AR05、TR06、SO01、SO02;C06/C07 让位逻辑)。

## 7. 测试策略

1. `article-signals.test.ts`:文章判定四条路径;作者四种来源;日期;正文范围;数据识别(带归属/孤立数字/日期电话排除,中英);权威引用;中文 GBK 页经 light-check 解码后的识别。
2. `social-links.test.ts`:平台识别、主页形态 vs 分享链接、区域过滤。
3. 规则测试:每条命中/不命中/守卫;C06/C07 让位。
4. 端到端:假站点含 5 篇博客(作者/日期/数据/引用各有缺失组合)+ 页脚社媒图标 + schema sameAs,走真实 light-check → 爬虫 → 规则。
5. 真实站点冒烟:至少一个中文博客站与一个英文博客站,人工抽查 5 篇文章的信号与判定是否一致,记录误判率。

## 8. 风险

- 数据与归属识别是启发式,**图片/图表中的数据识别不到**,AR04 只能标 inferred,描述写"未检测到"。
- 文章判定的 URL 弱证据可能把产品列表页当文章;需同时满足正文长度门槛。
- 社媒主页 vs 分享链接的区分靠 URL 形态,平台改版会漂移,平台表随 RULES_VERSION 保鲜。

## 9. 实现偏离(2026-10-03,已实现,以本节为准)

真实博客冒烟(阮一峰的网络日志、Cloudflare 博客,各 30 页)发现并修正:

- **作者**:补"作者路径链接"(`/author/<名字>/`、`/team/…`、`/people/…`)识别,署名元素没有 author 类名时也能取到(Cloudflare 6/6 篇原被误判缺作者)。
- **日期**:补 hAtom 微格式 `.published[title]` / `.updated[title]`,以及紧跟"日期/发布于/Published on/Posted on/Updated"的可见日期文字(阮一峰 20/20 篇原被误判缺日期)。
- **文章判定**:URL 弱证据另需正文链接密度 < 50%,正文多为链接标题的列表/归档页不算文章(阮一峰 `/blog/weekly` 原被误判)。
- **引用**:与站点同一可注册域名的子域(blog.x.com 之于 developers.x.com)不算外部引用;GitHub 仓库链接按技术引用计入,不按社媒排除。`registrableDomain` 为不引入公共后缀表的近似实现(常见二级后缀取后三段)。
- **TR06**:路径按词元匹配(`/website-terms`、`/legal/privacy-notice`);同一可注册域名主站上的信任页也算(博客子域常链到 www 主站)。
- C06/C07 让位阈值:文章页 ≥ 3。

## 10. 第三轮独立审查后的修订(2026-10-03,已实现,以本节为准)

**文章判定**(8 站审查测得精确率 39% → 修订后按 URL 真值复测 9 站精确率 99%、召回 94%;3 个未参与调参的留出站精确率 100%):
- 证据分三族:声明族(schema / og:article,常由同一模板输出,算一族)、结构族(`<article>` 内**有效**时间,空串与 0001-01-01 不算)、URL 族(博客类路径段**之后还有 slug**,或日期型路径 `/2024/07/slug`)。
- ≥2 族:正文 ≥80;只有声明族:须 schema 与 og 都有且识别到作者,正文 ≥80;只有结构族:须识别到作者,正文 ≥300;只有 URL 族:正文 ≥300。
- 全部证据都要过:首页/标签/分类/分页/作者/归档/搜索/附件路径排除;列表页(去掉评论类 `<article>` 后 ≥3 个且最大的不到总量一半)排除;正文链接密度 <50%。
- 已知局限:没有任何文章标记的极简博客(如 overreacted.io,仅标题下纯文本日期)识别不到 → AR 规则少报而不是错报。
- 正文根取 `<article>`/`<main>` 中文本最多的候选(Ghost 双 `<article>`);body 兜底时剔除页脚类 div;一律剔除评论区。
- 作者:补纯文本署名(「文/张三」「By Jane Doe」);作者路径链接只认本站同域;评论区作者排除。日期:补「时间:」前缀与标题附近无前缀的完整日期(只取日期,不作判定证据)。
- 引用:排除 ICP/公安备案站与各类分享/收藏/发送链接;归属语「据」前不能是「数/证/依/占」,英文按词边界;`.ac` 只认 `ac.国家码`;权威白名单去掉 gartner/mckinsey;托管平台子域(github.io、vercel.app、substack.com…)各自独立。
- 健壮性:URL 安全解码;文章信号抽取器在 `parseLightCheckHtml` 中单独 try,出错只让 `article` 为空。

**规则口径**:AR01–AR03、TR06、SO01、SO02 全部改标 **inferred**(识别均为启发式)。
- TR06:路径词元(含拼音、德/法/西语、连写)或入链锚文本命中即算;只认已抓 200 页与同一家主站链接;只找到错误页的记 `broken`。
- SO01/SO02:只认页眉/页脚/导航区,或无语义标签站点里出现在 ≥3 页且 ≥30% 页面的同一链接;主页形态按平台规则(视频/帖子/仓库子路径/Pin 按钮不算);补微信公众号;页脚有公众号二维码图片线索时 SO01 不报。
- C06/C07 只让出被接管的项:C06 的作者/日期 → AR01/AR03,关于/联系仅在 TR06 能运行时让出;C07 的统计/引用 → AR04/AR05,引述保留。detail 带 `supersededBy`。
