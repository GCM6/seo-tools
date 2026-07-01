# SP2：证据采集 · 设计文档

> 项目代号 **Veris**：SEO + GEO 证据化诊断台。
> 上游权威方案见 `docs/plan-ux.md`（尤其 §5 真实性保障与测量协议、§6 数据模型、§7 API）。
> SP1 交付见 `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md`，本轮是其路线图（§2）里的 SP2。
> 日期：2026-07-01。

---

## 0. 背景与本轮目标

SP1 交付了前端骨架 + 数据底座：4 屏可点、libSQL schema + §6.2 约束、§7 全部 API 路由但只读 seed/桩数据，`/runs/{id}/events` 用固定事件数组模拟 SSE。SP1 设计文档 §1.1 记录了两条延后到 SP2 生效的架构约束：

1. 页面渲染不能自带 Playwright，必须走托管浏览器 API，藏在 `RenderProvider` 接口后。
2. 长任务不能进程内后台跑，改用 Inngest 拆步骤、断点续跑，前端靠 SSE 看进度。

**本轮（SP2）交付真实的证据采集：单入口 URL 的页面抓取 + 托管浏览器渲染对比 + robots/meta/schema 检测，写入 `evidence_artifacts`，并把 SSE 从桩事件流换成 Inngest 驱动的真实进度。** GSC、AI 探针、finding/recommendation 生成、多页抓取均不在本轮范围（见 §8 非目标）。

---

## 1. 技术选型（本轮拍板）

| 决策点 | 选型 | 理由 |
|---|---|---|
| 托管浏览器渲染 API | **Cloudflare Browser Rendering REST API**（`POST /accounts/{account_id}/browser-rendering/content`） | 无需部署 Worker，用 API token 直接从 Next/Vercel 发一次 HTTPS 调用即可拿到渲染后 HTML；比自建 Worker 代理省一层基础设施 |
| 长任务编排 | **Inngest**，本轮用 **Dev Server**（本地/CI），生产密钥留到部署前再接 | 用户暂无 Inngest 账号；Dev 模式下事件/函数/Realtime 均可本地跑通，接口形状与生产一致 |
| SSE 实现 | **Inngest Realtime**（`@inngest/realtime`） | Vercel serverless 无跨调用共享内存，SSE 路由不能靠进程内 event emitter；Realtime 提供开箱即用的 publish/subscribe，比"路由轮询 DB 后 diff"更细粒度、代码量相近 |
| 证据类型 | 复用 §6.1 `evidence_artifacts.type` 已有枚举：`page_fetch` / `schema` / `render_check`（不新增类型） | 三次检测一一对应已有枚举值，无需改 schema 的 CHECK 约束 |
| 证据等级 | 三个 artifact 均为 **L4**（measured_hard） | 均为确定性工具直接测量（非抽样、非推断），符合 §5.1 "硬证据实测" |

---

## 2. Run 状态机扩展

SP1 的 `runs.status` CHECK 约束是 `draft|collecting|diagnosing|reviewing|output|failed`。finding 生成（`diagnosing` 阶段的实际内容）是 SP5 的事，SP2 只做采集，因此新增一个终态：

```
draft → collecting → collected → (SP5 之后才会推进到 diagnosing → reviewing → output)
                    ↘ failed
```

- `db/schema.ts` 的 `runs_status` CHECK 加入 `'collected'`。
- SP2 结束时 run 停在 `collected`，不擅自推进到 `diagnosing`（那里目前没有对应逻辑，硬推进会造成"状态到了但没内容"的假象）。

---

## 3. 采集编排（Inngest 函数）

### 3.1 触发

`POST /runs` 创建 run 后（`status` 从 `draft` 起手，立即置为 `collecting`），向 Inngest 发事件：

```
veris/run.collect.requested  { runId, projectId, url }
```

### 3.2 函数步骤

```
step 1  SSRF 校验 + URL 规范化                         → publish progress 10%
step 2  fetch 入口 URL 原始 HTML（不经浏览器）
        → 解析 robots.txt（同源 /robots.txt）、canonical、meta robots 标签
        → 提取正文字符数（initial_html_main_text_chars）
        → 落 evidence_artifacts(type=page_fetch, claim_level=L4)
        → publish progress 40%
step 3  从同一份原始 HTML 提取 JSON-LD / schema.org 结构化数据
        → 落 evidence_artifacts(type=schema, claim_level=L4)
        → publish progress 60%
step 4  CloudflareRenderProvider.renderMainText(url) 取渲染后正文
        → 计算 rendered_main_text_chars、main_content_delta（对应 §5.3 Readability Risk 字段）
        → 落 evidence_artifacts(type=render_check, claim_level=L4)
        → publish progress 90%
step 5  run.status = 'collected'，finishedAt = now          → publish {type:'done'}
```

任一 step 失败：`run.status = 'failed'`，publish `{type:'failed', reason}`。

- **不可重试**（URL 格式非法、SSRF 拦截、DNS 无法解析）→ 抛 `NonRetriableError`，Inngest 不重试。
- **可重试**（fetch 超时、CF API 5xx）→ 用 Inngest 默认重试/退避。
- robots.txt 返回 404 是合法状态（视为默认允许），不算失败。

### 3.3 `RenderProvider` 接口

```ts
interface RenderProvider {
  renderMainText(url: string): Promise<{ html: string; mainTextChars: number }>
}
```

