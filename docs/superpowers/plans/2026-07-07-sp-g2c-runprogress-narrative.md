# SP-G2c · RunProgress 叙事化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans。步骤用 `- [ ]`。

**Goal:** 把采集等待从「pct 转圈」变成阶段故事线（真相位 + 真计数 + 完成时刻 + 失败可重试），动效纯 CSS/极少 JS 且尊重 reduced-motion。

**Architecture:** 阶段/计数推导抽成纯 reducer `lib/runs/stageline.ts`（可单测、无 DOM/inngest）；`components/fx/` 三个 CSS 动效叶子基元；`RunProgress` 消费 SSE→reducer→渲染；失败重试走新增 `POST /api/runs/[id]/retry`。

**Tech Stack:** React 19 + Next 16；next-intl；vitest + @testing-library/react（jsdom）；纯 CSS keyframes。**不新增依赖**。pnpm。

## Global Constraints

- **不引入 motion/react / GSAP / three.js**；动效只用 CSS + rAF。
- 动效**永不**用于证据标签/claim_type/数字可信度语义；仅进度/数字首现/逐条进场/完成时刻。
- 所有 fx 基元尊重 `prefers-reduced-motion`（降级终态）。
- 客户端**不 import `@inngest/realtime`**；`ProgressMessage` 类型镜像在 `lib/runs/stageline.ts`。
- 文案 next-intl `t()`；fx 基元 i18n-free（`value`/`children` 由调用方给）。
- 错误码 snake_case；路由复用 `lib/repositories` + `buildCollectRequestedEvent`。命令 pnpm。

---

## File Structure

- `lib/runs/stageline.ts`（Create）+ `stageline.test.ts` — 进度模型 + `reduceProgress` reducer（纯）。
- `components/fx/CountUp.tsx`（Create）+ `CountUp.test.tsx` — rAF 数字滚动，reduced-motion 终值。
- `components/fx/AnimatedList.tsx`（Create）+ `AnimatedList.test.tsx` — 逐条 CSS 滑入。
- `components/fx/BlurText.tsx`（Create）+ `BlurText.test.tsx` — 标题 blur 进场。
- `app/globals.css`（Modify）— `fx-slide-in`/`fx-blur-in`/`fx-shimmer` keyframes + reduced-motion 覆盖 + 故事线样式。
- `app/api/runs/[id]/retry/route.ts`（Create）+ `route.test.ts` — 失败 run 重派采集。
- `components/RunProgress.tsx`（Rewrite）— 消费 reducer + 渲染故事线/证据流/完成/失败。
- `messages/zh.json`、`messages/en.json`（Modify）— `screen2.run` 增相位/证据/完成/重试文案。

---

### Task 1: 阶段故事线 reducer `lib/runs/stageline.ts`

**Files:** Create `lib/runs/stageline.ts` + `lib/runs/stageline.test.ts`

**Interfaces:**
- Produces:
  - `PhaseKey` / `PHASES: PhaseKey[]` / `EvidenceStreamType`
  - `ProgressMessage`（客户端安全镜像）
  - `StagelineState`（见下）
  - `initialStagelineState(status: 'collecting'|'collected'|'diagnosing'|'failed'|string, failureReason?: string): StagelineState`
  - `reduceProgress(state: StagelineState, msg: ProgressMessage): StagelineState`

