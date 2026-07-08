# 设计:重新分析入口 + 全站 Header 导航 + Footer

- 日期:2026-07-08
- 状态:已与用户确认方向(重新分析=双入口分流;导航=项目+规则库+设置+新建 CTA;Footer=多栏信息式)
- 前置阅读:`docs/plan-ux.md`(同协议回测原则 §5.2/§9)、`CLAUDE.md`(语言规范、数据不变量)

## 0. 背景与问题

1. **没有重新分析入口**:同协议回测 API(`POST /api/runs/[id]/retest`,见 `app/api/runs/[id]/retest/route.ts`)与 `RetestBanner` 已存在,但项目列表(`/projects`)与项目详情历史记录(`components/RunHistory.tsx`)里都没有重跑按钮;"尚未诊断"的项目更是没有任何续起分析的入口。
2. **导航机制本身是缺陷**:header + 4 步向导条由 `components/Shell.tsx` 实现,靠 12 个页面各自 `import Shell` 包裹;`/rules` 规则库页忘了包,成为无导航孤岛(`app/[locale]/rules/page.tsx`)。
3. **没有 footer**:全站不存在 Footer 组件(仅报告分享页有 `.share-footer` 版权行)。

## 1. 布局架构:导航从"每页自包"改为 layout 统一渲染

### 1.1 组件拆分

把现有 `Shell` 拆成三件:

| 组件 | 性质 | 内容 | 渲染位置 |
|---|---|---|---|
| `components/SiteHeader.tsx`(新) | Server Component | 品牌 logo(链 `/${locale}/`,沿用根页智能重定向)、导航链接「项目 / 规则库 / 设置」、「新建分析」主按钮(黑底 CTA,链 `/${locale}/new`)、`DataSourceHealth` 状态 pill、`LocaleSwitch` | `app/[locale]/layout.tsx` 统一渲染 |
| `components/SiteFooter.tsx`(新) | Server Component | 三栏信息式 footer,见 §3 | `app/[locale]/layout.tsx` 统一渲染 |
| `Shell`(瘦身) | Server Component | 仅剩向导上下文:`Stepper` + 「分析目标」域名徽章 | 仅向导流页面使用:`/new`、`/runs/*` 全部子页 |

### 1.2 页面归属

- **带 Stepper(继续包 Shell)**:`/new`、`/runs/[id]` 及其 7 个子页(facts/keywords/competitors/site/recommendations/output/report)。
- **不再显示 Stepper(去掉 Shell 包裹)**:`/projects`、`/projects/[id]`、`/settings`、`/rules`。理由:这些页面不在向导流内,现状永远高亮"步骤 1"语义错误。已获用户认可。
- **`/share/[token]`**:保持完全独立(在 `[locale]` 段之外),不渲染内部 header/footer——对外只读页不暴露内部入口。

### 1.3 layout 改造

`app/[locale]/layout.tsx` 的 body 结构变为:

```
<SiteHeader locale={locale} />
<main class="shell">{children}</main>
<SiteFooter locale={locale} />
```

全站新页面自动获得导航与 footer,孤岛问题从机制上消除。

## 2. 重新分析:双入口按状态分流

### 2.1 状态判定(project 维度)

对每个项目,依其 runs 计算一个 `reanalyzeState`:

| 状态 | 判定条件 | 主操作 | 行为 |
|---|---|---|---|
| `running` | 存在 `status ∉ {output, failed}` 的 run | 「诊断中…」(链接) | 链到该 run 详情看进度;不提供任何重跑按钮(防并发) |
| `retestable` | 无进行中 run,且存在 `status = 'output'` 且 `runType = 'baseline'` 的 run | 「发起回测」(主)+「重新配置」(次级链接) | 主:`POST /api/runs/{最近完成的 baseline}/retest`,成功跳新 retest run;次:跳 `/new?projectId={id}` 预填 |
| `unconfigured` | 其余(无 run、只有失败 run、或完成的全是无锚 retest——理论上不出现) | 「配置并分析」 | 跳 `/new?projectId={id}`,预填后可编辑,运行产出新 baseline |

### 2.2 入口位置

1. **项目列表页 `/projects`**(`components/ProjectList.tsx`):表格加"操作"列,按 §2.1 渲染。
2. **项目详情页 `/projects/[id]`**:
   - 页头按钮组:同 §2.1 的项目级操作。
   - `RunHistory` 表格:每条 `runType='baseline'` 且 `status='output'` 的行,操作列增加「以此回测」——允许锚定任意历史 baseline,不只最近一次。项目处于 `running` 状态时这些按钮禁用。

### 2.3 后端不变量:同项目并发 run 保护(新增)

