import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { collectEvidenceHandler } from './collect-evidence'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { NewEvidenceArtifact } from '@/lib/repositories'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    assertPublicUrl: vi.fn(async (u: string) => new URL(u)),
    fetchPageFacts: vi.fn(async () => ({
      rawHtml: '<html><body>hi</body></html>',
      mainTextChars: 2,
      canonicalUrl: 'https://teamflow.cn/',
      metaRobots: 'index,follow',
    })),
    fetchRobotsCheck: vi.fn(async () => ({ allowed: true, rawText: '' })),
    extractSchema: vi.fn(() => ({ types: ['Organization'], raw: [{ '@type': 'Organization' }] })),
    renderProvider: {
      renderMainText: vi.fn(async () => ({ html: '<html>rendered</html>', mainTextChars: 400 })),
    },
    createEvidenceArtifact: vi.fn(async (input: NewEvidenceArtifact) => [input]),
    markRunStatus: vi.fn(async () => undefined),
    ...overrides,
  }
}

// deps 保留 vi.fn() 的 Mock 类型（断言里要用 .mock.calls），只在传给
// collectEvidenceHandler 时转成它期望的 CollectDeps 形状。
function asCollectDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof collectEvidenceHandler>[1] {
  return deps as unknown as Parameters<typeof collectEvidenceHandler>[1]
}

function makeArgs() {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1', url: 'https://teamflow.cn' } },
      step: { run: async <T,>(_id: string, fn: () => Promise<T> | T) => fn() },
      publish: async (msg: unknown) => {
        published.push(msg)
      },
    },
    published,
  }
}

describe('collectEvidenceHandler', () => {
  it('runs all four checks, persists three L4 evidence artifacts, and marks the run collected', async () => {
    const deps = makeDeps()
    const { args, published } = makeArgs()

    const result = await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(result).toEqual({ status: 'collected' })
    expect(deps.fetchPageFacts).toHaveBeenCalledWith('https://teamflow.cn/')
    expect(deps.fetchRobotsCheck).toHaveBeenCalledWith('https://teamflow.cn/')
    expect(deps.renderProvider.renderMainText).toHaveBeenCalledWith('https://teamflow.cn/')

    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(3)
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(['page_fetch', 'schema', 'render_check'])
    deps.createEvidenceArtifact.mock.calls.forEach((c) => expect(c[0].claimLevel).toBe('L4'))

    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.objectContaining({ finishedAt: expect.any(String) }))

    const progressValues = published.map((m: unknown) => (m as { data: { pct?: number } }).data.pct).filter((v) => v !== undefined)
    expect(progressValues).toEqual([10, 40, 60, 90])
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'done')).toBe(true)
  })

  it('short-circuits on SSRF-blocked URLs: marks failed, publishes failed, throws NonRetriableError', async () => {
    const deps = makeDeps({
      assertPublicUrl: vi.fn(async () => {
        throw new SsrfBlockedError('blocked private/reserved address: 10.0.0.5')
      }),
    })
    const { args, published } = makeArgs()

    await expect(collectEvidenceHandler(args, asCollectDeps(deps))).rejects.toThrow(NonRetriableError)

    expect(deps.fetchPageFacts).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'failed')
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'failed')).toBe(true)
  })
})