- [ ] **Step 1: 写失败测试** — `lib/runs/stageline.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { PHASES, initialStagelineState, reduceProgress } from './stageline'

const s0 = () => initialStagelineState('collecting')

describe('reduceProgress', () => {
  it('progress 更新 pct', () => {
    expect(reduceProgress(s0(), { type: 'progress', pct: 42 }).pct).toBe(42)
  })
  it('phase 到达把先前相位并入 completed 并切当前', () => {
    const s = reduceProgress(s0(), { type: 'phase', phase: 'cluster' })
    expect(s.currentPhase).toBe('cluster')
    expect(s.completed).toEqual(['discover', 'light_check'])
  })
  it('phase 带 checked/total → phaseProgress；换相位重置', () => {
    let s = reduceProgress(s0(), { type: 'phase', phase: 'light_check', checked: 37, total: 120 })
    expect(s.phaseProgress).toEqual({ checked: 37, total: 120 })
    s = reduceProgress(s, { type: 'phase', phase: 'deep_check' })
    expect(s.phaseProgress).toBeNull()
  })
  it('diagnose 相位带 findings 累计', () => {
    const s = reduceProgress(s0(), { type: 'phase', phase: 'diagnose', findings: 9 })
    expect(s.currentPhase).toBe('diagnose')
    expect(s.findings).toBe(9)
  })
  it('evidence_created 累加 counts 并置 lastEvent', () => {
    let s = reduceProgress(s0(), { type: 'evidence_created', evidenceType: 'page_fetch' })
    s = reduceProgress(s, { type: 'evidence_created', evidenceType: 'page_fetch' })
    s = reduceProgress(s, { type: 'evidence_created', evidenceType: 'ai_answer' })
    expect(s.counts.page_fetch).toBe(2)
    expect(s.counts.ai_answer).toBe(1)
    expect(s.lastEvent).toEqual({ evidenceType: 'ai_answer' })
  })
  it('done → collected/pct100/全相位完成', () => {
    const s = reduceProgress(s0(), { type: 'done' })
    expect(s.status).toBe('collected')
    expect(s.pct).toBe(100)
    expect(s.completed).toEqual(PHASES)
  })
  it('failed → 带 reason', () => {
    const s = reduceProgress(reduceProgress(s0(), { type: 'phase', phase: 'probes' }), { type: 'failed', reason: 'boom' })
    expect(s.status).toBe('failed')
    expect(s.reason).toBe('boom')
    expect(s.currentPhase).toBe('probes') // 失败相位保留
  })
  it('initialStagelineState(failed) 带初始原因', () => {
    expect(initialStagelineState('failed', 'x').reason).toBe('x')
  })
})
```

- [ ] **Step 2: 跑确认失败** — `pnpm vitest run lib/runs/stageline.test.ts`（模块不存在）

- [ ] **Step 3: 实现** — `lib/runs/stageline.ts`

```ts
// 进度故事线纯模型。客户端安全：不 import @inngest/realtime（镜像其消息形状）。
export type PhaseKey = 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes' | 'diagnose'
export const PHASES: PhaseKey[] = ['discover', 'light_check', 'cluster', 'deep_check', 'probes', 'diagnose']

export type EvidenceStreamType =
  | 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' | 'sitemap' | 'site_audit'
  | 'psi' | 'gsc' | 'dataforseo_serp' | 'dataforseo_labs' | 'dataforseo_backlinks' | 'ua_probe' | 'third_party_presence'

export type ProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: EvidenceStreamType }
  | { type: 'phase'; phase: PhaseKey; checked?: number; total?: number; pillar?: string; findings?: number }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export interface StagelineState {
  status: 'collecting' | 'collected' | 'failed'
  pct: number
  currentPhase: PhaseKey | null
  completed: PhaseKey[]
  phaseProgress: { checked: number; total: number } | null
  findings: number
  counts: Partial<Record<EvidenceStreamType, number>>
  lastEvent: { evidenceType: EvidenceStreamType } | null
  reason: string
}

export function initialStagelineState(status: string, failureReason = ''): StagelineState {
  const done = status === 'collected' || status === 'diagnosing' || status === 'reviewing' || status === 'output'
  return {
    status: status === 'failed' ? 'failed' : done ? 'collected' : 'collecting',
    pct: done ? 100 : status === 'collecting' ? 8 : 0,
    currentPhase: null,
    completed: [],
    phaseProgress: null,
    findings: 0,
    counts: {},
    lastEvent: null,
    reason: failureReason,
  }
}

export function reduceProgress(state: StagelineState, msg: ProgressMessage): StagelineState {
  switch (msg.type) {
    case 'progress':
      return { ...state, pct: msg.pct }
    case 'phase': {
      const idx = PHASES.indexOf(msg.phase)
      const changed = state.currentPhase !== msg.phase
      const hasProg = typeof msg.checked === 'number' && typeof msg.total === 'number'
      return {
        ...state,
        currentPhase: msg.phase,
        completed: idx >= 0 ? PHASES.slice(0, idx) : state.completed,
        // 换相位重置计数；本事件自带 checked/total 则采用。
        phaseProgress: hasProg ? { checked: msg.checked!, total: msg.total! } : changed ? null : state.phaseProgress,
        findings: typeof msg.findings === 'number' ? msg.findings : state.findings,
      }
    }
    case 'evidence_created':
      return {
        ...state,
        counts: { ...state.counts, [msg.evidenceType]: (state.counts[msg.evidenceType] ?? 0) + 1 },
        lastEvent: { evidenceType: msg.evidenceType },
      }
    case 'done':
      return { ...state, status: 'collected', pct: 100, currentPhase: null, completed: [...PHASES] }
    case 'failed':
      return { ...state, status: 'failed', reason: msg.reason }
  }
}
```

