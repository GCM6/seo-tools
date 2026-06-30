# SP1：前端骨架 + 数据底座 · 设计文档

> 项目代号 **Veris**：SEO + GEO 证据化诊断台。
> 本文是 V0 第一个子项目（SP1）的设计 spec。上游权威方案见 `docs/plan-ux.md`，UI 原型见 `docs/plan-d.md`（实为可点击 HTML）。
> 日期：2026-06-30。

---

## 0. 背景与本轮目标

文档里的「完整 V0」（`plan-ux.md` §8.1）是一整套全栈系统，文档自评为 2-3 周工作量。一次性实现不现实，按工程纪律拆成有序子项目，每个子项目独立走 spec → plan → 实现。

**本轮（SP1）只交付前端骨架 + 数据底座，让产品可以 `dev` 跑起来、4 屏可点、数据契约成型。** 真实采集（Playwright/GSC/AI 探针）留到后续子项目。

---

## 1. 技术栈决策（已与文档偏离，需同步更新文档）

文档原选型是 Python/FastAPI + PostgreSQL，前后端分离。本项目基于「单一部署 + 部署到 Vercel + 用 libSQL」三个约束，收敛为**单一 TypeScript 全栈**：

| 层 | 本项目选型 | 说明 |
|---|---|---|
| 前端 + API | Next.js 16 App Router + React 19 + TypeScript | 内部工具，重交互 |
| 样式 | Tailwind v4 + CSS 变量主题 | 基座用炼图术 Studio 设计体系 `docs/d.md`（Apple 极简白/暗、Geist 双字体、亮+暗 token）；证据等级四色为独立语义层。详见 §5.1 |
| 多语言 | **next-intl**，locale segment `app/[locale]/...`，首批 `en` + `zh`，默认 `zh` | App Router 原生方案；文案全部外置到 message 目录 |
| 部署 | **Vercel（serverless）** | 单一部署 |
| 数据库 | **libSQL（Turso）+ Drizzle ORM** | JSON 字段存文本，CHECK/FK 落 §6.2 约束 |
| 页面渲染（SP2） | **托管浏览器 API**（Browserbase / Browserless / Cloudflare Browser Rendering），藏在 `RenderProvider` 接口后 | Vercel 不能自带完整 chromium |
| 长任务编排（SP2+） | **Inngest** | Vercel serverless 不能进程内跑长任务 |
| AI 探针（SP4） | 各家官方 TS SDK（Perplexity / OpenAI / Anthropic / Google） | provider adapter |
| GSC（SP3） | Google OAuth 只读 | fetch，无需常驻 |

### 1.1 Vercel 带来的两条既定架构约束（写死，避免后续返工）

1. **渲染不能自带 Playwright**。Vercel serverless 包体/超时扛不住完整 chromium 多页渲染。`render_check` 必须走托管浏览器 API。代码侧定义 `RenderProvider` 接口，SP2 接具体实现。
2. **长任务不能进程内后台跑**。一次诊断 run 有几十~几百个调用，超过单函数时长上限。改用 Inngest 把 run 拆成持久化步骤，断了能续，前端 SSE 看进度。文档 §4.1 的「FastAPI background task」模型在 Vercel 上由此替代。

> 对 SP1 影响为零：本轮不渲染、不跑长任务，纯前端 + schema + 桩，部署 Vercel 无障碍。这两条约束 SP2/SP4 才生效，此处记录以免后期返工。

### 1.2 需同步更新的文档（SP1 的交付物之一）

- `plan-ux.md` §4.1 技术栈表：Python/FastAPI/Postgres → Next 全栈 / libSQL / Vercel；§4.1 渲染行补注「Vercel 用托管浏览器 API」；§4.1 异步行补注 Inngest。
- `CLAUDE.md`：后端铁律由 Python/FastAPI 改为 Next 全栈 + libSQL。
- `veris-coding` skill：同步栈约定（**实现阶段第一件事就是更新它**，否则编码会按旧铁律走偏）。

---

## 2. V0 子项目路线图

