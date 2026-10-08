import type { Metadata } from 'next'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Research and guides on SEO and GEO (Generative Engine Optimization) diagnostics from Veris.',
}

// 博客列表（ux-blueprint §7）：还没有文章时明确写「No posts yet」+ 一句说明，不留空白页。
// 选词完成前不发文章（方案红线「先词后页」），文章页路由 [slug] 目前不产出任何页面。
export default function BlogIndexPage() {
  return (
    <main className="mk-wrap mk-page">
      <header className="mk-page__head">
        <h1>Research &amp; guides</h1>
        <p className="mk-page__lead">Evidence-backed writing on SEO and AI answer-engine visibility.</p>
      </header>

      <div className="mk-empty">
        <p className="mk-empty__title">No posts yet</p>
        <p>
          We publish only when a topic is backed by keyword research. Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to hear when the first one is out.
        </p>
      </div>
    </main>
  )
}
