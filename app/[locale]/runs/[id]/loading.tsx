import { getTranslations } from 'next-intl/server'
import { RouteFallback } from '@/components/RouteFallback'

// Run 总览页的路由级 loading 边界（P2-2）：page.tsx 并行 await 一批 repository 查询
// （getRun/getFindings/getRunEvidence/...），数据就绪前 Next 用本文件替代整段渲染，
// 避免用户在采集完成、诊断数据尚未取回时看到空白页。
export default async function RunLoading() {
  const t = await getTranslations('routeFallback')
  return <RouteFallback label={t('loading')} />
}
