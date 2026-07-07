# SP-G2b 数据源健康度常驻 + 空态 CTA 化 —— 设计

> 上游范围：`docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` §SP-G2b。
> 目标：把「pending 一片空白」变成「一条修复之路」——每个空白区域都有明确出路，无死胡同空态。

## 背景与既有资产

- `lib/settings/data-sources.ts` `buildDataSourceStatuses(env, gsc, dbKeys)` —— **本设计的权威数据源状态来源**，返回 7 个源的 `{ key, configured, connected?, detail? }`，已计入 SP-G1c 的 DB 凭据覆盖。设置页在用。
- `lib/config/data-sources.ts` `dataSourceStatus()` —— run 页 StatStrip/PresenceMap 的 pending 判定（4 flag），**本设计不改**，仍由它驱动 `deriveStatCards` 的 pending reason。
- `components/Shell.tsx` —— 全站顶栏（Server Component），run 子页与设置页都用。
- `app/[locale]/settings/page.tsx` —— 已有一段「拼装 statuses」逻辑（getPrimaryProject + getProjectSettings + getConfiguredCredentialKeys + isGscConfigured + buildDataSourceStatuses），本设计抽成共享服务端函数并复用（顺手消重）。
- `components/StatStrip.tsx`（pending 卡带 configHint）、run 页 PresenceMap/SovBar 的两个 `.pending-block` div —— 空态 CTA 化的改造对象。

## 决策（用户离席，采用推荐默认；可事后回调）

1. **健康度分母 = 可连接的 5 个源**：`gsc, googleCse, aiProbe, dataforseo, render`。排除 `psi`、`publicCorpora`（恒 `configured:true`，无需配置，计入会弱化紧迫感）。
2. **pill + 抽屉出现范围 = 仅 run/report 相关页**：Shell 加可选 `showDataHealth` prop，默认 false；设置页/首页不挂。
3. **「去连接」落点 = 设置页每源锚点 + 短暂高亮**：`/{locale}/settings#source-<key>`。

## 交付面

### 1. 纯函数：健康度汇总 `lib/settings/data-source-health.ts`

```ts
export const HEALTH_KEYS = ['gsc','googleCse','aiProbe','dataforseo','render'] as const
export type HealthKey = (typeof HEALTH_KEYS)[number]
export interface HealthItem { key: HealthKey; up: boolean }
export interface DataSourceHealth { up: number; total: number; items: HealthItem[] }
export function summarizeDataSourceHealth(statuses: DataSourceStatus[]): DataSourceHealth
```

- 「up」判定：`gsc` 用 `connected === true`（授权到项目才算真出数）；其余用 `configured === true`。
- `total = HEALTH_KEYS.length`（5），`up = items.filter(i => i.up).length`。
- 纯函数、无 IO、无翻译；单测覆盖：全配 / 半配 / GSC configured-但-未 connected / 排除 psi&publicCorpora。

### 2. 服务端加载器 `lib/settings/load-statuses.ts`（server-only）

抽出 settings page 现有拼装逻辑：`loadDataSourceStatuses(): Promise<DataSourceStatus[]>`（V0 单项目，走 `getPrimaryProject`）。settings page 与 Shell 同时复用，消除重复。无项目时返回按 env 计算的 statuses（gsc 一律未连接）。

### 3. `components/EmptyStateCTA.tsx`（i18n-free 纯展示，照 `ProvenanceTag` 约定）

- props：`{ title: string; impact: string; actionLabel: string; href: string; icon?: ReactNode }`（全部由调用方 `t()` 后传入，可用于 Server Component）。
- 渲染 `.empty-cta` 卡片：图标 + 标题（如「缺少 AI 探针数据源」）+ 影响一句话 + 主按钮 `<Link href>`。
- 单测：三段文案渲染、href 正确。

### 4. `components/DataSourceHealth.tsx`（client leaf）

