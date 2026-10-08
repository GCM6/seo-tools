import type { HTMLAttributes } from 'react'

// 骨架块：只用于路由正在加载（loading.tsx），不用于「没有数据」（design-system §3.6）。
// 静态浅底，无扫光动画。
export function Skeleton({
  className = '',
  width,
  height,
  circle = false,
  ...props
}: {
  className?: string
  width?: string | number
  height?: string | number
  circle?: boolean
} & HTMLAttributes<HTMLDivElement>) {
  const style = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    borderRadius: circle ? '50%' : undefined,
  }

  return <div className={`ui-skel ${className}`.trim()} style={style} aria-hidden="true" {...props} />
}
