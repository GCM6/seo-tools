import type { EvidenceGrade } from '@/lib/evidence'

// 证据等级徽章——产品的签名标签（design-system §3.1）。证据等级只用形状区分：
// 实测=实心 ink、抽样实测=实心 ink-2、推断=空心、疑似=虚线。不承担任何其它含义
// （自有/第三方、缺口、达标等用 Tag 或 SeverityMark）。
// i18n-free：调用方 t() 后传入 label / hint，可直接用于 Server Component。
export function EvidenceBadge({
  grade,
  label,
  hint,
  suffix,
}: {
  grade: EvidenceGrade
  label: string
  /** 悬停时的就近解释（已翻译），例如「实测：有可复查的原始数据」。 */
  hint?: string
  /** 可选后缀，例如样本量「n=23」。 */
  suffix?: string
}) {
  return (
    <span className={`ui-ev ui-ev--${grade}`} title={hint} data-grade={grade}>
      {label}
      {suffix ? <span className="ui-ev__suffix">&nbsp;· {suffix}</span> : null}
    </span>
  )
}
