import { channel, topic } from '@inngest/realtime'

export type RunProgressMessage =
  | { type: 'progress'; pct: number }
  | {
      type: 'evidence_created'
      evidenceType: 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' | 'sitemap' | 'site_audit'
    }
  | { type: 'phase'; phase: 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes'; checked?: number; total?: number }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export const runProgressChannel = channel((runId: string) => `run:${runId}`).addTopic(
  topic('progress').type<RunProgressMessage>(),
)
