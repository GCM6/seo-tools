import { describe, it, expect } from 'vitest'
import { computeProtocolHash, chooseProtocolAnchor, type ProtocolInputs, type PriorRun } from './protocol'

const base: ProtocolInputs = {
  industry: 'document metadata removal tool', market: 'global-en', language: 'en',
  competitors: ['metacleaner.com'], brandAliases: ['MetaDocu'], targetKeywords: ['remove pdf metadata'],
  confirmedCompetitors: ['metadata2go.com'], engines: ['deepseek', 'Google AI Overviews'], promptTemplateVersion: 'template_v2',
}

describe('computeProtocolHash', () => {
  it('列表顺序、大小写、首尾空白、重复项不影响指纹', () => {
    const shuffled = { ...base, engines: ['Google AI Overviews ', 'DEEPSEEK', 'deepseek'], competitors: [' MetaCleaner.com'] }
    expect(computeProtocolHash(shuffled)).toBe(computeProtocolHash(base))
  })

  it.each([
    ['industry', { industry: 'pdf editor' }],
    ['market', { market: 'us' }],
    ['language', { language: 'de' }],
    ['competitors', { competitors: [] }],
    ['brandAliases', { brandAliases: ['Meta Docu'] }],
    ['targetKeywords', { targetKeywords: ['pdf metadata'] }],
    ['confirmedCompetitors', { confirmedCompetitors: [] }],
    ['engines', { engines: ['deepseek'] }],
    ['promptTemplateVersion', { promptTemplateVersion: 'template_v3' }],
  ])('%s 变了 → 指纹变', (_name, patch) => {
    expect(computeProtocolHash({ ...base, ...patch })).not.toBe(computeProtocolHash(base))
  })
})

const run = (over: Partial<PriorRun>): PriorRun => ({
  id: 'run_x', runType: 'baseline', status: 'reviewing', protocolHash: 'h1', baselineRunId: null, protocolVersion: 'v2',
  startedAt: '2026-10-01T00:00:00.000Z', finishedAt: '2026-10-01T00:10:00.000Z', ...over,
})

describe('chooseProtocolAnchor', () => {
  it('没有历史 → 新协议', () => {
    expect(chooseProtocolAnchor('h1', [])).toEqual({ runType: 'baseline' })
  })
  it('最近一次已完成且指纹相同的是基线 → 沿用它', () => {
    expect(chooseProtocolAnchor('h1', [run({ id: 'run_a' })])).toEqual({ runType: 'retest', baselineRunId: 'run_a' })
  })
  it('最近一次是沿用协议的体检 → 沿用它的协议起点', () => {
    const runs = [run({ id: 'run_a' }), run({ id: 'run_b', runType: 'retest', baselineRunId: 'run_a', startedAt: '2026-10-05T00:00:00.000Z' })]
    expect(chooseProtocolAnchor('h1', runs)).toEqual({ runType: 'retest', baselineRunId: 'run_a' })
  })
  it('失败或进行中的体检不能当协议起点', () => {
    expect(chooseProtocolAnchor('h1', [run({ status: 'failed' }), run({ id: 'run_c', status: 'collecting' })])).toEqual({ runType: 'baseline' })
  })
  it('指纹不同 → 新协议；旧体检指纹为空 → 新协议', () => {
    expect(chooseProtocolAnchor('h2', [run({})])).toEqual({ runType: 'baseline' })
    expect(chooseProtocolAnchor('h1', [run({ protocolHash: null })])).toEqual({ runType: 'baseline' })
  })
  it('开始时间为空时回落到完成时间排序', () => {
    const runs = [run({ id: 'run_old', startedAt: null, finishedAt: '2026-09-01T00:00:00.000Z' }), run({ id: 'run_new', startedAt: null, finishedAt: '2026-10-01T00:00:00.000Z' })]
    expect(chooseProtocolAnchor('h1', runs)).toEqual({ runType: 'retest', baselineRunId: 'run_new' })
  })
})