- [ ] **Step 4: 跑确认通过 + 提交**

```bash
pnpm vitest run lib/runs/stageline.test.ts
git add lib/runs/stageline.ts lib/runs/stageline.test.ts
git commit -m "feat(runs): 阶段故事线纯 reducer（真相位/计数推导）"
```

---

### Task 2: fx 动效基元（CountUp / AnimatedList / BlurText）+ CSS

**Files:** Create `components/fx/CountUp.tsx` `AnimatedList.tsx` `BlurText.tsx` + 三个 `*.test.tsx`；Modify `app/globals.css`

**Interfaces:**
- Produces:
  - `CountUp({ value: number; durationMs?: number; className?: string })`
  - `AnimatedList({ items: { key: string; node: ReactNode }[]; className?: string })`
  - `BlurText({ children: ReactNode; className?: string })`

- [ ] **Step 1: 写 CountUp 失败测试** — `components/fx/CountUp.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CountUp } from './CountUp'

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('CountUp', () => {
  it('首次渲染显示初值', () => {
    mockReducedMotion(true)
    render(<CountUp value={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
  it('reduced-motion 下更新 value 直接显终值', () => {
    mockReducedMotion(true)
    const { rerender } = render(<CountUp value={0} />)
    rerender(<CountUp value={37} />)
    expect(screen.getByText('37')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑确认失败** — `pnpm vitest run components/fx/CountUp.test.tsx`

- [ ] **Step 3: 实现 CountUp** — `components/fx/CountUp.tsx`

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// 数字滚动：value 变化时 rAF 从旧值补间到新值；reduced-motion 或无 rAF 直接显终值。
export function CountUp({ value, durationMs = 600, className }: { value: number; durationMs?: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setDisplay(value)
      fromRef.current = value
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setDisplay(Math.round(from + (value - from) * p))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return <span className={className}>{display}</span>
}
```

- [ ] **Step 4: 跑确认通过 CountUp** — `pnpm vitest run components/fx/CountUp.test.tsx`

- [ ] **Step 5: AnimatedList + BlurText 测试** — 两个文件

`components/fx/AnimatedList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnimatedList } from './AnimatedList'

describe('AnimatedList', () => {
  it('渲染各项且带滑入 class', () => {
    render(<AnimatedList items={[{ key: 'a', node: <span>A 事件</span> }, { key: 'b', node: <span>B 事件</span> }]} />)
    expect(screen.getByText('A 事件')).toBeInTheDocument()
    expect(screen.getByText('B 事件').closest('li')).toHaveClass('fx-slide-in')
  })
})
```

`components/fx/BlurText.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BlurText } from './BlurText'

describe('BlurText', () => {
  it('渲染子内容且带进场 class', () => {
    render(<BlurText>诊断完成</BlurText>)
    const el = screen.getByText('诊断完成')
    expect(el).toHaveClass('fx-blur-in')
  })
})
```

