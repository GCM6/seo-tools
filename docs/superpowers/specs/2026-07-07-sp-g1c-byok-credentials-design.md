# SP-G1c · BYOK 凭据录入 + AES-256-GCM 加密存储 · 设计

> 日期：2026-07-07。上游：`docs/superpowers/specs/2026-07-07-commercialization-roadmap-design.md` SP-G1c。
> 目标：非技术用户不碰 `.env` 文件即可在设置页配齐数据源；凭据密文入库；DB 凭据优先于 env（向后兼容）。

## 已定决策（2026-07-07，采用推荐项）

| 决策点 | 结论 | 理由 |
|---|---|---|
| 凭据作用域 | **全局级** | BYOK 单用户下 OpenAI/DataForSEO 等是用户自己的账户 key，跨所有客户站通用；与 env 语义一致。GSC 的按站 token 仍走 `project_settings`，不进本表。 |
| 表列粒度 | **通用 env-var-name 键值** | 一张表存任意凭据：行 = (`credentialKey` 如 `OPENAI_API_KEY`，密文)。键名复用 env 变量名，使「DB > env」优先级变成同名覆盖，一个 resolver 搞定全部数据源，且天然容纳多字段凭据（`GOOGLE_CSE_CX`、`DATAFORSEO_PASSWORD` 各占一行）。 |
| 测试连接覆盖 | **先上 AI 探针 4 家** | openai/perplexity/gemini/deepseek 各打一次最小调用验证 key，对齐验收（只录 OpenAI key → 出 AI 可见度真数据）。其余源本 SP 只录入不提供测连接。 |

## 铁律对齐（不可违反）

- **无 Zod**：加密参数/请求体用手写校验 + `throw new Error`（validators 风格）。
- **证据不可变** 不受影响：本表存的是**运行配置凭据**，非证据 artifact。
- **凭据不得明文落库**：`provider_credentials.ciphertext` 恒为 AES-256-GCM 密文；主密钥只在 `CREDENTIALS_ENCRYPTION_KEY` env，永不入库、永不返回给前端。
- 错误码 snake_case 短码；DB 读写集中在 `lib/repositories/index.ts`；批量插入空数组短路。

---

## 组件与边界

### 1. 加密模块 `lib/crypto/secrets.ts`（+ `secrets.test.ts`）— 与 SP-G1f 共享

纯函数，node:crypto，AES-256-GCM。**自包含密文串**格式，便于 SP-G1f 把 `gsc_refresh_token` 单列明文直接替换为该串（无需加 iv/tag 列）。

```ts
// 主密钥：CREDENTIALS_ENCRYPTION_KEY，base64 编码的 32 字节（openssl rand -base64 32）。
// 解码后长度非 32 → throw new Error('credentials_encryption_key_invalid')。
export function encryptSecret(plaintext: string): string
// 产物：`v1.<iv_b64>.<tag_b64>.<ciphertext_b64>`（iv 12B 随机、tag 16B）。
export function decryptSecret(token: string): string
// token 非 v1 前缀 / 段数不对 / 认证失败 → throw new Error('secret_decrypt_failed')。
```

- 依赖：`process.env.CREDENTIALS_ENCRYPTION_KEY`。
- 用途：被 repositories 的凭据读写、以及 SP-G1f 的 refresh_token 迁移复用。

### 2. DB 表 `provider_credentials`（`db/schema.ts` + migration `0004_*.sql`）

```ts
export const providerCredentials = sqliteTable('provider_credentials', {
  credentialKey: text('credential_key').primaryKey(), // env 变量名，如 'OPENAI_API_KEY'
  ciphertext: text('ciphertext').notNull(),           // encryptSecret 产物（自包含）
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})
```

全局单行/键；无 `projectId`。迁移经 `pnpm exec drizzle-kit generate` 生成后提交（仓库惯例：`db/migrations/*.sql` 全量灌进测试临时库）。

### 3. 凭据读写 + 解析（`lib/repositories/index.ts` + `lib/credentials/store.ts`）

repositories（贴库、原始）：
```ts
getProviderCredentialRow(key): Promise<{ ciphertext } | undefined>
getConfiguredCredentialKeys(): Promise<string[]>        // 只取键，判「已配置」不解密
setProviderCredential(key, plaintext): Promise<void>    // encryptSecret + upsert（onConflictDoUpdate）
deleteProviderCredential(key): Promise<void>
```

`lib/credentials/store.ts`（DB>env 覆盖层 + 解密，供采集链与矩阵用）：
```ts
// DB 有则解密返回，否则回退 process.env[key]；都无返回 undefined。
resolveCredential(key): Promise<string | undefined>
// 批量：给定键集，返回 { KEY: value } 供 provider 工厂。
resolveCredentials(keys: string[]): Promise<Record<string, string | undefined>>
```

### 4. 探针工厂改造（`lib/probes/providers/index.ts`）

```ts
// 新：从已解析凭据映射建（不再直接读 env）
export function buildProbeProviders(creds: Record<string, string | undefined>): AiProbeProvider[]
// 兼容包装（现有测试/调用点）
export function buildProbeProvidersFromEnv(): AiProbeProvider[]  // = buildProbeProviders(process.env)
```

采集链注入点（`lib/inngest/collect-evidence.ts` `runProbes` 闭包）：调用 stage 前 `await resolveCredentials([4 个探针 key])`，传 `buildProviders: () => buildProbeProviders(creds)`。`run-probes.ts` 的 `buildProviders: () => Provider[]` 同步接口**不变**。

