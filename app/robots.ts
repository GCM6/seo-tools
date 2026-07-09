import type { MetadataRoute } from 'next'

// Veris 是内部诊断工具，全站禁止爬虫抓取；唯一对外面是 /share/[token] 只读分享页。
//
// 反直觉点，别顺手把 /share 也 disallow 掉：robots.txt 的 disallow 只挡「抓取」，
// 不挡「索引」——被 disallow 的 URL 谷歌抓不到页面内容，也就读不到页面自带的
// `<meta name="robots" content="noindex">`，反而可能以「仅 URL」的形式滞留在搜索结果里
// （标题为空/描述为空的裸链接），比不设 robots.txt 更糟。
// 所以这里必须 allow /share，让爬虫能抓到分享页并读取其自身的 noindex meta
// （app/share/[token]/page.tsx 已设 `metadata.robots = { index: false, follow: false }`），
// 靠页面自己的 noindex 退场，而不是靠 robots.txt 一刀切挡下。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/share',
      disallow: '/',
    },
  }
}
