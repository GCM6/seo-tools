# SP-G2c · 诊断进行中体验（RunProgress 叙事化）· 设计

> 日期：2026-07-07。上游：`docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` SP-G2c。
> 目标：把 3–10 分钟的采集等待从「转圈 + pct 条」变成「看得见的工作」——真阶段故事线、真计数、完成时刻、失败可重试。

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 动效实现 | **纯 CSS + 极少 JS**（`components/fx/`，尊重 `prefers-reduced-motion`） | G2c 所需（数字滚动/逐条滑入/标题进场/shimmer）全可 CSS 化；不引入 motion 依赖，最贴「克制点缀」。 |
| 逻辑归属 | **纯 reducer 抽进 `lib/runs/stageline.ts`** | 阶段/计数推导脱离 DOM，可单测；组件只渲染。 |
| 失败重试 | **新增 `POST /api/runs/[id]/retry`** 重派采集 | 现无重试路由；复用 `buildCollectRequestedEvent` 重置 failed→collecting。 |

## 现状与问题（`components/RunProgress.tsx`）

1. 组件本地 `ProgressMessage` 类型**已过时**：channels.ts 已发的 `phase`（带 `checked/total/pillar/findings`）与新证据类型（psi/gsc/dataforseo_*/ua_probe/third_party_presence）**未纳入**，`phase` 事件被静默忽略。
2. 阶段是 pct 阈值假阶段（target/page/schema/probe/finish），非真实相位。
3. 证据流只留最近 3 条裸类型标签，无计数、无动效。
4. 无完成庆祝 / 明确 CTA。
5. 失败仅显示原因，无重试。
6. 仅 `initialStatus === 'collecting'` 才订阅 SSE，`diagnosing` 相位不可见。

真实相位（`lib/inngest/channels.ts`）：采集 `discover → light_check → cluster → deep_check → probes`，诊断 `diagnose`。`phase` 事件带 `checked/total`（当前相位进度）；`diagnose` 带 `pillar/findings`。`evidence_created` 逐条带 `evidenceType`。

## 铁律对齐

- 动效**永不**出现在证据标签/claim_type/数字语义层的可信度呈现上（roadmap G2 原则 1）；仅用于进度推进、数字首现、逐条进场、完成时刻。
- 所有 fx 组件尊重 `prefers-reduced-motion`（降级为直接呈现终态）。
- 文案走 next-intl `t()`；纯展示 fx 组件 i18n-free（调用方传已译 label）。
- 客户端不 import `@inngest/realtime`（会把它拉进 bundle）——类型镜像放 `lib/runs/stageline.ts`（无 inngest 依赖）。

---

## 组件与边界

### 1. 纯逻辑 `lib/runs/stageline.ts`（+ `stageline.test.ts`）

客户端安全的进度模型与 reducer，无 DOM、无 inngest 依赖。

```ts
export type ProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: EvidenceStreamType }
  | { type: 'phase'; phase: PhaseKey; checked?: number; total?: number; pillar?: string; findings?: number }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export type PhaseKey = 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes' | 'diagnose'
export const PHASES: PhaseKey[] = ['discover', 'light_check', 'cluster', 'deep_check', 'probes', 'diagnose']

export interface StagelineState {
  status: 'collecting' | 'collected' | 'failed'
  pct: number
  currentPhase: PhaseKey | null
  completed: PhaseKey[]          // 已完成相位（当前相位之前的全部）
  phaseProgress: { checked: number; total: number } | null // 当前相位计数
  findings: number               // diagnose 累计 findings
  counts: Partial<Record<EvidenceStreamType, number>>       // 各证据类型累计（证据流计数）
  lastEvent: { evidenceType: EvidenceStreamType } | null    // 最近一条证据（供滑入）
  reason: string
}

export function initialStagelineState(status, failureReason): StagelineState
// 折叠一条消息；phase 到达时把其之前相位并入 completed、切 currentPhase；
// evidence_created 累加 counts 并置 lastEvent；done→collected+pct100+全相位完成；failed→带 reason。
export function reduceProgress(state: StagelineState, msg: ProgressMessage): StagelineState
```

`EvidenceStreamType` = channels.ts `evidence_created.evidenceType` 全集（含 dataforseo_*/psi/gsc/ua_probe/third_party_presence）。

### 2. fx 基元（`components/fx/`，纯 CSS + 极少 JS）

