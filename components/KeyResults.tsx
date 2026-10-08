import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { EvidenceBadge } from './EvidenceBadge'
import { EvidenceDrawer, type EvidenceView } from './EvidenceDrawer'
import { ResultTable, type ResultRow } from './ResultTable'
import { provenanceForLevel } from '@/lib/evidence'
import type { StatCard, StatCardKey } from '@/lib/diagnostics'
import type { HealthKey } from '@/lib/settings/data-source-health'
import { getDataSourceConnectHref, isExternalConnectHref } from '@/lib/settings/connect-links'

// 关键结果表（取代旧 StatStrip 卡片，ux-blueprint §3.1）：检测项目 / 结果 / 说明 / 证据。
// 有证据的行显示数值 + 证据等级；没有证据的行如实写「未接入」或「本轮未测量」和原因——
// 不用骨架屏冒充加载，也不把开发者环境变量写进界面（design-system §3.6）。
// statCardRows 是概览页与报告文档（ReportView）共用的同一套口径；概览页在此基础上加「去连接」
// 入口和原始数据，报告是给客户看的，只用 statCardRows 的纯结果。
const REASON_ANCHOR: Partial<Record<string, HealthKey>> = {
  search_provider: 'googleCse',
  ai_probe: 'aiProbe',
  gsc: 'gsc',
}
const NOT_CONNECTED = new Set(['search_provider', 'ai_probe', 'gsc'])

const UNIT_KEY: Partial<Record<StatCardKey, string>> = {
  indexVisibility: 'stats.indexVisibilityUnit',
  avgRank: 'stats.avgRankUnit',
  schemaCoverage: 'stats.schemaCoverageUnit',
}
const UNIT_SUFFIX: Partial<Record<StatCardKey, string>> = { crawlableText: '%' }

type Translate = (key: string, vars?: Record<string, string | number | Date>) => string

/** t = overview 命名空间，ts = screen2（单位），tRoot = 根命名空间（证据等级标签）。 */
export function statCardRows(
  cards: StatCard[],
  { t, ts, tRoot }: { t: Translate; ts: Translate; tRoot: Translate },
  extra?: (card: StatCard) => { evidence?: ReactNode; detail?: ReactNode },
): ResultRow[] {
  return cards.map((c) => {
    const label = t(`metric.${c.key}`)
    const more = extra?.(c) ?? {}
    if (c.state === 'pending') {
      return {
        key: c.key,
        label,
        value: NOT_CONNECTED.has(c.reason) ? t('notConnected') : t('notMeasured'),
        muted: true,
        note: t(`pending.${c.reason}`),
        evidence: more.evidence,
      }
    }
    const prov = provenanceForLevel(c.level)
    const unitKey = UNIT_KEY[c.key]
    const unit = UNIT_SUFFIX[c.key] ?? (unitKey ? ts(unitKey) : '')
    return {
      key: c.key,
      label,
      value: (
        <>
          {c.value}
          {unit ? <small> {unit}</small> : null}
        </>
      ),
      note: t(`metricNote.${c.key}`),
      evidence: <EvidenceBadge grade={prov.grade} label={tRoot(prov.labelKey)} />,
      detail: more.detail,
    }
  })
}

export function resultTableHead(t: Translate) {
  return { item: t('col.item'), result: t('col.result'), note: t('col.note'), evidence: t('col.evidence') }
}

// 概览页：在共用口径上加「去连接」入口（未接入的行）和可展开的原始数据（有证据的行）。
export async function KeyResults({
  cards,
  evidenceById,
  locale,
  projectId,
}: {
  cards: StatCard[]
  evidenceById?: Record<string, EvidenceView>
  locale: string
  projectId?: string
}) {
  const [t, ts, tRoot] = await Promise.all([getTranslations('overview'), getTranslations('screen2'), getTranslations()])

  const rows = statCardRows(cards, { t, ts, tRoot }, (c) => {
    if (c.state === 'pending') {
      const anchor = REASON_ANCHOR[c.reason]
      const href = anchor ? getDataSourceConnectHref(anchor, locale, projectId) : null
      if (!href) return {}
      return {
        evidence: isExternalConnectHref(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {t('connect')} ↗
          </a>
        ) : (
          <Link href={href}>{t('connect')}</Link>
        ),
      }
    }
    const ev = evidenceById?.[c.evidenceId]
    if (!ev) return {}
    return {
      detail: (
        <details className="ui-disclosure ui-result__detail">
          <summary>{t('viewEvidence')}</summary>
          <div className="mt-3">
            <EvidenceDrawer evidence={ev} />
          </div>
        </details>
      ),
    }
  })

  return <ResultTable rows={rows} head={resultTableHead(t)} />
}
