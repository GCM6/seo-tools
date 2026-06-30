# SEO + GEO 诊断优化助手 · 技术 / 交互 / 商业可行性方案 v2

> 配套 UI 原型见 `docs/plan-d.md`。该文件虽然扩展名是 `.md`，实际是一份可点击 HTML 原型；后续建议改名为 `docs/prototype.html`，或在 README 中明确打开方式。
>
> 工具内部代号 **Veris**。产品灵魂保持不变：**每个结论都必须可验证；不能验证的，只能标为推断或假设**。
>
> 本版是在 v1 基础上补齐四件事：真实性保障、MVP 边界、回测闭环、商业可行性判断。调研日期：2026-06-30。

---

## 一、结论摘要

### 1.1 是否可做

**可以做，但要把定位从“AI SEO 神器”收敛为“SEO + AI 搜索可见度的证据化诊断台”。**

可行的部分：
- 抓取页面初始 HTML、渲染后正文、robots、sitemap、schema，判断内容是否容易被搜索和 AI 引擎读取。
- 接入 GSC，拿到真实查询、展示、点击、CTR、平均排名，形成 SEO 地面实况。
- 对 ChatGPT / Perplexity / Gemini / Claude 等模型做固定协议探针，记录品牌是否出现、竞品是否出现、回答原文、引用 URL、时间、模型和配置。
- 把证据、发现、建议、提示词串成闭环，并支持 4-6 周后按同一协议回测 delta。

必须克制的部分：
- 不能承诺“让 AI Overviews 一定引用你”。
- 不能把低 CTR 直接归因于 AI Overviews，除非保存了同地区、同设备、同日期的 SERP/AIO 证据。
- 不能把 `关闭 JS 后正文为空` 直接等同于“所有 AI 都读不到”，只能说“对不渲染 JS 的抓取链路不可见，存在明显可读性风险”。

### 1.2 是否有商业价值

**有商业价值，但第一版要避开通用大平台正面竞争，先服务一个细分人群。**

更适合的切入点：
- 独立站、SaaS、跨境、电商、本地服务这类“搜索获客 + 内容获客”强依赖团队。
- 已有 GSC 数据但不知道怎么转成行动项的小团队。
- 想知道自己在 ChatGPT / Perplexity / Gemini 等回答中是否出现的品牌方。
- 需要“证据 + 执行提示词”，而不是只看图表的运营人员。

商业定位建议：
- **不是** 传统 rank tracker。
- **不是** 自动生成垃圾内容工具。
- **是** “可复核的 SEO/GEO 诊断 + 人工确认 + 执行提示词 + 回测”的工作台。

---

## 二、外部调研要点

### 2.1 官方信号

1. Google 官方对 AI features / AI Overviews 的站点建议没有脱离传统搜索基本面：可抓取、可索引、高质量内容、结构化数据和预览控制仍是核心。官方文档明确表示不需要为 AI features 做额外特殊处理。  
   来源：https://developers.google.com/search/docs/appearance/ai-features

2. GSC Search Analytics API 可以按站点查询 clicks、impressions、CTR、position 等指标，是“真实 SEO 地面实况”的合适来源。  
   来源：https://developers.google.com/webmaster-tools/v1/searchanalytics/query

3. Google Search Console 会把 AI features 的点击、展示和排名计入 Search Console，但目前不提供单独拆分 AI Overviews 的独立维度。这意味着 Veris 不能只靠 GSC 判断某个词是否被 AIO 截流，必须额外保存 SERP/AIO 现场证据。  
   来源：https://developers.google.com/search/docs/appearance/ai-features

4. Perplexity Sonar / Search API、OpenAI Responses API 的 web search、Anthropic web search tool 等都提供了“带引用的联网回答”能力或工具接口，说明 AI 探针在工程上可落地，但每家返回结构、引用质量、地区和模型行为不同，必须做 provider 抽象和原始响应留存。  
   来源：
   - https://docs.perplexity.ai/
   - https://platform.openai.com/docs/guides/tools-web-search
   - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool

### 2.2 市场信号

市场已经出现一批 AI visibility / GEO / AI search monitoring 工具，例如 Semrush AI Toolkit、Ahrefs Brand Radar、Profound、Peec AI、Otterly、Scrunch AI 等。它们验证了需求存在：品牌开始关心自己在 AI 回答中的出现率、引用率、竞品对比和声量变化。

