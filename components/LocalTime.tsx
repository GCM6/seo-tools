'use client'

import { useSyncExternalStore } from 'react'
import { formatLocalDateTime } from '@/lib/format/datetime'

const noopSubscribe = () => () => {}

// 本地时间显示（client 叶子）：服务端先输出 UTC 日期，hydration 后换成浏览器本地的
// YYYY-MM-DD HH:mm。用 useSyncExternalStore 的 server/client 双快照，不会触发 hydration 不一致。
export function LocalTime({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => formatLocalDateTime(iso) ?? iso,
    () => iso.slice(0, 10),
  )
  return (
    <time dateTime={iso} className="ui-num">
      {label}
    </time>
  )
}