- `'use client'`，`useTranslations('dataHealth')`，props：`{ items: HealthItem[]; up: number; total: number; locale: string }`。
- 顶栏 pill：`t('pill', { up, total })`，健康度配色（全绿 / 部分 / 多缺，用语义 class）。点击 toggle 抽屉。
- 抽屉逐源：源名 `t('source.'+key)` + 状态点（up 绿 / down 灰）+ 缺失影响 `t('impact.'+key)`；**仅 down 源**显示「去连接」`<Link href={/${locale}/settings#source-${key}}>`。
- 尊重 `prefers-reduced-motion`（抽屉展开纯 CSS，降级为直接呈现）。
- 单测：pill 文本；点击展开；down 源有正确 anchor 链接、up 源无按钮。

### 5. Shell 集成

- Shell 加 `showDataHealth?: boolean`（默认 false）。为 true 时 `await loadDataSourceStatuses()` → `summarizeDataSourceHealth(...)`，在 topbar 渲染 `<DataSourceHealth>`。
- run 页各页（先只接 `runs/[id]/page.tsx` 主诊断页；其余子页可后续统一）传 `showDataHealth`。

### 6. 报告顶部覆盖率横幅（`runs/[id]/page.tsx`）

- run 已完成（`status ∈ {collected, completed, ...}` 有产出）且 `health.up < health.total` 时，报告顶部一条 `.coverage-note`：`t('dataHealth.coverage', { up, total })`。非空态、非阻断，仅提示补齐空间。

### 7. run 页空态 CTA 化

- PresenceMap / SovBar 两个 `.pending-block` → `<EmptyStateCTA>`（title=缺少 AI 探针数据源、impact=答案地图/SoV 需要 AI 答案引擎探针、action=去连接、href=`#source-aiProbe`）。
- **StatStrip pending 卡**：保留卡片网格布局，每张 pending 卡补一个小「去连接」链接（指向对应源 anchor：`search_provider→googleCse`、`ai_probe→aiProbe`、`gsc→gsc`、`render_provider→render`；`uncollected` 无 anchor，仍显示「重新诊断」原文案）。**不整卡替换为 EmptyStateCTA**——full block 会破坏 4 列网格，这是对 roadmap「统一 EmptyStateCTA」的务实偏离，记录在此。

### 8. 设置页锚点 + 高亮（`SettingsClient.tsx`）

- 数据源矩阵每行 `<tr id={`source-${s.key}`}>`。
- 轻量 client effect：进入时读 `location.hash`，命中行加高亮 class，短暂后移除；`prefers-reduced-motion` 下静态高亮。

## i18n（新 namespace `dataHealth`，zh/en 各一份）

`pill`「数据源 {up}/{total}」、`title`「数据源健康度」、`source.<5 key>`、`impact.<5 key>`、`statusUp`/`statusDown`、`connect`「去连接」、`coverage`「本次诊断基于 {up}/{total} 数据源，补齐后可提升覆盖」、`emptyProbeTitle`/`emptyProbeImpact`（PresenceMap/SovBar 空态）、StatStrip 的 `connect` 复用。

## CSS（`app/globals.css` 语义类）

`.ds-health`（pill + 配色档）、`.ds-drawer` / `.ds-row`、`.empty-cta`、`.coverage-note`、设置页 `.ds-row-highlight`。全部尊重 `prefers-reduced-motion`；不引入新依赖。

## 不做（YAGNI / 超范围）

- 不做数据源实时探活（只看 env/DB 配置，不发请求验证）——沿用现状。
- 不改 `lib/config/data-sources.ts` 的 run 页 pending 语义。
- StatStrip pending 卡不整卡换 EmptyStateCTA（见 §7）。
- 不做多项目 / 不动 Inngest / 不加动画依赖。

## 测试

- `lib/settings/data-source-health.test.ts`（纯函数，主战场）。
- `components/EmptyStateCTA.test.tsx`、`components/DataSourceHealth.test.tsx`（RTL）。
- SettingsClient 锚点 id 存在断言（若已有测试则补一条）。
- 复用消重后 settings page / 全量 `pnpm test` 保持绿。

## 验收

环境只配一半 key 时：顶栏 pill 显示真实 `up/total`、点开抽屉每个 down 源有「去连接」直达对应锚点；PresenceMap/SovBar/StatStrip 每个空白都有出路；run 完成后报告顶部有覆盖率横幅。无死胡同空态。