但这也说明通用监控赛道会很快拥挤。Veris 的差异化不能只做“看见没看见”，而要做：
- 证据等级清楚。
- 结论可复核。
- 给到可执行改造建议。
- 人工确认后生成高质量提示词。
- 4-6 周后按同一协议回测。

### 2.3 对原方案的校准

原方案方向正确，但要修正三类表达：

| 原表达 | 风险 | v2 修正 |
|---|---|---|
| AI Overviews 压制 CTR | 因果证据不足 | 改为“疑似受 SERP 特性 / AIO 影响”，需 SERP 证据升级 |
| AI 爬虫读不到 | 对所有引擎过度概括 | 改为“不渲染 JS 的抓取链路读不到初始正文” |
| 各家 AI 跑 5 次 = 高置信 | 样本太小 | `n=5` 只能做方向性；高置信需要更高样本和稳定协议 |

---

## 三、产品闭环

### 3.1 端到端流程

```
[新建项目]
  输入域名 / 行业 / 市场 / 语言 / 竞品 / 探测模型 / 是否接 GSC
      |
[采集证据]
  GSC 查询、页面抓取、渲染对比、schema、robots、AI 探针、SERP/AIO 截图(可选)
      |
[生成 findings]
  每条 finding 必须引用证据；证据不足则只能标为 inferred 或 hypothesis
      |
[生成 recommendations]
  每条建议说明：做什么、为什么、证据、预期影响、工作量、风险、验证方式
      |
[人工闸门]
  接受 / 编辑 / 否决；只有接受或编辑后的建议进入输出
      |
[输出执行资产]
  精确提示词、技术改造清单、报告
      |
[回测]
  4-6 周后用同一 prompt set / model protocol / GSC window 重跑，计算 delta
```

### 3.2 关键原则

1. **证据先于结论**：没有 evidence artifact，就不能生成 measured finding。
2. **测量和推断分层**：事实、样本测量、模型推断、产品建议必须分开。
3. **人在环内**：工具不给自动发布权限，默认只输出建议和提示词。
4. **同协议回测**：前后对比必须用同一 prompt set、同一市场语言、同一模型族和同一采样规则。
5. **可解释的“不确定”**：当模型、地区、SERP 状态不稳定时，界面要明确显示不确定性。

---

## 四、技术架构

### 4.1 技术栈

> **注：技术栈已于 SP1 收敛为单一 TS 全栈 + Vercel，详见 `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md`。** 原 Python/FastAPI + PostgreSQL 方案已废弃，下表为收敛后的实际选型。

| 层 | V0 选型 | V1/V2 扩展 | 说明 |
|---|---|---|---|
| 前端 | Next.js 16 全栈 | 组件库 / 报告导出 | 内部工具先重交互，不做营销页 |
| 后端 | 同前端（Next Route Handlers / Server Actions） | worker 服务拆分 | 单一 TS 全栈，省去跨语言边界 |
| 异步 | Inngest（Vercel） | 队列扩容 / 多步编排 | Serverless 友好，承载长任务 / 重试 |
| 数据库 | libSQL (Turso) | 副本 / 向量扩展 | JSON 存原始证据，关系表做约束 |
| 缓存 | libSQL 表 / Vercel 边缘 | Redis | V0 用 DB 足够；模型探针规模化再上 Redis |
| 页面检测 | 托管浏览器 API（Vercel 不能自带 chromium） | 多 UA / 截图归档 | 比较初始 HTML 和渲染后正文 |
| AI 探针 | Perplexity + 1 个通用模型 | OpenAI / Anthropic / Google / Gemini | 统一 provider adapter |
| GSC | Google OAuth readonly | GA4 / BigQuery | GSC 是第一优先级真实数据 |

### 4.2 系统结构

```
Frontend
  新建项目 / 运行进度 / 诊断仪表台 / 建议审阅 / 输出 / 回测
      |
Next（Route Handlers / Server Actions）
  Project API
  Run Orchestrator（长任务走 Inngest）
  Evidence Collector
  Finding Generator
  Recommendation Generator
  Prompt Assembler
      |
Tools
  fetch_page
  render_check
  parse_schema
  gsc_query
  ai_probe
  serp_snapshot(optional)
  trends/autocomplete(optional)
      |
libSQL (Turso)
  projects / runs / evidence_artifacts / probe_results / findings
  recommendations / brand_facts / generated_prompts / retest_snapshots
```

### 4.3 Agent 定位

Agent 不是聊天框，而是“受约束的编排器”：

