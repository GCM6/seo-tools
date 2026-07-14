import type { HTMLAttributes } from 'react'

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

  return (
    <div
      className={`skeleton ${className}`}
      style={style}
      {...props}
    />
  )
}
