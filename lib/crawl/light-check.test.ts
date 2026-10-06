import { describe, it, expect, vi } from 'vitest'
import { parseLightCheckHtml, fetchLightCheck, MAX_INTERNAL_LINK_TARGETS, MAX_EXTERNAL_LINKS } from './light-check'

const html = `<html><head><title> 产品列表 </title>
<link rel="canonical" href="https://example.com/products">
<meta name="robots" content="noindex"></head>
<body><a href="/products/1?utm_source=x">a</a><a href="/products/1">dup</a>
<a href="https://blog.example.com/x">跨子域</a><a href="mailto:a@b.c">mail</a>
<p>hello world</p></body></html>`

describe('parseLightCheckHtml', () => {
  it('提取 title/canonical/metaRobots，内链归一化去重且只留同站', () => {
    const out = parseLightCheckHtml(html, 'https://example.com/products', 'example.com')
    expect(out.title).toBe('产品列表')
    expect(out.canonicalUrl).toBe('https://example.com/products')
    expect(out.metaRobots).toBe('noindex')
    expect(out.internalLinks).toEqual(['https://example.com/products/1'])
    expect(out.mainTextChars).toBeGreaterThan(0)
  })
})

describe('parseLightCheckHtml 链接明细（spec S1 §3）', () => {
  const doc = `<html><body>
    <nav><a href="/a">导航A</a></nav>
    <div class="site-footer"><a href="/a" rel="nofollow">页脚A</a><a href="https://www.linkedin.com/company/x" rel="noopener nofollow">LinkedIn</a></div>
    <main><p><a href="/b"><img src="x.png" alt="产品图"></a> <a href="/c" aria-label="联系我们"></a> <a href="/d" title="标题D"></a> <a href="/e">  多个   空白  </a></p>
      <a href="/f" rel="ugc">u1</a><a href="/f" rel="sponsored">u2</a>
      <a href="https://other.com/p?utm_source=x">外站</a><a href="https://other.com/p">外站重复</a>
    </main>
    <div role="navigation"><a href="/g">G</a></div>
    <a href="/h">裸链</a>
  </body></html>`
  const out = parseLightCheckHtml(doc, 'https://example.com/', 'example.com')
  const byPath = Object.fromEntries(out.linkDetails.map((d) => [d.url.replace('https://example.com', ''), d]))

  it('同目标聚合次数/锚文本/区域；部分出现带 nofollow 不算 nofollow', () => {
    expect(byPath['/a']).toEqual({ url: 'https://example.com/a', count: 2, anchors: ['导航A', '页脚A'], regions: ['nav', 'footer'], nofollow: false })
  })
  it('锚文本回退 img alt → aria-label → title，空白折叠', () => {
    expect(byPath['/b'].anchors).toEqual(['产品图'])
    expect(byPath['/c'].anchors).toEqual(['联系我们'])
    expect(byPath['/d'].anchors).toEqual(['标题D'])
    expect(byPath['/e'].anchors).toEqual(['多个 空白'])
  })
  it('每次出现都带 ugc/sponsored → nofollow=true', () => {
    expect(byPath['/f'].nofollow).toBe(true)
  })
  it('区域：role=navigation→nav，main 内→main，无区域祖先→body', () => {
    expect(byPath['/g'].regions).toEqual(['nav'])
    expect(byPath['/b'].regions).toEqual(['main'])
    expect(byPath['/h'].regions).toEqual(['body'])
  })
  it('internalLinks 与 linkDetails 目标一致', () => {
    expect(out.internalLinks).toEqual(out.linkDetails.map((d) => d.url))
  })
  it('站外链接归一化去重，记 host/锚文本/区域/rel', () => {
    expect(out.externalLinks).toEqual([
      { url: 'https://linkedin.com/company/x', host: 'linkedin.com', anchor: 'LinkedIn', region: 'footer', rel: ['nofollow'], href: 'https://www.linkedin.com/company/x' },
      { url: 'https://other.com/p', host: 'other.com', anchor: '外站', region: 'main', rel: [], href: 'https://other.com/p?utm_source=x' },
    ])
    expect(out.extra.linkDetailsTruncated).toBe(false)
  })
  it('<base href> 存在时相对链接按 base 解析（Review Focus 2）', () => {
    const o = parseLightCheckHtml('<html><head><base href="https://example.com/docs/"></head><body><a href="intro">i</a></body></html>', 'https://example.com/', 'example.com')
    expect(o.internalLinks).toEqual(['https://example.com/docs/intro'])
  })
  it('站内目标超上限记 linkDetailsTruncated', () => {
    const many = Array.from({ length: MAX_INTERNAL_LINK_TARGETS + 5 }, (_, i) => `<a href="/p${i}">p</a>`).join('')
    const o = parseLightCheckHtml(`<html><body>${many}</body></html>`, 'https://example.com/', 'example.com')
    expect(o.linkDetails).toHaveLength(MAX_INTERNAL_LINK_TARGETS)
    expect(o.extra.linkDetailsTruncated).toBe(true)
  })
})

