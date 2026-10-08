'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Notice } from './Notice'
import { RecCard, type RecCardProps, type RecStatus } from './RecCard'
import {
  REC_FILTERS,
  countRecFilters,
  groupByPriority,
  rankRecs,
  recFilterOf,
  type RecFilter,
} from '@/lib/runs/recommendations'

export type RecListItem = Omit<RecCardProps, 'onStatusChange'> & { priority: string }

// 建议页列表（ux-blueprint §3.3）：顶部进度 + 「全部 / 待确认 / 已接受 / 已否决」筛选 + 按优先级分组。
// 筛选结果在切换筛选那一刻定格：在「待确认」里点了接受，这一行留在原位显示新状态，
// 不会立刻从眼前消失；计数实时更新，再点一次筛选才重新过滤。
export function RecommendationList({ items, checklistHref }: { items: RecListItem[]; checklistHref: string }) {
  const t = useTranslations('screen3')
  const [statuses, setStatuses] = useState<Record<string, RecStatus>>(() =>
    Object.fromEntries(items.map((it) => [it.id, it.initialStatus])),
  )
  const [filter, setFilter] = useState<RecFilter>('all')
  const [visible, setVisible] = useState<Set<string> | null>(null)

  const counts = countRecFilters(items.map((it) => statuses[it.id]))
  const pick = (next: RecFilter) => {
    setFilter(next)
    setVisible(next === 'all' ? null : new Set(items.filter((it) => recFilterOf(statuses[it.id]) === next).map((it) => it.id)))
  }
  const onStatusChange = (id: string, status: RecStatus) => setStatuses((prev) => ({ ...prev, [id]: status }))

  const shown = items.filter((it) => !visible || visible.has(it.id))
  // 组内排序用所针对问题的严重度与证据等级（confidenceGrade 就是该问题的证据等级）。
  const groups = groupByPriority(rankRecs(shown.map((it) => ({ ...it, grade: it.confidenceGrade }))))
  const allDecided = counts.pending === 0 && counts.accepted > 0

  return (
    <div className="grid grid-cols-1 gap-4">
      <p className="ui-rec-toolbar__summary">
        {t('summary', { total: counts.all, pending: counts.pending, accepted: counts.accepted, rejected: counts.rejected })}
      </p>

      <div className="ui-chips" role="group" aria-label={t('filterLabel')}>
        {REC_FILTERS.map((f) => (
          <button key={f} type="button" className="ui-chip" aria-pressed={filter === f} onClick={() => pick(f)}>
            {t(`filter.${f}`)}
            <span className="ui-chip__count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="ui-panel ui-empty">
          <p className="ui-empty__title">{t('emptyFiltered')}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.priority} className="ui-recgroup" aria-labelledby={`recgroup-${g.priority}`}>
            <h3 className="ui-recgroup__title" id={`recgroup-${g.priority}`}>
              {t(`priority.${g.priority}`)}
              <span className="ui-recgroup__count">{g.items.length}</span>
            </h3>
            <ul className="ui-panel ui-recs">
              {g.items.map((it) => (
                <li key={it.id} id={it.id}>
                  <RecCard {...it} onStatusChange={onStatusChange} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* 全部处理完：抬头的主按钮会随 router.refresh() 变成「打开执行清单」；
          在列表末尾再给一个文字入口，处理完最后一条的人不用滚回顶部（页面仍只有一个主按钮）。 */}
      {allDecided ? (
        <Notice tone="success" action={<Link href={checklistHref}>{t('openChecklist')}</Link>}>
          {t('allDecided', { accepted: counts.accepted })}
        </Notice>
      ) : null}
    </div>
  )
}
