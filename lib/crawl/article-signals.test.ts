import { describe, it, expect } from 'vitest'
import { parseHTML } from 'linkedom'
import { extractArticleSignals, countWords, isAuthoritativeHost, registrableDomain, ARTICLE_MIN_WORDS } from './article-signals'

const H = 'https://blog.example'
const sig = (html: string, path = '/x') => extractArticleSignals(parseHTML(html).document, `${H}${path}`, 'blog.example')
const longText = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

describe('countWords', () => {
  it('中文按字、拉丁按词', () => {
    expect(countWords('数据显示 SEO traffic grew')).toBe(4 + 3)
  })
})

describe('文章判定（spec S4 §3；Review Focus 4）', () => {
  it('JSON-LD BlogPosting（含 @graph 嵌套）：长正文 → 文章；短正文 → 证据在但被门槛拦下', () => {
    const head = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"BlogPosting","headline":"x"}]}</script>'
    // 只有 schema 一条声明证据不够（Ghost 静态页形态）；加上 og:article 与作者才算
    const schemaOnly = sig(`<html><head>${head}</head><body><article><p>${longText(400)}</p></article></body></html>`)
    expect([schemaOnly.isArticle, schemaOnly.articleReasons, schemaOnly.articleGate]).toEqual([false, ['schema'], 'no_evidence'])
    const long = sig(`<html><head>${head}<meta property="og:type" content="article"><meta name="author" content="Jane"></head><body><article><p>${longText(400)}</p></article></body></html>`)
    expect([long.isArticle, long.articleGate]).toEqual([true, 'ok'])
    const short = sig(`<html><head>${head}</head><body><p>短</p></body></html>`)
    expect([short.isArticle, short.articleGate]).toEqual([false, 'no_evidence'])
  })
  it('og:type=article', () => {
    expect(sig(`<html><head><meta property="og:type" content="article"></head><body><article><p>${longText(400)}</p></article></body></html>`).articleReasons).toEqual(['og_article'])
  })
  it('<article> 内含有效 <time datetime>（只有结构族时须识别到作者）', () => {
    const s = sig(`<html><head><meta name="author" content="Jane"></head><body><article><time datetime="2024-03-01">3月1日</time><p>${longText(400)}</p></article></body></html>`)
    expect([s.articleReasons, s.isArticle]).toEqual([['article_tag_with_date'], true])
  })
  it('URL 弱证据需正文 ≥ 300 词/字：长文命中，短列表页不命中', () => {
    expect(ARTICLE_MIN_WORDS).toBe(300)
    expect(sig(`<html><body><main><p>${longText(320)}</p></main></body></html>`, '/blog/my-post').isArticle).toBe(true)
    expect(sig(`<html><body><main><p>${longText(50)}</p></main></body></html>`, '/blog/category/news').isArticle).toBe(false)
  })
  it('普通页面不是文章', () => {
    expect(sig('<html><body><main><p>产品介绍</p></main></body></html>', '/products/x').isArticle).toBe(false)
  })
})

describe('作者与日期', () => {
  it('JSON-LD author（对象，含 url）优先', () => {
    const s = sig(`<html><head><script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"张三","url":"https://blog.example/authors/zhang"},"datePublished":"2024-03-01","dateModified":"2024-05-02"}</script></head><body></body></html>`)
    expect([s.author, s.authorSource, s.authorUrl, s.datePublished, s.dateModified]).toEqual(['张三', 'schema', 'https://blog.example/authors/zhang', '2024-03-01', '2024-05-02'])
  })
  it('meta author / rel=author / byline，清理「By」「作者：」前缀', () => {
    expect(sig('<html><head><meta name="author" content="Jane Doe"></head><body></body></html>')).toMatchObject({ author: 'Jane Doe', authorSource: 'meta' })
    expect(sig('<html><body><a rel="author" href="/about/jane">Jane</a></body></html>')).toMatchObject({ author: 'Jane', authorSource: 'rel_author', authorUrl: 'https://blog.example/about/jane' })
    expect(sig('<html><body><article><span class="post-author">作者：李四</span></article></body></html>')).toMatchObject({ author: '李四', authorSource: 'byline', authorUrl: null })
    expect(sig('<html><body><div class="byline">By <a href="/team/bob">Bob Lee</a></div></body></html>')).toMatchObject({ author: 'Bob Lee', authorSource: 'byline', authorUrl: 'https://blog.example/team/bob' })
  })
  it('日期来自 meta article:published_time 或 time[datetime]', () => {
    expect(sig('<html><head><meta property="article:published_time" content="2023-01-02T00:00:00Z"></head><body></body></html>').datePublished).toBe('2023-01-02T00:00:00Z')
    expect(sig('<html><body><article><time datetime="2022-07-08">x</time></article></body></html>').datePublished).toBe('2022-07-08')
  })
})

