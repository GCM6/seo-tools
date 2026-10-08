import { getTranslations } from 'next-intl/server'

// 分享链接无效或已过期（ux-blueprint §5 状态）：一句说明 + 怎么办，纯文本，不放 mailto 按钮。
// 这里拿不到分享行的语言（token 无效），中英文各写一遍；过期和不存在说法相同，不泄露报告是否存在。
export default async function ShareNotFound() {
  const [zh, en] = await Promise.all([
    getTranslations({ locale: 'zh', namespace: 'share' }),
    getTranslations({ locale: 'en', namespace: 'share' }),
  ])
  return (
    <main className="ui-share">
      <article className="ui-doc ui-doc--message">
        <p className="ui-doc__brand">
          <span className="ui-doc__brand-name">Veris</span>
        </p>
        <h1 className="ui-doc__title">{zh('expiredTitle')}</h1>
        <p className="ui-result__note">{zh('expiredBody')}</p>
        <div lang="en" className="ui-doc__alt">
          <p>
            <b>{en('expiredTitle')}</b>
          </p>
          <p className="ui-result__note">{en('expiredBody')}</p>
        </div>
      </article>
    </main>
  )
}