### 5. 测试连接（`lib/credentials/test-connection.ts` + `app/api/credentials/test/route.ts`）

不污染探针热路径接口（`AiProbeProvider` 不动）。独立模块：按 provider 最小 auth 检查，`fetch` 可注入以便单测。

```ts
// credentialKey → provider；对 4 家各做最小调用。unknown/非可测键 → { ok:false, error:'not_testable' }。
export async function testCredentialConnection(
  credentialKey: string, value: string, fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; error?: string }>
```
最小调用：openai `GET /v1/models`、gemini `GET /v1beta/models?key=`、deepseek `GET /models`（OpenAI 兼容）、perplexity 最小 `POST /chat/completions`（`sonar`,`max_tokens:1`）。非 2xx → `{ ok:false, error:'auth_failed' | 'http_<status>' }`。

路由 `POST /api/credentials/test`：体 `{ credentialKey, value }`，缺字段 422 `credential_key_required`/`value_required`；返回 `{ ok, error? }`。

### 6. 凭据保存/删除路由（`app/api/credentials/route.ts`）

与既有设置页变更一致（现 `SettingsClient` 用 `fetch('/api/gsc/site')` + `router.refresh()`，本页统一走 Route Handler 而非 Server Action，保持设置面板一致性）：
- `POST { credentialKey, value }` → 键在允许清单内才写；`setProviderCredential`；返回 `{ ok:true }`。非法键 422 `unknown_credential_key`。
- `DELETE { credentialKey }` → `deleteProviderCredential`。

**允许清单**（`lib/credentials/keys.ts`，矩阵与路由共用真源）：`OPENAI_API_KEY` `PERPLEXITY_API_KEY` `GEMINI_API_KEY` `DEEPSEEK_API_KEY` `GOOGLE_CSE_API_KEY` `GOOGLE_CSE_CX` `DATAFORSEO_LOGIN` `DATAFORSEO_PASSWORD` `CLOUDFLARE_ACCOUNT_ID` `CLOUDFLARE_API_TOKEN`，各标注 `provider`（用于测连接映射）与是否可测。

### 7. 设置页矩阵升级（`data-sources.ts` + `SettingsClient.tsx` + `page.tsx`）

- `buildDataSourceStatuses` 的 env 入参改为**合并视图**：`{ ...process.env, ...dbConfiguredKeys 置真 }`。即 server `page.tsx` 先 `getConfiguredCredentialKeys()`，把 DB 已配键并进传给纯函数，矩阵 configured 判定就同时认 DB 与 env（不解密、不外泄值）。
- `SettingsClient` 每个「未配置/可录入」源行内联：密码输入框 + 「测试连接」（打 `/api/credentials/test` 显 ✓/✗+原因）+「保存」（打 `POST /api/credentials`）+ 已配置显「已配置·来自 DB/env」与「清除」（DB 来源才可清除，`DELETE`）。文案走 next-intl `t()`。

---

## 数据流

```
录入 key ──POST /api/credentials/test──▶ testCredentialConnection ──最小调用──▶ ✓/✗
   │(✓ 后点保存)
   └──POST /api/credentials──▶ setProviderCredential ──encryptSecret──▶ provider_credentials(密文)
                                                                            │
采集链 collect-evidence.runProbes ──resolveCredentials([探针键])──▶ DB密文─decrypt─┐
                                                                    env 回退 ──────┴─▶ buildProbeProviders(creds) ──▶ 真探针
矩阵 page.tsx ──getConfiguredCredentialKeys()（只键不解密）──▶ buildDataSourceStatuses 认 DB+env
```

## 错误处理

- 主密钥缺失/格式错：`encryptSecret`/`decryptSecret` 抛 `credentials_encryption_key_invalid`；保存路由捕获 → 500 `encryption_unavailable`（提示配置 `CREDENTIALS_ENCRYPTION_KEY`）。
- 解密失败（密钥轮换/数据损坏）：`resolveCredential` 吞掉解密异常回退 env 并 `console.warn`，不使采集整体崩溃（单源降级优于全链失败）。
- 测连接网络错：`{ ok:false, error:'network_error' }`，UI 原样显示原因。

## 测试策略

- `secrets.test.ts`：round-trip（enc→dec 还原）、密文不含明文、篡改 tag → `secret_decrypt_failed`、坏密钥 → `credentials_encryption_key_invalid`。
- 仓库集成（临时库）：`setProviderCredential` 后行内是密文（≠明文）、`getConfiguredCredentialKeys` 返回键、`deleteProviderCredential` 删除。
- `store.test.ts`：DB 有→返回解密值；DB 无→回退 env；均无→undefined（注入 fake repo + env）。
- `test-connection.test.ts`：注入 fake fetch，2xx→ok、401→auth_failed、未知键→not_testable。
- `buildProbeProviders` 单测：creds 有 key→isConfigured 真；无→假。
- 路由测试：save 非法键 422、缺字段 422、成功 ok；test 路由转发结果。

## 范围边界（YAGNI）

- 本 SP **只**做 AI 探针 4 家的测连接；其余源仅录入。
- 不做密钥轮换/多密钥版本管理（`v1` 前缀已预留版本位，未来再说）。
- 不做 SP-G1f 的 `gsc_refresh_token` 加密迁移——本 SP 只交付**共享加密模块**，迁移在 SP-G1f 计划里做。
- 不做多租户/项目级凭据（全局级已定）。
