import { EvidenceBadge } from './EvidenceBadge'
import type { EvidenceGrade } from '@/lib/evidence'

// 「证据等级怎么读」（ux-blueprint §5 ④）：报告里出现的 4 种证据徽章，各配一句白话。
// 用的就是正文里同一个 EvidenceBadge（形状区分），读者对照图例就能认出正文里的标签。
// i18n-free 纯展示：调用方 t() 后传入 label / desc，可直接用于 Server Component。
export function EvidenceLadder({
  levels,
  note,
}: {
  levels: { grade: EvidenceGrade; label: string; desc: string }[]
  /** 图例下方的一句补充（例如「没有证据的说法不会写进报告」）。 */
  note?: string
}) {
  return (
    <div className="ui-ladder">
      <dl>
        {levels.map((l) => (
          <div key={l.grade}>
            <dt>
              <EvidenceBadge grade={l.grade} label={l.label} />
            </dt>
            <dd>{l.desc}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="ui-footnote">{note}</p> : null}
    </div>
  )
}
