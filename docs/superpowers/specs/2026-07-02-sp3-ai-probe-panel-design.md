# SP3 — AI 探针链与诊断面板真数据接入（设计）

日期：2026-07-02
状态：已确认（用户授权「按分析表优化面板，不束缚发挥」；GSC 拆到下一期）

## 1. 目标与范围

把屏 2 诊断面板上依赖 AI 探针的三块（AI 可见度卡、答案出现地图、竞品 SoV）从占位块接到真实数据链路，同时让所有「待接入」空态给出精确、可行动的配置指引。

**本期做：**

1. AI 探针 provider 适配层（OpenAI / Perplexity / Gemini，BYOK，fetch 直连不引 SDK）。
2. 固定 20 条 prompt set 的确定性模板生成（按行业/市场/语言/品牌/竞品填充），落 `prompts` 表。
3. 采集函数新增探针阶段：每 prompt × provider × 样本各一次调用，完整协议落 `ai_answer` evidence（L3）+ `ai_probe_results`。
4. 聚合查询 + 面板渲染：AI 可见度卡（X/20）、PresenceMap（每 prompt 是否出现）、SovBar（品牌与竞品提及占比）。
5. 竞品落库：`projects.competitors`（JSON 数组），表单已有输入框，补齐链路。
6. 空态精确指引：每张待接入卡/占位块显示缺哪个环境变量或数据源，`render_check` 未配置 Cloudflare 时不再误标为「尚未采集」。

**本期不做（顺延）：**

- GSC OAuth（需要用户先在 Google Cloud Console 建凭据，独立一期）。
- Google AI Overviews 探针（是 SERP 特性不是可调 API，归 V1 SERP/AIO 截图）。
- 情绪分析（`sentiment` 保持默认 `neutral`，不造信号）。
- findings 自动生成（另一条链路）。

## 2. 架构与数据流

```
POST /runs → Inngest collectEvidence
  … 既有阶段（serp_snapshot / page_fetch / schema / render_check）
  → [新] probe 阶段（pct 65→90）：
      buildPromptSet(project) → 落 prompts 表（source=template_v1）
      for provider ∈ (defaultModels ∩ 已配置 key):
        for prompt × runIdx(1..n):
          step.run(`probe:{provider}:{i}:{idx}`):
            provider.ask() → 完整协议 → ai_answer evidence(L3) + ai_probe_results
  → mark collected

屏2 Server Component：
  getRunEvidence + getAiProbeSummary(runId)
  → StatStrip（aiVisibility 由聚合派生）
  → PresenceMap / SovBar（真数据）或带指引的空态
```

## 3. 关键决策

### 3.1 Provider 适配层（`lib/probes/providers/`）

统一接口，模式对齐既有 `SearchVisibilityProvider`：

```ts
interface AiProbeProvider {
  id: 'openai' | 'perplexity' | 'gemini'
  modelId: string
  isConfigured(): boolean
  ask(input: { prompt: string; language: string; market: string }): Promise<AiProbeAnswer>
}
// AiProbeAnswer: { answerText, citations: string[], rawResponse: unknown,
//                  webSearchEnabled, temperature/topP（能取则取，取不到记 null） }
```

- OpenAI：Responses API + `web_search` 工具；Perplexity：`sonar`（自带联网引用）；Gemini：`generateContent` + `google_search` grounding。带引用的联网回答是 GEO 探针的意义所在。
- 模型默认值写在代码常量里，可用环境变量覆盖（`AI_PROBE_OPENAI_MODEL` 等）。
- 表单引擎名 ↔ provider 映射：ChatGPT→openai、Perplexity→perplexity、Gemini→gemini；「Google AI Overviews」被选中时忽略（见不做清单）。
- 只探「项目 defaultModels 选中 ∩ key 已配置」的 provider；一个都没有则整段跳过，面板保持待接入。

### 3.2 Prompt set：确定性模板，不用 LLM 生成

V0 用 20 条固定意图模板（推荐类/对比类/怎么办类/评价类…），以品牌、行业、市场、竞品变量填充，按项目语言出中文或英文 prompt。理由：可测试、可复现（回测同协议）、零成本、不依赖任何 key；LLM 生成 prompt 引入不可复现性，违背同协议回测原则。`prompts.source='template_v1'`，per-run 落库。

### 3.3 采样与步骤粒度

- n 取 `project_settings.probeN`（默认 5），环境变量 `AI_PROBE_N` 可覆盖（本地调试降成本）。
- Inngest 步骤粒度 = 单次调用（`probe:{provider}:{promptIdx}:{runIdx}`，调用+落库同步完成，天然幂等重试）。20×5×3 = 最多 300 步，远低于上限；单步一次 LLM 调用，不会顶到 serverless 超时。
- 单次探针失败不摧毁整个 run：捕获后落一条带 `error_code` 的 `ai_answer` evidence（保留失败协议现场），不写 `ai_probe_results` 行，继续后续探针。
- 进度事件按 prompt 粒度 emit（避免 SSE 洪水），pct 在 65→90 区间线性推进。