describe('fetchLightCheck', () => {
  it('200 HTML 页返回完整轻检结果', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 200, url, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => html, arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    })) as never
    const out = await fetchLightCheck('https://example.com/products', 'example.com', fetchImpl)
    expect(out.checkStatus).toBe('checked')
    expect(out.httpStatus).toBe(200)
    expect(out.contentHash).toHaveLength(64)
  })

  it('相对链接按原始最终 URL 解析（保留目录末尾斜杠），自链接仍被排除', async () => {
    const page = '<html><body><a href="intro">i</a><a href="./">self</a></body></html>'
    const fetchImpl = vi.fn(async () => ({
      status: 200, url: 'https://example.com/docs/', headers: new Headers({ 'content-type': 'text/html' }), text: async () => page, arrayBuffer: async () => new TextEncoder().encode(page).buffer,
    })) as never
    const out = await fetchLightCheck('https://example.com/docs', 'example.com', fetchImpl)
    expect(out.internalLinks).toEqual(['https://example.com/docs/intro'])
  })

  it('404 与非 HTML 不解析正文，仍记状态', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 404, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => 'nf', arrayBuffer: async () => new TextEncoder().encode('nf').buffer,
    })) as never
    const out = await fetchLightCheck('https://example.com/gone', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'checked', httpStatus: 404, internalLinks: [], linkDetails: [], externalLinks: [] })
  })

  it('fetch 抛错收敛为 error，不向外抛', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('timeout') }) as never
    const out = await fetchLightCheck('https://example.com/x', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'error', errorReason: 'timeout', httpStatus: 0 })
  })
})

// —— S1 修复波（独立审查 P1/P8 + 真实站点冒烟）——
const resp = (body: string | Uint8Array, o: { status?: number; url?: string; ct?: string | null } = {}) => {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const headers = new Headers()
  if (o.ct !== null) headers.set('content-type', o.ct ?? 'text/html')
  return vi.fn(async (url: string) => ({
    status: o.status ?? 200, url: o.url ?? url, headers,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => new TextDecoder().decode(bytes),
  })) as never
}

describe('链接抽取：<area href> 图片热区导航（真实站点 paulgraham.com 冒烟发现）', () => {
  it('area 与 a 同等抽取，锚文本取 alt', () => {
    const out = parseLightCheckHtml('<html><body><map name="m"><area shape="rect" href="/articles.html" alt="Essays"><area href="https://ext.com/x" alt="Ext"></map></body></html>', 'https://example.com/', 'example.com')
    expect(out.linkDetails).toEqual([{ url: 'https://example.com/articles.html', count: 1, anchors: ['Essays'], regions: ['body'], nofollow: false }])
    expect(out.externalLinks.map((x) => x.url)).toEqual(['https://ext.com/x'])
  })
})

