'use client'

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// 数字滚动：value 变化时 rAF 从旧值补间；补间中显示 animated，否则直接显 value。
// reduced-motion 或无 rAF 时 effect 不触发动画，render 直接落终值（不在 effect 内同步 setState）。
export function CountUp({ value, durationMs = 600, className }: { value: number; durationMs?: number; className?: string }) {
  const [animated, setAnimated] = useState<number | null>(null)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    fromRef.current = value
    if (from === value) return
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      if (p < 1) {
        setAnimated(Math.round(from + (value - from) * p))
        raf = requestAnimationFrame(tick)
      } else {
        setAnimated(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return <span className={className}>{animated ?? value}</span>
}
