import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How Veris grades evidence from L0 to L4, runs same-protocol retests, and gates every recommendation behind human review before it becomes an execution asset.',
}

const LADDER = [
  {
    level: 'L0',
    label: 'Unsupported',
    body: "Not allowed to be stored as a conclusion at all — an opinion with no evidence behind it (e.g. \"I think the competitor is doing better\").",
    measured: false,
  },
  {
    level: 'L1',
    label: 'Hypothesis',
    body: 'An unverified assumption, labeled as "suspected" — for example, a possible link to a SERP feature that hasn\'t been checked yet.',
    measured: false,
  },
  {
    level: 'L2',
    label: 'Inferred',
    body: 'A conclusion derived from evidence, labeled as "inferred" — for example, low click-through rate combined with an AI Overview present on the SERP, suspected (not proven) to be capturing clicks. Inference is never written up as settled causation.',
    measured: false,
  },
  {
    level: 'L3',
    label: 'Measured (sample)',
    body: 'A directional measurement from a defined sample — for example, running 20 prompts across AI engines, 5 times each, and counting how often a brand actually appears.',
    measured: true,
  },
  {
    level: 'L4',
    label: 'Measured (hard)',
    body: 'A hard, directly observed measurement — for example, "Google Search Console: 0.8% CTR over the last 28 days" or "the initial HTML contains 0 characters of body text."',
    measured: true,
  },
]

export default function MethodologyPage() {
  return (
    <main>
      <section className="hero shell">
        <h1>How Veris grades evidence</h1>
        <p>
          The core rule behind every part of Veris: a conclusion is only as strong as the
          evidence under it. What can&apos;t be verified stays labeled as a hypothesis or an
          inference — it never gets dressed up as a fact.
        </p>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section__heading">
            <h2>The evidence ladder — L0 to L4</h2>
            <p>
              Every finding Veris produces carries an evidence reference and a claim type. The{' '}
              <strong>&quot;measured&quot;</strong> label in the product UI is reserved for L3 and
              L4 only — sampled and hard measurements. Anything below that is shown as a
              hypothesis or an inference, never as a fact.
            </p>
          </div>

          <div className="ladder">
            {LADDER.map((row) => (
              <div
                className={`ladder__row${row.measured ? ' ladder__row--measured' : ''}`}
                key={row.level}
              >
                <div className="ladder__level">
                  {row.level}
                  {row.measured && <span className="tag">measured</span>}
                </div>
                <div className="ladder__label">{row.label}</div>
                <p style={{ margin: 0, fontSize: '0.95rem' }}>{row.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--muted">
        <div className="shell prose">
          <h2>Same-protocol retest</h2>
          <p>
            Veris re-tests a site on a 4–6 week cadence, and every retest reuses the exact same
            protocol as the original run: the same prompt set, the same market and language, the
            same model family, and the same sampling rule. Before/after comparisons are only ever
            drawn between runs that used an identical protocol — changing any of those variables
            resets the baseline instead of producing a false apples-to-apples comparison.
          </p>

          <h2>Human-in-the-loop gate</h2>
          <p>
            Veris is a constrained orchestrator, not an autonomous publisher. Recommendations sit
            in a review queue until a human marks them <em>accepted</em> or <em>edited</em> — only
            those two states are allowed to generate execution-ready output (briefs, prompts,
            task lists). Nothing ships to your team automatically, and the tool never invents a
            number that isn&apos;t backed by a stored evidence artifact.
          </p>

          <h2>What Veris is not</h2>
          <ul>
            <li>Not a rank tracker — it does not report keyword positions as its core output.</li>
            <li>Not an auto-content generator — content and recommendations are human-reviewed.</li>
            <li>
              Not an &quot;AI SEO magic&quot; black box — every claim traces back to a stored
              piece of evidence you can inspect.
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
