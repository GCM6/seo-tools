// 时间显示（design-system §8）：一律本地时间 YYYY-MM-DD HH:mm，不显示裸 ISO 字符串。
// 纯函数：时区由调用方决定（客户端组件传浏览器时区；测试传固定时区）。
export function formatLocalDateTime(iso: string, timeZone?: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

// 运行时间优先取 started_at，没有时回落到 finished_at；两者都没有返回 null（调用方显示「时间未记录」）。
export function runTimestamp(run: { startedAt?: string | null; finishedAt?: string | null }): string | null {
  return run.startedAt ?? run.finishedAt ?? null
}