| 文件 | 职责 | reduced-motion |
|---|---|---|
| `CountUp.tsx` | rAF 从旧值滚到新值（`value` prop 变化触发） | 直接显示终值 |
| `AnimatedList.tsx` | 子项挂载时 CSS 滑入（`.fx-slide-in`）；容器裁剪溢出 | 无动画直接显示 |
| `BlurText.tsx` | 文本 blur+fade 进场（一次性） | 直接清晰显示 |

- 均 `'use client'` 叶子级；i18n-free（`value`/`children`/`label` 由调用方给）。
- reduced-motion 检测：`CountUp` 用 `window.matchMedia('(prefers-reduced-motion: reduce)')`（挂载时读一次，SSR 安全默认终值）；`AnimatedList`/`BlurText` 纯靠 CSS `@media (prefers-reduced-motion: reduce)` 关闭动画。
- CSS keyframes（`fx-slide-in` / `fx-blur-in` / `fx-shimmer`）+ reduced-motion 覆盖写进 `app/globals.css`。

### 3. `components/RunProgress.tsx`（重写渲染 + 真相位）

- SSE 订阅条件放宽：`initialStatus === 'collecting' || 'diagnosing'`。
- `onmessage` 把每条消息喂 `reduceProgress`，state 驱动渲染。
- 三块：
  - **阶段故事线**：`PHASES` 逐个渲染。已完成→打勾 + 折叠（小字灰）；当前→大字号 + shimmer 进度条 + `CountUp`（`phaseProgress.checked/total`，probes 相位读同一字段显「探针 12/20」）；未来→暗。`diagnose` 相位显 `findings` CountUp。
  - **证据流**：`AnimatedList` 逐条滑入最近若干条（`t('evidence.<type>')` + 该类型累计 `CountUp`）。
  - **完成时刻**：`status==='collected'` → 标题 `BlurText` 进场 + 主按钮「查看诊断结果」（`router.refresh()` 揭示下方 findings；本页即结果页）。
  - **失败态**：显示失败相位（最后 currentPhase 的 label）+ 原因 + 「重试」按钮 → `POST /api/runs/{id}/retry` 成功后 `router.refresh()`。

### 4. 重试路由 `app/api/runs/[id]/retry/route.ts`（+ test）

```
POST /api/runs/[id]/retry
- getRun；不存在 404 not_found
- 非 failed → 409 not_failed（只重试失败 run）
- 取 project.domain；markRunStatus(collecting, {failureReason:null})；inngest.send(buildCollectRequestedEvent(run, domain))
- 派发失败 → markRunStatus(failed,…) + 503 dispatch_failed（与 POST /runs 同构）
- 成功 → { ok:true }
```

## 数据流

```
SSE /api/runs/{id}/events ──ProgressMessage──▶ reduceProgress(state,msg) ──▶ StagelineState
                                                                                │
   阶段故事线（当前相位 CountUp + shimmer）· 证据流 AnimatedList · 完成 BlurText+CTA · 失败+重试
failed「重试」──POST /api/runs/{id}/retry──▶ 重派采集 ──▶ router.refresh() 重开 SSE
```

## 错误处理

- SSE `onerror`：关闭流（保留现状）；失败终态由 `failed` 帧或初始 `run.failureReason` 驱动。
- 重试路由派发失败：run 置 failed + 503，前端提示可再试。
- reduced-motion：全部 fx 降级终态，零动画。

## 测试策略

- `stageline.test.ts`（纯逻辑，重点）：phase 推进把先前相位并入 completed；evidence_created 累加 counts + lastEvent；done→collected/pct100；failed→reason；乱序/缺失 total 容错。
- `CountUp.test.tsx`：reduced-motion（matchMedia mock）直接渲染终值；value 变化最终显新值。
- `AnimatedList.test.tsx` / `BlurText.test.tsx`：渲染子项/文本、带 fx class。
- retry `route.test.ts`（mock 仓库 + inngest）：404 / 409 not_failed / 成功重派 / 503。
- RunProgress 组件：既有测试保绿（若有）；新增「喂一串 phase/evidence 事件→故事线状态」可借 reducer 单测覆盖，组件层仅冒烟。

## 范围边界（YAGNI）

- 不引入 motion/react / GSAP / three.js。
- 不做 SpotlightCard/ShinyText 等（属 G2b/G2d）。
- 不改采集/诊断后端逻辑，只消费既有 `phase`/`evidence_created` 事件（channels.ts 不动）。
- diagnose 相位做基础展示（订阅放宽 + findings 计数），不做诊断阶段的逐规则叙事。
- 重试仅针对 failed 采集 run；成功 run 的「重跑」属回测/新建，不在此。
