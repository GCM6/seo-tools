export const COLLECT_REQUESTED_EVENT = 'veris/run.collect.requested' as const

export interface CollectRequestedEventData {
  runId: string
  projectId: string
  url: string
}

export function buildCollectRequestedEvent(run: { id: string; projectId: string }, url: string) {
  return {
    name: COLLECT_REQUESTED_EVENT,
    data: { runId: run.id, projectId: run.projectId, url } satisfies CollectRequestedEventData,
  }
}
