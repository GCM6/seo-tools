import type { HealthKey } from './data-source-health'

// 将每个数据源的「去连接」落到真正能完成下一步的页面，而不是笼统地回到设置页。
// GSC 的 OAuth 仍是项目级操作：在项目上下文中优先回到该项目；没有项目上下文时，
// 直接打开 OAuth 客户端凭据页，避免用户先在设置页阅读一轮再手动寻找入口。
const DIRECT_CONNECT_URLS: Partial<Record<HealthKey, string>> = {
  gsc: 'https://console.cloud.google.com/apis/credentials',
  googleCse: 'https://programmablesearchengine.google.com/controlpanel/all',
  dataforseo: 'https://app.dataforseo.com/api-access',
}

export function getDataSourceConnectHref(key: HealthKey, locale: string, projectId?: string): string {
  if (key === 'gsc' && projectId) return `/${locale}/projects/${projectId}`
  return DIRECT_CONNECT_URLS[key] ?? `/${locale}/settings#source-${key}`
}

export function isExternalConnectHref(href: string): boolean {
  return href.startsWith('https://') || href.startsWith('http://')
}
