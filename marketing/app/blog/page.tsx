import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Research and guides on SEO and GEO (Generative Engine Optimization) diagnostics from Veris — coming soon.',
}

export default function BlogIndexPage() {
  return (
    <main>
      <section className="hero shell">
        <h1>Research &amp; guides</h1>
        <p>
          Original, evidence-backed writing on SEO and AI-answer-engine visibility — coming soon.
        </p>
      </section>

      <section className="section">
        <div className="shell">
          <div className="empty-state">
            <p>
              <strong>Research &amp; guides coming soon.</strong>
            </p>
            <p>
              We publish once we have keyword research to back it — no content goes up without a
              validated topic behind it. Check back, or reach out at{' '}
              <a href="mailto:mingicelucky@gmail.com">mingicelucky@gmail.com</a> to be notified.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