### 3.4 证据与解析（铁律落点）

- 每次调用一条 `ai_answer` evidence：`claimLevel='L3'`（采样实测），`request` 存 §5.2 完整协议（provider/model_id/web_search_enabled/params/prompts/market/language/run_idx/request_hash），`rawText` 存原始响应 JSON 原样，`rawHash` = sha256。
- 解析器 `lib/probes/parse.ts`（`parser_version='v1'`）：纯函数、确定性——
  - `brandPresent`：品牌词（域名去 TLD + 可选品牌名）在回答文本的词边界匹配（大小写不敏感）；
  - `targetDomainCited`：目标域名出现在引用 URL；
  - `competitorsMentioned`：竞品名逐个匹配；`citedUrls`：引用 URL 列表。
  - LLM 不参与解析，绝不生成数字。

### 3.5 聚合与面板派生

新增 repo 查询 `getAiProbeSummary(runId)`：

- `perPrompt[]`：每条 prompt 是否「任一 provider 任一样本 brandPresent」→ PresenceMap；
- `aiVisibility`：present 的 prompt 数 / prompt 总数 → 指标卡 `X / 20`，等级 L3，evidenceId 取该 run 第一条命中的 `ai_answer`（卡片可点开一条代表性原始回答）；
- `sov[]`：品牌 + 每个竞品的「提及样本数 / 总样本数」百分比，降序 → SovBar。

`deriveStatCards(evidence, { probeSummary?, sources? })` 扩展第二参数；无 probe 数据时 aiVisibility 保持 pending。

### 3.6 空态精确指引

新增 `lib/config/data-sources.ts`（仅服务端）：读 env 汇总各数据源配置状态 `{ searchProvider, renderProvider, aiProviders: string[], gsc: false }`，由屏 2 Server Component 传下去：

- `serp_snapshot` 缺失 → 「配置 GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX 后重新诊断」；
- `render_check` 缺失且 Cloudflare 未配置 → 新 pending 原因 `render_provider`（修正现在误标的「尚未采集」）；
- AI 三块 → 列出缺失的 key（如「未配置 OPENAI_API_KEY / PERPLEXITY_API_KEY / GEMINI_API_KEY，配置任一后勾选对应引擎重新诊断」）；已配置但本 run 未采到 → 「重新诊断」提示；
- `gsc` → 「GSC OAuth 接入将在下一期提供」。

图例计数改为动态插值（`你出现（{count}）`），去掉写死的 6/14。

### 3.7 竞品落库

`projects` 表加 `competitors`（JSON string[]，默认 `[]`）；`POST /api/projects` 接收并规范化（逗号分隔→trim→去空）；表单把已有输入框的值传上来。SoV 与解析器都从项目读竞品。

## 4. 错误处理

- provider HTTP 非 2xx / 超时：单步失败重试由 Inngest 承担，重试耗尽落 error evidence 继续；
- 全部 provider 未配置：跳过探针阶段，run 正常 collected（与现在 CSE/Cloudflare 行为一致）；
- 聚合查询对 0 数据返回 null，UI 显式空态，不出现 0/20 之类的假实测。

## 5. 测试策略

- 单元：prompt 模板（数量恰 20、变量填充、双语）、每个 provider 适配器（mock fetch：请求形状/解析/未配置抛错）、解析器（品牌/域名/竞品边界样例）、聚合查询（内存 fake repo）、`deriveStatCards` 新分支、空态指引映射。
- 采集编排：仿既有 `collect-evidence.test.ts` 的 fake step/publish/deps，断言步骤序列、失败续跑、跳过逻辑、进度事件。
- 端到端（本地）：无 AI key 时 run collected + 面板显示精确指引；配 key 后（用户自备）出真数据。

## 6. 涉及文件

新增：`lib/probes/{prompt-set,parse,run-probes}.ts`、`lib/probes/providers/{types,openai,perplexity,gemini}.ts`、`lib/config/data-sources.ts` 及配套测试。
修改：`db/schema.ts`（projects.competitors）、`app/api/projects/route.ts`、`components/NewAnalysisForm.tsx`、`lib/inngest/collect-evidence.ts`、`lib/repositories/index.ts`、`lib/diagnostics.ts`、`app/[locale]/runs/[id]/page.tsx`、`components/StatStrip.tsx`（如需传指引）、`messages/{zh,en}.json`、`.env.example`、`README.md`。
