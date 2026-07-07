# SP-G2d 报告页品质打磨设计

> 商业化路线图 Phase G2 收尾项。依赖 SP-G1e（`ReportView` 已抽为报告页 / 分享页共用渲染）。
> 目标一句话：**报告 = 产品的脸面 = 传播素材**。所有改动落在共享 `components/ReportView.tsx`，报告页与只读分享页自动同步。

## 背景

- 报告主体已抽成 `components/ReportView.tsx`，被 `app/[locale]/runs/[id]/report/page.tsx`（带 Shell + 工具栏）与 `app/share/[token]/page.tsx`（无 Shell、noindex）共用。
- G2c 已产出纯 CSS 动效基元 `components/fx/{CountUp,BlurText,AnimatedList}.tsx`（尊重 `prefers-reduced-motion`，未引入 motion 依赖），但**报告里尚未使用**。
- 证据等级阶梯 L0–L4（plan-ux §5.1）是产品护城河，代码里多处引用（`实测`/`推断`/`假设` 标签），但**没有任何可视化图例**向用户解释这套可信度阶梯。

## 范围

### 1. 首屏「诊断概要卡」（差异化核心）

在 summary 段落顶部：

- **总健康分**：保留大号数字，套 `CountUp`。
- **五支柱**：现有数字网格 → **水平条形**（`PillarBars`）。每行 `支柱名 · 进度条 · 分数`；`score === null` 显示「未评分」空轨（V0 常有支柱未评分，条形比雷达更诚实、手机/打印更稳）。分数套 `CountUp`。
- **证据等级图例（L0–L4 阶梯）**：新增一张卡 `EvidenceLadder`，显性化 plan-ux §5.1 阶梯：
  - L0 unsupported → 不允许入库为结论
  - L1 hypothesis → 假设 / 待验证
  - L2 inferred → 基于证据的推断
  - L3 measured_sample → 样本实测
  - L4 measured_hard → 硬证据实测
  - 每级配色对齐现有 `.tag` 语义变体（L1/L0→`g`、L2→`i`、L3/L4→`m`），让报告里出现的「实测/推断/假设」标签有据可查。放首屏。

### 2. 抽出两个纯展示组件（i18n-free，照 `components/ProvenanceTag.tsx` 模式；组件平铺，不建子目录）

- `components/PillarBars.tsx`
  - props：`overall: number | null`、`overallLabel: string`、`unscoredLabel: string`、`pillars: { key: string; label: string; score: number | null }[]`、`max?: number`（默认 100）、`ariaLabel: string`。
  - 内部组合 `CountUp` 渲染 `overall` 与各 `score`（`null` 走 `unscoredLabel`）。条宽 = `score/max`。
  - Server Component 可直接渲染（`CountUp` 是 `'use client'` 叶子，SSR 落终值，客户端挂载后才补间 → 无水合错配）。组件本身不加 `'use client'`。
  - 同层 `PillarBars.test.tsx`。
- `components/EvidenceLadder.tsx`
  - props：`title: string`、`levels: { code: string; name: string; desc: string; tone: 'g' | 'i' | 'm' }[]`。
  - 纯展示 L0–L4 阶梯，`tone` 决定圆点/描边色（复用 `.tag` 语义色）。
  - 同层 `EvidenceLadder.test.tsx`。

`ReportView` 负责 `t()` 解析后把已翻译 label 传入（组件本身无 hook、无 DB、无 i18n）。

### 3. 大标题 BlurText（仅首次）

报告 `<h2>{t('title')}</h2>` 用 `BlurText` 包裹（一次性进场，reduced-motion 下 CSS 关闭）。**仅此一处**，避免动效噪音。

### 4. 排版 / 打印 / 移动端过一遍

- **间距节奏**：`report-body` 硬编码 `gap: 34px` → 对齐 `--sp-*` token（`--sp-2xl` 40px）。
- **打印**：条形填充加 `print-color-adjust: exact`；每条旁**永远有数字**，即便填充色被打印机丢弃仍可读（黑白安全）。`EvidenceLadder` 卡 `break-inside: avoid`。
- **移动端**：条形天然 `width%` 自适应；图例 `flex-wrap`。复用已有 720px 断点。

### 5. 文案（`report` namespace，zh + en 同步）

新增：
- `summary.pillarBarsAria`（条形组 aria-label）
- `summary.evidenceLadderTitle`
- `evidenceLadder.l0`…`l4`，每项 `{ name, desc }`

其余复用现有 `claim.*` / `pillarNames.*` / `summary.overall` / `pillars.unscored`。

## 不做（YAGNI）

雷达 / 五边形图、SoV/presence 迷你图、PDF 服务端端点（仍走浏览器打印，依赖 SP-G1a 生产 URL）、任何动效库（motion）。

## 测试与验收

- 新增 `PillarBars.test.tsx`（条形渲染、`null`→未评分、aria）、`EvidenceLadder.test.tsx`（5 级 L0–L4 渲染、tone 色）。
- 现有 `ReportView` 相关测试保持绿；补断言：概要卡出现条形与 L0–L4 图例。
- 验收：分享链接在手机可读；打印/PDF 无断版且条形数字可读；L0–L4 图例出现在首屏概要区；`pnpm test` / `pnpm exec tsc --noEmit` / `pnpm lint` / `pnpm build` 全绿。

关联路线图 `docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` §SP-G2d。
