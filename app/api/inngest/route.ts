import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { collectEvidence } from '@/lib/inngest/collect-evidence'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [collectEvidence],
})