| | 子项目 | 内容 | 对应文档 |
|---|---|---|---|
| **SP1（本轮）** | 前端骨架 + 数据底座 | Next 脚手架、4 屏 UI、libSQL schema(§6)、核心 API 桩 | §9 §6 §7 |
| SP2 | 证据采集 | 页面抓取 + 托管浏览器渲染对比、schema/robots/meta 检测、evidence 入库 | §5 |
| SP3 | GSC 接入 | Google OAuth 只读、真实查询/展示/CTR/排名 | §4.1 |
| SP4 | AI 探针 | provider adapter、探针协议留存、presence/citation 指标 | §5.2 §5.3 |
| SP5 | 诊断与建议 | finding/recommendation 生成、人工闸门状态机、prompt assembler | §3 |
| SP6 | 回测与导出 | retest run、delta 报告、Markdown 导出 | §3.1 |

---

## 3. SP1 架构与分层

```
app/
  [locale]/                        next-intl locale segment（en / zh，默认 zh）
    layout.tsx                     顶栏（含语言切换） + stepper 外壳 + CSS 变量主题
    page.tsx                       屏1 新建分析
    runs/[id]/page.tsx             屏2 诊断仪表台
    runs/[id]/recommendations/page.tsx  屏3 优化建议
    runs/[id]/output/page.tsx      屏4 输出
  api/                             §7 REST Route Handlers（与 locale 无关，本轮读 seed/fixtures 返回桩数据）
    projects/route.ts  projects/[id]/route.ts
    runs/route.ts  runs/[id]/route.ts  runs/[id]/events/route.ts(SSE)
    runs/[id]/evidence/route.ts  evidence/[id]/route.ts
    runs/[id]/findings/route.ts  findings/[id]/route.ts
    runs/[id]/recommendations/route.ts  recommendations/[id]/route.ts
    recommendations/[id]/prompt/route.ts
    runs/[id]/report/route.ts  runs/[id]/retest/route.ts  runs/[id]/delta/route.ts
    brand-facts/...  settings/providers/...
components/                        见 §5
lib/
  types.ts                         领域类型：claim_type、证据等级 L0–L4、§6 各实体
  evidence.ts                      证据等级 ↔ UI 标签映射规则（§5.1 界面规则）
  repositories/                    数据访问层（Server Component 与 API Route 共用）
  fixtures.ts                      类型化 mock（teamflow.cn 样例，来自原型）
i18n/
  routing.ts / request.ts          next-intl 配置（locales、默认 locale、路由）
messages/
  en.json  zh.json                 全部 UI 文案外置（含 §5.3 修正后的两套表达）
db/
  schema.ts                        Drizzle 建模 §6 全部表
  constraints.ts / migrations      §6.2 约束（CHECK/FK）
  seed.ts                          种子数据（teamflow.cn 完整一套 run）
```

### 3.1 数据流（本轮）

Server Component 与 API Route **共用 `lib/repositories`** 数据访问层。本轮 repositories 读 libSQL 里的 seed 数据（或 fixtures），返回类型与「接真实采集器后」一致。SP2+ 只替换 repositories 内部实现与采集逻辑，**前端与 API 契约不变**。

`/runs/{id}/events` SSE 端点本轮用桩事件流模拟渐进诊断（progress / finding_created / failed）。

---

## 4. 数据模型（libSQL，落 §6 全部表 + §6.2 约束）

用 Drizzle 建模 `plan-ux.md` §6.1 的全部表：
`projects` / `project_settings` / `brand_facts` / `runs` / `prompts` / `evidence_artifacts` / `ai_probe_results` / `findings` / `recommendations` / `generated_prompts` / `retest_snapshots`。

### 4.1 libSQL 适配

- JSONB 字段（`request_jsonb` `payload_jsonb` `evidence_refs[]` `cited_urls[]` `edited_payload_jsonb` `input_fact_refs[]` 等）→ 存 JSON 文本（Drizzle `text({ mode: 'json' })`），读时解析。
- 枚举字段（`claim_type` `status` `run_type` `type` `claim_level` 等）→ 用 CHECK 约束限定取值。

### 4.2 §6.2 约束逐条落地