describe('区域判定：作用域规则（审查 P8 + metadocu.com 真实结构）', () => {
  const region = (html: string) => parseLightCheckHtml(`<html><body>${html}</body></html>`, 'https://example.com/', 'example.com').linkDetails[0].regions
  it('文章内 header（entry-header）里的链接属于正文', () => {
    expect(region('<main><article><header class="entry-header"><a href="/post-1">P</a></header></article></main>')).toEqual(['main'])
  })
  it('页脚里的 nav / ul.menu → footer；<main> 包整页时页脚仍是页脚', () => {
    expect(region('<footer><nav><a href="/privacy">P</a></nav></footer>')).toEqual(['footer'])
    expect(region('<footer><ul class="menu"><li><a href="/x">X</a></li></ul></footer>')).toEqual(['footer'])
    expect(region('<main class="shell"><footer><nav><a href="/privacy">P</a></nav></footer></main>')).toEqual(['footer'])
  })
  it('页眉里的主导航仍是 nav；section 内的 footer 不是全站页脚', () => {
    expect(region('<main><header><nav><a href="/blog">B</a></nav></header></main>')).toEqual(['nav'])
    expect(region('<main><section><footer><a href="/more">M</a></footer></section></main>')).toEqual(['main'])
  })
})

describe('字符集解码与内容类型（真实站点冒烟 + 审查 P1/D）', () => {
  it('meta charset=gbk 的中文页正确解码标题与锚文本', async () => {
    const gbk = Uint8Array.from([
      ...new TextEncoder().encode('<html><head><meta charset="gbk"><title>'),
      0xb2, 0xfa, 0xc6, 0xb7, // 产品
      ...new TextEncoder().encode('</title></head><body><a href="/c">'),
      0xc1, 0xaa, 0xcf, 0xb5, // 联系
      ...new TextEncoder().encode('</a></body></html>'),
    ])
    const out = await fetchLightCheck('https://example.com/', 'example.com', resp(gbk, { ct: 'text/html' }))
    expect(out.title).toBe('产品')
    expect(out.linkDetails[0].anchors).toEqual(['联系'])
  })
  it('响应头 charset 优先于 meta', async () => {
    const out = await fetchLightCheck('https://example.com/', 'example.com', resp(Uint8Array.from([...new TextEncoder().encode('<html><head><meta charset="gbk"><title>'), 0xe9, ...new TextEncoder().encode('</title></head></html>')]), { ct: 'text/html; charset=windows-1252' }))
    expect(out.title).toBe('é')
  })
  it('未声明字符集且不是合法 UTF-8 → 按 windows-1252 解码', async () => {
    const out = await fetchLightCheck('https://example.com/', 'example.com', resp(Uint8Array.from([...new TextEncoder().encode('<html><head><title>'), 0x93, 0x51, 0x94, ...new TextEncoder().encode('</title></head></html>')])))
    expect(out.title).toBe('\u201cQ\u201d')
  })
  it('application/xhtml+xml 按 HTML 解析；缺 content-type 但内容是 HTML 也解析', async () => {
    const page = '<!DOCTYPE html><html><body><a href="/x">x</a></body></html>'
    const xhtml = await fetchLightCheck('https://example.com/', 'example.com', resp(page, { ct: 'application/xhtml+xml' }))
    const sniffed = await fetchLightCheck('https://example.com/', 'example.com', resp(page, { ct: null }))
    expect([xhtml.internalLinks, xhtml.extra.contentKind]).toEqual([['https://example.com/x'], 'html'])
    expect([sniffed.internalLinks, sniffed.extra.contentKind]).toEqual([['https://example.com/x'], 'html'])
  })
  it('图片记 media、JSON 记 resource，都不解析链接', async () => {
    const img = await fetchLightCheck('https://example.com/a.jpg', 'example.com', resp('xx', { ct: 'image/jpeg' }))
    const json = await fetchLightCheck('https://example.com/a.json', 'example.com', resp('{}', { ct: 'application/json' }))
    expect([img.extra.contentKind, img.internalLinks]).toEqual(['media', []])
    expect(json.extra.contentKind).toBe('resource')
  })
})