`lib/render/cloudflare-provider.ts` 是本轮唯一实现，调用上述 CF REST 端点，配置走环境变量 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（沿用 `.env.example` 里 libSQL 那种纯 env 配置模式，不是 `/settings/providers` 的 BYOK UI——那个留给 SP4 的 AI provider 密钥）。

---

## 4. SSRF 防护（非协商项）

`page_fetch`（入口 HTML + robots.txt）两次 fetch 都是我方服务端对**用户任意输入的域名**发起请求，必须防护：

- 只允许 `http`/`https` scheme。
- 解析 DNS 后校验目标 IP，拒绝私有/保留段：`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`（含云平台常见的 `169.254.169.254` 元数据端点）、`::1`、`fc00::/7`。
- 限制重定向跳数，且每一跳都重新做上述校验（防止先过一次校验、再 302 到内网）。
- 硬超时。

该守卫**不覆盖** Cloudflare Rendering 的调用——那次 fetch 发生在 CF 的基础设施上，不在我方网络边界内，不属于我方 SSRF 威胁模型。

守卫实现为纯函数（`lib/security/ssrf-guard.ts`），便于直接单测，不依赖 Inngest step 包装。

---

## 5. SSE：`/runs/{id}/events`

替换 SP1 的桩事件数组，改为订阅 Inngest Realtime 的 `run:{runId}` channel，把收到的消息原样转发成 SSE frame。事件形状：

```
{type:'progress', pct}
{type:'evidence_created', evidenceType}   // page_fetch | schema | render_check
{type:'done'}
{type:'failed', reason}
```

> 注：SP1 桩里的 `finding_created` 事件本轮不出现——SP2 不生成 finding（那是 SP5），事件形状按本轮实际内容调整为 `evidence_created`。

---

## 6. UI 接入：屏1 → 真实 run

`NewAnalysisForm`（已是 client component）新增提交处理：

1. `POST /projects`，body 取表单的 domain/industry/market/language。
2. `POST /runs { projectId, runType: 'baseline' }`（该路由内部把 status 置为 `collecting` 并派发 Inngest 事件，见 §3.1）。
3. `router.push('/{locale}/runs/{run.id}')`。

"开始诊断"主 CTA 不再链接 demo run；提交中给出 loading 态，失败给出错误提示（复用现有表单区域，不新增全局错误组件）。

---

## 7. 数据模型改动

- `db/schema.ts`：`runs_status` CHECK 加入 `'collected'`。
- `evidence_artifacts` 表结构不变，`type`/`claim_level` 枚举已覆盖本轮所有取值，无需改动。
- 新增依赖：`inngest`、`@inngest/realtime`。

---

## 8. 非目标（本轮明确不做）

- GSC OAuth 接入（SP3）。
- AI 探针 / provider adapter（SP4）。
- finding / recommendation 生成，`diagnosing` 阶段的实际逻辑（SP5）。
- SERP 快照 / AIO 证据（`evidence_artifacts.type = serp_snapshot`，未分配到具体 SP，晚于 SP2）。
- 多页抓取——只抓 `NewAnalysisForm` 提交的单个入口 URL。
- retest 复用同协议采集（SP6，`POST /runs/{id}/retest` 桩目前只克隆 run 壳，不触发本轮的采集编排）。
- `/settings/providers` BYOK UI（SP4 的 AI provider 密钥管理）。

---

## 9. 测试（TDD）

- **纯函数单测**（不经 Inngest step 包装）：
  - `ssrf-guard.ts`：私有 IP / 保留段 / 非 http(s) scheme / 重定向跳内网 均应拒绝；正常公网 URL 应通过。
  - 正文字符数提取 + `main_content_delta` 计算。
  - robots.txt 解析（allow/disallow、404 视为允许）。
  - JSON-LD / schema.org 提取。
- **`RenderProvider`**：测试里 mock，不发真实 CF 请求。
- **Inngest 函数**：保持函数体是"调用已单测过的纯函数 + step.run 包装"的薄封装，用 `@inngest/test` 做 step 级别 mock 验证编排顺序与失败分支（`NonRetriableError` vs 默认重试）。
- **§6.2 不变量测试**（SP1 已有）：扩展到本轮写入的真实 `page_fetch`/`schema`/`render_check` 行，确认仍是 L4-only，无需新增约束。
- **API 路由测试**：`POST /runs` 触发 Inngest 事件（mock Inngest client 校验事件已发送）；`/runs/{id}/events` 路由测试 Realtime 订阅转发逻辑（mock channel）。

---

## 10. SP2 完成定义（DoD）

1. 提交屏1 表单可端到端跑通：创建 project + run → Inngest 编排采集 → 屏2 通过真实 SSE 看到进度 → `evidence_artifacts` 落库 3 条真实记录（page_fetch / schema / render_check，均 L4）。
2. `run.status` 正确流转 `draft → collecting → collected`，失败路径正确落 `failed` 并带 reason。
3. SSRF 守卫单测覆盖私有网段 / 元数据端点 / 重定向绕过场景。
4. `RenderProvider` 接口 + Cloudflare 实现落地，接口本身不依赖具体厂商细节，为后续换厂商留了口子（即便 V0 不打算换）。
5. §9 测试全绿。
6. `.env.example` 补充 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / Inngest Dev 相关变量及说明。
