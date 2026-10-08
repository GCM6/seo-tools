import { Skeleton } from './Skeleton'

// 诊断工作区的路由级加载骨架（ux-blueprint §0「路由加载」）：版式与目标页一致——
// 面包屑、标题、事实栏、进度、视图标签，再加正文的几块。静态浅底，无扫光。
// 纯展示、无 hook：文案由各 loading.tsx 解析好后当 label 传入（只给屏幕阅读器播报）。
export function RouteFallback({ label }: { label?: string }) {
  return (
    <div className="ui-ws" data-screen="loading">
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      <div className="ui-ws-head" aria-hidden="true">
        <Skeleton width="16rem" height={12} />
        <Skeleton width="14rem" height={28} />
        <div className="ui-skel-row">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width="8rem" height={44} />
          ))}
        </div>
        <Skeleton width="28rem" height={14} />
        <div className="ui-skel-row">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="4.5rem" height={16} />
          ))}
        </div>
      </div>
      <div className="ui-ws-body" aria-hidden="true">
        <div className="ui-panel ui-skel-panel">
          <Skeleton width="30%" height={18} />
          <Skeleton width="85%" height={14} />
          <Skeleton width="70%" height={14} />
          <Skeleton width="60%" height={14} />
        </div>
        <div className="ui-panel ui-skel-panel">
          <Skeleton width="24%" height={18} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="75%" height={14} />
        </div>
      </div>
    </div>
  )
}
