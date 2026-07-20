'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ProvenanceTag } from './ProvenanceTag'

export interface KeywordMetricRow {
  id: string
  keywordId: string
  clicks: number | null
  impressions: number | null
  ctr: string | null
  position: string | null
  source: string
}
export interface KeywordGapRow {
  id: string
  keywordId: string
  gapType: string
  ourPosition: string | null
  opportunityScore: string | null
}
// Server→Client 边界只传可序列化的普通结构（不能传 Map 实例——RSC 序列化对 Map 是否受支持
// 未经运行时验证，改为 Record 消除这个隐患）。组件内部若需要 Map 的查找语义，就地
// `new Map(Object.entries(...))` 重建，这一步完全在 client 侧，不跨边界，安全。
export type KeywordTextRecord = Record<string, { text: string; volume: number | null; difficulty: number | null }>

// GSC 落库的 ctr/position 是原样字符串（ctr 为 0–1 小数、position 为未截断均值，
// 如 "50.6666666666667"），展示层统一格式化：整数原样，小数保留 1 位。
function fmtNumeric(value: string | number | null): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ctr：GSC 语义是 0–1 的比例，展示为百分比（0.0333 → 3.3%）。
function fmtCtr(value: string | null): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  const pct = n * 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}

// P1-8：metrics（实测指标：clicks/impressions/ctr/position）与 gaps（缺口：gapType/opportunity/volume）
// 原来拆在两张互不关联的表里，同一关键词的信息要来回对照。这里按 keywordId 合并成一行，
// 缺口/实测各自缺失的字段显示"—"；`hasMetric`/`hasGap` 供"类型"列渲染徽标。
interface KeywordRow {
  keywordId: string
  text: string
  hasMetric: boolean
  hasGap: boolean
  clicks: number | null
  impressions: number | null
  ctr: string | null
  position: string | null
  gapType: string | null
  ourPosition: string | null
  opportunity: string | null
  volume: number | null
}

function buildRows(
  keywordMetrics: KeywordMetricRow[],
  keywordGaps: KeywordGapRow[],
  keywordText: Map<string, { text: string; volume: number | null; difficulty: number | null }>,
): KeywordRow[] {
  const rows = new Map<string, KeywordRow>()
  const textOf = (keywordId: string) => keywordText.get(keywordId)?.text ?? keywordId
  const volumeOf = (keywordId: string) => keywordText.get(keywordId)?.volume ?? null

  for (const m of keywordMetrics) {
    // 同一 keywordId 在本 run 内只应有一条 metrics 行（当前采集只落 source='gsc' 一路，见
    // lib/inngest/collect-evidence.ts）；若未来出现多 source 并存，这里保留先到者，避免静默覆盖。
    if (rows.has(m.keywordId)) continue
    rows.set(m.keywordId, {
      keywordId: m.keywordId,
      text: textOf(m.keywordId),
      hasMetric: true,
      hasGap: false,
      clicks: m.clicks,
      impressions: m.impressions,
      ctr: m.ctr,
      position: m.position,
      gapType: null,
      ourPosition: null,
      opportunity: null,
      volume: volumeOf(m.keywordId),
    })
  }
  for (const g of keywordGaps) {
    const existing = rows.get(g.keywordId)
    if (existing) {
      existing.hasGap = true
      existing.gapType = g.gapType
      existing.ourPosition = g.ourPosition
      existing.opportunity = g.opportunityScore
      continue
    }
    rows.set(g.keywordId, {
      keywordId: g.keywordId,
      text: textOf(g.keywordId),
      hasMetric: false,
      hasGap: true,
      clicks: null,
      impressions: null,
      ctr: null,
      position: null,
      gapType: g.gapType,
      ourPosition: g.ourPosition,
      opportunity: g.opportunityScore,
      volume: volumeOf(g.keywordId),
    })
  }
  return [...rows.values()]
}

// null 恒排最后（降序语境下）。不能用 "?? -Infinity 再相减" 的写法：两边都缺失时
// -Infinity - (-Infinity) = NaN，Array.prototype.sort 拿到 NaN 比较结果会静默放弃排序，
// 整段数据退化成"原样不排"（曾在纯 gaps 数据集上实测触发，见 KeywordTable.test.tsx）。
function cmpDesc(bv: number | null, av: number | null): number {
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return bv - av
}

// 服务端已用 orderBy 分别把 metrics 按 clicks 降序、gaps 按 opportunity 降序取回（P1-8 repository
// 层修复），但两个数组在这里按 keywordId 合并成一张表后需要一个统一的初始展示序：clicks 优先
// （有实测点击数据的词更可信），其后依次用 opportunity / impressions / volume 打破平局。
// 效果：纯 metrics 数据集退化为"按 clicks 降序"；纯 gaps 数据集（clicks 全为 null）退化为
// "按 opportunity 降序"——与两条验收标准分别对应。
function defaultCompare(a: KeywordRow, b: KeywordRow): number {
  const clicks = cmpDesc(b.clicks, a.clicks)
  if (clicks !== 0) return clicks
  const opp = cmpDesc(b.opportunity != null ? Number(b.opportunity) : null, a.opportunity != null ? Number(a.opportunity) : null)
  if (opp !== 0) return opp
  const imp = cmpDesc(b.impressions, a.impressions)
  if (imp !== 0) return imp
  return cmpDesc(b.volume, a.volume)
}

