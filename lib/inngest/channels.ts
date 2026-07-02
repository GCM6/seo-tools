import { channel, topic } from '@inngest/realtime'

export type RunProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export const runProgressChannel = channel((runId: string) => `run:${runId}`).addTopic(
  topic('progress').type<RunProgressMessage>(),
)
