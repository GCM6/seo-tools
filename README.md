# Veris

Veris 是一个**以证据为先的 SEO + GEO（生成式引擎优化）诊断工作台**。它诊断网站在传统搜索（Google Search Console）与 AI 答案引擎（ChatGPT / Perplexity / Gemini / Claude）中的可见度，产出经人工确认的优化建议与可直接使用的执行 prompt，并支持 4–6 周的复测闭环。它**不是**排名追踪器，**不是**自动写作工具，**不是**「AI SEO 魔法」。

**核心原则：证据先于结论。** 凡不可验证者只能标注为推断（inference）或假设（hypothesis），绝不可称为事实。UI 上的「实测」标签仅保留给 L3 / L4 级证据。事实、抽样测量、模型推断、产品建议在数据与界面中始终分层。

> **SP1 范围说明：** 当前阶段是「由强类型种子数据驱动」的前端脚手架。**尚未接入**真实数据采集 / GSC OAuth / AI 探针 / 页面渲染对比。渲染（托管浏览器 API）与长任务（Inngest）将在 SP2+ 引入。本仓库现可在 Vercel 部署，本地 `dev` 全流程可点通。

## 本地开发

```bash
cp .env.example .env   # 本地默认 file:./veris.db，token 用占位值 local
npm install
npm run db:push        # 用 drizzle-kit 把 schema 推到本地 libSQL 文件
npm run db:seed        # 灌入 demo 种子数据（project=teamflow, run=run_demo）
npm run dev            # 启动开发服务器
```

打开 http://localhost:3000，默认进入 `/zh`（中文为默认 locale），英文为 `/en`。

四屏主流程：**新建分析 → 诊断 → 优化建议 → 输出**。demo run id 为 `run_demo`，可直接访问：

- 诊断：`/zh/runs/run_demo`
- 优化建议：`/zh/runs/run_demo/recommendations`
- 输出：`/zh/runs/run_demo/output`

把路径前缀换成 `/en` 即为英文界面。

### 本地数据库注意事项

drizzle-kit 的 `turso` dialect **不接受空的 `LIBSQL_AUTH_TOKEN`**。因此本地使用 `file:` 形式的库时，必须给 `LIBSQL_AUTH_TOKEN` 一个**非空占位值**（如 `local`）才能跑通 `npm run db:push`。对 `file:` URL，该 token 在运行时会被忽略，仅用于通过 drizzle-kit 的校验。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（默认 http://localhost:3000） |
| `npm run build` | 生产构建 |
| `npm run start` | 运行已构建的生产服务器 |
| `npm run test` | 运行 Vitest 全量测试（`vitest run`） |
| `npm run db:push` | 用 drizzle-kit 把 schema 推到 `LIBSQL_URL` |
| `npm run db:seed` | 灌入 demo 种子数据 |

## 部署（Vercel + Turso）

标准 Next.js 16 应用，直接在 Vercel 导入即可，无需额外的 `vercel.json`。

在 Vercel 项目的 Environment Variables 中配置：

- `LIBSQL_URL` —— Turso 远程库 URL，形如 `libsql://<your-db>-<org>.turso.io`
- `LIBSQL_AUTH_TOKEN` —— 真实的 Turso token（请勿提交进仓库）

生产环境用真实 Turso URL + token；本地用 `file:./veris.db` + 占位 token（见上）。

SP2+ 才会接入真实采集与长任务：页面渲染对比依赖**托管浏览器 API**（Vercel 无法自带 chromium），长时任务交给 **Inngest**（Vercel 友好，避免进程内后台任务）。

## 技术栈

- **Next.js 16** App Router + **React 19**（全栈单体：前端 + Route Handlers / Server Actions）
- **Tailwind CSS v4**
- **libSQL（Turso）+ Drizzle ORM**（原始证据存 JSON，关系表施加约束）
- **next-intl**（zh 默认 / en）
- **Vitest** 测试
- 部署于 **Vercel**