- [ ] **Step 6: 跑确认失败 → 实现两基元**

`components/fx/AnimatedList.tsx`:
```tsx
'use client'

import type { ReactNode } from 'react'

// 逐条滑入列表：新挂载的 <li> 播放 fx-slide-in（reduced-motion 下 CSS 关闭动画）。
export function AnimatedList({ items, className }: { items: { key: string; node: ReactNode }[]; className?: string }) {
  return (
    <ul className={`fx-list ${className ?? ''}`}>
      {items.map((it) => (
        <li key={it.key} className="fx-slide-in">
          {it.node}
        </li>
      ))}
    </ul>
  )
}
```

`components/fx/BlurText.tsx`:
```tsx
'use client'

import type { ReactNode } from 'react'

// 标题一次性 blur+fade 进场；reduced-motion 下 CSS 关闭动画直接清晰。
export function BlurText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`fx-blur-in ${className ?? ''}`.trim()}>{children}</span>
}
```

- [ ] **Step 7: CSS keyframes + reduced-motion** — `app/globals.css` 末尾追加

```css
/* —— SP-G2c fx 动效基元（纯 CSS，尊重 reduced-motion）—— */
@keyframes fx-slide-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes fx-blur-in { from { opacity: 0; filter: blur(8px) } to { opacity: 1; filter: blur(0) } }
@keyframes fx-shimmer { 0% { background-position: -160% 0 } 100% { background-position: 160% 0 } }
.fx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.fx-slide-in { animation: fx-slide-in .32s ease-out both; }
.fx-blur-in { display: inline-block; animation: fx-blur-in .5s ease-out both; }
.fx-shimmer { background-image: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); background-size: 200% 100%; animation: fx-shimmer 1.6s linear infinite; }
/* 故事线相位 */
.stageline { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.stageline-row { display: flex; align-items: baseline; gap: 8px; font-size: 13px; color: var(--ds-muted, #6b7280); }
.stageline-row.done { color: var(--ds-muted, #9ca3af); }
.stageline-row.current { font-size: 16px; font-weight: 600; color: var(--ds-fg, #111827); }
.stageline-row .sl-count { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .fx-slide-in, .fx-blur-in, .fx-shimmer { animation: none !important; }
}
```

- [ ] **Step 8: 跑通三基元 + 提交**

```bash
pnpm vitest run components/fx
git add components/fx app/globals.css
git commit -m "feat(fx): CountUp/AnimatedList/BlurText 纯 CSS 动效基元（reduced-motion 降级）"
```

---

### Task 3: 失败重试路由 `POST /api/runs/[id]/retry`

**Files:** Create `app/api/runs/[id]/retry/route.ts` + `route.test.ts`

**Interfaces:**
- Consumes: `getRun`/`getProject`/`markRunStatus`（repositories）、`buildCollectRequestedEvent`（`@/lib/inngest/events`）、`inngest`（`@/lib/inngest/client`）。
- Produces: `POST /api/runs/[id]/retry` → `{ ok:true }` / 404 `not_found` / 409 `not_failed` / 503 `dispatch_failed`。

- [ ] **Step 1: 写失败测试** — `app/api/runs/[id]/retry/route.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { run: { id: string; projectId: string; status: string } | null; sendThrows: boolean } = {
  run: { id: 'run_1', projectId: 'proj_1', status: 'failed' }, sendThrows: false,
}
const marks: { status: string }[] = []
vi.mock('@/lib/repositories', () => ({
  getRun: async () => state.run,
  getProject: async () => ({ id: 'proj_1', domain: 'https://example.com/' }),
  markRunStatus: async (_id: string, status: string) => { marks.push({ status }) },
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: async () => { if (state.sendThrows) throw new Error('dev server down') } },
}))

const { POST } = await import('./route')
const call = (id = 'run_1') => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/retry', () => {
  beforeEach(() => { marks.length = 0; state.run = { id: 'run_1', projectId: 'proj_1', status: 'failed' }; state.sendThrows = false })

  it('run 不存在 → 404', async () => {
    state.run = null
    expect((await call()).status).toBe(404)
  })
  it('非 failed → 409 not_failed', async () => {
    state.run = { id: 'run_1', projectId: 'proj_1', status: 'collecting' }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_failed')
  })
  it('failed → 置 collecting 并重派，返回 ok', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(marks[0].status).toBe('collecting')
  })
  it('派发失败 → 置 failed + 503', async () => {
    state.sendThrows = true
    const res = await call()
    expect(res.status).toBe(503)
    expect(marks.map((m) => m.status)).toEqual(['collecting', 'failed'])
  })
})
```

