import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Evidence-Based SEO & GEO Diagnostic Workbench',
  description:
    'Veris diagnoses how visible your site is in Google Search and AI answer engines like ChatGPT, Perplexity, and Gemini — with evidence-graded findings, same-protocol retests, and human-approved recommendations.',
}

const VALUE_PROPS = [
  {
    title: 'Evidence-graded findings',
    body: "Every finding carries evidence references and a claim type. The 'measured' label is reserved for hard, verifiable evidence — not guesses dressed up as facts.",
  },
  {
    title: 'Cross-engine AI visibility',
    body: 'Probes your brand and topic visibility across ChatGPT, Perplexity, Gemini, DeepSeek, and Google AI Overviews, using a consistent, repeatable protocol.',
  },
  {
    title: 'Grounded in your real search data',
    body: 'Google Search Console integration grounds diagnosis in your own search performance — not third-party rank-tracker estimates.',
  },
  {
    title: 'Human-approved recommendations',
    body: 'Nothing reaches your execution queue automatically. A human reviews and accepts or edits every recommendation before it becomes an output.',
  },
]

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  description:
    'Veris is an evidence-based SEO and GEO (Generative Engine Optimization) diagnostic workbench.',
}

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description:
    'Veris diagnoses website visibility in Google Search and AI answer engines (ChatGPT, Perplexity, Gemini, DeepSeek, Google AI Overviews), grading every finding by evidence strength and gating recommendations behind human approval.',
}

export default function HomePage() {
  return (
    <main>
      {/* JSON-LD：仅用 CLAUDE.md / plan-ux.md 已确认的产品事实，不含 offers/rating（方案 C-1 勘误：不部署 FAQPage / 不为无实据字段编造数据）。 */}
      <Script
        id="ld-organization"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <Script
        id="ld-software-application"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />

      <section className="hero shell">
        <h1>An evidence-based SEO &amp; GEO diagnostic workbench</h1>
        <p>
          Veris shows you how visible your site really is in Google Search and in AI answer
          engines — and labels what&apos;s proven versus what&apos;s inferred, so you never
          confuse a hypothesis for a fact.
        </p>
        <a className="btn btn--primary" href="mailto:mingicelucky@gmail.com">
          Request early access
        </a>
      </section>

      <section className="section">
        <div className="shell">
          <div className="card-grid">
            {VALUE_PROPS.map((item) => (
              <div className="card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--muted">
        <div className="shell prose" style={{ textAlign: 'center' }}>
          <h2>Fact, measurement, and inference — kept separate</h2>
          <p>
            Every conclusion Veris produces is traceable back to evidence. Findings are graded on
            an L0–L4 ladder, from unsupported claims up to hard measured evidence, and
            recommendations only become execution-ready prompts after a human accepts or edits
            them. Retests reuse the same prompt set, market/language, model family, and sampling
            rule as the original run, so before/after comparisons are actually comparable.
          </p>
          <p>
            <Link href="/methodology">Read the full methodology &rarr;</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="shell" style={{ textAlign: 'center' }}>
          <h2>Want early access?</h2>
          <p>
            We&apos;re onboarding a limited number of teams as we build out Veris. Reach out and
            we&apos;ll follow up directly.
          </p>
          <a className="btn btn--primary" href="mailto:mingicelucky@gmail.com">
            Request early access
          </a>
        </div>
      </section>
    </main>
  )
}
