import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { collectEvidence } from '@/lib/inngest/collect-evidence'
import { generateFindings } from '@/lib/inngest/generate-findings'
import { reevaluateCompetitors } from '@/lib/inngest/reevaluate-competitors'
import { rulesEvolutionScan } from '@/lib/inngest/rules-evolution'
import {
  googleKnowledgeIngestion,
  manualKnowledgeIngestion,
  redditActiveThreadRefresh,
  redditKnowledgeIngestion,
} from '@/lib/inngest/knowledge-ingestion'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    collectEvidence,
    generateFindings,
    reevaluateCompetitors,
    rulesEvolutionScan,
    googleKnowledgeIngestion,
    redditKnowledgeIngestion,
    redditActiveThreadRefresh,
    manualKnowledgeIngestion,
  ],
})
