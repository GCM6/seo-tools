import type { LinkGraphExternal } from './link-graph'
import type { LinkRegion } from './light-check'

// 社媒主页识别（spec 2026-09-29-s4 §4 / §9）：只认主页形态。第三轮独立审查 P1-4 后按平台给出主页路径规则：
// 视频/帖子/动态/仓库子路径/Pin 按钮等内容页与分享链接都不算主页；补微信公众号（mp.weixin.qq.com）。
// 平台表随 RULES_VERSION 保鲜。

export type SocialPlatform =
  | 'linkedin' | 'facebook' | 'x' | 'instagram' | 'youtube' | 'tiktok' | 'pinterest' | 'github'
  | 'weibo' | 'zhihu' | 'xiaohongshu' | 'bilibili' | 'douyin' | 'wechat'

// [平台, 主机, 主页路径规则]。路径规则作用于 pathname（不含查询串）。
const SINGLE = /^\/[^/]+\/?$/
const PLATFORMS: [SocialPlatform, string[], RegExp][] = [
  ['linkedin', ['linkedin.com'], /^\/(company|in|school|showcase)\/[^/]+\/?$/i],
  ['facebook', ['facebook.com', 'fb.com'], SINGLE],
  ['x', ['x.com', 'twitter.com'], /^\/[A-Za-z0-9_]{1,15}\/?$/],
  ['instagram', ['instagram.com'], /^\/[A-Za-z0-9_.]+\/?$/],
  ['youtube', ['youtube.com'], /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/i],
  ['tiktok', ['tiktok.com'], /^\/@[^/]+\/?$/],
  ['pinterest', ['pinterest.com'], SINGLE],
  ['github', ['github.com'], SINGLE], // 只认组织/用户主页，仓库（两段以上）是技术引用
  ['weibo', ['weibo.com', 'weibo.cn'], /^\/(u\/)?[^/]+\/?$/],
  ['zhihu', ['zhihu.com'], /^\/(people|org)\/[^/]+\/?$/i],
  ['xiaohongshu', ['xiaohongshu.com'], /^\/user\/profile\/[^/]+\/?$/i],
  ['bilibili', ['space.bilibili.com'], /^\/\d+\/?$/],
  ['douyin', ['douyin.com'], /^\/user\/[^/]+\/?$/i],
  // 公众号没有稳定的公开主页 URL，站点常链到 profile 或任一推文：只要在模板区出现即视为官方账号入口
  ['wechat', ['mp.weixin.qq.com'], /^\/.*/],
]

// 单段路径里属于功能/内容而非账号名的保留字
const RESERVED_SINGLE = new Set([
  'sharer.php', 'share', 'sharer', 'dialog', 'watch', 'events', 'groups', 'hashtag', 'search', 'home', 'explore', 'intent', 'i',
  'login', 'signup', 'pin', 'p', 'reel', 'reels', 'stories', 'features', 'about', 'pricing', 'settings', 'marketplace', 'policies',
])

export const SOCIAL_HOSTS = PLATFORMS.flatMap(([, hosts]) => hosts)

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')
  } catch {
    return ''
  }
}

export function isSocialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^(www|m|mobile)\./, '')
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`)) || h === 'bilibili.com' || h.endsWith('.bilibili.com')
}

// 分享 / 收藏 / 发送类链接：不是主页，也不是内容来源（第三轮审查 P1-7：reddit、HN、telegram、whatsapp、pocket…）。
const SHARE_PATTERN =
  /sharer|\/share(?:\/|\?|$)|share\?|intent\/(tweet|post)|sharearticle|\/dialog\/|addthis|sharethis|shareurl|\/plugins\/|\/submit\?|submitlink|\/send\?text=|\/\/wa\.me\/|getpocket\.com\/(save|edit)|\/save\?url=|line\.me\/r\/msg|\/\/t\.me\/share|telegram\.me\/share|pinterest\.com\/pin\/create|service\.weibo\.com\/share|connect\.qq\.com|sns\.qzone\.qq\.com|mailto:/i
export function isShareUrl(url: string): boolean {
  return SHARE_PATTERN.test(url)
}

export function socialPlatformOf(url: string): SocialPlatform | null {
  if (isShareUrl(url)) return null
  const host = hostOf(url)
  const entry = PLATFORMS.find(([, hosts]) => hosts.some((h) => host === h || host.endsWith(`.${h}`)))
  if (!entry) return null
  let path = ''
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const [platform, , profile] = entry
  if (!profile.test(path)) return null
  if (profile === SINGLE || platform === 'x' || platform === 'instagram') {
    const seg = path.split('/').filter(Boolean)[0]?.toLowerCase() ?? ''
    if (!seg || RESERVED_SINGLE.has(seg)) return null
  }
  return platform
}

export interface SocialProfile {
  platform: SocialPlatform
  url: string
  pages: number // 链接到它的不同源页数
  regions: LinkRegion[]
}

const TEMPLATE_REGIONS = new Set<LinkRegion>(['header', 'footer', 'nav'])
const SITEWIDE_MIN_PAGES = 3
const SITEWIDE_MIN_SHARE = 0.3

// 从链接图站外链接中识别官方社媒主页（spec S4 §4）：只认模板区（页眉/页脚/导航），或无语义标签的站点里
// 出现在 ≥3 页且 ≥30% 已抓页面的同一链接（全站模板）。正文里引用的第三方视频/仓库不算（第三轮审查 P1-4）。
export function detectSocialProfiles(
  external: Pick<LinkGraphExternal, 'from' | 'url' | 'region'>[],
  opts: { fetchedPages?: number } = {},
): SocialProfile[] {
  const acc = new Map<string, { platform: SocialPlatform; from: Set<string>; regions: Set<LinkRegion> }>()
  for (const x of external) {
    const platform = socialPlatformOf(x.url)
    if (!platform) continue
    let a = acc.get(x.url)
    if (!a) acc.set(x.url, (a = { platform, from: new Set(), regions: new Set() }))
    a.from.add(x.from)
    a.regions.add(x.region)
  }
  const fetched = opts.fetchedPages ?? 0
  return [...acc]
    .filter(([, a]) => [...a.regions].some((r) => TEMPLATE_REGIONS.has(r)) || (a.from.size >= SITEWIDE_MIN_PAGES && fetched > 0 && a.from.size / fetched >= SITEWIDE_MIN_SHARE))
    .map(([url, a]) => ({ platform: a.platform, url, pages: a.from.size, regions: [...a.regions] }))
    .sort((a, b) => b.pages - a.pages || a.url.localeCompare(b.url))
}