describe('数据支撑（spec S4 §3；Review Focus 1/2）', () => {
  it('带单位/百分比/货币的数字计入；年份与日期不计；归属语使同句或相邻句的数据计为 attributed', () => {
    const s = sig(`<html><body><article>
      <p>据艾瑞咨询统计，2023年中国 SEO 市场规模达到 120 亿元，同比增长 15%。</p>
      <p>We launched in 2019. Traffic grew 3x and revenue hit $2 million.</p>
      <p>According to Statista, 64% of marketers invest in SEO.</p>
      <p>发布于 2024-03-01，共 3 个章节。</p>
    </article></body></html>`)
    // 120 亿元、15%、3x、$2 million、64% → 5 个数据；2023年、2019、2024-03-01 不算
    expect(s.stats.total).toBe(5)
    // 第 1 句（据…统计）2 个、第 3 句（According to）1 个
    expect(s.stats.attributed).toBe(3)
  })
  it('正文站外链接计为引用；社媒与分享链接不算；权威域名单独计数', () => {
    const s = sig(`<html><body><article>
      <a href="https://www.stats.gov.cn/data">国家统计局</a>
      <a href="https://en.wikipedia.org/wiki/SEO">Wikipedia</a>
      <a href="https://someblog.com/post">别人的博客</a>
      <a href="https://twitter.com/intent/tweet?url=x">分享</a>
      <a href="https://www.linkedin.com/company/x">LinkedIn</a>
      <a href="/internal">站内</a>
    </article><footer><a href="https://partner.com">页脚外链</a></footer></body></html>`)
    expect(s.citations).toEqual({ total: 3, authoritative: 2 })
  })
  it('引述、表格、参考资料段', () => {
    const s = sig('<html><body><article><blockquote>引用</blockquote><p><q>短引</q></p><table><tr><td>1</td></tr></table><h2>参考资料</h2><ul><li>x</li></ul></article></body></html>')
    expect([s.quotes, s.tables, s.hasReferencesSection]).toEqual([2, 1, true])
  })
})

describe('isAuthoritativeHost', () => {
  it.each(['www.stats.gov.cn', 'nih.gov', 'mit.edu', 'who.int', 'en.wikipedia.org', 'www.statista.com', 'pku.edu.cn', 'cas.ac.cn'])('%s 是权威来源', (h) => {
    expect(isAuthoritativeHost(h)).toBe(true)
  })
  it.each(['someblog.com', 'example.org', 'medium.com'])('%s 不是', (h) => {
    expect(isAuthoritativeHost(h)).toBe(false)
  })
})

// —— 真实博客冒烟发现（阮一峰博客 / Cloudflare 博客，2026-10-03）——
describe('真实博客形态', () => {
  it('hAtom 微格式 abbr.published[title] 与可见「日期：」文字都能取到日期（阮一峰博客形态）', () => {
    const a = sig('<html><body><article class="hentry"><div class="asset-meta"><p class="vcard author">作者： <a class="fn url" href="https://blog.example">阮一峰</a></p><p>日期： <a href="/2026/09/"><abbr class="published" title="2026-09-18T08:03:02+08:00">2026年9月18日</abbr></a></p></div></article></body></html>')
    expect([a.author, a.datePublished]).toEqual(['阮一峰', '2026-09-18T08:03:02+08:00'])
    const b = sig('<html><body><article><p>发布于 2025年3月8日</p><p>正文</p></article></body></html>')
    expect(b.datePublished).toBe('2025年3月8日')
    const c = sig('<html><body><article><div>Published on March 8, 2025</div></article></body></html>')
    expect(c.datePublished).toBe('March 8, 2025')
  })

  it('/author/<名字>/ 形态的作者链接（Cloudflare / WordPress 形态）', () => {
    const s = sig('<html><body><article><p class="m-0 flex"><span><a href="/author/willi/" class="inline-block">Willi Mueller</a></span></p><p>正文</p></article></body></html>')
    expect(s).toMatchObject({ author: 'Willi Mueller', authorSource: 'byline', authorUrl: 'https://blog.example/author/willi/' })
  })

  it('URL 弱证据 + 链接密度 ≥ 50% 的列表页不是文章（阮一峰 /blog/weekly 形态）', () => {
    const list = Array.from({ length: 80 }, (_, i) => `<li><a href="/blog/2026/09/weekly-${i}.html">科技爱好者周刊第 ${i} 期：本期主题是一个很长的标题</a></li>`).join('')
    expect(sig(`<html><body><main><ul>${list}</ul></main></body></html>`, '/blog/weekly').isArticle).toBe(false)
  })

  it('同一可注册域名的子域链接不算外部引用（developers.cloudflare.com 之于 blog.cloudflare.com）', () => {
    const cite = (links: string) => extractArticleSignals(parseHTML(`<html><body><article>${links}</article></body></html>`).document, 'https://blog.cloudflare.com/p', 'blog.cloudflare.com').citations.total
    // developers.cloudflare.com 与站点同属 cloudflare.com → 不算；example.org 算
    expect(cite('<a href="https://developers.cloudflare.com/x">docs</a><a href="https://example.org/x">外站</a>')).toBe(1)
    // GitHub 仓库链接是常见技术引用，不按社媒平台排除
    expect(cite('<a href="https://github.com/acme/repo">gh</a>')).toBe(1)
  })

  it.each([['blog.cloudflare.com', 'cloudflare.com'], ['www.example.com.cn', 'example.com.cn'], ['a.b.example.co.uk', 'example.co.uk'], ['example.com', 'example.com']])('registrableDomain(%s) = %s', (h, d) => {
    expect(registrableDomain(h)).toBe(d)
  })
})

