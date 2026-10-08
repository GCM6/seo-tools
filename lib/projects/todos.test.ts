import { describe, it, expect } from 'vitest'
import { buildTodos, type TodoProject } from './todos'

const now = new Date('2026-10-08T12:00:00.000Z')

function project(overrides: Partial<TodoProject> & { id: string }): TodoProject {
  return { domain: `${overrides.id}.com`, nextRetestDueAt: null, latestRun: null, activeRun: null, ...overrides }
}

describe('buildTodos（首页待处理，ux-blueprint §1）', () => {
  it('四种来源各出一条，按「失败 > 待确认 > 该复查 > 尚未诊断」排序，各带去处', () => {
    const todos = buildTodos(
      [
        project({ id: 'new' }),
        project({ id: 'due', nextRetestDueAt: '2026-10-01T00:00:00.000Z', latestRun: { id: 'r_due', status: 'output' } }),
        project({ id: 'rev', latestRun: { id: 'r_rev', status: 'reviewing', draftRecCount: 12 } }),
        project({ id: 'bad', latestRun: { id: 'r_bad', status: 'failed' } }),
      ],
      'zh',
      now,
    )
    expect(todos.map((t) => [t.kind, t.domain, t.href, t.count])).toEqual([
      ['failed', 'bad.com', '/zh/runs/r_bad', undefined],
      ['review', 'rev.com', '/zh/runs/r_rev/recommendations', 12],
      ['retest', 'due.com', '/zh/projects/due', undefined],
      ['unstarted', 'new.com', '/zh/new?projectId=new', undefined],
    ])
  })

  it('建议都处理完了、复查还没到期、已经在诊断中的项目，都不出现', () => {
    const todos = buildTodos(
      [
        project({ id: 'done', latestRun: { id: 'r1', status: 'reviewing', draftRecCount: 0 } }),
        project({ id: 'later', nextRetestDueAt: '2026-11-01T00:00:00.000Z', latestRun: { id: 'r2', status: 'output' } }),
        project({ id: 'busy', activeRun: { id: 'r3' }, nextRetestDueAt: '2026-10-01T00:00:00.000Z' }),
      ],
      'zh',
      now,
    )
    expect(todos).toEqual([])
  })
})
