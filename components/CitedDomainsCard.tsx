// ⑤（引用来源归属分类）：被引用域名 Top 列表，自有域名高亮，超过 10 个默认折叠。
// i18n-free by design（同 EvidenceBadge / SovBar 约定）：调用方 t() 解析好文案再传入，
// 组件本身不带 hook，可直接用在 Server Component 里（概览页、报告页）。
// 归属（自有 / 第三方）与平台都用中性标签表达，不借用证据色（design-system §1.2 否决级）。
import { DomainCountTable } from './DomainCountTable'
import type { CitationPlatform } from '@/lib/probes/citation-platform'

export interface CitedDomainRow {
  domain: string
  count: number
  origin: 'owned' | 'third_party'
  // 平台分类：'other' 不展示徽标——认不出的域名标个「other」徽标反而是噪音。
  platform: CitationPlatform
}

export function CitedDomainsCard({
  rows,
  ownedLabel,
  thirdPartyLabel,
  platformLabels,
  listLabels,
}: {
  rows: CitedDomainRow[]
  ownedLabel: string
  thirdPartyLabel: string
  // 已翻译好的平台展示名（i18n-free 惯例，调用方 t() 解析）。'other' 不展示，故不需要该 key。
  platformLabels: Record<Exclude<CitationPlatform, 'other'>, string>
  listLabels: { domain: string; count: string; showAll: string; showLess: string }
}) {
  if (rows.length === 0) return null

  return (
    <div className="ui-panel">
      <div className="ui-panel__body">
        <DomainCountTable
          rows={rows.map((r) => ({
            domain: r.domain,
            count: r.count,
            own: r.origin === 'owned',
            tags: [
              ...(r.origin === 'owned' ? [] : [thirdPartyLabel]),
              ...(r.platform !== 'other' ? [platformLabels[r.platform]] : []),
            ],
          }))}
          labels={{ ...listLabels, own: ownedLabel }}
        />
      </div>
    </div>
  )
}
