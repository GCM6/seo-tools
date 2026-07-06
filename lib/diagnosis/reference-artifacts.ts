// 规则保鲜最小版（spec §11.1）——版本化参考资产 + 陈旧检查。
// 原则：宁可在报告里承认「规则库最后校验于 X，以下检查可能滞后」，也不假装最新（与证据铁律同构）。
// 本模块纯逻辑；DB 落库（seed）与月度巡检（Phase F）在外层。

// 需保鲜的资产种子（spec §11.1 清单）。artifactKey 唯一，作为 reference_artifacts.artifact_key。
// last_verified_at 由 seed/巡检写入；payload 存该资产的结构化清单（如 UA 名单）。
export interface ReferenceArtifactSeed {
  artifactKey: string
  version: string
  sourceUrl: string
  refreshCadenceDays: number
  // 人读标题，报告陈旧告警里列出。
  label: string
}

export const REFERENCE_ARTIFACT_SEEDS: ReferenceArtifactSeed[] = [
  {
    artifactKey: 'ai_crawler_ua_list',
    version: 'v1',
    sourceUrl: 'https://darkvisitors.com/agents',
    refreshCadenceDays: 30,
    label: 'AI 爬虫 User-Agent 清单（可达性/robots 检查依据）',
  },
  {
    artifactKey: 'google_rich_result_status',
    version: 'v1',
    sourceUrl: 'https://developers.google.com/search/blog',
    refreshCadenceDays: 90,
    label: '富摘要类型支持状态（FAQ/HowTo 弃用等）',
  },
  {
    artifactKey: 'core_web_vitals_thresholds',
    version: 'v1',
    sourceUrl: 'https://web.dev/articles/vitals',
    refreshCadenceDays: 180,
    label: 'Core Web Vitals 指标与阈值（INP 取代 FID 等）',
  },
  {
    artifactKey: 'dataforseo_endpoints',
    version: 'v1',
    sourceUrl: 'https://docs.dataforseo.com/v3/',
    refreshCadenceDays: 90,
    label: 'DataForSEO v3 端点与计费（v2 下线等）',
  },
  {
    artifactKey: 'schema_org_vocab',
    version: 'v1',
    sourceUrl: 'https://schema.org/docs/releases.html',
    refreshCadenceDays: 180,
    label: 'Schema.org 类型与属性词表',
  },
]

// reference_artifacts 表行的最小形状（避免依赖 drizzle $inferSelect，保持本模块纯净可测）。
export interface ReferenceArtifactRow {
  artifactKey: string
  label?: string | null
  sourceUrl: string
  lastVerifiedAt: string | null
  refreshCadenceDays: number
}

export interface ArtifactFreshness {
  artifactKey: string
  label: string
  sourceUrl: string
  lastVerifiedAt: string | null
  // 距上次校验的天数（从未校验为 null）。
  ageDays: number | null
  // 超过 refresh_cadence_days（或从未校验）即 stale。
  stale: boolean
}

export interface FreshnessReport {
  // 所有资产的保鲜状态。
  artifacts: ArtifactFreshness[]
  // 仅陈旧项（报告「方法与范围」板块列出）。
  stale: ArtifactFreshness[]
  // 全部资产里最早的一次校验时间（报告「规则库最后校验于 X」）。null=无任一校验。
  oldestVerifiedAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

const seedLabel = (key: string): string => REFERENCE_ARTIFACT_SEEDS.find((s) => s.artifactKey === key)?.label ?? key

// 传入 now 便于测试（不在纯函数内取当前时间）。
export function checkArtifactFreshness(rows: ReferenceArtifactRow[], now: Date): FreshnessReport {
  const nowMs = now.getTime()
  const artifacts: ArtifactFreshness[] = rows.map((r) => {
    const verifiedMs = r.lastVerifiedAt ? Date.parse(r.lastVerifiedAt) : NaN
    const hasVerified = Number.isFinite(verifiedMs)
    const ageDays = hasVerified ? Math.floor((nowMs - verifiedMs) / DAY_MS) : null
    const stale = !hasVerified || (ageDays !== null && ageDays > r.refreshCadenceDays)
    return {
      artifactKey: r.artifactKey,
      label: r.label ?? seedLabel(r.artifactKey),
      sourceUrl: r.sourceUrl,
      lastVerifiedAt: r.lastVerifiedAt,
      ageDays,
      stale,
    }
  })

  const verifiedDates = rows.map((r) => r.lastVerifiedAt).filter((d): d is string => !!d && Number.isFinite(Date.parse(d)))
  const oldestVerifiedAt = verifiedDates.length ? verifiedDates.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null

  return { artifacts, stale: artifacts.filter((a) => a.stale), oldestVerifiedAt }
}
