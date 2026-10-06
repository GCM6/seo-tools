import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

// [locale] 段内的 404（项目/诊断/会话不存在，或路径不存在）：保留站点导航，文案本地化，
// 给出返回项目列表的出口，而不是 Next 默认的英文 404 空白页。
export default async function LocaleNotFound() {
  const [t, locale] = await Promise.all([getTranslations('notFound'), getLocale()])
  return (
    <section className="screen show card" style={{ padding: '16px' }}>
      <h2>{t('title')}</h2>
      <p className="note">{t('description')}</p>
      <div className="flex gap-4" style={{ marginTop: '16px' }}>
        <Link href={`/${locale}/projects`} className="act acc on">
          {t('backToProjects')}
        </Link>
      </div>
    </section>
  )
}
