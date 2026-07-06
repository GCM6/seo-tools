import { describe, it, expect } from 'vitest'
import { checkArtifactFreshness, REFERENCE_ARTIFACT_SEEDS, type ReferenceArtifactRow } from './reference-artifacts'

const now = new Date('2026-07-06T00:00:00Z')
const daysAgo = (n: number): string => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('checkArtifactFreshness', () => {
  it('flags artifacts past their refresh cadence as stale', () => {
    const rows: ReferenceArtifactRow[] = [
      { artifactKey: 'ai_crawler_ua_list', label: 'UA', sourceUrl: 'x', lastVerifiedAt: daysAgo(10), refreshCadenceDays: 30 },
      { artifactKey: 'core_web_vitals_thresholds', label: 'CWV', sourceUrl: 'y', lastVerifiedAt: daysAgo(200), refreshCadenceDays: 180 },
    ]
    const r = checkArtifactFreshness(rows, now)
    expect(r.stale.map((s) => s.artifactKey)).toEqual(['core_web_vitals_thresholds'])
    expect(r.artifacts[0].ageDays).toBe(10)
  })

  it('treats never-verified artifacts as stale', () => {
    const rows: ReferenceArtifactRow[] = [
      { artifactKey: 'k', sourceUrl: 'x', lastVerifiedAt: null, refreshCadenceDays: 90 },
    ]
    const r = checkArtifactFreshness(rows, now)
    expect(r.stale).toHaveLength(1)
    expect(r.artifacts[0].ageDays).toBeNull()
  })

  it('reports oldest verified date across artifacts', () => {
    const rows: ReferenceArtifactRow[] = [
      { artifactKey: 'a', sourceUrl: 'x', lastVerifiedAt: daysAgo(5), refreshCadenceDays: 90 },
      { artifactKey: 'b', sourceUrl: 'y', lastVerifiedAt: daysAgo(50), refreshCadenceDays: 90 },
    ]
    expect(checkArtifactFreshness(rows, now).oldestVerifiedAt).toBe(daysAgo(50))
  })

  it('handles empty artifact set', () => {
    const r = checkArtifactFreshness([], now)
    expect(r.stale).toEqual([])
    expect(r.oldestVerifiedAt).toBeNull()
  })

  it('ships a non-empty seed list with source urls', () => {
    expect(REFERENCE_ARTIFACT_SEEDS.length).toBeGreaterThan(0)
    for (const s of REFERENCE_ARTIFACT_SEEDS) {
      expect(s.sourceUrl).toMatch(/^https:\/\//)
      expect(s.refreshCadenceDays).toBeGreaterThan(0)
    }
  })
})
