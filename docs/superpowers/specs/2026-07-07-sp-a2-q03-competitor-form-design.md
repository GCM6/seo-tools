# SP-A2 Q03 竞品轻检采集器 + content_brief 接线 设计

> 「A 档」第 2 项（`docs/superpowers/specs/2026-07-07-sp-a1-backend-backlog-batch-design.md` triage 中的 #7）。补齐 content_brief 的「SERP Top-5 竞品内容形态」段——当前恒渲染「待补」。
> **无 migration、无 parser 版本 bump、无规则层改动**：新采集器 → 复用 `dataforseo_serp` 证据（`payload.kind` 判别）→ prompt 路由消费。additive：缺数据时回落现有「待补」，零回归。

## 现状（摸底结论）

- content_brief 由 `assembleContentBrief`（`lib/diagnosis/prompt-assembler.ts:125`）纯函数生成；已接受可选 `competitorForm?: string`（`:114`），第 2 段据此渲染，缺省「待补」（`:137`）。当前唯一调用方 `app/api/recommendations/[id]/prompt/route.ts` 生成 brief 时**未传** `competitorForm`。
- 竞品 SERP 页 URL 只存在于 `dataforseo_serp` 证据 `payload.results[].items[].url`（`SeedSerpEntry{keyword, items:SerpItem[]}`，`SerpItem{domain,url,rank,title,type}`）。确认竞品（`getConfirmedCompetitors`）只有 domain。
- `fetchLightCheck(url, host)`（`lib/crawl/light-check.ts:141`）serverless-safe、永不抛、返回 `LightCheckPage`（title/mainTextChars/extra{listCount,tableCount,h2QuestionRate,…}）——**但不暴露原始 HTML**，故不走 `extractSchema`（避免二次抓取/耦合），页面形态信号全取自 light-check。

## 范围

### 1. 纯逻辑 + 轻采集：`lib/collection/competitor-form.ts`（新）

- 类型：
  - `CompetitorFormTarget { keyword; url; domain }`
  - `CompetitorFormSignal { keyword; domain; url; title: string|null; pageType; mainTextChars; listCount; tableCount; h2QuestionRate }`
- `selectCompetitorFormTargets(serpResults, confirmedDomains, cap = 5)`（纯）：逐 seed 关键词取 `domain ∈ confirmed` 的最高排名（rank 最小）item 的 url，一词一条；按 url 去重；截断 cap。**不依赖 gap 计算**（解耦，YAGNI）。
- `inferPageType(page)`（纯，启发式，标签仅供参考非事实）：`h2QuestionRate≥0.3 → 'faq'`；`listCount≥5 → 'listicle'`；`mainTextChars≥2500 → 'article'`；否则 `'page'`。
- `deriveContentForm(target, page)`（纯）：从 `LightCheckPage` 组 `CompetitorFormSignal`。
- `summarizeCompetitorForm(signals)`（纯）：汇总为一段人读中文串（每条：域名·标题·类型·字数量级·结构计数）；空 → `''`。
- `collectCompetitorForm(targets, { fetchLightCheck })`（薄 IO，DI）：逐 target `fetchLightCheck(url, hostOf(url))`，仅 `checkStatus==='checked' && httpStatus<400` 者 `deriveContentForm`，错误页跳过。

### 2. 采集接线：`lib/inngest/reevaluate-competitors.ts`

- `ReevaluateDeps` 增 `fetchLightCheck`、`createEvidenceArtifact`（默认注入真实实现）。
- 新增 `step.run('collect-competitor-form')`（reeval-rules 之后，独立）：
  - 取 `getConfirmedCompetitors` + `getRunEvidence` 找 `dataforseo_serp/kind:'seed_serp'` → results。
  - `selectCompetitorFormTargets` → 空则跳过（no-op，不落证据）。
  - `collectCompetitorForm` → signals → 空则跳过。
  - `createEvidenceArtifact({ type:'dataforseo_serp', payload:{kind:'competitor_content_form', signals}, claimLevel:'L3', source:'competitor_light_check', rawText, rawHash })` + `emit evidence_created`（evidenceType 仍是 `dataforseo_serp`，无需扩 channels/EvidenceType 联合，**免 migration**）。
  - 采集失败整步 try/catch 吞掉（不污染 reeval 主流程；brief 回落待补）。

### 3. 消费：`app/api/recommendations/[id]/prompt/route.ts`

- 生成 content brief 前，`getRunEvidence(run.id)` 找 `kind:'competitor_content_form'` → `summarizeCompetitorForm(payload.signals)` → 非空则作为 `competitorForm` 传入 `assembleContentBrief`。缺则不传（渲染「待补」，与今一致）。

## 不做（YAGNI / 边界）

- 不改 `context.ts` / Q03 规则 detail（rule 层不动，降风险；Q03 finding 仍只列域名+词）。
- 不用 `extractSchema`（fetchLightCheck 不暴露 html，不二次抓取）；FAQ 近似用 `h2QuestionRate`。
- 不新增 evidence 类型 / 不改 schema / 不 bump parser（复用 `dataforseo_serp` + `payload.kind`）。
- 不做渲染后字数（不引 Cloudflare render）；`mainTextChars` 原始 HTML 量级够方向性。

## 测试（TDD）

- `competitor-form.test.ts`：`selectCompetitorFormTargets`（按 rank 取顶、一词一条、去重、cap、非确认域排除）、`inferPageType` 各分支、`deriveContentForm` 映射、`summarizeCompetitorForm`（空→''、多条拼接）、`collectCompetitorForm`（mock fetchLightCheck：跳过 error/4xx 页）。
- reeval：可选补一条「有确认竞品+seed_serp → 落 competitor_content_form 证据」的 DI 单测（若既有 reeval 测试易扩）。
- prompt 路由消费不单测（与既有 gsc 路由等薄封装一致，靠纯函数 + 手验）。
- 验收：`pnpm test` / `tsc` / `lint` / `build` 全绿；brief 第 2 段在有竞品轻检数据时渲染真实形态。

关联：`veris-v3-methodology-redesign` Phase D 局限②（content_brief 竞品形态段待补）。