- 工具负责采集事实。
- Agent 只能读取证据、归纳 finding、起草建议。
- Agent 不能自己补数字。
- Agent 输出必须经过 schema 校验。
- Agent 生成的每条 finding 必须带 `evidence_refs` 和 `claim_type`。

---

## 五、真实性保障与测量协议

这是 Veris 的核心护城河。所有研发都要围绕这一节执行。

### 5.1 证据等级

| 等级 | 标签 | 允许表达 | 示例 |
|---|---|---|---|
| L0 | unsupported | 不允许入库为结论 | “我觉得竞品更强” |
| L1 | hypothesis | 假设 / 待验证 | “可能与 SERP 特性有关” |
| L2 | inferred | 基于证据的推断 | “低 CTR + SERP 有 AIO，疑似被截流” |
| L3 | measured_sample | 样本实测 | “20 个 prompt、每个模型 5 次，你出现 6 次” |
| L4 | measured_hard | 硬证据实测 | “GSC 近 28 天 CTR 0.8%；初始 HTML 正文 0 字” |

界面规则：
- `实测` 只能对应 L3/L4。
- `推断` 对应 L2。
- `疑似` 对应 L1/L2。
- 禁止把 L2 写成确定因果。

### 5.2 AI 探针协议

每次 `ai_probe` 必须保存：

```
provider
model_id
model_version_or_snapshot
web_search_enabled
temperature
top_p
system_prompt
user_prompt
market
language
location_hint
run_idx
run_at
raw_response
citations
mentioned_brands
mentioned_domains
parser_version
request_hash
response_hash
error_code
```

建议采样：
- V0：每个 prompt 每个模型 `n=5`，只标为方向性样本。
- V1：核心 prompt `n>=20`，按 Wilson interval 或 bootstrap 给置信区间。
- 高置信 finding 必须满足：样本足够、跨时间稳定、解析器无异常、证据可打开复核。

### 5.3 指标定义

**Prompt Presence Rate**

```
brand_present_runs / total_valid_probe_runs
```

适合回答“目标品牌在 AI 回答中出现的概率”。

**Citation Rate**

```
runs_with_target_domain_cited / total_valid_probe_runs
```

适合回答“目标域名被引用的概率”。

**AI Share of Voice**

```
target_brand_mentions / all_tracked_brand_mentions
```

只在同一 prompt set、同一模型集合、同一时间窗口内可比。

**SEO Opportunity Score**

```
normalized_impressions * rank_window_weight * low_ctr_weight * evidence_confidence
```

低 CTR 只能说明“机会”，不能单独说明 AIO 截流。

**Readability Risk**

```
initial_html_main_text_chars
rendered_main_text_chars
main_content_delta
robots_allowed
canonical_status
schema_presence
```

当初始正文为空但渲染后有正文时，结论是“非渲染抓取链路存在可读性风险”。

### 5.4 AI Overviews / SERP 证据规则

关于 AIO 的结论必须分级：

- 只有 GSC 低 CTR：`hypothesis`，写“疑似受 SERP 特性影响”。
- GSC 低 CTR + 同日期 SERP 截图出现 AIO：`inferred`，写“可能受 AIO 影响”。
- 多日、多地区、多设备 SERP 证据 + CTR 异常稳定：`measured_sample`，写“样本显示该词常出现 AIO，且 CTR 异常低”。

禁止表达：
- “这个词被 AI Overviews 压制了”，除非有足够的 SERP 时间序列证据。

### 5.5 证据保存要求

证据必须可复核：

- 保存原始 JSON/HTML/文本响应。
- 保存采集时间、工具版本、请求参数。
- 保存 hash，防止后续修改证据内容。
- finding 只引用同一个 run 或同一个 project 下的 evidence。
- 删除项目时必须级联删除用户数据和第三方 API 响应。

---

## 六、数据模型 v2

### 6.1 核心表