// —— 修复波 3（第三轮独立审查 P0/P1/P3）——
describe('健壮性：畸形 href 不抛错（审查 P0-1）', () => {
  it.each(['/tags/%D6%D0%CE%C4.html', '/sale/50%-off', '/a%'])('%s', (href) => {
    expect(() => sig(`<html><body><article><a href="${href}">x</a><p>正文</p></article></body></html>`)).not.toThrow()
  })
})

describe('文章判定门槛（审查 P0-2：8 站精确率 39%）', () => {
  const body = (n: number) => `<p>${longText(n)}</p>`
  it('<article>+<time> 但正文不足 300 → 不是文章', () => {
    expect(sig('<html><body><article><time datetime="2024-03-01">x</time><p>短</p></article></body></html>', '/about').isArticle).toBe(false)
  })
  it('og:article / Article schema 也要过门槛：首页、分类、标签、分页、作者页一律不是文章', () => {
    const page = `<html><head><meta property="og:type" content="article"><script type="application/ld+json">{"@type":"BlogPosting"}</script></head><body><article>${body(400)}</article></body></html>`
    for (const path of ['/', '/tag/seo', '/category/news', '/page/2', '/author/jane', '/archives', '/search']) expect(sig(page, path).isArticle).toBe(false)
    expect(sig(page, '/2024/03/my-post').isArticle).toBe(true)
  })
  it('页面上有 ≥3 个 <article> 卡片 → 列表页', () => {
    const cards = Array.from({ length: 4 }, (_, i) => `<article><time datetime="2024-0${i + 1}-01">d</time><p>${longText(120)}</p></article>`).join('')
    expect(sig(`<html><body>${cards}</body></html>`, '/blog').isArticle).toBe(false)
  })
  it('无效日期（空串、0001-01-01）不算 <article>+<time> 证据，也不作为发布日期', () => {
    const s = sig(`<html><body><article><time datetime="">x</time><time datetime="0001-01-01T00:00:00Z">y</time><p>${longText(400)}</p></article></body></html>`, '/x')
    expect(s.articleReasons).not.toContain('article_tag_with_date')
    expect(s.datePublished).toBeNull()
  })
})

describe('正文根取文本最多的候选（审查 P0-3：Ghost 双 <article> 形态）', () => {
  it('第一个 <article> 只有标题区时取第二个', () => {
    const s = sig(`<html><body><article><h1>标题</h1><time datetime="2024-01-01">d</time></article><article class="post-content"><p>据统计，用户增长 30%。</p><p>${longText(400)}</p><a href="https://example.org/r">来源</a></article></body></html>`, '/2024/01/x')
    expect(s.mainWords).toBeGreaterThan(400)
    expect(s.stats).toEqual({ total: 1, attributed: 1 })
    expect(s.citations.total).toBe(1)
  })
})

