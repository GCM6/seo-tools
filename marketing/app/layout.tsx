import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { CONTACT_EMAIL, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'
import { fontVariables } from './fonts'
import './tokens.css'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Veris diagnoses how visible your site is in Google Search and in AI answer engines like ChatGPT, Perplexity, and Gemini — with evidence-graded findings and human-approved recommendations.',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
  },
}

// 暗色跟随系统：tokens.css 的暗色挂在 html.dark 上（与应用同一份 token），营销站没有主题开关，
// 所以只按 prefers-color-scheme 加 / 去 dark 类，并跟随系统切换。原生 <script>，随 SSR 输出、hydration 前执行。
const THEME_SCRIPT = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.classList.toggle('dark',m.matches)};a();if(m.addEventListener)m.addEventListener('change',a)}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="mk-top">
          <div className="mk-wrap mk-top__in">
            <Link href="/" className="mk-logo" aria-label={`${SITE_NAME} home`}>
              <Logo />
            </Link>
            <nav className="mk-nav" aria-label="Site">
              <Link href="/methodology">Methodology</Link>
              <Link href="/blog">Blog</Link>
              <a className="btn btn--primary btn--sm" href={`mailto:${CONTACT_EMAIL}`}>
                Request early access
              </a>
            </nav>
          </div>
        </header>
        <div id="main">{children}</div>
        <footer className="mk-foot">
          <div className="mk-wrap">
            &copy; {new Date().getFullYear()} {SITE_NAME}. Evidence-based SEO &amp; GEO diagnostics.
          </div>
        </footer>
      </body>
    </html>
  )
}
