import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { FindingList, type FindingItem } from '@/components/FindingList'
import { EvidenceDrawer, type EvidenceView } from '@/components/EvidenceDrawer'
import { SectionHeader } from '@/components/SectionHeader'
import { getEvidence, getFindings, getRun, getRunEvidence } from '@/lib/repositories'
import { provenanceForClaim } from '@/lib/evidence'
import type { ClaimType } from '@/lib/types'

// 问题视图（ux-blueprint §3.2，新增路由）：本轮全部未忽略的问题，按严重度、证据强度排序，
// 可按严重度与维度筛选，展开看说明、原始证据与「忽略」操作。数据装配沿用概览页原问题清单的逻辑。
export default async function RunIssuesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const [t, ti, run, findings, evidenceRows] = await Promise.all([
    getTranslations(),
    getTranslations('issues'),
    getRun(id),
    getFindings(id),
    getRunEvidence(id),
  ])
  if (!run) notFound()

  const evidenceById: Record<string, EvidenceView> = Object.fromEntries(
    evidenceRows.map((e) => [e.id, { id: e.id, type: e.type, claimLevel: e.claimLevel, source: e.source, payload: e.payload }]),
  )

  // 已忽略（dismissed）的发现不进入列表——人工判定为误报后即从视图隐去。
  const items: FindingItem[] = await Promise.all(
    findings
      .filter((f) => f.status !== 'dismissed')
      .map(async (f): Promise<FindingItem> => {
        const prov = provenanceForClaim(f.claimType as ClaimType)
        // 同 run 的证据已一次性载入；只有跨 run 的引用（数据异常时）才单独查询，避免 N+1。
        const artifacts = await Promise.all((f.evidenceRefs ?? []).map((ref) => evidenceById[ref] ?? getEvidence(ref)))
        const shown = artifacts.filter((a): a is NonNullable<typeof a> => Boolean(a))
        return {
          id: f.id,
          side: f.side as FindingItem['side'],
          title: f.title,
          description: f.description ?? undefined,
          pillar: f.pillar ?? undefined,
          grade: prov.grade,
          provLabel: t(prov.labelKey),
          confidence: f.confidence,
          severity: f.severity,
          evidence: (
            <div className="grid gap-4">
              <h4 className="ui-label">{ti('evidenceLabel')}</h4>
              {shown.length ? (
                shown.map((a) => (
                  <EvidenceDrawer
                    key={a.id}
                    evidence={{ id: a.id, type: a.type, claimLevel: a.claimLevel, source: a.source, payload: a.payload }}
                  />
                ))
              ) : (
                <p className="ui-result__note">{ti('noEvidence')}</p>
              )}
            </div>
          ),
        }
      }),
  )

  return (
    <RunWorkspace runId={id} locale={locale} current="issues">
      <section className="ui-section" aria-labelledby="sec-issues">
        <SectionHeader id="sec-issues" title={ti('title')} note={ti('note')} />
        <FindingList items={items} />
      </section>
    </RunWorkspace>
  )
}