describe('作者与日期补强（审查 P1-6）', () => {
  it('纯文本署名「文/张三」「By Jane Doe」', () => {
    expect(sig('<html><body><article><p>文/张三</p><p>正文</p></article></body></html>').author).toBe('张三')
    expect(sig('<html><body><article><p>By Jane Doe</p><p>Body</p></article></body></html>').author).toBe('Jane Doe')
  })
  it('评论区的作者不是文章作者', () => {
    expect(sig('<html><body><main><p>正文</p><section id="comments"><div class="comment-author"><a href="/author/spam">SpamBot99</a></div></section></main></body></html>').author).toBeNull()
  })
  it('「时间：」前缀的可见日期（jac.com.cn 新闻页形态）', () => {
    expect(sig('<html><body><article><p>时间: 2026-09-30 21:36:30</p><p>正文</p></article></body></html>').datePublished).toBe('2026-09-30')
  })
})

describe('引用与归属语去噪（审查 P1-7/P3）', () => {
  it('无 <article>/<main> 的 div 结构站（jac.com.cn 形态）：页脚备案链接与各类分享链接不算引用', () => {
    const s = sig(`<html><body><div class="content"><p>正文</p>
      <a href="https://www.reddit.com/submit?url=x">r</a><a href="https://news.ycombinator.com/submitlink?u=x">hn</a><a href="https://t.me/share/url?url=x">t</a><a href="https://api.whatsapp.com/send?text=x">w</a><a href="https://getpocket.com/save?url=x">p</a>
      <a href="https://example.org/report">真来源</a></div>
      <div class="foot"><a href="https://beian.miit.gov.cn/">京ICP备</a><a href="https://www.beian.gov.cn/portal">公网安备</a></div></body></html>`)
    expect(s.citations).toEqual({ total: 1, authoritative: 0 })
  })
  it('正文里的备案链接（不在页脚区）同样不算权威引用', () => {
    const s = sig('<html><body><article><p>正文</p><a href="https://beian.miit.gov.cn/">备案查询</a></article></body></html>')
    expect(s.citations.total).toBe(0)
  })
  it('「数据库里的数据量」「I was studying」不是归属语；「根据…统计」「a survey by」是', () => {
    const stats = (t: string) => sig(`<html><body><article><p>${t}</p></article></body></html>`).stats
    expect(stats('我们把数据库里的数据量从 3 亿条压缩到 5000 万条。').attributed).toBe(0)
    expect(stats('I was studying for 3 hours and saved $20.').attributed).toBe(0)
    expect(stats('根据工信部统计，用户增长 12%。').attributed).toBe(1)
    expect(stats('A survey by Gartner found 40% of buyers agree.').attributed).toBe(1)
  })
  it.each(['startup.ac', 'gartner.com', 'mckinsey.com'])('%s 不是权威来源', (h) => expect(isAuthoritativeHost(h)).toBe(false))
  it.each([['alice.github.io', 'alice.github.io'], ['foo.vercel.app', 'foo.vercel.app'], ['bar.blogspot.com', 'bar.blogspot.com'], ['x.substack.com', 'x.substack.com']])('托管平台子域各自独立：%s', (h, d) => {
    expect(registrableDomain(h)).toBe(d)
  })
})

// —— 修复波 3 第二轮：9 个真实站点按 URL 真值测得精确率 60%/召回 61% 后的判定修正 ——
describe('证据族判定（真实站点复测）', () => {
  const schema = '<script type="application/ld+json">{"@type":"Article","author":{"name":"Troy"}}</script>'
  const og = '<meta property="og:type" content="article">'
  it('评论用 <article class="comment-body"> 不算列表卡片（coolshell 形态）', () => {
    const comments = Array.from({ length: 5 }, (_, i) => `<article class="comment-body" id="div-comment-${i}"><p>评论 ${i}</p></article>`).join('')
    const s = sig(`<html><head>${og}</head><body><article class="post-content"><time datetime="2023-05-08">d</time><p>${longText(400)}</p></article>${comments}</body></html>`, '/articles/22422.html')
    expect([s.isArticle, s.articleGate]).toEqual([true, 'ok'])
  })
  it('只有 schema 一条声明证据（Ghost 静态页 /workshops 形态）→ 不是文章', () => {
    expect(sig(`<html><head>${schema}</head><body><article><p>${longText(600)}</p></article></body></html>`, '/workshops').isArticle).toBe(false)
  })
  it('schema + og 但识别不到作者（plausible 落地页形态）→ 不是文章', () => {
    const noAuthor = '<script type="application/ld+json">{"@type":"BlogPosting","datePublished":"2026-10-02"}</script>'
    expect(sig(`<html><head>${noAuthor}${og}</head><body><main><p>${longText(700)}</p></main></body></html>`, '/simple-web-analytics').isArticle).toBe(false)
  })
  it('schema + og + 作者（troyhunt 文章形态）→ 文章', () => {
    expect(sig(`<html><head>${schema}${og}</head><body><article><p>${longText(400)}</p></article></body></html>`, '/heres-how-i-verify').isArticle).toBe(true)
  })
  it('日期型 URL 是 URL 族证据（WordPress /2024/07/slug，zhangxinxu 形态）', () => {
    const s = sig(`<html><body><main><p>${longText(400)}</p></main></body></html>`, '/wordpress/2024/07/html-is-not-simple')
    expect([s.articleReasons, s.isArticle]).toEqual([['url_pattern'], true])
  })
  it('≥2 族证据的短文（ma.tt 短链文、troyhunt 视频周报）≥80 词即算文章；只有 1 族的短文不算', () => {
    const short = `<p>${longText(100)}</p>`
    expect(sig(`<html><head>${schema}${og}</head><body><article><time datetime="2026-09-25">d</time>${short}</article></body></html>`, '/2026/09/schneier').isArticle).toBe(true)
    expect(sig(`<html><body><main>${short}</main></body></html>`, '/blog/tiny').isArticle).toBe(false)
  })
})

