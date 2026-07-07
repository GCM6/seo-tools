'use client'

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// 数字滚动：value 变化时 rAF 从旧值补间到新值；reduced-motion 或无 rAF 直接显终值。
export function CountUp({ value, durationMs = 600, className }: { value: number; durationMs?: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setDisplay(value)
      fromRef.current = value
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setDisplay(Math.round(from + (value - from) * p))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return <span className={className}>{display}</span>
}
