# SP-G1a 生产部署 Runbook（Vercel + Turso + Inngest）

> 目标：把当前 `main` 部署成一个可对外的种子版实例，供 G3 商业验证招募（3-5 个真实外贸站免费诊断）。**这是用户操作清单**——需要你在 Vercel / Turso / Inngest / Google Cloud / Cloudflare 控制台亲自操作并录入真实凭据；本文给出确切顺序、env 名与验证方法。执行中卡住把控制台报错贴回来即可。

**技术栈**：Next.js 16（`next build`，Node ≥ 20.9）· libSQL/Turso · Inngest（长任务）· Cloudflare Browser Rendering（页面渲染检测）· 包管理器 **pnpm**。

**为什么要重建生产 DB**：本地 `veris.db` 是开发污染库（含试跑数据、且缺 `provider_credentials` 等新表的历史状态），**不可**用于生产。生产用一个全新的 Turso 库，按下方施加 schema + 参考数据。

---

## 阶段 0 · 前置准备（账号与 CLI）

- [ ] GitHub 仓库 `GCM6/seo-tools` 已推到最新（本次已 push 到 `8efdf5a`）。
- [ ] 注册/登录：**Vercel**、**Turso**（`turso` CLI：`brew install tursodatabase/tap/turso` 后 `turso auth login`）、**Inngest**（cloud）、**Google Cloud Console**（GSC OAuth）、**Cloudflare**（Browser Rendering）。
- [ ] 本机能跑 `pnpm install` + `pnpm build`（部署前最后一次本地绿灯：`pnpm test` 应 792 绿、`pnpm build` ✓）。

---

## 阶段 1 · 生产数据库（Turso）

1. [ ] 建库并取连接信息：
   ```bash
   turso db create veris-prod
   turso db show veris-prod --url          # → libsql://veris-prod-<org>.turso.io
   turso db tokens create veris-prod       # → 生产 LIBSQL_AUTH_TOKEN（长期）
   ```
2. [ ] **施加 schema 到生产库**（在本机，用生产 env 覆盖跑 drizzle push——项目用 `db:push` 而非 migrate 应用 schema）：
   ```bash
   LIBSQL_URL='libsql://veris-prod-<org>.turso.io' \
   LIBSQL_AUTH_TOKEN='<生产 token>' \
   pnpm db:push
   ```
   > 备选：逐个灌 `db/migrations/000{0..6}.sql`（含 `0006_wide_odin.sql` = SP-A2 #2 的 `internal_links` 列）——`turso db shell veris-prod < db/migrations/0000_*.sql` …。两种任选其一，`db:push` 最省事。
3. [ ] **灌参考数据**（诊断引擎依赖的 reference artifacts，非合成诊断数据）：
   ```bash
   LIBSQL_URL='libsql://veris-prod-<org>.turso.io' \
   LIBSQL_AUTH_TOKEN='<生产 token>' \
   pnpm db:seed
   ```
   预期输出 `[seed] upserted N reference artifacts` + `real-only baseline ready`。
4. [ ] 验证：`turso db shell veris-prod "select count(*) from reference_artifacts;"` 非 0；`"select name from pragma_table_info('site_pages') where name='internal_links';"` 有一行（确认 #2 迁移已到位）。

> **注意**：drizzle 的 turso dialect 不接受空 `LIBSQL_AUTH_TOKEN`——生产给真实 token 即可，无需占位。

---

## 阶段 2 · 生成并保管密钥（一次性、务必稳定）

- [ ] **`CREDENTIALS_ENCRYPTION_KEY`**（BYOK 主密钥，AES-256-GCM）：
  ```bash
  openssl rand -base64 32
  ```
  ⚠️ **此值一旦用于加密用户/自己录入的 API Key，就必须在所有后续部署中保持不变**。换掉它 = 库里已加密的凭据全部解不开（设置页会报 `encryption_unavailable` 或解密失败）。存进密码管理器，别只留在 Vercel。

---

## 阶段 3 · 首次部署到 Vercel（拿到生产 URL）

Inngest 回调与 GSC 重定向都依赖「最终生产 URL」，存在先有鸡还是先有蛋——**先用尚不完整的 env 部署一次，拿到 URL，再回填 URL 相关项**。