type SortKey = 'default' | 'clicks' | 'impressions' | 'ctr' | 'position' | 'opportunity' | 'volume'
type SortDir = 'asc' | 'desc'

const SORTABLE_KEYS: Exclude<SortKey, 'default'>[] = ['clicks', 'impressions', 'ctr', 'position', 'opportunity', 'volume']

function getSortValue(row: KeywordRow, key: SortKey): number | null {
  switch (key) {
    case 'clicks': return row.clicks
    case 'impressions': return row.impressions
    case 'ctr': return row.ctr != null ? Number(row.ctr) : null
    case 'position': {
      const raw = row.position ?? row.ourPosition
      return raw != null ? Number(raw) : null
    }
    case 'opportunity': return row.opportunity != null ? Number(row.opportunity) : null
    case 'volume': return row.volume
    default: return null
  }
}

function compareRows(a: KeywordRow, b: KeywordRow, key: SortKey, dir: SortDir): number {
  if (key === 'default') return defaultCompare(a, b)
  const av = getSortValue(a, key)
  const bv = getSortValue(b, key)
  // 缺失值恒排最后，不随升/降切换——否则"点一下升序"会把一堆"—"顶到最前面，反而更难读。
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return dir === 'desc' ? bv - av : av - bv
}

const PAGE_SIZE = 50

function SortableHeader({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean
  dir: SortDir
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <th aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        className="act"
        style={{ minHeight: 'auto', padding: '2px 4px', whiteSpace: 'nowrap' }}
        onClick={onClick}
      >
        {children}
        <span aria-hidden="true" style={{ marginLeft: 4, opacity: active ? 1 : 0.35 }}>
          {active ? (dir === 'desc' ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  )
}

// 关键词表：metrics + gaps 按 keywordId 合并为单表（P1-8 重构，见 docs 里的调查记录）。
// 报告页 §4 与关键词现状 tab 同用。列标签复用 report.keywords.*。
export function KeywordTable({
  keywordMetrics,
  keywordGaps,
  keywordText,
}: {
  keywordMetrics: KeywordMetricRow[]
  keywordGaps: KeywordGapRow[]
  keywordText: KeywordTextRecord
}) {
  const t = useTranslations('report')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'default', dir: 'desc' })
  const [expanded, setExpanded] = useState(false)

  // Record 是跨边界安全的序列化形态；这里在 client 侧就地重建 Map 以复用 buildRows 的查找语义。
  const keywordTextMap = useMemo(() => new Map(Object.entries(keywordText)), [keywordText])
  const rows = useMemo(() => buildRows(keywordMetrics, keywordGaps, keywordTextMap), [keywordMetrics, keywordGaps, keywordTextMap])
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.dir)),
    [rows, sort],
  )
  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, PAGE_SIZE)
  const hasMore = sortedRows.length > PAGE_SIZE

  if (!rows.length) {
    return <p className="note">{t('keywords.empty')}</p>
  }

  const toggleSort = (key: Exclude<SortKey, 'default'>) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  }

  const colLabel: Record<Exclude<SortKey, 'default'>, string> = {
    clicks: t('keywords.col.clicks'),
    impressions: t('keywords.col.impressions'),
    ctr: t('keywords.col.ctr'),
    position: t('keywords.col.position'),
    opportunity: t('keywords.col.opportunity'),
    volume: t('keywords.col.volume'),
  }

  return (
    <>
      <p className="note">{t('keywords.estimateNote')}</p>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>{t('keywords.col.keyword')}</th>
              <th>{t('keywords.col.type')}</th>
              {SORTABLE_KEYS.map((key) => (
                <SortableHeader
                  key={key}
                  active={sort.key === key}
                  dir={sort.key === key ? sort.dir : 'desc'}
                  onClick={() => toggleSort(key)}
                >
                  {colLabel[key]}
                </SortableHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.keywordId}>
                <td>{row.text}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {row.hasMetric ? <ProvenanceTag variant="m" label={t('keywords.type.measured')} /> : null}
                    {row.hasGap ? (
                      <ProvenanceTag
                        variant="g"
                        label={`${t('keywords.type.gap')} · ${t(`keywords.gapType.${row.gapType}`)}`}
                      />
                    ) : null}
                  </div>
                </td>
                <td>{row.clicks ?? '—'}</td>
                <td>{row.impressions ?? '—'}</td>
                <td>{fmtCtr(row.ctr)}</td>
                <td>{fmtNumeric(row.position ?? row.ourPosition)}</td>
                <td>{fmtNumeric(row.opportunity)}</td>
                <td>{row.volume ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <button type="button" className="act" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t('keywords.collapse') : t('keywords.expandAll', { count: sortedRows.length })}
        </button>
      ) : null}
    </>
  )
}
