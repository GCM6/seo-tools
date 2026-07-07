// Phase F 提案纯逻辑：evidence 校验 / 版本推导 / 资产更新计算 / changelog 分组 / 跨版本 delta。
// 全部纯函数（now 显式注入），供仓库层、API、UI 复用。

/** evidence_refs 非空校验：至少一个去空白后非空的字符串（对齐「无一手来源不入库」铁律）。 */
export function hasValidEvidence(refs: string[] | null | undefined): boolean {
  return Array.isArray(refs) && refs.some((r) => typeof r === 'string' && r.trim().length > 0)
}

/** 从已发布版本序列 + 当前代码版本推导下一个 rules_v<N>（取最大值 +1）。 */
// 发布守卫：newVersion 必须格式合法、未发布过、且数值严格大于已发布最大值（单调递增）。
// 违反即抛（校验器风格），阻止重发已发布版本或发布更低版本。releaseApprovedProposals 入口调用。
export function assertReleasableVersion(newVersion: string, releasedVersions: string[]): void {
  const parse = (v: string): number | null => {
    const m = /^rules_v(\d+)$/.exec(v ?? '')
    return m ? Number(m[1]) : null
  }
  const n = parse(newVersion)
  if (n === null) throw new Error('rules_version_format_invalid')
  if (releasedVersions.includes(newVersion)) throw new Error('rules_version_already_released')
  const nums = releasedVersions.map(parse).filter((x): x is number => x !== null)
  const max = nums.length ? Math.max(...nums) : 0
  if (n <= max) throw new Error('rules_version_not_monotonic')
}

export function deriveNextRulesVersion(publishedVersions: string[], currentVersion: string): string {
  const nums = [...publishedVersions, currentVersion]
    .map((v) => /^rules_v(\d+)$/.exec(v ?? ''))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
  const max = nums.length ? Math.max(...nums) : 1
  return `rules_v${max + 1}`
}

function bumpArtifactVersion(v: string): string {
  const m = /^v(\d+)$/.exec(v)
  return m ? `v${Number(m[1]) + 1}` : 'v2'
}

/** update_artifact 类提案发版时对 reference_artifacts 行的更新补丁。 */
export function computeArtifactUpdate(
  current: { version: string; payload: unknown },
  diff: { payload?: unknown } | null | undefined,
  now: Date,
): { version: string; lastVerifiedAt: string; payload?: unknown } {
  const hasPayload = !!diff && typeof diff === 'object' && 'payload' in diff && diff.payload !== undefined
  return {
    version: bumpArtifactVersion(current.version),
    lastVerifiedAt: now.toISOString(),
    ...(hasPayload ? { payload: (diff as { payload: unknown }).payload } : {}),
  }
}

export interface ChangelogInput {
  changeType: string
  target: string
  evidenceRefs: string[]
  reviewedAt: string | null
  status: string
  releasedInRulesVersion: string | null
}

export interface ChangelogEntry {
  version: string
  proposals: { changeType: string; target: string; evidenceRefs: string[]; reviewedAt: string | null }[]
}

/** 已批且已发布的提案，按 released_in_rules_version 分组，版本号数值降序。 */
export function groupChangelog(rows: ChangelogInput[]): ChangelogEntry[] {
  const byVersion = new Map<string, ChangelogEntry['proposals']>()
  for (const p of rows) {
    if (p.status !== 'approved' || !p.releasedInRulesVersion) continue
    const list = byVersion.get(p.releasedInRulesVersion) ?? []
    list.push({ changeType: p.changeType, target: p.target, evidenceRefs: p.evidenceRefs, reviewedAt: p.reviewedAt })
    byVersion.set(p.releasedInRulesVersion, list)
  }
  return [...byVersion.entries()]
    .map(([version, proposals]) => ({ version, proposals }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

/** 跨版本 delta：stored（run 记录的版本）与 current（当前规则库版本）不同则返回 from/to。 */
export function rulesVersionDelta(
  stored: string | null,
  current: string | null,
): { from: string; to: string } | null {
  if (!stored || !current || stored === current) return null
  return { from: stored, to: current }
}