```
projects(
  id, domain, industry, market, language,
  owner_id, created_at, updated_at
)

project_settings(
  project_id, gsc_connected, default_models[],
  probe_n, market_location, cache_policy
)

brand_facts(
  id, project_id, fact_type, fact_text,
  source_url, source_note, status[verified|draft|retired],
  created_at, updated_at
)

runs(
  id, project_id, run_type[baseline|retest],
  status[draft|collecting|diagnosing|reviewing|output|failed],
  protocol_version, started_at, finished_at
)

prompts(
  id, run_id, text, intent, source,
  market, language, priority
)

evidence_artifacts(
  id, project_id, run_id,
  type[gsc|ai_answer|page_fetch|render_check|schema|serp_snapshot|manual],
  claim_level[L1|L2|L3|L4],
  source, captured_at,
  request_jsonb, payload_jsonb,
  raw_text, raw_hash, parser_version
)

ai_probe_results(
  id, run_id, prompt_id, evidence_id,
  provider, model_id, run_idx,
  brand_present, target_domain_cited,
  competitors_mentioned[], cited_urls[],
  sentiment, raw_answer_hash, parser_version
)

findings(
  id, run_id, side[seo|geo|technical],
  title, description, severity,
  claim_type[hypothesis|inferred|measured_sample|measured_hard],
  confidence, evidence_refs[],
  status[open|dismissed|converted]
)

recommendations(
  id, run_id, finding_id,
  what, why, expected_impact, effort, risk,
  validation_method, priority, confidence,
  status[draft|accepted|edited|rejected],
  edited_payload_jsonb, evidence_refs[]
)

generated_prompts(
  id, recommendation_id,
  prompt_type[content|technical|brief|cms],
  prompt_text, input_fact_refs[], evidence_refs[],
  created_at
)

retest_snapshots(
  id, project_id, baseline_run_id, retest_run_id,
  metric_name, baseline_value, retest_value,
  delta, interpretation
)
```

### 6.2 数据库约束

- `findings.evidence_refs` 不能为空。
- `claim_type = measured_hard` 时，至少一个 evidence 必须是 L4。
- `claim_type = measured_sample` 时，必须有关联 probe 或 SERP 样本证据。
- `recommendations.status in (accepted, edited)` 才能生成 prompt。
- `generated_prompts.input_fact_refs` 必须引用 verified 或人工确认过的 `brand_facts`。

---

## 七、关键 API v2

```
POST /projects
GET  /projects/{id}
PATCH /projects/{id}

POST /projects/{id}/gsc/connect
GET  /projects/{id}/gsc/status

GET  /projects/{id}/brand-facts
POST /projects/{id}/brand-facts
PATCH /brand-facts/{id}

POST /runs
GET  /runs/{id}
GET  /runs/{id}/events                 -- SSE: progress / finding_created / failed

GET  /runs/{id}/evidence
GET  /evidence/{id}

GET  /runs/{id}/findings
PATCH /findings/{id}

GET  /runs/{id}/recommendations
PATCH /recommendations/{id}

POST /recommendations/{id}/prompt
GET  /runs/{id}/report

POST /runs/{id}/retest
GET  /runs/{id}/delta

GET  /settings/providers
PATCH /settings/providers/{provider}
```

---

## 八、MVP 边界

### 8.1 V0：2-3 周可验证版本

目标：证明“证据化诊断 + 提示词输出”对自己或 3-5 个种子用户有用。

做：
- 单用户、单项目。
- 手动配置 provider API Key。
- 接入 GSC readonly。
- 页面初始 HTML / Playwright 渲染对比。
- JSON-LD / title / meta / canonical / robots 检测。
- Perplexity + 1 个模型探针。
- 固定 20 个 prompt，`n=5`。
- findings / evidence drawer / recommendations。
- 人工接受/编辑/否决。
- 生成执行提示词。
- 手动导出 Markdown 报告。

不做：
- 多租户计费。
- Redis。
- DataForSEO。
- 自动写 CMS。
- 自动发外链/社区帖。
- 大规模 prompt marketplace。
- 对 AIO 做确定性归因。

### 8.2 V1：可售卖版本

目标：让小团队愿意付费。

新增：
- 多项目。
- 周期性重跑。
- prompt set 管理。
- SERP/AIO 快照。
- 更完整的 provider adapter。
- 报告分享链接 / PDF。
- 成本控制与缓存。
- 团队协作与审计日志。

### 8.3 V2：规模化版本

新增：
- 行业 benchmark。
- 活手册 playbook。
- 自动发现竞品和 prompt。
- API / webhook。
- CMS 草稿写入，但仍需人工发布。

---

## 九、交互设计优化

### 9.1 四个屏幕

1. **新建分析**  
   输入 URL、行业、市场、语言、竞品、探测模型、GSC 状态。开始诊断前显示预计耗时和预计 API 成本。

2. **诊断仪表台**  
   显示 AI 可见度、引用率、GSC 机会、页面可读性风险、竞品 SoV。每个指标旁显示证据等级。

3. **优化建议**  
   每条建议卡包含：做什么、为什么、证据、预期影响、工作量、风险、验证方式。默认 draft，必须人工确认。

4. **输出**  
   只输出已接受/已编辑建议。提示词中必须注入 verified brand facts，并声明不得编造。

