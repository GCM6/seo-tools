// 生产域名尚未购买/确定 —— 见 docs/superpowers/specs/2026-07-09-veris-marketing-site-seo-plan.md §0（"域名待决"）。
// 上线前把 NEXT_PUBLIC_SITE_URL 环境变量设为真实域名（如 https://veris.xxx），本文件无需改动。
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'

export const SITE_NAME = 'Veris'

export const SITE_TAGLINE = 'Evidence-based SEO & GEO diagnostic workbench'