- [ ] **Step 2: 跑确认失败** — `pnpm vitest run "app/api/runs/[id]/retry/route.test.ts"`

- [ ] **Step 3: 实现** — `app/api/runs/[id]/retry/route.ts`

```ts
import { NextResponse } from 'next/server'
import { getRun, getProject, markRunStatus } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'

// 失败采集 run 重试：重置 collecting 并重派采集事件（与 POST /runs 派发同构）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (run.status !== 'failed') return NextResponse.json({ error: 'not_failed' }, { status: 409 })
  const project = await getProject(run.projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await markRunStatus(id, 'collecting', { failureReason: null })
  try {
    await inngest.send(buildCollectRequestedEvent(run, project.domain))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await markRunStatus(id, 'failed', { failureReason: `采集事件派发失败：${reason}`, finishedAt: new Date().toISOString() })
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 跑确认通过 + 提交**

```bash
pnpm vitest run "app/api/runs/[id]/retry/route.test.ts"
git add "app/api/runs/[id]/retry"
git commit -m "feat(api): 失败采集 run 重试路由（重派采集事件）"
```

---

### Task 4: RunProgress 重写（故事线 + 证据流 + 完成 + 失败重试）+ i18n

**Files:** Rewrite `components/RunProgress.tsx`；Modify `messages/zh.json`、`messages/en.json`

**Interfaces:**
- Consumes: `PHASES`/`initialStagelineState`/`reduceProgress`/`ProgressMessage`（Task 1）；`CountUp`/`AnimatedList`/`BlurText`（Task 2）；`POST /api/runs/[id]/retry`（Task 3）。

- [ ] **Step 1: 新增 i18n 文案** — `messages/zh.json` 的 `screen2.run` 增：

```json
"phase": { "discover": "发现页面", "light_check": "轻量抓取", "cluster": "聚类归组", "deep_check": "深度检测", "probes": "AI 探针", "diagnose": "生成诊断" },
"phaseCount": "{checked}/{total}",
"findingsCount": "已生成 {n} 条发现",
"completedTitle": "诊断证据已就绪",
"viewResults": "查看诊断结果",
"retry": "重试采集",
"retrying": "正在重试…",
"retryFailed": "重试失败，请稍后再试。",
"streamLabel": "证据流"
```

`messages/zh.json` 的 `screen2.run.evidence` 补齐缺失类型：

```json
"psi": "已保存 PageSpeed 证据",
"gsc": "已保存 Search Console 证据",
"dataforseo_serp": "已保存 SERP 排名证据",
"dataforseo_labs": "已保存关键词数据证据",
"dataforseo_backlinks": "已保存外链证据",
"ua_probe": "已保存 UA 探测证据",
"third_party_presence": "已保存第三方存在性证据"
```

`messages/en.json` 的 `screen2.run` 增对应英文：

```json
"phase": { "discover": "Discovering pages", "light_check": "Light fetch", "cluster": "Clustering", "deep_check": "Deep checks", "probes": "AI probes", "diagnose": "Generating diagnosis" },
"phaseCount": "{checked}/{total}",
"findingsCount": "{n} findings generated",
"completedTitle": "Diagnostic evidence is ready",
"viewResults": "View diagnosis",
"retry": "Retry collection",
"retrying": "Retrying…",
"retryFailed": "Retry failed, please try again later.",
"streamLabel": "Evidence stream"
```

`messages/en.json` 的 `screen2.run.evidence` 补：

```json
"psi": "Saved PageSpeed evidence",
"gsc": "Saved Search Console evidence",
"dataforseo_serp": "Saved SERP ranking evidence",
"dataforseo_labs": "Saved keyword data evidence",
"dataforseo_backlinks": "Saved backlink evidence",
"ua_probe": "Saved UA probe evidence",
"third_party_presence": "Saved third-party presence evidence"
```

- [ ] **Step 2: 重写组件** — 全量替换 `components/RunProgress.tsx`

```tsx
'use client'

