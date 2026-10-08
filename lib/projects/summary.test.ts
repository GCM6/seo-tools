import { describe, it, expect } from 'vitest'
import { pickLatestRun, pickActiveRun, pickRetestAnchor, type RunLike } from './summary'

const r = (id: string, startedAt: string | null): RunLike => ({
  id,
  runType: 'baseline',
  status: 'output',
  startedAt,
  finishedAt: null,
})

// pickActiveRun / pickRetestAnchor 用的通用 fixture：可指定 runType/status。
const run = (
  id: string,
  opts: { runType?: string; status?: string; startedAt?: string | null } = {},
): RunLike => ({
  id,
  runType: opts.runType ?? 'baseline',
  status: opts.status ?? 'output',
  startedAt: opts.startedAt ?? null,
  finishedAt: null,
})

describe('pickLatestRun', () => {
  it('空数组返回 null', () => {
    expect(pickLatestRun([])).toBeNull()
  })

  it('挑 startedAt 最大的 run', () => {
    const picked = pickLatestRun([
      r('a', '2026-07-01T00:00:00Z'),
      r('c', '2026-07-05T00:00:00Z'),
      r('b', '2026-07-03T00:00:00Z'),
    ])
    expect(picked?.id).toBe('c')
  })

  it('startedAt 为 null 的排在有值之后', () => {
    const picked = pickLatestRun([r('draft', null), r('started', '2026-07-01T00:00:00Z')])
    expect(picked?.id).toBe('started')
  })

  it('单个 run 直接返回', () => {
    expect(pickLatestRun([r('only', null)])?.id).toBe('only')
  })
})

// 真实形状（10-08 查本地库 metadocu 项目，按插入顺序）：基线 run 从不写 startedAt（只有回测路由写），
// 时间只在 finishedAt。上面的夹具都是「startedAt 有值、finishedAt 为空」，真实采集产不出这种基线。
describe('startedAt 为空时回落 finishedAt（真实基线的形状）', () => {
  const real: RunLike[] = [
    { id: 'b_0712', runType: 'baseline', status: 'reviewing', startedAt: null, finishedAt: '2026-07-12T14:39:06.171Z' },
    { id: 'r_0713', runType: 'retest', status: 'reviewing', startedAt: '2026-07-13T07:05:02.556Z', finishedAt: '2026-07-13T07:15:05.804Z' },
    { id: 'b_0718', runType: 'baseline', status: 'output', startedAt: null, finishedAt: '2026-07-18T14:36:24.377Z' },
    { id: 'b_1003', runType: 'baseline', status: 'reviewing', startedAt: null, finishedAt: '2026-10-03T08:38:32.687Z' },
    { id: 'b_1006', runType: 'baseline', status: 'reviewing', startedAt: null, finishedAt: '2026-10-06T02:50:23.487Z' },
  ]

  it('最近一次是 10-06 的基线，而不是唯一带 startedAt 的 07-13 回测', () => {
    expect(pickLatestRun(real)?.id).toBe('b_1006')
  })

  it('回测锚点是最新完成的基线（10-06），而不是最早的那条（07-12）', () => {
    expect(pickRetestAnchor(real)?.id).toBe('b_1006')
  })
})

describe('pickActiveRun', () => {
  it('空数组返回 null', () => {
    expect(pickActiveRun([])).toBeNull()
  })

  it('只有 failed run 时返回 null（failed 不计入 active）', () => {
    const picked = pickActiveRun([run('a', { status: 'failed' })])
    expect(picked).toBeNull()
  })

  it('reviewing 不计为进行中', () => {
    const picked = pickActiveRun([run('a', { status: 'reviewing' })])
    expect(picked).toBeNull()
  })

  it('存在多条进行中 run 时取 startedAt 最新的一条', () => {
    const picked = pickActiveRun([
      run('a', { status: 'collecting', startedAt: '2026-07-01T00:00:00Z' }),
      run('b', { status: 'diagnosing', startedAt: '2026-07-05T00:00:00Z' }),
      run('c', { status: 'draft', startedAt: '2026-07-03T00:00:00Z' }),
    ])
    expect(picked?.id).toBe('b')
  })

  it('混合 active 与非 active 时只从 active 里挑', () => {
    const picked = pickActiveRun([
      run('done', { status: 'output', startedAt: '2026-07-10T00:00:00Z' }),
      run('active', { status: 'collected', startedAt: '2026-07-01T00:00:00Z' }),
      run('failed', { status: 'failed', startedAt: '2026-07-09T00:00:00Z' }),
    ])
    expect(picked?.id).toBe('active')
  })
})

describe('pickRetestAnchor', () => {
  it('空数组返回 null', () => {
    expect(pickRetestAnchor([])).toBeNull()
  })

  it('只有 failed run 时返回 null', () => {
    const picked = pickRetestAnchor([run('a', { status: 'failed' })])
    expect(picked).toBeNull()
  })

  it('reviewing 计为完成态，可作回测锚点', () => {
    const picked = pickRetestAnchor([run('a', { runType: 'baseline', status: 'reviewing' })])
    expect(picked?.id).toBe('a')
  })

  it('output 计为完成态，可作回测锚点', () => {
    const picked = pickRetestAnchor([run('a', { runType: 'baseline', status: 'output' })])
    expect(picked?.id).toBe('a')
  })

  it('最新一条是已完成的 retest，但存在更早已完成的 baseline 时，返回该 baseline', () => {
    const picked = pickRetestAnchor([
      run('baseline_1', { runType: 'baseline', status: 'reviewing', startedAt: '2026-07-01T00:00:00Z' }),
      run('retest_1', { runType: 'retest', status: 'output', startedAt: '2026-07-05T00:00:00Z' }),
    ])
    expect(picked?.id).toBe('baseline_1')
  })

  it('进行中的 baseline 不算完成，不能作锚点', () => {
    const picked = pickRetestAnchor([run('a', { runType: 'baseline', status: 'collecting' })])
    expect(picked).toBeNull()
  })

  it('存在多条完成 baseline 时取 startedAt 最新的一条', () => {
    const picked = pickRetestAnchor([
      run('older', { runType: 'baseline', status: 'output', startedAt: '2026-07-01T00:00:00Z' }),
      run('newer', { runType: 'baseline', status: 'reviewing', startedAt: '2026-07-05T00:00:00Z' }),
    ])
    expect(picked?.id).toBe('newer')
  })
})
