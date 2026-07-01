import { describe, it, expect } from 'vitest'
import { COLLECT_REQUESTED_EVENT, buildCollectRequestedEvent } from './events'

describe('buildCollectRequestedEvent', () => {
  it('builds an Inngest event payload from a run and its entry URL', () => {
    const event = buildCollectRequestedEvent({ id: 'run_1', projectId: 'proj_1' }, 'https://teamflow.cn')
    expect(event).toEqual({
      name: COLLECT_REQUESTED_EVENT,
      data: { runId: 'run_1', projectId: 'proj_1', url: 'https://teamflow.cn' },
    })
  })
})