// —— 修复波 2（第二轮独立审查 #2/#6/#13/#14/#18）——
describe('内容类型细分（审查 #2/#13）', () => {
  it('PDF/Office 为 document（出链未知）；feed/CSS/JSON/纯文本为 resource（不属于 HTML 链接图）', async () => {
    const kinds: Record<string, string> = {}
    for (const ct of ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/rss+xml', 'application/atom+xml', 'text/css', 'application/json', 'text/plain', 'image/png', 'application/zip', 'application/x-foo']) {
      kinds[ct] = (await fetchLightCheck('https://example.com/x', 'example.com', resp('x', { ct }))).extra.contentKind!
    }
    expect(kinds).toEqual({
      'application/pdf': 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document', 'application/msword': 'document',
      'application/rss+xml': 'resource', 'application/atom+xml': 'resource', 'text/css': 'resource', 'application/json': 'resource', 'text/plain': 'resource',
      'image/png': 'media', 'application/zip': 'media', 'application/x-foo': 'other',
    })
  })
})

describe('原始 href 保留（审查 #6：抓取应请求页面上的原始地址，归一化只作去重键）', () => {
  it('站内/站外链接明细带首次出现的原始 href（与归一化键不同时）', () => {
    const out = parseLightCheckHtml('<html><body><a href="/docs/">d</a><a href="https://www.other.com/docs/?ref=abc">o</a><a href="/plain">p</a></body></html>', 'https://example.com/', 'example.com')
    expect(out.linkDetails.find((d) => d.url === 'https://example.com/docs')?.href).toBe('https://example.com/docs/')
    expect(out.linkDetails.find((d) => d.url === 'https://example.com/plain')?.href).toBeUndefined()
    expect(out.externalLinks[0]).toMatchObject({ url: 'https://other.com/docs', href: 'https://www.other.com/docs/?ref=abc' })
  })
  it('请求原始 URL 时 redirected 按归一化后比较，不因末尾斜杠误判跳转', async () => {
    const out = await fetchLightCheck('https://example.com/docs/', 'example.com', resp('<html><body></body></html>'))
    expect(out.extra.redirected).toBe(false)
    expect(out.finalUrl).toBe('https://example.com/docs')
  })
})

describe('截断标志站内/站外分开（审查 #13）', () => {
  it('站外链接超上限只标 externalLinksTruncated，不影响站内完整性', () => {
    const many = Array.from({ length: MAX_EXTERNAL_LINKS + 3 }, (_, i) => `<a href="https://s${i}.com/">s</a>`).join('')
    const o = parseLightCheckHtml(`<html><body><a href="/a">a</a>${many}</body></html>`, 'https://example.com/', 'example.com')
    expect([o.extra.linkDetailsTruncated, o.extra.externalLinksTruncated]).toEqual([false, true])
  })
})

describe('字符集与嗅探边界（审查 #14/#18）', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  it('UTF-8 BOM 优先于响应头 charset', async () => {
    const out = await fetchLightCheck('https://example.com/', 'example.com', resp(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('<html><head><title>中文</title></head></html>')]), { ct: 'text/html; charset=iso-8859-1' }))
    expect(out.title).toBe('中文')
  })
  it('meta charset 位于 2KB 之后（大段内联脚本）仍能识别 GBK', async () => {
    const filler = `<script>${'x'.repeat(3000)}</script>`
    const bytes = Uint8Array.from([...enc(`<html><head>${filler}<meta charset="gbk"><title>`), 0xd6, 0xd0, 0xce, 0xc4, ...enc('</title></head></html>')])
    expect((await fetchLightCheck('https://example.com/', 'example.com', resp(bytes))).title).toBe('中文')
  })
  it('UTF-16LE BOM 页面可解码', async () => {
    const body = '<html><head><title>中文</title></head></html>'
    const u16 = new Uint8Array(2 + body.length * 2)
    u16[0] = 0xff; u16[1] = 0xfe
    for (let i = 0; i < body.length; i++) { const c = body.charCodeAt(i); u16[2 + i * 2] = c & 0xff; u16[3 + i * 2] = c >> 8 }
    expect((await fetchLightCheck('https://example.com/', 'example.com', resp(u16))).title).toBe('中文')
  })
  it('缺 Content-Type、以 <?xml 声明或注释开头的 HTML 也能嗅探为 html', async () => {
    const out = await fetchLightCheck('https://example.com/', 'example.com', resp('<?xml version="1.0"?>\n<!-- c -->\n<html><body><a href="/x">x</a></body></html>', { ct: null }))
    expect(out.extra.contentKind).toBe('html')
  })
})