1. [ ] Vercel → New Project → 导入 `GCM6/seo-tools`。Framework 自动识别 Next.js；Build `next build`；Install `pnpm install`；Node ≥ 20.9。
2. [ ] 先录入**不依赖 URL** 的生产 env（Production 环境）：
   - `LIBSQL_URL` / `LIBSQL_AUTH_TOKEN`（阶段 1）
   - `CREDENTIALS_ENCRYPTION_KEY`（阶段 2）
   - `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`（阶段 5，可先留空后补，仅影响 render_check）
   - **不要**设 `INNGEST_DEV`（那是本地专用；生产存在它会把事件发去本地 8288，采集必失败）
3. [ ] Deploy。记下生产域名，例如 `https://veris-xxx.vercel.app`（或绑定自定义域后用自定义域）。此刻 AI 探针/GSC/Inngest 尚未通，但站点能起、页面能开。

---

## 阶段 4 · Inngest（长任务编排，采集/探针/回测的命脉）

采集、20-prompt 多模型探针、回测都跑在 Inngest；不接通则「新建分析」会报「采集任务派发失败」。

1. [ ] Inngest Cloud → 新建 App → 取 **Event Key** 与 **Signing Key**。
2. [ ] Vercel 补两个 env 并 redeploy：
   - `INNGEST_EVENT_KEY=<event key>`
   - `INNGEST_SIGNING_KEY=<signing key>`
3. [ ] Inngest Cloud → **Sync / Register app**，端点填生产 serve 路由：
   ```
   https://<生产域名>/api/inngest
   ```
   Sync 成功后应能在 Inngest 里看到本项目注册的函数（collect-evidence / generate-findings / reevaluate-competitors / 回测等）。
4. [ ] 验证：Inngest Dashboard 的 app 状态为 healthy、函数列表非空。

---

## 阶段 5 · Cloudflare Browser Rendering（页面渲染检测）

页面「初始 HTML vs 渲染后正文」对比走 Cloudflare Browser Rendering REST API（无需自建 Worker）。

- [ ] Cloudflare → 取 **Account ID**；建一个有 **Browser Rendering** 权限的 **API Token**。
- [ ] Vercel 补 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` → redeploy。
- [ ] 未配置也不致命：render_check 会降级/空态，但建议接通（否则技术侧一部分证据缺失）。

---

## 阶段 6 · Google Search Console OAuth（第一优先真实数据源）

GSC 是唯一的一手搜索表现数据，read-only OAuth。redirect 必须是生产 URL。

1. [ ] Google Cloud Console → 项目 → 启用 **Search Console API** → OAuth 同意屏幕（External，scope 只需 `webmasters.readonly`）→ 创建 **OAuth Client（Web application）**。
2. [ ] Authorized redirect URI 精确填：
   ```
   https://<生产域名>/api/gsc/callback
   ```
3. [ ] Vercel 补三件套 → redeploy：
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI=https://<生产域名>/api/gsc/callback`（须与控制台完全一致）
4. [ ] 验证：项目详情页点「连接 GSC」→ 走完 Google 授权 → 跳回项目页显示已连接、站点下拉能列出 property（`/api/gsc/sites`，SP-A1 接的）。
> 同意屏幕若处于 Testing 态，需把招募用户的 Google 邮箱加进 Test users，或提审发布。

---

## 阶段 7 · AI 探针 & 可选数据源（BYOK）

探针 provider「配了哪家 key 就探哪家」。两条路：**运营方在 env 配自己的 key** 跑种子诊断；或**每个用户在设置页录入自己的 key**（DB 覆盖 env，AES-256-GCM 加密存 `provider_credentials`，依赖阶段 2 的主密钥）。

- [ ] （二选一/可叠加）Vercel env 配运营方 key：`OPENAI_API_KEY` / `PERPLEXITY_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY`。默认模型 gpt-5-mini / sonar / gemini-2.5-flash / deepseek-chat，可用 `AI_PROBE_*_MODEL` 覆盖；`AI_PROBE_N` 默认取项目 `probe_n=5`（生产别调低，n=5 是方向性样本下限）。
- [ ] 可选 `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX`：Google 前台可见性（`site:domain`）。
- [ ] 可选 `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`：竞品/关键词缺口/分引擎 SoV 的第三方 SERP（未配则相关规则 no-op，探针 SoV 仍可用）。
- [ ] 一个 AI key 都不配时：AI 可见度 / 答案地图 / SoV 保持「待接入」空态（不会造假数）。

---

## 阶段 8 · 端到端冒烟验证（部署完成的判据）