### 9.2 空态与错误

- 未接 GSC：仍可做页面和 AI 探针，但 SEO 机会只能用公开/手动数据，置信度降低。
- 某模型失败：标记 provider error，不影响其他模型。
- 没有引用 URL：显示“该 provider 本次未返回可解析引用”，不虚构引用。
- 样本太小：明确显示“方向性样本，不宜做高置信判断”。

### 9.3 原型需要同步修正

`docs/plan-d.md` 仍可作为演示原型，但文案要避免过度确定：

- “AI Overviews 压制”改为“疑似受 AI Overviews / SERP 特性影响”。
- “AI 爬虫读不到”改为“非渲染抓取链路读不到初始正文”。
- “置信 高”只给 L4 硬证据；`n=5` AI 样本最多标“方向性/样本”。
- 复制、导出、重新诊断等按钮要么接交互，要么标为演示态。

---

## 十、商业可行性

### 10.1 用户痛点

目标用户已经有三个真实痛点：

1. SEO 数据和 AI 搜索可见度割裂。  
   GSC 能告诉你搜索表现，但不能告诉你 ChatGPT / Perplexity / Gemini 回答里有没有你。

2. 传统 SEO 工具给图表多，给执行闭环少。  
   小团队需要“该改哪页、为什么、怎么写、怎么验证”。

3. AI 搜索结果不稳定，人工抽查不可持续。  
   需要固定协议、固定 prompt、固定时间窗口做趋势对比。

### 10.2 可付费点

- 品牌 AI 可见度监控。
- 竞品在 AI 回答中的出现率对比。
- GSC 机会词转行动建议。
- 技术可读性风险诊断。
- 带证据的内容 brief / 技术改造 brief。
- 周期性回测报告。

### 10.3 定价建议

V0 种子用户：
- 免费或一次性诊断，换真实反馈和案例。

V1 SaaS：
- Starter：$19-49/月，1 个项目，少量 prompt，月度回测。
- Pro：$99-199/月，5-10 个项目，周度回测，多模型。
- Agency：$299+/月，多客户、白标报告、团队协作。

国内市场可用人民币版本：
- 个人/小站：99-199 元/月。
- 小团队：399-999 元/月。
- 代运营/咨询：按项目或按客户报价。

### 10.4 竞争策略

不要和 Semrush / Ahrefs 争“最大数据库”。Veris 的策略是：

- 更适合中文和细分行业。
- 更重证据抽屉和可复核。
- 更重“诊断到执行”的闭环。
- BYOK / 自带 API Key，降低平台成本。
- 对小团队说人话，不只给营销仪表盘。

### 10.5 最大商业风险

- AI 搜索结果波动大，客户可能质疑指标稳定性。
- 大平台会很快补齐 AI visibility 功能。
- 多 provider API 成本和失败率会吃掉毛利。
- 如果建议质量不高，用户会把它当普通 SEO 报告，复购弱。

应对：
- 把指标定义和证据等级做透明。
- 从细分行业切入，积累行业 prompt set。
- 默认 BYOK，平台只收工具费。
- 强化回测，证明建议实施后的 delta。

---

## 十一、研发拆解

### Phase 0：协议和原型固化

- 完成证据等级、AI probe schema、指标公式。
- 修正 UI 原型文案。
- 准备 20 个固定 prompt 的生成规则。

### Phase 1：证据采集

- 页面抓取与渲染对比。
- GSC OAuth readonly。
- Perplexity / OpenAI 或 Anthropic provider adapter。
- evidence_artifacts 入库。

### Phase 2：诊断与建议

- finding generator。
- recommendation generator。
- 人工审阅状态机。
- prompt assembler。

### Phase 3：回测和商业验证

- retest run。
- delta 报告。
- 找 3-5 个真实站点试跑。
- 记录用户是否愿意付费、愿意为哪类建议付费。

---

## 十二、是否继续做

建议继续，但以 V0 验证方式推进：

1. 先做一个“内部可用”的诊断台。
2. 用 3-5 个真实站点跑出报告。
3. 验证用户是否因为报告采取行动。
4. 4-6 周后回测是否看到 visibility / citation / CTR / indexability 的变化。
5. 有案例再产品化。

判断标准：
- 如果用户只觉得“报告有趣”，商业价值弱。
- 如果用户愿意按建议改页面、写内容、接回测，商业价值成立。
- 如果 2-3 个用户愿意付费或愿意拿真实项目试点，就值得进入 V1。
