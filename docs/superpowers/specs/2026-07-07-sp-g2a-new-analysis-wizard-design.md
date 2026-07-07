# SP-G2a 新建分析向导化（含 SP-G1d GSC 接线）—— 设计

> 上游范围：`docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` §SP-G2a。
> 目标：把单页大表单变成 3 步向导，首次使用零门槛；GSC 授权在向导内闭环。
> 验收：新用户从落地到发起第一次 run ≤ 2 分钟且无需看文档；每步只有一个主 CTA。

## 背景与既有资产

- `components/NewAnalysisForm.tsx` —— 当前单页表单（域名/行业/市场/竞品/引擎 chips/GSC 开关 + brief aside）。本设计**原地重构为 3 步向导**（保留文件名与 `NewAnalysisForm` 导出，减少接线改动）。
- GSC OAuth 已通（`/api/gsc/auth?projectId=` → Google 同意页 → `/api/gsc/callback?state=<projectId>` → 存 token → 跳 `/settings?gsc=connected`）。`buildAuthUrl(state)` 把 state 原样带回。**当前 state=projectId，回调硬编码跳设置页**——本设计要让它能跳回向导。
- `POST /api/projects` 每次新建项目；`PATCH /api/projects/[id]` 目前只改 industry/market/language（不改 domain/competitors）。`getPrimaryProject()` 取**最早**一条——全站页面都据此假设「单项目」。
- `lib/probes/prompt-set.ts` `brandFromDomain`（已有）；V0 固定 **20 prompts × n=5**。
- G2b 刚落地：设置页 `#source-aiProbe` 锚点 + 命中高亮、`buildDataSourceStatuses`、数据源健康度。向导第 2 步复用。

## 决策（用户离席，采用推荐默认；可事后回调）

1. **项目创建 = 复用单个项目（upsert）**。向导始终操作 `getPrimaryProject()` 那一个项目：无则第 1 步创建，有则 PATCH 更新。与全站「单项目」假设一致，无孤儿草稿。为此 **PATCH 扩展为可改 domain（规范化）+ competitors**。
2. **第 2 步 AI 探针未配 → 链接设置页锚点**（复用 G2b `#source-aiProbe`），三态：已配 ✓ / 未配（附影响 + 「去配置」）/ 跳过。不做向导内联录入（YAGNI，留 V1）。
3. **第 3 步成本 = 纯函数粗估区间**，显式标「预估」（非实测，合证据诚实铁律）。
4. **GSC 回调返回目标 = 经 state 编码 returnTo**。`/api/gsc/auth` 加可选 `returnTo` query；state 编码为 `projectId` 或 `projectId::<returnTo>`；回调按 `::` 拆分，有 returnTo 跳该路径（带 `?gsc=connected`），无则维持跳 `/settings`（设置页流程不变）。

## 交付面

### 1. 纯函数：域名 → 市场/语言预填 `lib/analysis/locale-guess.ts`

```ts
export interface MarketGuess { marketIndex: number; language: 'zh' | 'en' }
export function guessMarketLanguage(domain: string): MarketGuess
```

- 由 ccTLD 启发：`.cn` → { marketIndex: 0（中文·中国大陆）, language: 'zh' }；`.sg/.my/.th/.id/.vn/.ph` → { 2（东南亚）, 'en' }；其余 → { 1（English · Global）, 'en' }。
- marketIndex 对应 `screen1.marketOptions` 的下标（zh/en 同序），向导据此预选；language 供 project.language 默认。
- 纯函数、无 IO，单测覆盖各 ccTLD 分支 + 裸域名/带 scheme/无法解析兜底。

### 2. 纯函数：诊断预估 `lib/analysis/estimate.ts`

```ts
export interface EstimateInput { engineCount: number; promptCount: number; n: number; gsc: boolean; render: boolean }
export interface RunEstimate { probeCalls: number; timeLowMin: number; timeHighMin: number; costLowUsd: number; costHighUsd: number }
export function estimateRun(input: EstimateInput): RunEstimate
```

- `probeCalls = engineCount × promptCount × n`（对齐 run-probes 三层循环）。
- 成本区间：每次探针调用一个粗略 token 成本带（低/高常量，内部工具方向性够用），乘 probeCalls，叠加 GSC/render 的少量固定调用；四舍五入到合理精度。
- 时间区间：按 probeCalls 的并发吞吐粗算下限/上限分钟数（如 3–10 分钟带）。
- 纯函数、单测：零引擎、多引擎、含/不含 gsc/render 的单调性与边界。
- **所有产出显式标记为「预估」文案**，不进任何 evidence/finding。

### 3. 向导组件 `components/NewAnalysisForm.tsx`（client）

内部 `step` 状态（1|2|3）+ 顶部 3 点进度指示（复用/新增轻量 `.wizard-steps`，不与四屏 `Stepper` 混用）。每步一个主 CTA。

