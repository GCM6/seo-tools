// 建议与执行状态文字（design-system §3.3）。✓ 和空心圆由样式渲染，文案里不要再写「✓」。i18n-free。
export type StatusKind = 'draft' | 'accepted' | 'edited' | 'rejected' | 'applied'

export function StatusText({ status, label }: { status: StatusKind; label: string }) {
  return <span className={`ui-status ui-status--${status}`}>{label}</span>
}
