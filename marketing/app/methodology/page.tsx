import type { Metadata } from 'next'
import { EvidenceLadder } from '@/components/EvidenceLadder'

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How Veris grades evidence from L0 to L4, runs same-protocol retests, and gates every recommendation behind human review before it becomes an execution asset.',
}

// 方法论（ux-blueprint §7）：正文最宽 65ch，证据阶梯用表格，「What Veris is not」用列表。
export default function MethodologyPage() {
  return (
    <main className="mk-wrap mk-page">
      <header className="mk-page__head">
        <h1>How Veris grades evidence</h1>
        <p className="mk-page__lead">
          A conclusion is only as strong as the evidence under it. What can’t be verified stays labeled as a hypothesis
          or an inference — it never gets dressed up as a fact.
        </p>
      </header>

      <article className="prose">
        <h2>The evidence ladder — L0 to L4</h2>
        <p>
          Every finding Veris produces carries an evidence reference and a claim type. The <strong>“Measured”</strong>{' '}
          label in the product is reserved for L3 and L4 only — sampled and hard measurements. Anything below that is
          shown as a hypothesis or an inference, never as a fact.
        </p>
        <EvidenceLadder variant="long" />

        <h2>Same-protocol retest</h2>
        <p>
          Veris re-tests a site on a 4–6 week cadence, and every retest reuses the exact protocol of the original run:
          the same prompt set, the same market and language, the same model family, and the same sampling rule.
          Before/after comparisons are only drawn between runs with an identical protocol — changing any of those
          resets the baseline instead of producing a false apples-to-apples comparison.
        </p>

        <h2>Human-in-the-loop gate</h2>
        <p>
          Veris is a constrained orchestrator, not an autonomous publisher. Recommendations wait in a review queue until
          a person marks them <em>accepted</em> or <em>edited</em> — only those two states can produce execution-ready
          output such as briefs, prompts and task lists. Nothing ships to your team automatically, and the tool never
          states a number that isn’t backed by a stored evidence artifact.
        </p>

        <h2>What Veris is not</h2>
        <ul>
          <li>Not a rank tracker — keyword positions are not its core output.</li>
          <li>Not an auto-content generator — content and recommendations are reviewed by a person.</li>
          <li>Not an “AI SEO magic” black box — every claim traces back to a stored piece of evidence you can inspect.</li>
        </ul>
      </article>
    </main>
  )
}