`POST /api/runs`(`app/api/runs/route.ts`)与 `POST /api/runs/[id]/retest` 都增加检查:**同项目存在 `status ∉ {output, failed}` 的 run 时返回 409**(body 带 `error: 'run_in_progress'` 与进行中 run 的 id)。

理由:入口从 RetestBanner 一处扩大到列表每行,误触/双击产生并发采集的风险变实;两个 API 目前均无保护。前端收到 409 时提示并链到进行中的 run。

### 2.4 `/new?projectId=` 预填(补齐)

`app/[locale]/new/page.tsx` 已接收 `projectId` 并把 project 传入 `NewAnalysisForm`(现用于 GSC 授权续起)。本设计要求预填**全部**配置项:

- Step1:域名、行业、市场、竞品(来自 `projects` 行:`domain/industry/market/competitors`)。
- Step2:引擎多选(来自 `projectSettings.defaultModels`)、GSC 连接状态(来自 `projectSettings.gscConnected`)。
- 提交沿现有链路:有 `projectId` 走 `PATCH /api/projects/{id}`,然后 `POST /api/runs`(`runType:'baseline'`)。

> **实现第一核查项(assumed)**:竞品与引擎多选是否已从 project/projectSettings 回填未经验证;实现前先读 `NewAnalysisForm.tsx` 的初始化逻辑,缺哪项补哪项,勿重复实现。

### 2.5 语义边界(产品铁律对齐)

- 「发起回测」= 同协议:复用项目当前配置,`protocolVersion` 继承 baseline(现有 API 行为),产出可与 baseline 做 delta(`retest_snapshots`)。
- 「重新配置 / 配置并分析」= 新 baseline:允许改任何配置,**不产生**与旧 run 的 delta 对比,不污染同协议语义。
- 已知局限(不在本期修):`runs` 表不存配置快照,项目配置在两次 run 之间被编辑时,旧 run 无法严格还原当时配置(见 `db/schema.ts` runs 表)。本设计不引入配置快照表。

## 3. Footer:三栏信息式 + 版本底行

只链接已存在的路由,不发明新页面:

- **栏 1 · 产品**:「Veris — SEO + GEO 证据化诊断工作台」+ 方法论定位一句:"每个结论都有证据分级,『实测』标签仅授予 L3/L4 证据。"
- **栏 2 · 导航**:项目、新建分析、规则库、设置(与 header 一致,链 `/${locale}/...`)。
- **栏 3 · 方法论**:证据分级 L0–L4 一行简述;"同协议回测:前后对比使用同一 prompt 集、市场语言、模型族与采样规则";当前规则版本(`RULES_VERSION`,来自 `lib` 常量)与协议版本(`v2`)。版本号服务诊断可复现性,非装饰。
- **底行**:`© 2026 Veris · v{package.json version}`。

## 4. i18n 与样式

- `messages/zh.json`、`messages/en.json` 新增顶层命名空间 `nav`(header 链接、CTA)与 `footer`(三栏全部文案);`projects` 命名空间补操作列文案(`actionRetest / actionReconfigure / actionConfigure / actionRunning` 等)。UI 文案中文优先,英文对照按现有惯例。
- 样式延续现有体系:`--ds-*` token + `app/globals.css` 手写 class(BEM 风格),不引入组件库;footer 用 `--ds-surface-1` 底色、细上边框,视觉重量低于内容区;header 沿用现有 `.topbar` 风格,CTA 按钮复用现有黑底主按钮样式。

## 5. 验收标准(pass/fail)

1. `/rules` 页出现全局 header 与 footer。
2. `[locale]` 下全部页面(13 个 page.tsx)有统一 header/footer;`/share/[token]` 没有。
3. `/projects`、`/settings` 不再显示 Stepper;`/new`、`/runs/*` 仍显示且 active 步骤正确。
4. 项目列表三种状态(`running / retestable / unconfigured`)各渲染正确按钮;点「发起回测」产生 `runType='retest'`、`protocolVersion` 继承 baseline 的新 run 并跳转。
5. 同项目存在进行中 run 时,`POST /api/runs` 与 `POST /api/runs/[id]/retest` 均返回 409。
6. `/new?projectId=` 预填域名/行业/市场/竞品/引擎/GSC 状态。
7. 现有测试全绿(基线 792)+ 新组件/新逻辑各有测试(SiteHeader、SiteFooter、ProjectList 操作列三态、409 保护、预填)。

## 6. 明确不做(本期)

- run 详情页内的面包屑 / 子页 tab 两级导航(用户选择留待二期)。
- runs 配置快照表(时点还原历史配置)。
- footer 中的方法论独立页面(栏 3 用简述文字,不新建路由)。
- `/share` 页任何改动。