describe('文章信号接入（spec S4 Task 2；Review Focus 1）', () => {
  it('GBK 编码的中文博客页：解码后识别文章、作者、日期与带归属的数据', async () => {
    // 用 TextDecoder 的逆过程不可行（无 GBK 编码器），这里手工给出 GBK 字节：作者：李四 / 据统计增长15%
    const enc = (t: string) => new TextEncoder().encode(t)
    const gbk = Uint8Array.from([
      ...enc('<html><head><meta charset="gbk"><meta property="og:type" content="article"></head><body><article><time datetime="2024-03-01">x</time><span class="post-author">'),
      0xd7, 0xf7, 0xd5, 0xdf, 0xa3, 0xba, 0xc0, 0xee, 0xcb, 0xc4, // 作者：李四
      ...enc('</span><p>'),
      0xbe, 0xdd, 0xcd, 0xb3, 0xbc, 0xc6, // 据统计
      ...enc(' 15%</p></article></body></html>'),
    ])
    const out = await fetchLightCheck('https://example.com/blog/post', 'example.com', resp(gbk))
    // 正文很短：信号照常抽取，但被文章长度门槛拦下（第三轮独立审查 P0-2）
    expect(out.extra.article).toMatchObject({ isArticle: false, articleGate: 'too_short', author: '李四', authorSource: 'byline', datePublished: '2024-03-01', stats: { total: 1, attributed: 1 } })
  })
  it('非 HTML / 错误页没有文章信号', async () => {
    const img = await fetchLightCheck('https://example.com/a.jpg', 'example.com', resp('x', { ct: 'image/jpeg' }))
    expect(img.extra.article).toBeUndefined()
  })
})

describe('页脚社媒二维码线索（第三轮独立审查 P1-4：中文站常只放公众号二维码图片）', () => {
  it('页眉/页脚里 alt/src 含微信、二维码字样的图片 → socialQrHint', () => {
    const yes = parseLightCheckHtml('<html><body><footer><img src="/img/wechat-qrcode.png" alt="关注公众号"></footer></body></html>', 'https://example.com/', 'example.com')
    const no = parseLightCheckHtml('<html><body><main><img src="/img/product.png" alt="产品图"></main></body></html>', 'https://example.com/', 'example.com')
    expect([yes.extra.socialQrHint, no.extra.socialQrHint]).toEqual([true, false])
  })
})


describe('真实站点冒烟修复（2026-10-03）', () => {
  it('抓取失败时 finalUrl 也归一化：请求原始 href（带 www/末尾斜杠）出错不得伪装成一次跳转（jac.com.cn）', async () => {
    const failing = vi.fn(async () => {
      throw new Error('too many redirects (redirect loop) fetching https://www.example.com/a/')
    })
    const out = await fetchLightCheck('https://www.example.com/a/', 'example.com', failing as never)
    expect([out.checkStatus, out.finalUrl]).toEqual(['error', 'https://example.com/a'])
  })

  it('Cloudflare 邮箱混淆链接（/cdn-cgi/l/email-protection）记为邮箱联系方式，不进站内链接；其他 /cdn-cgi/ 路径也不进', () => {
    const out = parseLightCheckHtml(
      `<html><body><footer><a href="/cdn-cgi/l/email-protection#a1b2">[email&#160;protected]</a><a href="tel:+86-400-000">电话</a></footer>
       <main><a href="mailto:hi@example.com">写信</a><a href="/cdn-cgi/trace">t</a><a href="/real">正文链接</a></main></body></html>`,
      'https://example.com/',
      'example.com',
    )
    expect(out.internalLinks).toEqual(['https://example.com/real'])
    expect(out.extra.contactLinks).toEqual([
      { kind: 'email', region: 'footer' },
      { kind: 'phone', region: 'footer' },
      { kind: 'email', region: 'main' },
    ])
  })
})

