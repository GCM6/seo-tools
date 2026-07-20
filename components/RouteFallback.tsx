import { Skeleton } from './Skeleton'

// 路由级 loading 边界（Next 16 App Router loading.tsx）共用的骨架屏（P2-2）。
// 纯展示、无 hook：不在这里调用 useTranslations，由各 loading.tsx（Server Component，
// 可 await getTranslations）解析好文案后当 label 传入，保持本组件 i18n-free、
// 可在任意 Server Component 边界直接渲染（参考 components/ProvenanceTag.tsx 的约定）。
// 视觉沿用 StatStrip 里 pending 卡已验证过的 Skeleton 用法：card + 分行 Skeleton 条。
export function RouteFallback({ label }: { label?: string }) {
  return (
    <div className="screen show" data-screen="loading">
      {/* 屏幕阅读器播报加载态；骨架图形本身对可视用户已经足够表意，不重复用可见文案打断布局 */}
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      <div className="card" style={{ padding: '16px' }}>
        <div className="flex flex-col gap-3">
          <Skeleton width="40%" height={20} />
          <Skeleton width="70%" height={14} />
        </div>
      </div>
      <div className="stats" style={{ marginTop: '16px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card stat">
            <div className="flex flex-col gap-2">
              <Skeleton width="50%" height={14} />
              <Skeleton width="70%" height={24} />
              <Skeleton width="40%" height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
