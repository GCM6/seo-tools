import { setRequestLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { BrandFactRow, type FactStatus } from '@/components/BrandFactRow'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/Button'
import { getRun, getProject, getBrandFacts } from '@/lib/repositories'
import { addBrandFact, setBrandFactStatus, removeBrandFact } from './actions'

// 品牌事实（ux-blueprint §3.6；spec §5.1-1）。Server Component（Next 16：await params）。
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

  const verifiedCount = facts.filter((f) => f.status === 'verified').length

  return (
    <RunWorkspace runId={id} locale={locale} current="facts">
      <section className="ui-section">
        <SectionHeader title={t('title')} note={t('countLine', { total: facts.length, verified: verifiedCount })} />
        <div className="grid grid-cols-1 gap-8">
          <div className="grid grid-cols-1 gap-3">
            <Notice>{t('gateNotice')}</Notice>
            {facts.length ? (
              <ul className="ui-panel ui-facts-list">
                {facts.map((f) => (
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
                      unverify: t('unverify'),
                      retire: t('retire'),
                      restore: t('restore'),
                      retired: t('retired'),
                      draft: t('draft'),
                      remove: t('remove'),
                      removeConfirm: t('removeConfirm'),
                      cancel: t('cancel'),
                      sourceLabel: t('colSource'),
                      error: t('error'),
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
                ))}
              </ul>
            ) : (
              <div className="ui-panel"><EmptyState title={t('emptyTitle')} description={t('empty')} /></div>
            )}
          </div>

          <section className="ui-subsec" aria-labelledby="facts-add">
            <h3 id="facts-add" className="ui-subsec__title">
              {t('addTitle')}
            </h3>
            <form
              className="ui-panel ui-form"
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
              <div className="ui-field">
                <label className="ui-label" htmlFor="fact-type">
                  {t('typeLabel')}
                </label>
                <input id="fact-type" className="ui-input" name="factType" required placeholder={t('typePlaceholder')} />
              </div>
              <div className="ui-field ui-form__wide">
                <label className="ui-label" htmlFor="fact-text">
                  {t('factLabel')}
                </label>
                <textarea id="fact-text" className="ui-textarea" name="factText" rows={4} required placeholder={t('factPlaceholder')} />
                <p className="ui-hint">{t('factHint')}</p>
              </div>
              <div className="ui-field">
                <label className="ui-label" htmlFor="fact-source-url">
                  {t('sourceUrlLabel')}
                </label>
                <input id="fact-source-url" className="ui-input" name="sourceUrl" type="url" placeholder="https://…" />
              </div>
              <div className="ui-field">
                <label className="ui-label" htmlFor="fact-source-note">
                  {t('sourceNoteLabel')}
                </label>
                <input id="fact-source-note" className="ui-input" name="sourceNote" placeholder={t('sourceNotePlaceholder')} />
              </div>
              <div className="ui-form__actions">
                <Button type="submit" variant="primary">
                  {t('add')}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </RunWorkspace>
  )
}