describe('内容图片 alt 口径（2026-10-03：metadocu 每页一个装饰 logo 被报「alt 缺失 100%」）', () => {
  it('页眉/页脚/导航里的模板图、role=presentation、aria-hidden、≤48px 小图不算内容图片；旧字段口径不变', () => {
    const out = parseLightCheckHtml(
      `<html><body><header><img src="/logo.svg" alt="" width="26" height="26"></header>
       <main><img src="/shot.png" alt=""><img src="/chart.png" alt="增长图"><img src="/sep.png" role="presentation">
         <img src="/i.svg" aria-hidden="true"><img src="/px.gif" width="1" height="1"><img src="/big.png" width="800" height="48"></main>
       <footer><img src="/qr.png"></footer></body></html>`,
      'https://example.com/',
      'example.com',
    )
    expect([out.extra.imgCount, out.extra.imgAltMissing]).toEqual([8, 7])
    expect([out.extra.contentImgCount, out.extra.contentImgAltMissing]).toEqual([3, 2])
  })
})

describe('混合内容计数（SP-A §5.2 #3）：只算会加载资源的元素', () => {
  const mixed = (body: string, head = '') =>
    parseLightCheckHtml(`<html><head>${head}</head><body>${body}</body></html>`, 'https://example.com/', 'example.com').extra.mixedContentCount
  it('canonical / alternate / a[href] 不加载资源，不计', () => {
    expect(mixed('', '<link rel="canonical" href="http://example.com/">')).toBe(0)
    expect(mixed('', '<link rel="alternate" hreflang="en" href="http://example.com/en/">')).toBe(0)
    expect(mixed('<a href="http://other.com/">x</a>')).toBe(0)
  })
  it('stylesheet / preload / icon 的 href、iframe / video / source 的 src、object 的 data 计入', () => {
    expect(mixed('', '<link rel="stylesheet" href="http://cdn.example.com/a.css">')).toBe(1)
    expect(mixed('', '<link rel="preload" as="font" href="http://cdn.example.com/f.woff2"><link rel="icon" href="http://example.com/f.ico">')).toBe(2)
    expect(mixed('<iframe src="http://video.example.com/embed"></iframe>')).toBe(1)
    expect(mixed('<video src="http://m.example.com/v.mp4"><source src="http://m.example.com/v.webm"></video>')).toBe(2)
    expect(mixed('<object data="http://example.com/a.swf"></object>')).toBe(1)
  })
  it('srcset 按逗号拆分逐项判断', () => {
    expect(mixed('<img src="https://a.com/x.jpg" srcset="http://a.jpg 1x, https://b.jpg 2x">')).toBe(1)
    expect(mixed('<picture><source srcset="http://a.webp 1x, http://b.webp 2x"><img src="https://a.com/x.jpg"></picture>')).toBe(2)
  })
})

describe('textHash：去掉脚本样式后的可见正文哈希（SP-A §5.2 #5，供 C10 判断正文重复）', () => {
  const hashOf = (html: string) => parseLightCheckHtml(html, 'https://example.com/a', 'example.com').extra.textHash
  const body = '<main><h1>Remove PDF metadata</h1><p>Strip author, dates and GPS data from your documents.</p></main>'
  it('正文相同、仅 script nonce 与 title 不同 → 哈希相同', () => {
    const a = hashOf(`<html><head><title>A</title><script nonce="abc">window.x=1</script></head><body>${body}</body></html>`)
    const b = hashOf(`<html><head><title>B</title><script nonce="xyz">window.x=2</script></head><body>${body}<style>.a{}</style></body></html>`)
    expect(a).toBeTruthy()
    expect(a).toBe(b)
  })
  it('正文不同 → 哈希不同', () => {
    expect(hashOf(`<html><body>${body}</body></html>`)).not.toBe(hashOf('<html><body><p>Completely different text.</p></body></html>'))
  })
  it('没有可见文本 → null', () => {
    expect(hashOf('<html><body><script>x()</script><svg><text>logo</text></svg></body></html>')).toBeNull()
  })
})
