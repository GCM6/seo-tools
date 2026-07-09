import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-nav">
          <div className="shell site-nav__row">
            <Link href="/" className="site-nav__logo">
              {SITE_NAME}
            </Link>
            <ul className="site-nav__links">
              <li>
                <Link href="/methodology">Methodology</Link>
              </li>
              <li>
                <Link href="/blog">Blog</Link>
              </li>
              <li>
                <a href="mailto:mingicelucky@gmail.com">Request early access</a>
              </li>
            </ul>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell">
            &copy; {new Date().getFullYear()} {SITE_NAME}. Evidence-based SEO &amp; GEO
            diagnostics.
          </div>
        </footer>
      </body>
    </html>
  )
}