describe('证据族判定第二轮（9 站复测精确率 93%/召回 82% 后）', () => {
  it('/blog、/news 栏目首页（博客段后没有文章 slug）不是 URL 证据', () => {
    expect(sig(`<html><body><main><p>${longText(600)}</p></main></body></html>`, '/blog').articleReasons).toEqual([])
    expect(sig(`<html><body><main><p>${longText(600)}</p></main></body></html>`, '/blog/my-post').articleReasons).toEqual(['url_pattern'])
  })
  it('只有结构族证据且识别不到作者（WordPress 独立页 /about、文档页 /docs）→ 不是文章', () => {
    expect(sig(`<html><body><article><time datetime="2024-03-01">d</time><p>${longText(600)}</p></article></body></html>`, '/about-me').isArticle).toBe(false)
    expect(sig(`<html><head><meta name="author" content="Jane"></head><body><article><time datetime="2024-03-01">d</time><p>${longText(600)}</p></article></body></html>`, '/essay').isArticle).toBe(true)
  })
  it('schema + og + 作者的短文（troyhunt 视频周报，135 词）→ 文章', () => {
    const head = '<script type="application/ld+json">{"@type":"Article","author":{"name":"Troy"}}</script><meta property="og:type" content="article">'
    expect(sig(`<html><head>${head}</head><body><article><p>${longText(135)}</p></article></body></html>`, '/weekly-update-522').isArticle).toBe(true)
  })
  it('站外的 /people/<名字>/ 链接（豆瓣主页）不是本站作者', () => {
    expect(sig('<html><body><article><a href="http://book.douban.com/people/haoel/">我的豆瓣</a><p>正文</p></article></body></html>').author).toBeNull()
  })
})

describe('标题附近无前缀的完整日期（overreacted.io 形态）', () => {
  it('作为发布日期提取，但不作为文章判定证据', () => {
    const s = sig(`<html><body><article><h1>A Social Filesystem</h1><p>January 18, 2026</p><p>${longText(400)}</p></article></body></html>`, '/a-social-filesystem')
    expect(s.datePublished).toBe('January 18, 2026')
    expect(s.articleReasons).toEqual([])
  })
  it('正文深处才出现的日期不算标题日期', () => {
    const s = sig(`<html><body><article><h1>T</h1><p>${longText(200)}</p><p>Back on January 18, 2016 we shipped.</p></article></body></html>`, '/x')
    expect(s.datePublished).toBeNull()
  })
})


describe('正文根去导航（2026-10-03 真实站点冒烟：jac.com.cn 手机端导航面板里的子品牌外链被当成引用）', () => {
  it('无 <article>/<main> 时，class/id 词元含 nav/menu 的容器整体剔除', () => {
    const s = sig(`<html><body><div id="mobileNavPanel" class="mobile-nav-panel"><ul class="mobile-main-menu"><li><a href="https://sister-brand.example/">子品牌</a></li></ul></div>
      <div class="content"><p>正文</p><a href="https://example.org/report">真来源</a></div></body></html>`)
    expect(s.citations).toEqual({ total: 1, authoritative: 0 })
  })
  it('包住大半正文的页面级包装容器（with-sidebar / menu-open 等状态类）不剔除', () => {
    const s = sig(`<html><body><div class="page with-sidebar menu-open"><div class="content"><p>${longText(200)}</p><a href="https://example.org/report">真来源</a></div>
      <div class="sidebar"><a href="https://ads.example/">广告</a></div></div></body></html>`)
    expect([s.citations.total, s.mainWords >= 200]).toEqual([1, true])
  })
})
