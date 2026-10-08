import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from '@/lib/site'
import { EvidenceLadder } from '@/components/EvidenceLadder'

export const metadata: Metadata = {
  title: 'Evidence-Based SEO & GEO Diagnostic Workbench',
  description:
    'Veris diagnoses how visible your site is in Google Search and AI answer engines like ChatGPT, Perplexity, and Gemini — with evidence-graded findings, same-protocol retests, and human-approved recommendations.',
}

const VALUE_PROPS = [
  {
    title: 'Evidence-graded findings',
    body: 'Every finding carries evidence references and a claim type. “Measured” is reserved for hard, verifiable evidence.',
  },
  {
    title: 'Cross-engine AI visibility',
    body: 'Brand and topic visibility across AI engines and Google AI Overviews, with one repeatable protocol.',
  },
  {
    title: 'Grounded in your search data',
    body: 'Search Console integration ties the diagnosis to your own performance, not third-party estimates.',
  },
  {
    title: 'Human-approved recommendations',
    body: 'Nothing reaches the execution list until a person accepts or edits it.',
  },
]

// 首屏右侧的匿名案例：来自一次真实诊断（run_05face85，2026-07-18），对外不展示域名、日期等任何可识别信息
// （用户 2026-10-08 拍板：首屏不公开任何具体站点，最多以匿名案例出现）。
// 四条数字逐条对过库和该次报告（2026-10-08）：noindex 2 页（measured_hard）、无品牌提问 0/23（measured_sample）、
// AI 概览 19/21 出现、其中 2 次引用本站（Google SERP 实测）、健康分 74.6（P4 未评分，inferred）。
// 换摘录时必须换成另一次真实运行的数字，不能手写。
const PROOF: { lead: string; rest: string; level: 'hard' | 'sample' | 'inferred'; label: string }[] = [
  { lead: '2 pages are blocked from Google.', rest: 'They carry a noindex tag.', level: 'hard', label: 'Measured' },
  { lead: 'AI doesn’t recommend this site yet.', rest: 'Mentioned in 0 of 23 questions that don’t name the brand.', level: 'sample', label: 'Sampled' },
  { lead: 'AI Overviews rarely cite it.', rest: '19 of 21 queries showed an AI Overview; 2 cited the site.', level: 'hard', label: 'Measured' },
  { lead: 'Health score 74.6 / 100.', rest: 'Weighted across five areas; one area not scored.', level: 'inferred', label: 'Inferred' },
]

// JSON-LD：仅用 CLAUDE.md / plan-ux.md 已确认的产品事实，不含 offers/rating（方案 C-1 勘误：不部署 FAQPage / 不为无实据字段编造数据）。
const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Veris is an evidence-based SEO and GEO (Generative Engine Optimization) diagnostic workbench.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description:
      'Veris diagnoses website visibility in Google Search and AI answer engines (ChatGPT, Perplexity, Gemini, DeepSeek, Google AI Overviews), grading every finding by evidence strength and gating recommendations behind human approval.',
  },
]

export default function HomePage() {
  return (
    <main>
      {jsonLd.map((data) => (
        <script key={data['@type']} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <section className="mk-wrap mk-hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">An evidence-based SEO &amp; GEO diagnostic workbench</h1>
          <p className="mk-hero__lead">
            Veris shows you how visible your site really is in Google Search and in AI answer engines, and labels
            what’s proven versus what’s inferred, so you never confuse a hypothesis for a fact.
          </p>
          <div className="mk-cta">
            <a className="btn btn--primary" href={`mailto:${CONTACT_EMAIL}`}>
              Request early access
            </a>
            <Link href="/methodology">How we grade evidence</Link>
          </div>
        </div>

        <figure className="proof">
          <div className="proof__head">
            <span>Case · B2B document-tools site</span>
            <span>Anonymized</span>
          </div>
          <ul>
            {PROOF.map((item) => (
              <li key={item.lead}>
                <span>
                  <b>{item.lead}</b> {item.rest}
                </span>
                <span className={`ev ev--${item.level}`}>{item.label}</span>
              </li>
            ))}
          </ul>
          <figcaption>Anonymized excerpt from a real diagnostic run. Site details removed; every line links back to stored evidence.</figcaption>
        </figure>
      </section>

      <div className="mk-band">
        <section className="mk-wrap mk-sec" aria-labelledby="what-you-get">
          <div>
            <h2 id="what-you-get">What you get</h2>
            <p className="mk-sec__intro">Four things that keep the diagnosis honest.</p>
          </div>
          <div className="feat">
            {VALUE_PROPS.map((item) => (
              <div key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mk-band">
        <section className="mk-wrap mk-sec" aria-labelledby="evidence-ladder">
          <div>
            <h2 id="evidence-ladder">The evidence ladder</h2>
            <p className="mk-sec__intro">“Measured” appears only at L3 and L4.</p>
            <p className="mk-sec__intro">
              <Link href="/methodology">Read the full methodology</Link>
            </p>
          </div>
          <EvidenceLadder variant="short" />
        </section>
      </div>
    </main>
  )
}
