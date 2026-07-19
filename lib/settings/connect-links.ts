import type { HealthKey } from './data-source-health'

// 将每个数据源的「去连接」落到真正能完成下一步的页面，而不是笼统地回到设置页。
// GSC 是项目级授权，必须回到对应项目；没有项目上下文时只能先去项目列表选择站点。
const DIRECT_CONNECT_URLS: Partial<Record<HealthKey, string>> = {
  googleCse: 'https://programmablesearchengine.google.com/controlpanel/all',
  dataforseo: 'https://app.dataforseo.com/api-access',
}

export function getDataSourceConnectHref(key: HealthKey, locale: string, projectId?: string): string {
  if (key === 'gsc') {
    return projectId
      ? `/${locale}/projects/${encodeURIComponent(projectId)}#gsc`
      : `/${locale}/projects`
  }
  return DIRECT_CONNECT_URLS[key] ?? `/${locale}/settings#source-${key}`
}

export function isExternalConnectHref(href: string): boolean {
  return href.startsWith('https://') || href.startsWith('http://')
}