| 文档约束 | libSQL 落地方式 |
|---|---|
| `findings.evidence_refs` 非空 | CHECK（JSON 数组长度 > 0）+ 应用层校验 |
| `claim_type=measured_hard` 需 ≥1 个 L4 证据 | 应用层在写入/状态流转时校验关联 evidence 的 `claim_level` |
| `claim_type=measured_sample` 需关联 probe/SERP 样本 | 应用层校验存在关联 `ai_probe_results` 或 SERP evidence |
| `recommendations.status in (accepted,edited)` 才能生成 prompt | `generated_prompts` 写入前校验关联 recommendation 状态，否则抛错 |
| `generated_prompts.input_fact_refs` 必须引 verified brand_facts | 应用层校验引用的 `brand_facts.status = verified` |
| 证据不可变 | 写入即存原始 payload + captured_at + 工具版本 + hash，无更新路径 |
| 删项目级联删用户数据与第三方响应 | FK `ON DELETE CASCADE` |

> 这些约束是产品护城河，必须有对应单测（§7）。

---

## 5. UI（还原原型 + 修正文案）

### 5.1 主题（基座 = 炼图术 Studio 设计体系 `docs/d.md`）

主题真相来源改为 `docs/d.md`（炼图术 Studio：Apple 极简白/暗色），**取代原型 `plan-d.md` 的临时 token**。分两层：

