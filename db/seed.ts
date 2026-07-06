import { eq } from 'drizzle-orm'
import { db } from './client'
import { projects } from './schema'
import { REFERENCE_ARTIFACT_SEEDS } from '@/lib/diagnosis/reference-artifacts'
import { upsertReferenceArtifact } from '@/lib/repositories'

async function seed() {
  // Real-only baseline: remove the legacy sample project and its cascaded rows.
  // New evidence must come from a submitted run and the collection pipeline.
  await db.delete(projects).where(eq(projects.id, 'teamflow'))

  console.log('[seed] real-only baseline ready')
  console.log('[seed] removed legacy sample project if it existed; no synthetic diagnostics inserted')

  // 规则保鲜资产种子（spec §11.1）：版本化参考资产入库，last_verified_at 记为今天，
  // 供报告页陈旧告警与月度巡检（docs/runbooks/rules-refresh.md）比对刷新节奏。payload 待巡检填充。
  const today = new Date().toISOString()
  for (const s of REFERENCE_ARTIFACT_SEEDS) {
    await upsertReferenceArtifact({
      id: `refart_${s.artifactKey}`,
      artifactKey: s.artifactKey,
      version: s.version,
      sourceUrl: s.sourceUrl,
      lastVerifiedAt: today,
      refreshCadenceDays: s.refreshCadenceDays,
      payload: null,
    })
  }
  console.log(`[seed] upserted ${REFERENCE_ARTIFACT_SEEDS.length} reference artifacts`)
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err)
    process.exit(1)
  })
