import { describe, it, expect, vi } from 'vitest'
import { rulesEvolutionScanHandler } from './rules-evolution'
import type { RulesEvolutionDeps } from './rules-evolution'

// fake step：模拟 Inngest 的 JSON 序列化边界（捕获不可序列化返回）。
function makeArgs() {
  return { step: { run: async <T,>(_id: string, fn: () => Promise<T>) => JSON.parse(JSON.stringify(await fn())) as T } }
}

const FIXED_NOW = new Date('2026-08-01T00:00:00Z')

// 镜像 reevaluate-competitors.test.ts：deps 用宽松对象 + asDeps 转型（真实仓库函数返回
// Drizzle 查询构造器而非 Promise，`typeof` DI 接口无法直接吃 vi.fn，故沿用既有转型模式）。
function makeDeps(over: Record<string, unknown> = {}) {
  return {
    now: () => FIXED_NOW,
    getReferenceArtifacts: vi.fn(async () => [] as unknown[]),
    getPendingProposalKeys: vi.fn(async () => new Set<string>()),
    createRuleChangeProposal: vi.fn(async (_row: unknown) => [{}] as unknown[]),
    getFindingStatRecords: vi.fn(async () => [] as unknown[]),
    getRecStatRecords: vi.fn(async () => [] as unknown[]),
    ...over,
  }
}

function asDeps(deps: ReturnType<typeof makeDeps>): RulesEvolutionDeps {
  return deps as unknown as RulesEvolutionDeps
}

describe('rulesEvolutionScanHandler', () => {
  it('超期资产入队 scheduled_research 提案', async () => {
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: 'https://ua.doc', lastVerifiedAt: '2026-01-01T00:00:00Z', refreshCadenceDays: 90, payload: null },
      ]),
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), asDeps(deps))
    expect(res.enqueued).toBe(1)
    expect(deps.createRuleChangeProposal).toHaveBeenCalledTimes(1)
    const arg = deps.createRuleChangeProposal.mock.calls[0][0] as {
      source: string; changeType: string; target: string; evidenceRefs: string[]
    }
    expect(arg.source).toBe('scheduled_research')
    expect(arg.changeType).toBe('update_artifact')
    expect(arg.target).toBe('ua')
    expect(arg.evidenceRefs).toEqual(['https://ua.doc'])
  })

  it('已有同 source::target 的 pending 提案则跳过（幂等）', async () => {
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: 'https://ua.doc', lastVerifiedAt: '2026-01-01T00:00:00Z', refreshCadenceDays: 90, payload: null },
      ]),
      getPendingProposalKeys: vi.fn(async () => new Set(['scheduled_research::ua'])),
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), asDeps(deps))
    expect(res.enqueued).toBe(0)
    expect(deps.createRuleChangeProposal).not.toHaveBeenCalled()
  })

  it('超期但 sourceUrl 为空的资产跳过（无一手来源不入库）', async () => {
    const deps = makeDeps({
      getReferenceArtifacts: vi.fn(async () => [
        { artifactKey: 'ua', version: 'v1', sourceUrl: '', lastVerifiedAt: null, refreshCadenceDays: 90, payload: null },
      ]),
    })
    const res = await rulesEvolutionScanHandler(makeArgs(), asDeps(deps))
    expect(res.enqueued).toBe(0)
    expect(deps.createRuleChangeProposal).not.toHaveBeenCalled()
  })
})