**A. 基座层（照 `docs/d.md` 全套 token）：**
- 画布/表面：`--ds-canvas/--ds-surface-1..3/--ds-surface-elevated`。
- 文字层级：`--ds-ink/--ds-body/--ds-muted/--ds-ghost`。
- 品牌色：`--ds-primary`(Apple Blue #0071e3) 普通操作/导航/链接；`--ds-mystic`(#6366f1) 专用于 **AI/GEO 元素**（探针、AI 可见度、Style）。
- 语义色 `--ds-success/error/warning/info`、间距 `--sp-*`(4px 步进)、圆角 `--rd-*`、阴影 `--shadow-*`、过渡 `--transition-*`、布局尺寸。
- 字体：**Geist Sans**(UI) + **Geist Mono**(AI 输出/代码/提示词)，经 `next/font/google` 引入；**保留 Noto Sans SC 作 CJK 兜底**（Geist 不含中文字形），挂在 `--font-sans`/`--font-mono` 字体栈尾。
- **亮 + 暗双 token 都写入**（`:root` 亮 / `.dark` 暗）；SP1 默认亮色、**不做切换器**（toggle 留后续）。
- Tailwind v4 用 `@theme inline` 把 token 注册进编译器（照 `docs/d.md` §5.2）。

**B. 证据等级语义层（产品护城河，独立保留，名字不变）：**
- `--measured`(实测/青 #0B6E74) `--inferred`(推断/橙 #B26B16) `--gap`(差距/红 #B23A48) `--good`(已具备/绿 #2E7D56)，含各自浅底色 `-bg`。
- 这四色**不**并入炼图术语义色，保持证据标签的独特辨识度；亮暗模式下各给一组取值。
- AI/GEO 相关强调（如 GEO 可见度、探针来源）用 `--ds-mystic`。

> 组件引用的 `.tag.m/.tag.i/.tag.g/.tag.ok` 类名与证据 token 名**不变**，故 Task 9–14 不受影响；变的是基座（surface/字体/间距/阴影/暗色）。

### 5.2 组件清单

| 组件 | 用途 | 屏 |
|---|---|---|
| `Stepper` | 4 步导航（路由驱动，非单页切换） | 全局 |
| `ProvenanceTag` | 证据等级标签（实测/推断/差距/已具备），**贯穿全 UI 的护城河信号** | 全局 |
| `NewAnalysisForm` | URL/行业/市场/竞品/探测引擎/GSC 开关 + 预计耗时与成本 | 1 |
| `StatStrip` / `Stat` | AI 可见度、平均排名、可抓取页面、竞品可见度 | 2 |
| `PresenceMap` | 20 提问答案出现地图，hover tooltip | 2 |
| `SovBar` | 竞品 Share of Voice 条 | 2 |
| `FindingList` / `FindingCard` / `EvidenceDrawer` | 问题清单 + 可展开原始证据抽屉（GEO/SEO tab） | 2 |
| `RecCard` | 建议卡：做什么/为什么/证据/影响/工作量/风险/验证；接受/编辑/否决状态机 | 3 |
| `PromptCard` | 提示词卡 + 复制 | 4 |
| `ReportPanel` | 报告摘要 + 导出（本轮按钮占位/演示态） | 4 |

### 5.3 文案修正（同步 §9.3，强制）

- 「AI Overviews 压制」→「疑似受 SERP 特性 / AIO 影响」。
- 「AI 爬虫读不到」→「非渲染抓取链路读不到初始正文」。
- `n=5` AI 样本一律标「方向性样本」，不标「置信 高」。
- `实测` 标签只对应 L3/L4；`推断`→L2；`疑似`→L1/L2。禁止把 L2 写成确定因果。

### 5.4 多语言（en + zh）

- 用 **next-intl**：`app/[locale]/` 路由段，`locales = ['en','zh']`，默认 `zh`（产品主受众），未匹配回退默认。
- **全部 UI 文案外置**到 `messages/en.json` + `messages/zh.json`，组件经 `useTranslations` / `getTranslations` 取文案，不写死中文。
- 顶栏放语言切换；切换保持当前路由与 run id。
- §5.3 的文案修正在**两套语言里都要正确表达**（例：「非渲染抓取链路读不到初始正文」/ "core text isn't present in the non-rendered crawl path"）。
- **范围内 vs 范围外**：UI 静态文案双语本轮做；数据库里的用户内容（finding 描述、建议正文、证据原文、品牌事实）本轮仍是 seed 里的样例文本，不做内容级翻译——内容多语言是后续子项目的事，SP1 只保证「界面框架支持双语」。

### 5.5 状态机（前端本轮即实现，写入走 API 桩）

建议卡：`draft → accepted | edited | rejected`。只有 `accepted/edited` 的建议在屏4 生成提示词。否决/草稿不进入输出。本轮状态变更打到 `PATCH /recommendations/{id}` 桩接口并乐观更新。

---

## 6. API 桩（§7 契约）

Route Handlers 实现 `plan-ux.md` §7 全部端点的**请求/响应形状**，本轮从 seed/repositories 返回桩数据，类型与真实版一致。重点端点：

- `POST /runs`、`GET /runs/{id}`、`GET /runs/{id}/events`(SSE 桩事件)
- `GET /runs/{id}/findings`、`PATCH /findings/{id}`
- `GET /runs/{id}/recommendations`、`PATCH /recommendations/{id}`
- `POST /recommendations/{id}/prompt`（**桩里也要校验 status ∈ {accepted,edited}，否则 4xx**——契约从第一天就成立）
- `GET /evidence/{id}`、`GET /runs/{id}/report`

---

## 7. 测试（TDD）

- **数据访问层 + 约束**（Vitest）：重点覆盖 §6.2 不变量——
  - 非 accepted/edited 的 recommendation 生成 prompt 必须抛错；
  - `measured_hard` 无 L4 证据写入必须失败；
  - `findings.evidence_refs` 为空必须失败；
  - `generated_prompts.input_fact_refs` 引用非 verified brand_fact 必须失败。
- **证据等级 ↔ 标签映射**（`lib/evidence.ts`）：L3/L4→实测，L2→推断，L1→疑似，禁止 L2 标确定。
- **关键 UI 组件**（React Testing Library 冒烟）：FindingCard 展开证据抽屉、RecCard 状态机、PromptCard 复制。

---

## 8. SP1 完成定义（DoD）

1. `npm run dev` 起得来，4 屏可经 stepper 路由互通，视觉还原原型且文案已按 §9.3 修正。
   - en / zh 双语可切换，全部 UI 文案走 message 目录、无写死中文；两套语言文案完整且符合 §5.3 表达规则。
2. libSQL schema 建好，§6 全部表 + §6.2 约束落地，seed 一套完整 teamflow.cn run。
3. §7 核心 API 桩可用，契约类型与真实版一致，prompt 生成桩已强制状态校验。
4. §7 测试全绿。
5. `plan-ux.md` / `CLAUDE.md` / `veris-coding` 技术栈描述已同步更新。
6. 部署 Vercel 可访问（纯前端 + 桩，无渲染/长任务依赖）。

## 9. 非目标（本轮明确不做）

- 真实页面抓取 / Playwright / 托管浏览器调用（SP2）。
- GSC OAuth 真实接入（SP3）。
- 真实 AI 探针 / provider adapter（SP4）。
- 真实 finding/recommendation 生成 agent（SP5）。
- 回测 delta 计算、PDF/分享链接（SP6 / V1）。
- 多租户、计费、Redis、DataForSEO、自动写 CMS（V1/V2，文档 §8 明确延后）。
