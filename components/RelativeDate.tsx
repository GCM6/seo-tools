'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}
const DAY = 24 * 60 * 60 * 1000

/** 相对今天的天数文案（「明天」「3 天前」）：用浏览器自带的 Intl.RelativeTimeFormat，不在代码里写死中英文。 */
export function relativeDayLabel(iso: string, locale: string, now: Date): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / DAY)
  // 两个月以外的日期，相对说法（「85 天后」）反而难读，直接给日期。
  if (Math.abs(diff) > 60) return null
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day')
}

// 相对日期（client 叶子）：服务端先输出日期，hydration 后换成浏览器本地的相对说法，悬停看完整日期。
// 用 useSyncExternalStore 的 server/client 双快照，服务器时区与用户时区不同也不会 hydration 不一致。
export function RelativeDate({ iso, locale }: { iso: string; locale: string }) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => relativeDayLabel(iso, locale, new Date()) ?? iso.slice(0, 10),
    () => iso.slice(0, 10),
  )
  return (
    <time dateTime={iso} title={iso.slice(0, 10)}>
      {label}
    </time>
  )
}
