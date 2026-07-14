import { setRequestLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { BrandFactRow, type FactStatus } from '@/components/BrandFactRow'
import { getRun, getProject, getBrandFacts } from '@/lib/repositories'
import { addBrandFact, setBrandFactStatus, removeBrandFact } from './actions'

// 品牌事实管理（spec §5.1-1）。Server Component（Next 16：await params）。
// 列出 project 级 brand_facts + 添加表单；verified 是人在环闸门——只有它可注入提示词。
export default async function FactsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const [t, run] = await Promise.all([getTranslations('facts'), getRun(id)])
  if (!run) notFound()
  const project = await getProject(run.projectId)
  if (!project) notFound()

  const facts = await getBrandFacts(project.id)

  return (
    <Shell runId={id} domain={project.domain}>
      <section className="screen show">
        <div className="sec-h">
          <h2>{t('title')}</h2>
          <span className="meta">{t('meta')}</span>
        </div>

        <div className="note" style={{ marginBottom: 12 }}>
          {t('gateNotice')}
        </div>

        <div className="card">
          {facts.length ? (
            facts.map((f) => (
              <BrandFactRow
                key={f.id}
                fact={{
                  id: f.id,
                  factType: f.factType,
                  factText: f.factText,
                  sourceUrl: f.sourceUrl,
                  sourceNote: f.sourceNote,
                  status: f.status as FactStatus,
                }}
                labels={{
                  verify: t('verify'),
                  verified: t('verified'),
                  retire: t('retire'),
                  retired: t('retired'),
                  draft: t('draft'),
                  remove: t('remove'),
                  sourceLabel: t('colSource'),
                }}
                onSetStatus={async (fid, status) => {
                  'use server'
                  await setBrandFactStatus(fid, status, id, locale)
                }}
                onRemove={async (fid) => {
                  'use server'
                  await removeBrandFact(fid, id, locale)
                }}
              />
            ))
          ) : (
            <div className="pending-block">{t('empty')}</div>
          )}
        </div>

        <div className="sec-h" style={{ marginTop: 20 }}>
          <h2>{t('addTitle')}</h2>
        </div>
        <form
          className="card"
          style={{ display: 'grid', gap: 10 }}
          action={async (formData: FormData) => {
            'use server'
            await addBrandFact({
              projectId: project.id,
              runId: id,
              locale,
              factType: String(formData.get('factType') ?? ''),
              factText: String(formData.get('factText') ?? ''),
              sourceUrl: String(formData.get('sourceUrl') ?? ''),
              sourceNote: String(formData.get('sourceNote') ?? ''),
            })
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="fb-l">{t('typeLabel')}</span>
            <input name="factType" required placeholder={t('typePlaceholder')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="fb-l">{t('factLabel')}</span>
            <textarea name="factText" required placeholder={t('factPlaceholder')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="fb-l">{t('sourceUrlLabel')}</span>
            <input name="sourceUrl" type="url" placeholder="https://…" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="fb-l">{t('sourceNoteLabel')}</span>
            <input name="sourceNote" />
          </label>
          <div>
            <button type="submit" className="act acc on">
              {t('add')}
            </button>
          </div>
        </form>

        <div className="note" style={{ marginTop: 16 }}>
          <Link href={`/${locale}/runs/${id}/output`} className="underline underline-offset-2">
            {t('backToOutput')}
          </Link>
        </div>
      </section>
    </Shell>
  )
}
