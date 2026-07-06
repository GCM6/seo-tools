import { channel, topic } from '@inngest/realtime'

export type RunProgressMessage =
  | { type: 'progress'; pct: number }
  | {
      type: 'evidence_created'
      evidenceType:
        | 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' | 'sitemap' | 'site_audit' | 'psi' | 'gsc'
        | 'dataforseo_serp' | 'dataforseo_labs' | 'dataforseo_backlinks'
        | 'ua_probe' | 'third_party_presence'
    }
  | {
      type: 'phase'
      phase: 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes' | 'diagnose'
      checked?: number
      total?: number
      // diagnose 阶段专用：当前支柱与累计 findings 数（其余阶段留空，形状保持兼容）。
      pillar?: string
      findings?: number
    }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export const runProgressChannel = channel((runId: string) => `run:${runId}`).addTopic(
  topic('progress').type<RunProgressMessage>(),
)
