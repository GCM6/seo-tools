// ⑤（引用来源归属分类）：被引用域名 Top 列表卡片，owned 高亮。
// i18n-free by design（同 ProvenanceTag / SovBar 约定）：调用方 t() 解析好文案再传入，
// 组件本身不带 hook，可直接用在 Server Component 里（PresenceMap 所在的 run 详情页）。
// 标题/说明由调用方按页面既有的 .sec-h 惯例渲染在卡片外部（同 SoV 区块的接线方式），
// 本组件只负责卡片本体，不重复一套区块标题结构。
import { ProvenanceTag } from './ProvenanceTag'
import type { CitationPlatform } from '@/lib/probes/citation-platform'

export interface CitedDomainRow {
  domain: string
  count: number
  origin: 'owned' | 'third_party'
  // 平台分类（新增）：'other' 不展示徽标——认不出的域名标个「other」徽标反而是噪音。
  platform: CitationPlatform
}

export function CitedDomainsCard({
  rows,
  ownedLabel,
  thirdPartyLabel,
  platformLabels,
}: {
  rows: CitedDomainRow[]
  ownedLabel: string
  thirdPartyLabel: string
  // 已翻译好的平台展示名（i18n-free 惯例，调用方 t() 解析）。'other' 不展示，故不需要该 key。
  platformLabels: Record<Exclude<CitationPlatform, 'other'>, string>
}) {
  if (rows.length === 0) return null

  return (
    <div className="card">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.domain} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{r.domain}</span>
              {r.platform !== 'other' ? <span className="platform-badge">{platformLabels[r.platform]}</span> : null}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <ProvenanceTag variant={r.origin === 'owned' ? 'ok' : 'i'} label={r.origin === 'owned' ? ownedLabel : thirdPartyLabel} />
              <b>{r.count}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
