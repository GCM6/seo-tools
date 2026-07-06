import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { collectEvidence } from '@/lib/inngest/collect-evidence'
import { generateFindings } from '@/lib/inngest/generate-findings'
import { reevaluateCompetitors } from '@/lib/inngest/reevaluate-competitors'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [collectEvidence, generateFindings, reevaluateCompetitors],
})
