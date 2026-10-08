// 严重度标记：8px 方块 + 文字（design-system §3.2）。finding.severity 的 'ok' 是「提示」级缺口，
// 用中性灰方块，绝不显示成绿色（绿色=达标，那是另一回事，用 level='pass'）。i18n-free。
export type SeverityLevel = 'high' | 'mid' | 'low' | 'pass'

/** findings.severity（high | mid | ok）→ 标记级别；未知值按「提示」处理，不冒充更高或达标。 */
export function severityLevel(severity: string): SeverityLevel {
  if (severity === 'high') return 'high'
  if (severity === 'mid') return 'mid'
  return 'low'
}

export function SeverityMark({ level, label }: { level: SeverityLevel; label: string }) {
  return <span className={`ui-sev ui-sev--${level}`}>{label}</span>
}