- **props（由 home page server 传入）**：`{ locale; project: {id, domain, industry, market, language, competitors} | null; gscConnected: boolean; aiProbeConfigured: boolean; initialStep: 1|2|3 }`。
- **第 1 步「你的网站」**：域名输入（onBlur/onChange 触发 `guessMarketLanguage` 预选市场）、行业 select、市场 select。竞品**从必填降级为可选折叠项**（「AI 会自动发现候选，稍后确认」，链到 competitors 流）。主 CTA「下一步」：upsert 项目（无 project→`POST /projects`；有→`PATCH /projects/[id]` 含 domain/industry/market/language/competitors），成功后 `step=2` 并记住 projectId。
- **第 2 步「连接数据」**：两张卡，各三态：
  - GSC 卡：已连接 ✓（显示站点）/ 未连接（「连接 GSC」→ `window.location.href = /api/gsc/auth?projectId=<id>&returnTo=/<locale>?step=connect`，全页跳转授权后跳回向导第 2 步）/ 跳过。
  - AI 探针卡：已配 ✓（`aiProbeConfigured`）/ 未配（影响说明 + 「去配置」链 `/<locale>/settings#source-aiProbe`）/ 跳过。
  - 引擎 chips 移到此步（默认 ChatGPT/Perplexity/Gemini/DeepSeek 开、Google AIO 关，沿用现状）。
  - 主 CTA「下一步」→ `step=3`。
- **第 3 步「确认与预估」**：诊断范围摘要（域名/行业/市场/引擎/数据源到位情况）+ `estimateRun` 的耗时 & 成本区间（标「预估」）+ 大按钮「开始诊断」→ `POST /api/runs {projectId, runType:'baseline'}` → 跳 `/<locale>/runs/<runId>`。
- **GSC 往返恢复**：授权跳回 `/<locale>?step=connect&gsc=connected`；home page 读 searchParams 令 `initialStep=2`，并从刷新后的 settings 得到 `gscConnected=true`。向导初始 step = initialStep。

组件较大：把三步各抽为**同文件内的子渲染函数**（`StepSite` / `StepConnect` / `StepConfirm`）或必要时拆平铺子组件（`WizardStepSite.tsx` 等），保持每个单元聚焦、可单测。倾向拆平铺子组件（纯展示 + 回调 props），主 `NewAnalysisForm` 只管 step 编排与 upsert/run 提交。

### 4. 后端改动

- **`PATCH /api/projects/[id]`**：受理 `domain`（走 `normalizeDomain`，非法 422 `invalid_domain`）与 `competitors`（字符串/数组归一）。保持 industry/market/language。
- **`GET /api/gsc/auth`**：读可选 `returnTo`（仅接受站内相对路径，防开放重定向）；state 编码 `projectId` 或 `projectId::<returnTo>`。
- **`GET /api/gsc/callback`**：state 按首个 `::` 拆分为 `projectId` + `returnTo`；有 returnTo → `redirect(returnTo + (含?则&)gsc=connected)`；无 → 维持 `/settings?gsc=connected`。projectId 仍用于存 token。
- **home page `app/[locale]/page.tsx`**（server）：`await searchParams`（读 `step`/`gsc`）；载 `getPrimaryProject` + `getProjectSettings` + `buildDataSourceStatuses`（判 aiProbe 是否配）；把 project/gscConnected/aiProbeConfigured/initialStep 传入向导。

### 5. i18n（`screen1` 扩展，zh/en）

新增 3 步标题与副文案、步骤指示、每卡三态文案（GSC/AI 三态）、竞品可选提示、第 3 步范围摘要标签、预估文案（`estimateTime`/`estimateCost`/`estimatePrefix`「预估」）、返回/上一步。保留现有 key 复用。

### 6. CSS（`app/globals.css` 语义类）

`.wizard`, `.wizard-steps`（3 点进度）, `.wizard-body`, `.connect-card`（三态）, `.estimate-grid`, `.wizard-nav`（上一步/下一步）。尊重 `prefers-reduced-motion`；不引入新依赖。

## 不做（YAGNI / 超范围）

- 不做向导内联 AI key 录入（链设置页，V1 再内联）。
- 不做多项目（V0 单项目 upsert）。
- 不做真实成本核算（探针实际用量在 run 后有 raw 协议，V1 可回填「实际成本」；本步只预估）。
- 不改 GSC OAuth scope / token 存储（G1f 已做）。

## 测试

- `lib/analysis/locale-guess.test.ts`、`lib/analysis/estimate.test.ts`（纯函数主战场）。
- 向导子组件（RTL）：三步渲染、步进、GSC/AI 三态、竞品可选、第 3 步预估展示与「开始诊断」提交（fetch 打桩）。
- `PATCH /projects/[id]` domain/competitors 分支（若有 route 测试则补）。
- GSC auth/callback state 编解码（returnTo 往返 + 无 returnTo 回落设置页 + 开放重定向拦截）。
- 全量 `pnpm test` / tsc / lint / build 绿。

## 验收对照

只填域名即自动预选市场；GSC 在向导内点连接→授权→跳回第 2 步显示已连接；AI 未配有「去配置」直达锚点；第 3 步显示预估耗时/成本并「开始诊断」直接进 run 页；竞品不再是必填。