import { useEffect, useReducer, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { RunStatus } from '@/lib/types'
import {
  PHASES,
  initialStagelineState,
  reduceProgress,
  type ProgressMessage,
  type StagelineState,
} from '@/lib/runs/stageline'
import { CountUp } from '@/components/fx/CountUp'
import { AnimatedList } from '@/components/fx/AnimatedList'
import { BlurText } from '@/components/fx/BlurText'

// 最近若干条证据事件（逐条滑入用），仅前端展示态，独立于 reducer。
const STREAM_MAX = 6

export function RunProgress({
  runId,
  initialStatus,
  initialFailureReason = '',
}: {
  runId: string
  initialStatus: RunStatus
  initialFailureReason?: string
}) {
  const t = useTranslations('screen2.run')
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceProgress, initialStagelineState(initialStatus, initialFailureReason))
  const [stream, setStream] = useState<{ key: string; type: string }[]>([])
  const [retrying, setRetrying] = useState(false)
  const [retryErr, setRetryErr] = useState(false)

  useEffect(() => {
    if (initialStatus !== 'collecting' && initialStatus !== 'diagnosing') return
    const source = new EventSource(`/api/runs/${runId}/events`)
    let seq = 0
    source.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ProgressMessage
      dispatch(msg)
      if (msg.type === 'evidence_created') {
        seq += 1
        setStream((prev) => [{ key: `${seq}`, type: msg.evidenceType }, ...prev].slice(0, STREAM_MAX))
      }
      if (msg.type === 'done' || msg.type === 'failed') {
        source.close()
        router.refresh()
      }
    }
    source.onerror = () => source.close()
    return () => source.close()
  }, [initialStatus, router, runId])

  async function retry() {
    setRetrying(true)
    setRetryErr(false)
    const res = await fetch(`/api/runs/${runId}/retry`, { method: 'POST' })
    setRetrying(false)
    if (res.ok) router.refresh()
    else setRetryErr(true)
  }

  const tone = state.status === 'failed' ? 'failed' : state.status === 'collecting' ? 'collecting' : 'ready'
  const displayPct = state.status === 'collecting' ? t('progressSoftLabel', { pct: state.pct }) : `${state.pct}%`

  const streamItems = useMemo(
    () => stream.map((e) => ({ key: e.key, node: <span>{t(`evidence.${e.type}`)}</span> })),
    [stream, t],
  )

  return (
    <div className={`run-progress ${tone}`}>
      <div className="rp-main">
        <div className="rp-copy">
          <span className="rp-orb" aria-hidden="true" />
          <div>
            <div className="rp-eyebrow">{t('eyebrow')}</div>
            {state.status === 'collected' ? (
              <h2><BlurText>{t('completedTitle')}</BlurText></h2>
            ) : (
              <h2>{state.status === 'failed' ? t('failedTitle') : t('collectingTitle')}</h2>
            )}
            {state.status === 'failed' ? (
              <p>{t('failedDetail', { reason: state.reason || t('unknown') })}</p>
            ) : state.status === 'collected' ? (
              <p>{t('readyDetail')}</p>
            ) : (
              <p>{t('collectingDetail')}</p>
            )}
          </div>
        </div>
        <span className="rp-pct">{displayPct}</span>
      </div>

      <div className="rp-track" aria-label={t('progressLabel', { pct: state.pct })}>
        <i style={{ width: `${state.pct}%` }} className={state.status === 'collecting' ? 'fx-shimmer' : undefined} />
      </div>

      {/* 阶段故事线：真相位驱动，当前相位大字 + 计数 */}
      <div className="stageline" aria-label={t('stageLabel')}>
        {PHASES.map((phase) => {
          const done = state.completed.includes(phase)
          const current = state.currentPhase === phase && state.status === 'collecting'
          const cls = current ? 'current' : done ? 'done' : ''
          return (
            <div key={phase} className={`stageline-row ${cls}`}>
              <span aria-hidden="true">{done ? '✓' : current ? '▸' : '·'}</span>
              <span>{t(`phase.${phase}`)}</span>
              {current && state.phaseProgress && (
                <span className="sl-count">
                  <CountUp value={state.phaseProgress.checked} /> / {state.phaseProgress.total}
                </span>
              )}
              {current && phase === 'diagnose' && state.findings > 0 && (
                <span className="sl-count">{t('findingsCount', { n: state.findings })}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* 证据流：逐条滑入 */}
      {streamItems.length > 0 && (
        <div className="rp-events" aria-label={t('streamLabel')}>
          <AnimatedList items={streamItems} />
        </div>
      )}

      {/* 完成时刻 CTA */}
      {state.status === 'collected' && (
        <button type="button" className="mt-3" onClick={() => router.refresh()}>
          {t('viewResults')}
        </button>
      )}

      {/* 失败态：可重试 */}
      {state.status === 'failed' && (
        <div className="mt-3">
          <button type="button" onClick={retry} disabled={retrying}>
            {retrying ? t('retrying') : t('retry')}
          </button>
          {retryErr && <span role="status" className="ml-2 text-xs">{t('retryFailed')}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: JSON 合法 + 构建 + 全量测试**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/zh.json'));JSON.parse(require('fs').readFileSync('messages/en.json'));console.log('json ok')"`
Run: `pnpm build` → 编译通过（类型 + i18n 键齐全）。
Run: `pnpm test` → 全绿。
Run: `pnpm lint` → 无新增 error。

- [ ] **Step 4: 提交**

```bash
git add components/RunProgress.tsx messages/zh.json messages/en.json
git commit -m "feat(runs): RunProgress 叙事化（真相位故事线 + 证据流滑入 + 完成/失败重试）"
```

---

## Self-Review

**1. Spec coverage:**
- 真相位故事线（spec §组件3）→ Task 1（reducer）+ Task 4（渲染）。
- fx 基元 CountUp/AnimatedList/BlurText（§2）→ Task 2。
- 订阅放宽 diagnosing + 消费 phase（§3、现状问题 6）→ Task 4 useEffect guard。
- 完成时刻 BlurText+CTA（§3）→ Task 4。
- 失败相位+原因+重试（§3、§4）→ Task 3（路由）+ Task 4（按钮）。
- reduced-motion 降级（§2）→ Task 2 CountUp matchMedia + CSS `@media` 覆盖。
- 类型过时修复（现状问题 1）→ Task 1 `ProgressMessage`/`EvidenceStreamType` 全集，Task 4 evidence 文案补齐。

**2. Placeholder scan:** 无 TBD/TODO；每步完整代码/命令。组件层无独立单测——核心逻辑在 reducer（Task 1 单测）与 fx 基元（Task 2 单测）+ 路由（Task 3 单测），组件仅编排渲染，由 `pnpm build` 兜类型/i18n（与既有无测 RunProgress 一致）。

**3. Type consistency:** `ProgressMessage`/`StagelineState`/`PHASES`/`EvidenceStreamType` Task 1 定义、Task 4 消费一致；`reduceProgress` 直接作 `useReducer` reducer（签名 `(state,msg)=>state` 匹配）；`CountUp value:number`、`AnimatedList items:{key,node}[]`、`BlurText children` Task 2 定义、Task 4 消费一致；retry 路由错误码 snake_case（not_found/not_failed/dispatch_failed）。

**4. 依赖顺序:** 1→2→3→4，无前向引用。Task 4 依赖 1/2/3 全部产物。
