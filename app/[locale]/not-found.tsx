import { getLocale, getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/Button'

// [locale] 段内的 404（项目/诊断/会话不存在，或路径不存在）：保留站点导航，文案本地化，
// 「页面不存在」+ 一句原因 + [返回项目]（ux-blueprint §6），而不是 Next 默认的英文 404 空白页。
export default async function LocaleNotFound() {
  const [t, locale] = await Promise.all([getTranslations('notFound'), getLocale()])
  return (
    <section className="ui-panel ui-error-page">
      <h1 className="ui-error-page__title">{t('title')}</h1>
      <p className="ui-result__note">{t('description')}</p>
      <ButtonLink href={`/${locale}/projects`} variant="primary">
        {t('backToProjects')}
      </ButtonLink>
    </section>
  )
}
