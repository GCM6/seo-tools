import { getTranslations } from 'next-intl/server'
import { RouteFallback } from '@/components/RouteFallback'

// output 子页路由级 loading 边界（P2-2），复用与 runs/[id] 根边界一致的骨架。
export default async function OutputLoading() {
  const t = await getTranslations('routeFallback')
  return <RouteFallback label={t('loading')} />
}
