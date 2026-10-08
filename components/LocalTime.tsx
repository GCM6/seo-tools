'use client'

import { useSyncExternalStore } from 'react'
import { formatLocalDateTime } from '@/lib/format/datetime'

const noopSubscribe = () => () => {}

// 本地时间显示（client 叶子）：服务端先输出 UTC 日期，hydration 后换成浏览器本地的
// YYYY-MM-DD HH:mm（dateOnly 时只到日期，用于报告抬头）。用 useSyncExternalStore 的
// server/client 双快照，不会触发 hydration 不一致。
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => {
      const local = formatLocalDateTime(iso)
      if (!local) return iso
      return dateOnly ? local.slice(0, 10) : local
    },
    () => iso.slice(0, 10),
  )
  return (
    <time dateTime={iso} className="ui-num">
      {label}
    </time>
  )
}
