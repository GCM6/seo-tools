// 首页「待处理」（ux-blueprint §1）：只读现有数据，不新增字段。纯函数，便于单测。
// 写法是「对象 + 数量 + 动作」：每条带一个去处（href），由页面渲染成一行。
export type TodoKind = 'failed' | 'review' | 'retest' | 'unstarted'

export interface TodoProject {
  id: string
  domain: string
  nextRetestDueAt: string | null
  latestRun: { id: string; status: string; draftRecCount?: number } | null
  /** 有进行中的诊断时，「尚未诊断 / 该复查了」都不再提示（避免叫人重复发起）。 */
  activeRun: { id: string } | null
}

export interface TodoItem {
  key: string
  kind: TodoKind
  projectId: string
  domain: string
  /** review：待确认的建议条数。 */
  count?: number
  href: string
}

// 越靠前越要先处理：失败的诊断 > 待确认的建议 > 到期的复查 > 还没诊断过的项目。
const ORDER: Record<TodoKind, number> = { failed: 0, review: 1, retest: 2, unstarted: 3 }

export function buildTodos(projects: TodoProject[], locale: string, now: Date): TodoItem[] {
  const items: TodoItem[] = []
  for (const p of projects) {
    const run = p.latestRun
    if (run?.status === 'failed') {
      items.push({ key: `${p.id}:failed`, kind: 'failed', projectId: p.id, domain: p.domain, href: `/${locale}/runs/${run.id}` })
    }
    if (run?.status === 'reviewing' && (run.draftRecCount ?? 0) > 0) {
      items.push({
        key: `${p.id}:review`,
        kind: 'review',
        projectId: p.id,
        domain: p.domain,
        count: run.draftRecCount,
        href: `/${locale}/runs/${run.id}/recommendations`,
      })
    }
    if (!p.activeRun && p.nextRetestDueAt && new Date(p.nextRetestDueAt).getTime() <= now.getTime()) {
      items.push({ key: `${p.id}:retest`, kind: 'retest', projectId: p.id, domain: p.domain, href: `/${locale}/projects/${p.id}` })
    }
    if (!run && !p.activeRun) {
      items.push({ key: `${p.id}:unstarted`, kind: 'unstarted', projectId: p.id, domain: p.domain, href: `/${locale}/new?projectId=${p.id}` })
    }
  }
  return items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.domain.localeCompare(b.domain))
}
