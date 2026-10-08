import Link from 'next/link'
import { EvidenceBadge } from './EvidenceBadge'
import { SeverityMark, severityLevel } from './SeverityMark'
import type { EvidenceGrade } from '@/lib/evidence'

// 概览页「优先处理的问题」（ux-blueprint §3.1）：按严重度挑前几条，完整清单在「问题」视图。
// i18n-free：调用方 t() 后把文案放进 items / labels。
export interface IssueSummaryItem {
  id: string
  title: string
  description?: string
  severity: string
  severityLabel: string
  pillarLabel?: string
  grade: EvidenceGrade
  gradeLabel: string
}

const SEV_ORDER: Record<string, number> = { high: 0, mid: 1, ok: 2 }
const GRADE_ORDER: Record<EvidenceGrade, number> = { hard: 0, sample: 1, inferred: 2, hypothesis: 3 }

/** 严重度优先，其次证据越硬越靠前。 */
export function rankIssues<T extends { severity: string; grade: EvidenceGrade }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade],
  )
}

export function IssueSummary({ items, issuesHref }: { items: IssueSummaryItem[]; issuesHref: string }) {
  return (
    <ul className="ui-panel ui-issues">
      {items.map((it) => (
        <li key={it.id} className="ui-issue">
          <SeverityMark level={severityLevel(it.severity)} label={it.severityLabel} />
          <div>
            <Link href={`${issuesHref}#${it.id}`} className="ui-issue__title">
              {it.title}
            </Link>
            {it.description ? <p className="ui-issue__desc">{it.description}</p> : null}
          </div>
          <span className="ui-issue__meta">{it.pillarLabel ?? ''}</span>
          <EvidenceBadge grade={it.grade} label={it.gradeLabel} />
        </li>
      ))}
    </ul>
  )
}