按主流程 `新建项目 → 采集 → 生成 findings → 建议 → 人工确认 → 输出 → 回测` 走一遍最小闭环：

- [ ] `/` 打开正常（4 个实时页 `/`、`/projects`、`/new`、`/settings` 都是 `force-dynamic`，不应命中 build 期静态化——若列表看不到新建项目，多半是这条回退了）。
- [ ] `/new` 建一个真实小站项目 → 采集 run 启动（RunProgress 有真实阶段推进，非假进度）→ Inngest Dashboard 能看到函数在跑。
- [ ] 采集完成后报告页出：五支柱概要卡、答案出现地图、SoV（配了 AI key 的话）、L0–L4 证据阶梯。点 measured 卡能看到原文。
- [ ] 设置页录一个 AI key → 保存成功（无 `encryption_unavailable`）→ 「测连接」通过。
- [ ] 连 GSC → 站点下拉有真实 property。
- [ ] 生成一条建议 → accept → 能产出执行 prompt（人在环闸门生效）。
- [ ] 分享链接 `/share/<token>` 无 Shell、noindex、能打开。
- [ ] PDF：走浏览器打印（`@media print` 已打磨）。**Cloudflare PDF 端点本期不做**（顺延，非阻塞）。

---

## Env 清单速查（Vercel Production）

| Env | 必需 | 来源 / 说明 |
|---|---|---|
| `LIBSQL_URL` | ✅ | Turso 生产库 URL |
| `LIBSQL_AUTH_TOKEN` | ✅ | `turso db tokens create` |
| `CREDENTIALS_ENCRYPTION_KEY` | ✅ | `openssl rand -base64 32`，**永久稳定** |
| `INNGEST_EVENT_KEY` | ✅ | Inngest Cloud |
| `INNGEST_SIGNING_KEY` | ✅ | Inngest Cloud |
| `INNGEST_DEV` | ❌ 生产**不设** | 本地专用（发往 8288） |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | 建议 | 渲染检测 |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | 建议 | GSC 授权（redirect=生产 `/api/gsc/callback`） |
| `OPENAI_/PERPLEXITY_/GEMINI_/DEEPSEEK_API_KEY` | 按需 | 运营方跑种子诊断；否则靠用户 BYOK |
| `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` | 可选 | 前台可见性 |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | 可选 | 竞品/缺口/分引擎 SoV |
| `AI_PROBE_*_MODEL` / `AI_PROBE_N` | 可选 | 覆盖默认模型/采样数 |

---

## 常见坑（按踩坑概率排序）

1. **新建项目在列表里不显示** → 页面被 build 期静态预渲染。四个实时页已加 `force-dynamic`（SP-G1b 修过）；若复发，检查是否有页面回退成静态。
2. **「采集任务派发失败」** → 生产误设了 `INNGEST_DEV`，或 Inngest app 未 Sync `/api/inngest`，或 event/signing key 缺失。
3. **设置页保存 key 报 `encryption_unavailable`** → `CREDENTIALS_ENCRYPTION_KEY` 未设或非 base64 32 字节。
4. **换了 `CREDENTIALS_ENCRYPTION_KEY` 后旧凭据全失效** → 该值必须永久稳定；轮换需重录所有凭据。
5. **GSC 回调 `redirect_uri_mismatch`** → env 的 `GOOGLE_OAUTH_REDIRECT_URI` 与 Google 控制台里登记的不是逐字符一致（协议/尾斜杠/域名）。
6. **回测口径不一致** → SP-A2 #6 已把 `PROBE_PARSER_VERSION` 升到 v3；**v2 之前跑的 baseline 与 v3 回测在竞品 SoV 上不可比**（品牌 `brand_sov` 仍可比）。生产是全新库、无历史 baseline，不受影响；仅在未来跨版回测时注意同协议。
7. **drizzle push 报 token 空** → turso dialect 校验，生产给真实 token 即可。

---

## 部署后要交接给 G3 的东西

- 生产 URL（招募页/诊断入口）。
- 每个招募用户需：授权 GSC（read-only）+ 录入自己的 AI key（BYOK）——或由运营方 key 统一承担探针成本（注意 20 prompts × n=5 × provider 数的调用量）。
- 回测排期：建议 accept 后自动排 4–6 周，到期顶栏一键同协议重跑。

关联：路线图 `docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md`；记忆 `veris-g1-commercialization-progress`。**闸门**：G3 验证期内不写 G4；≥2 用户愿付费才启 G4。
