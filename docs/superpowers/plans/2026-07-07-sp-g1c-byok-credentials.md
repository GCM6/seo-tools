# SP-G1c · BYOK 凭据录入 + 加密存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让非技术用户在设置页录入各数据源 API Key（密文入库、DB 优先于 env），并对 AI 探针 4 家提供「测试连接」，只录 OpenAI key 即可跑出 AI 可见度真数据。

**Architecture:** 通用 env-var-name 键值表 `provider_credentials`（全局级，AES-256-GCM 密文）；共享加密模块 `lib/crypto/secrets.ts`；解析层 `lib/credentials/store.ts` 做「DB 密文解密 > env 回退」覆盖；探针工厂由读 env 改为读已解析 creds 映射；设置页矩阵与新增「API Key 录入」区经 Route Handler 保存/删除/测连接。

**Tech Stack:** TypeScript 全栈；node:crypto（AES-256-GCM）；libSQL(Turso)+Drizzle；Next 16 Route Handlers；next-intl；vitest。包管理器 **pnpm**。

## Global Constraints

- **无 Zod**：手写校验 + `throw new Error` / snake_case 错误码。
- 主密钥只在 `CREDENTIALS_ENCRYPTION_KEY` env（base64 的 32 字节）；**永不入库、永不返回前端**。凭据 `ciphertext` 恒为密文。
- DB 读写集中在 `lib/repositories/index.ts`；插入空数组短路；插入行显式给主键。
- 测试与源码同层共存（`foo.ts` 旁 `foo.test.ts`），不建 `__tests__/`；组件平铺。
- Next 16：`params`/`searchParams`/`cookies` 必 `await`；变更走既有设置页风格（Route Handler + `router.refresh()`，与 `/api/gsc/site` 一致）。
- 命令一律 pnpm。UI 文案走 next-intl `t()`，纯展示组件由调用方传已翻译 label。
- 类型真源：`AiProbeProvider`/`AiProbeProviderId` 在 `lib/probes/providers/types.ts`。

---

## File Structure

- `lib/crypto/secrets.ts`（Create）+ `secrets.test.ts` — 加密模块（与 SP-G1f 共享）。
- `db/schema.ts`（Modify）+ `db/migrations/0004_*.sql`（Create，drizzle-kit 生成）— `provider_credentials` 表。
- `lib/repositories/index.ts`（Modify）+ `lib/repositories/provider-credentials.repo.test.ts`（Create）— 凭据读写。
- `lib/credentials/keys.ts`（Create）+ `keys.test.ts` — 允许清单真源（矩阵/路由/测连接共用）。
- `lib/credentials/store.ts`（Create）+ `store.test.ts` — DB>env 解析层。
- `lib/probes/providers/index.ts`（Modify）+ `providers-factory.test.ts`（Create）— `buildProbeProviders(creds)`。
- `lib/inngest/collect-evidence.ts`（Modify）— `runProbes` 注入已解析 creds。
- `lib/credentials/test-connection.ts`（Create）+ `test-connection.test.ts` — AI 探针测连接。
- `app/api/credentials/route.ts`（Create）+ `route.test.ts` — 保存/删除。
- `app/api/credentials/test/route.ts`（Create）+ `route.test.ts` — 测连接。
- `lib/settings/data-sources.ts`（Modify）+ `data-sources.test.ts`（Modify）— 矩阵认 DB+env。
- `lib/settings/credential-rows.ts`（Create）+ `credential-rows.test.ts` — 录入区行模型（纯函数，不外泄值）。
- `app/[locale]/settings/page.tsx`（Modify）+ `SettingsClient.tsx`（Modify）+ `messages/zh.json` `messages/en.json`（Modify）— 录入 UI。

---

### Task 1: 加密模块 `lib/crypto/secrets.ts`

**Files:**
- Create: `lib/crypto/secrets.ts`
- Test: `lib/crypto/secrets.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(plaintext: string): string` — 返回自包含串 `v1.<iv_b64>.<tag_b64>.<ct_b64>`。
  - `decryptSecret(token: string): string` — 还原明文；坏 token/认证失败抛 `secret_decrypt_failed`；主密钥非法抛 `credentials_encryption_key_invalid`。

- [ ] **Step 1: 写失败测试** — `lib/crypto/secrets.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { encryptSecret, decryptSecret } from './secrets'

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('secrets AES-256-GCM', () => {
  it('明文往返还原', () => {
    expect(decryptSecret(encryptSecret('sk-abc123'))).toBe('sk-abc123')
  })
  it('密文不含明文', () => {
    expect(encryptSecret('sk-secret-value')).not.toContain('sk-secret-value')
  })
  it('篡改密文段 → 认证失败', () => {
    const parts = encryptSecret('x').split('.')
    parts[3] = Buffer.from('tampered').toString('base64')
    expect(() => decryptSecret(parts.join('.'))).toThrow('secret_decrypt_failed')
  })
  it('版本前缀不对 → 拒绝', () => {
    expect(() => decryptSecret('v2.a.b.c')).toThrow('secret_decrypt_failed')
  })
  it('主密钥非法 → 抛 key invalid', () => {
    const saved = process.env.CREDENTIALS_ENCRYPTION_KEY
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'short'
    expect(() => encryptSecret('x')).toThrow('credentials_encryption_key_invalid')
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run lib/crypto/secrets.test.ts`
Expected: FAIL —「Cannot find module './secrets'」。

- [ ] **Step 3: 实现** — `lib/crypto/secrets.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// 凭据加密：AES-256-GCM，自包含串 v1.<iv>.<tag>.<ct>（base64 段）。
// 主密钥来自 CREDENTIALS_ENCRYPTION_KEY（base64 的 32 字节，openssl rand -base64 32）。
// 版本位 v1 预留未来密钥轮换；本 SP 不做轮换。
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const VERSION = 'v1'

function loadKey(): Buffer {
  const key = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('credentials_encryption_key_invalid')
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, loadKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

export function decryptSecret(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('secret_decrypt_failed')
  try {
    const decipher = createDecipheriv(ALGO, loadKey(), Buffer.from(parts[1], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8')
  } catch (e) {
    if (e instanceof Error && e.message === 'credentials_encryption_key_invalid') throw e
    throw new Error('secret_decrypt_failed')
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run lib/crypto/secrets.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 5: 提交**

```bash
git add lib/crypto/secrets.ts lib/crypto/secrets.test.ts
git commit -m "feat(crypto): AES-256-GCM 凭据加密模块（与 SP-G1f 共享）"
```

---

### Task 2: `provider_credentials` 表 + 凭据读写仓库函数

**Files:**
- Modify: `db/schema.ts`（表定义）
- Create: `db/migrations/0004_*.sql`（drizzle-kit 生成）
- Modify: `lib/repositories/index.ts`（import + 4 个函数）
- Test: `lib/repositories/provider-credentials.repo.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`（Task 1）。
- Produces:
  - `getProviderCredentialRow(key: string): Promise<{ credentialKey: string; ciphertext: string; createdAt: string; updatedAt: string } | undefined>`
  - `getConfiguredCredentialKeys(): Promise<string[]>`
  - `setProviderCredential(key: string, plaintext: string): Promise<void>`
  - `deleteProviderCredential(key: string): Promise<void>`

- [ ] **Step 1: 加表定义** — `db/schema.ts` 末尾（其他 export 之后）新增：

```ts
// —— BYOK 凭据（SP-G1c）：全局级、env-var-name 为主键、AES-256-GCM 密文。GSC 按站 token 仍在 project_settings。
export const providerCredentials = sqliteTable('provider_credentials', {
  credentialKey: text('credential_key').primaryKey(), // env 变量名，如 'OPENAI_API_KEY'
  ciphertext: text('ciphertext').notNull(),           // encryptSecret 产物（自包含 iv/tag/ct）
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})
```

- [ ] **Step 2: 生成迁移 SQL**

Run: `pnpm exec drizzle-kit generate`
Expected: 新增 `db/migrations/0004_*.sql`（含 `CREATE TABLE \`provider_credentials\``）+ 更新 `db/migrations/meta/`。
若 drizzle-kit 交互式询问，选默认（create table）。生成后确认文件存在：`ls db/migrations/ | tail -3`。

- [ ] **Step 3: 写失败测试** — `lib/repositories/provider-credentials.repo.test.ts`

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-credrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
const migrations = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const m of migrations) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { providerCredentials } = await import('@/db/schema')

describe('provider_credentials 仓库', () => {
  beforeEach(async () => { await db.delete(providerCredentials) })

  it('setProviderCredential 存密文（≠明文）；getConfiguredCredentialKeys 列出键；解密可还原', async () => {
    await repo.setProviderCredential('OPENAI_API_KEY', 'sk-plain')
    const [row] = await db.select().from(providerCredentials)
    expect(row.ciphertext).not.toContain('sk-plain')
    expect(await repo.getConfiguredCredentialKeys()).toEqual(['OPENAI_API_KEY'])
    const got = await repo.getProviderCredentialRow('OPENAI_API_KEY')
    const { decryptSecret } = await import('@/lib/crypto/secrets')
    expect(decryptSecret(got!.ciphertext)).toBe('sk-plain')
  })

  it('upsert 同键覆盖，不新增行', async () => {
    await repo.setProviderCredential('OPENAI_API_KEY', 'v1')
    await repo.setProviderCredential('OPENAI_API_KEY', 'v2')
    expect(await db.select().from(providerCredentials)).toHaveLength(1)
  })

  it('deleteProviderCredential 移除', async () => {
    await repo.setProviderCredential('GEMINI_API_KEY', 'k')
    await repo.deleteProviderCredential('GEMINI_API_KEY')
    expect(await repo.getConfiguredCredentialKeys()).toEqual([])
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run lib/repositories/provider-credentials.repo.test.ts`
Expected: FAIL — `repo.setProviderCredential is not a function`。

- [ ] **Step 5: 实现仓库函数** — `lib/repositories/index.ts`

顶部 schema import 追加 `providerCredentials`；新增加密 import：

```ts
// db/schema import 列表末尾加 providerCredentials
// 文件顶部 import 区新增：
import { encryptSecret } from '@/lib/crypto/secrets'
```

在文件末尾 `export * from './validators'` **之前**追加：

```ts
// —— BYOK 凭据读写（SP-G1c）——
export const getProviderCredentialRow = (key: string) =>
  db.query.providerCredentials.findFirst({ where: eq(providerCredentials.credentialKey, key) })

// 只取键判「已配置」，不解密、不外泄值（矩阵/UI 用）。
export const getConfiguredCredentialKeys = async (): Promise<string[]> => {
  const rows = await db.select({ k: providerCredentials.credentialKey }).from(providerCredentials)
  return rows.map((r) => r.k)
}

// 加密后 upsert（同键覆盖）；主键 = credentialKey，无需生成 id。
export const setProviderCredential = async (key: string, plaintext: string): Promise<void> => {
  const ciphertext = encryptSecret(plaintext)
  const now = new Date().toISOString()
  await db
    .insert(providerCredentials)
    .values({ credentialKey: key, ciphertext, updatedAt: now })
    .onConflictDoUpdate({ target: providerCredentials.credentialKey, set: { ciphertext, updatedAt: now } })
}

export const deleteProviderCredential = async (key: string): Promise<void> => {
  await db.delete(providerCredentials).where(eq(providerCredentials.credentialKey, key))
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run lib/repositories/provider-credentials.repo.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 7: 提交**

```bash
git add db/schema.ts db/migrations lib/repositories/index.ts lib/repositories/provider-credentials.repo.test.ts
git commit -m "feat(repo): provider_credentials 表 + 加密凭据读写（BYOK）"
```

---

### Task 3: 允许清单 `keys.ts` + 解析层 `store.ts`

**Files:**
- Create: `lib/credentials/keys.ts` + `lib/credentials/keys.test.ts`
- Create: `lib/credentials/store.ts` + `lib/credentials/store.test.ts`

**Interfaces:**
- Consumes: `getProviderCredentialRow`（Task 2）、`decryptSecret`（Task 1）。
- Produces:
  - `CredentialProvider` = `'openai'|'perplexity'|'gemini'|'deepseek'|'googleCse'|'dataforseo'|'cloudflare'`
  - `CredentialKeyMeta = { key: string; provider: CredentialProvider; testable: boolean }`
  - `CREDENTIAL_KEYS: CredentialKeyMeta[]`（真源）
  - `isAllowedCredentialKey(k: string): boolean`、`credentialMeta(k: string): CredentialKeyMeta | undefined`
  - `PROBE_CREDENTIAL_KEYS: string[]`（4 个探针 env 名）
  - `resolveCredential(key, deps?): Promise<string | undefined>`、`resolveCredentials(keys, deps?): Promise<Record<string,string|undefined>>`
  - `ResolveDeps = { getRow: (key: string) => Promise<{ ciphertext: string } | undefined>; env: Record<string,string|undefined> }`

- [ ] **Step 1: 写 keys 失败测试** — `lib/credentials/keys.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { CREDENTIAL_KEYS, isAllowedCredentialKey, credentialMeta, PROBE_CREDENTIAL_KEYS } from './keys'

describe('credential keys 允许清单', () => {
  it('含 4 家探针且标 testable', () => {
    for (const k of ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'])
      expect(credentialMeta(k)?.testable).toBe(true)
  })
  it('非探针源 testable=false', () => {
    expect(credentialMeta('GOOGLE_CSE_CX')?.testable).toBe(false)
  })
  it('未知键不在清单', () => {
    expect(isAllowedCredentialKey('HACK')).toBe(false)
    expect(isAllowedCredentialKey('OPENAI_API_KEY')).toBe(true)
  })
  it('PROBE_CREDENTIAL_KEYS 恰为 4 家探针 env 名', () => {
    expect(PROBE_CREDENTIAL_KEYS).toEqual(['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'])
  })
  it('CREDENTIAL_KEYS 键唯一', () => {
    expect(new Set(CREDENTIAL_KEYS.map((c) => c.key)).size).toBe(CREDENTIAL_KEYS.length)
  })
})
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm vitest run lib/credentials/keys.test.ts`
Expected: FAIL —「Cannot find module './keys'」。

- [ ] **Step 3: 实现 keys** — `lib/credentials/keys.ts`

```ts
// BYOK 凭据允许清单：矩阵/保存路由/测连接的共用真源。键名 = env 变量名，使 DB>env 同名覆盖。
export type CredentialProvider =
  | 'openai' | 'perplexity' | 'gemini' | 'deepseek' | 'googleCse' | 'dataforseo' | 'cloudflare'

export interface CredentialKeyMeta {
  key: string
  provider: CredentialProvider
  testable: boolean // 本 SP 是否支持「测试连接」（仅 AI 探针 4 家）
}

export const CREDENTIAL_KEYS: CredentialKeyMeta[] = [
  { key: 'OPENAI_API_KEY', provider: 'openai', testable: true },
  { key: 'PERPLEXITY_API_KEY', provider: 'perplexity', testable: true },
  { key: 'GEMINI_API_KEY', provider: 'gemini', testable: true },
  { key: 'DEEPSEEK_API_KEY', provider: 'deepseek', testable: true },
  { key: 'GOOGLE_CSE_API_KEY', provider: 'googleCse', testable: false },
  { key: 'GOOGLE_CSE_CX', provider: 'googleCse', testable: false },
  { key: 'DATAFORSEO_LOGIN', provider: 'dataforseo', testable: false },
  { key: 'DATAFORSEO_PASSWORD', provider: 'dataforseo', testable: false },
  { key: 'CLOUDFLARE_ACCOUNT_ID', provider: 'cloudflare', testable: false },
  { key: 'CLOUDFLARE_API_TOKEN', provider: 'cloudflare', testable: false },
]

export const isAllowedCredentialKey = (k: string): boolean => CREDENTIAL_KEYS.some((c) => c.key === k)
export const credentialMeta = (k: string): CredentialKeyMeta | undefined => CREDENTIAL_KEYS.find((c) => c.key === k)

// 探针工厂需要的 4 个 key（顺序即 openai/perplexity/gemini/deepseek）。
export const PROBE_CREDENTIAL_KEYS = CREDENTIAL_KEYS.filter((c) => c.testable).map((c) => c.key)
```

- [ ] **Step 4: 跑确认通过**

Run: `pnpm vitest run lib/credentials/keys.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 5: 写 store 失败测试** — `lib/credentials/store.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resolveCredential, resolveCredentials } from './store'
import { encryptSecret } from '@/lib/crypto/secrets'

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64') })
const noRow = async () => undefined

describe('resolveCredential DB>env 覆盖', () => {
  it('DB 有值 → 返回解密明文', async () => {
    const ciphertext = encryptSecret('sk-db')
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: async () => ({ ciphertext }), env: {} })
    expect(v).toBe('sk-db')
  })
  it('DB 无值 → 回退 env', async () => {
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: noRow, env: { OPENAI_API_KEY: 'sk-env' } })
    expect(v).toBe('sk-env')
  })
  it('DB、env 均无 → undefined', async () => {
    expect(await resolveCredential('OPENAI_API_KEY', { getRow: noRow, env: {} })).toBeUndefined()
  })
  it('解密失败 → 不抛，回退 env', async () => {
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: async () => ({ ciphertext: 'v1.bad.bad.bad' }), env: { OPENAI_API_KEY: 'sk-env' } })
    expect(v).toBe('sk-env')
  })
  it('resolveCredentials 批量成映射', async () => {
    const map = await resolveCredentials(['A', 'B'], { getRow: noRow, env: { A: '1' } })
    expect(map).toEqual({ A: '1', B: undefined })
  })
})
```

- [ ] **Step 6: 跑确认失败**

Run: `pnpm vitest run lib/credentials/store.test.ts`
Expected: FAIL —「Cannot find module './store'」。

- [ ] **Step 7: 实现 store** — `lib/credentials/store.ts`

```ts
import { getProviderCredentialRow } from '@/lib/repositories'
import { decryptSecret } from '@/lib/crypto/secrets'

// DB 密文优先、env 回退的凭据解析。解密失败（密钥轮换/损坏）时降级到 env，不使采集整链崩溃。
export interface ResolveDeps {
  getRow: (key: string) => Promise<{ ciphertext: string } | undefined>
  env: Record<string, string | undefined>
}
const defaultDeps: ResolveDeps = { getRow: getProviderCredentialRow, env: process.env }

export async function resolveCredential(key: string, deps: ResolveDeps = defaultDeps): Promise<string | undefined> {
  const row = await deps.getRow(key)
  if (row?.ciphertext) {
    try {
      return decryptSecret(row.ciphertext)
    } catch {
      console.warn(`credential_decrypt_failed:${key}`)
    }
  }
  return deps.env[key] || undefined
}

export async function resolveCredentials(
  keys: string[],
  deps: ResolveDeps = defaultDeps,
): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await resolveCredential(k, deps)] as const))
  return Object.fromEntries(entries)
}
```

- [ ] **Step 8: 跑确认通过 + 提交**

Run: `pnpm vitest run lib/credentials/keys.test.ts lib/credentials/store.test.ts`
Expected: PASS（10 用例）。

```bash
git add lib/credentials/keys.ts lib/credentials/keys.test.ts lib/credentials/store.ts lib/credentials/store.test.ts
git commit -m "feat(credentials): 允许清单 + DB>env 凭据解析层"
```

---

### Task 4: 探针工厂改造 `buildProbeProviders(creds)` + 采集链注入

**Files:**
- Modify: `lib/probes/providers/index.ts`
- Test: `lib/probes/providers/providers-factory.test.ts`
- Modify: `lib/inngest/collect-evidence.ts`（`runProbes` 闭包 + imports）

**Interfaces:**
- Consumes: `resolveCredentials` + `PROBE_CREDENTIAL_KEYS`（Task 3）；`create*ProbeProvider`（既有）。
- Produces: `buildProbeProviders(creds: Record<string, string | undefined>): AiProbeProvider[]`；`buildProbeProvidersFromEnv(): AiProbeProvider[]` 保留为 `buildProbeProviders(process.env)`。

- [ ] **Step 1: 写失败测试** — `lib/probes/providers/providers-factory.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildProbeProviders } from './index'

describe('buildProbeProviders(creds)', () => {
  it('creds 有 openai key → 仅 openai isConfigured', () => {
    const ps = buildProbeProviders({ OPENAI_API_KEY: 'sk' })
    expect(ps.find((p) => p.id === 'openai')!.isConfigured()).toBe(true)
    expect(ps.find((p) => p.id === 'gemini')!.isConfigured()).toBe(false)
  })
  it('空 creds → 全部未配置', () => {
    expect(buildProbeProviders({}).every((p) => !p.isConfigured())).toBe(true)
  })
})
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm vitest run lib/probes/providers/providers-factory.test.ts`
Expected: FAIL — `buildProbeProviders` 未导出。

- [ ] **Step 3: 实现工厂** — 替换 `lib/probes/providers/index.ts` 的 `buildProbeProvidersFromEnv`：

```ts
// BYOK：全部实例化，key 缺失的 isConfigured() 为 false，由探针 stage 过滤。
// creds 已由 lib/credentials/store 解析（DB 密文优先、env 回退）。
export function buildProbeProviders(creds: Record<string, string | undefined>): AiProbeProvider[] {
  return [
    createOpenAiProbeProvider({ apiKey: creds.OPENAI_API_KEY ?? '' }),
    createPerplexityProbeProvider({ apiKey: creds.PERPLEXITY_API_KEY ?? '' }),
    createGeminiProbeProvider({ apiKey: creds.GEMINI_API_KEY ?? '' }),
    createDeepseekProbeProvider({ apiKey: creds.DEEPSEEK_API_KEY ?? '' }),
  ]
}

// 向后兼容：无 DB 凭据时（如脚本/测试）直接从 env 建。
export function buildProbeProvidersFromEnv(): AiProbeProvider[] {
  return buildProbeProviders(process.env)
}
```

- [ ] **Step 4: 跑确认通过**

Run: `pnpm vitest run lib/probes/providers/providers-factory.test.ts lib/probes/providers/providers.test.ts`
Expected: PASS。

- [ ] **Step 5: 采集链注入 DB 凭据** — `lib/inngest/collect-evidence.ts`

顶部 import 调整：

```ts
// 原：import { buildProbeProvidersFromEnv } from '@/lib/probes/providers'
import { buildProbeProviders } from '@/lib/probes/providers'
import { resolveCredentials } from '@/lib/credentials/store'
import { PROBE_CREDENTIAL_KEYS } from '@/lib/credentials/keys'
```

把 `runProbes` 闭包（现 `buildProviders: buildProbeProvidersFromEnv`）改为先解析凭据：

```ts
    runProbes: async (args) => {
      // 探针 key 走 DB>env 解析（BYOK 设置页录入优先于环境变量）。
      const creds = await resolveCredentials(PROBE_CREDENTIAL_KEYS)
      return collectProbesStage(args, {
        getProject,
        getProjectSettings,
        buildProviders: () => buildProbeProviders(creds),
        createPrompts,
        createEvidenceArtifact,
        createAiProbeResult,
      })
    },
```

- [ ] **Step 6: 全量回归**

Run: `pnpm vitest run lib/inngest lib/probes`
Expected: PASS（采集/探针链无回归；单测注入 fake deps，不走真 DB 解析）。

- [ ] **Step 7: 提交**

```bash
git add lib/probes/providers/index.ts lib/probes/providers/providers-factory.test.ts lib/inngest/collect-evidence.ts
git commit -m "feat(probes): buildProbeProviders(creds) + 采集链接 DB>env 凭据"
```

---

### Task 5: AI 探针测连接 `lib/credentials/test-connection.ts`

**Files:**
- Create: `lib/credentials/test-connection.ts` + `lib/credentials/test-connection.test.ts`

**Interfaces:**
- Consumes: `credentialMeta`（Task 3）。
- Produces: `testCredentialConnection(credentialKey: string, value: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: 写失败测试** — `lib/credentials/test-connection.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { testCredentialConnection } from './test-connection'

const okFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
const unauthFetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
const boomFetch = (async () => { throw new Error('net') }) as unknown as typeof fetch

describe('testCredentialConnection', () => {
  it('openai 2xx → ok', async () => {
    expect(await testCredentialConnection('OPENAI_API_KEY', 'sk', okFetch)).toEqual({ ok: true })
  })
  it('401 → auth_failed', async () => {
    expect(await testCredentialConnection('OPENAI_API_KEY', 'sk', unauthFetch)).toEqual({ ok: false, error: 'auth_failed' })
  })
  it('网络异常 → network_error', async () => {
    expect(await testCredentialConnection('GEMINI_API_KEY', 'k', boomFetch)).toEqual({ ok: false, error: 'network_error' })
  })
  it('非可测键 → not_testable', async () => {
    expect(await testCredentialConnection('GOOGLE_CSE_CX', 'x', okFetch)).toEqual({ ok: false, error: 'not_testable' })
  })
  it('空值 → value_required', async () => {
    expect(await testCredentialConnection('OPENAI_API_KEY', '  ', okFetch)).toEqual({ ok: false, error: 'value_required' })
  })
})
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm vitest run lib/credentials/test-connection.test.ts`
Expected: FAIL —「Cannot find module './test-connection'」。

- [ ] **Step 3: 实现** — `lib/credentials/test-connection.ts`

```ts
import { credentialMeta } from './keys'

type Result = { ok: boolean; error?: string }

// 最小 auth 检查：只判 key 是否被接受，不消耗真实探针配额。
async function check(url: string, fetchImpl: typeof fetch, init?: RequestInit): Promise<Result> {
  try {
    const res = await fetchImpl(url, init)
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'auth_failed' }
    return { ok: false, error: `http_${res.status}` }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

export async function testCredentialConnection(
  credentialKey: string,
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result> {
  const meta = credentialMeta(credentialKey)
  if (!meta || !meta.testable) return { ok: false, error: 'not_testable' }
  if (!value.trim()) return { ok: false, error: 'value_required' }
  const key = value.trim()
  switch (meta.provider) {
    case 'openai':
      return check('https://api.openai.com/v1/models', fetchImpl, { headers: { authorization: `Bearer ${key}` } })
    case 'deepseek':
      return check('https://api.deepseek.com/models', fetchImpl, { headers: { authorization: `Bearer ${key}` } })
    case 'gemini':
      return check(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, fetchImpl)
    case 'perplexity':
      return check('https://api.perplexity.ai/chat/completions', fetchImpl, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'sonar', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      })
    default:
      return { ok: false, error: 'not_testable' }
  }
}
```

- [ ] **Step 4: 跑确认通过 + 提交**

Run: `pnpm vitest run lib/credentials/test-connection.test.ts`
Expected: PASS（5 用例）。

```bash
git add lib/credentials/test-connection.ts lib/credentials/test-connection.test.ts
git commit -m "feat(credentials): AI 探针最小 auth 测连接"
```

---

### Task 6: 凭据保存/删除/测连接路由

**Files:**
- Create: `app/api/credentials/route.ts` + `app/api/credentials/route.test.ts`
- Create: `app/api/credentials/test/route.ts` + `app/api/credentials/test/route.test.ts`

**Interfaces:**
- Consumes: `setProviderCredential` / `deleteProviderCredential`（Task 2）、`isAllowedCredentialKey`（Task 3）、`testCredentialConnection`（Task 5）。
- Produces: `POST/DELETE /api/credentials`、`POST /api/credentials/test`。

- [ ] **Step 1: 写保存路由失败测试** — `app/api/credentials/route.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saved: { key: string; value: string }[] = []
const deleted: string[] = []
vi.mock('@/lib/repositories', () => ({
  setProviderCredential: async (key: string, value: string) => { saved.push({ key, value }) },
  deleteProviderCredential: async (key: string) => { deleted.push(key) },
}))

const { POST, DELETE } = await import('./route')

function req(method: string, body: unknown) {
  return new Request('http://x/api/credentials', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('/api/credentials', () => {
  beforeEach(() => { saved.length = 0; deleted.length = 0 })

  it('缺 key → 422', async () => {
    expect((await POST(req('POST', { value: 'x' }))).status).toBe(422)
  })
  it('未知键 → 422 unknown_credential_key', async () => {
    const res = await POST(req('POST', { credentialKey: 'HACK', value: 'x' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('unknown_credential_key')
  })
  it('缺 value → 422', async () => {
    expect((await POST(req('POST', { credentialKey: 'OPENAI_API_KEY' }))).status).toBe(422)
  })
  it('合法 → 保存', async () => {
    const res = await POST(req('POST', { credentialKey: 'OPENAI_API_KEY', value: ' sk ' }))
    expect(res.status).toBe(200)
    expect(saved).toEqual([{ key: 'OPENAI_API_KEY', value: 'sk' }])
  })
  it('DELETE 合法键 → 删除', async () => {
    const res = await DELETE(req('DELETE', { credentialKey: 'GEMINI_API_KEY' }))
    expect(res.status).toBe(200)
    expect(deleted).toEqual(['GEMINI_API_KEY'])
  })
})
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm vitest run app/api/credentials/route.test.ts`
Expected: FAIL —「Cannot find module './route'」。

- [ ] **Step 3: 实现保存路由** — `app/api/credentials/route.ts`

```ts
import { NextResponse } from 'next/server'
import { setProviderCredential, deleteProviderCredential } from '@/lib/repositories'
import { isAllowedCredentialKey } from '@/lib/credentials/keys'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { credentialKey?: string; value?: string }
  if (!body.credentialKey) return NextResponse.json({ error: 'credential_key_required' }, { status: 422 })
  if (!isAllowedCredentialKey(body.credentialKey)) return NextResponse.json({ error: 'unknown_credential_key' }, { status: 422 })
  if (!body.value?.trim()) return NextResponse.json({ error: 'value_required' }, { status: 422 })
  try {
    await setProviderCredential(body.credentialKey, body.value.trim())
  } catch {
    // encryptSecret 抛（主密钥缺失/非法）→ 提示配置 CREDENTIALS_ENCRYPTION_KEY。
    return NextResponse.json({ error: 'encryption_unavailable' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { credentialKey?: string }
  if (!body.credentialKey) return NextResponse.json({ error: 'credential_key_required' }, { status: 422 })
  if (!isAllowedCredentialKey(body.credentialKey)) return NextResponse.json({ error: 'unknown_credential_key' }, { status: 422 })
  await deleteProviderCredential(body.credentialKey)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 跑确认通过**

Run: `pnpm vitest run app/api/credentials/route.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 5: 写测连接路由失败测试** — `app/api/credentials/test/route.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/credentials/test-connection', () => ({
  testCredentialConnection: async (key: string, value: string) =>
    value === 'good' ? { ok: true } : { ok: false, error: 'auth_failed' },
}))

const { POST } = await import('./route')
const req = (body: unknown) =>
  new Request('http://x/api/credentials/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('/api/credentials/test', () => {
  it('缺字段 → 422', async () => {
    expect((await POST(req({ credentialKey: 'OPENAI_API_KEY' }))).status).toBe(422)
  })
  it('转发测连接结果 ok', async () => {
    expect(await (await POST(req({ credentialKey: 'OPENAI_API_KEY', value: 'good' }))).json()).toEqual({ ok: true })
  })
  it('转发失败原因', async () => {
    expect(await (await POST(req({ credentialKey: 'OPENAI_API_KEY', value: 'bad' }))).json()).toEqual({ ok: false, error: 'auth_failed' })
  })
})
```

- [ ] **Step 6: 跑确认失败 → 实现测连接路由** — `app/api/credentials/test/route.ts`

```ts
import { NextResponse } from 'next/server'
import { testCredentialConnection } from '@/lib/credentials/test-connection'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { credentialKey?: string; value?: string }
  if (!body.credentialKey) return NextResponse.json({ error: 'credential_key_required' }, { status: 422 })
  if (!body.value?.trim()) return NextResponse.json({ error: 'value_required' }, { status: 422 })
  return NextResponse.json(await testCredentialConnection(body.credentialKey, body.value.trim()))
}
```

- [ ] **Step 7: 跑确认通过 + 提交**

Run: `pnpm vitest run app/api/credentials`
Expected: PASS（8 用例）。

```bash
git add app/api/credentials
git commit -m "feat(api): 凭据保存/删除/测连接路由"
```

---

### Task 7: 矩阵认 DB + 录入区行模型（纯函数）

**Files:**
- Modify: `lib/settings/data-sources.ts`
- Modify: `lib/settings/data-sources.test.ts`
- Create: `lib/settings/credential-rows.ts` + `lib/settings/credential-rows.test.ts`

**Interfaces:**
- Consumes: `CREDENTIAL_KEYS`（Task 3）。
- Produces:
  - `buildDataSourceStatuses(env, gsc, dbConfiguredKeys?: string[]): DataSourceStatus[]`（新增第 3 参，默认 `[]`）
  - `CredentialRow = { key: string; provider: CredentialProvider; testable: boolean; source: 'db' | 'env' | 'none' }`
  - `buildCredentialRows(env: Record<string,string|undefined>, dbKeys: string[]): CredentialRow[]`

- [ ] **Step 1: 改矩阵测试（新增 DB 认定用例）** — `lib/settings/data-sources.test.ts`

在文件内新增一条用例（保留原有）：

```ts
it('DB 已配探针键 → aiProbe 认为已配置（即使 env 空）', () => {
  const statuses = buildDataSourceStatuses({}, { gscAppConfigured: false, gscConnected: false, gscSiteUrl: null }, ['OPENAI_API_KEY'])
  const ai = statuses.find((s) => s.key === 'aiProbe')!
  expect(ai.configured).toBe(true)
  expect(ai.detail).toBe('1/4')
})
```

- [ ] **Step 2: 跑确认失败**

Run: `pnpm vitest run lib/settings/data-sources.test.ts`
Expected: FAIL — 第 3 参未被接受 / aiProbe 仍 false。

- [ ] **Step 3: 改 `buildDataSourceStatuses` 认 DB** — `lib/settings/data-sources.ts`

```ts
export function buildDataSourceStatuses(
  env: Record<string, string | undefined>,
  gsc: GscConnection,
  dbConfiguredKeys: string[] = [],
): DataSourceStatus[] {
  const has = (k: string) => !!env[k] || dbConfiguredKeys.includes(k)
  const aiCount = AI_PROVIDER_ENVS.filter(has).length
  return [
    { key: 'gsc', configured: gsc.gscAppConfigured, connected: gsc.gscConnected, detail: gsc.gscSiteUrl ?? undefined },
    { key: 'googleCse', configured: has('GOOGLE_CSE_API_KEY') && has('GOOGLE_CSE_CX') },
    { key: 'aiProbe', configured: aiCount > 0, detail: `${aiCount}/4` },
    { key: 'dataforseo', configured: has('DATAFORSEO_LOGIN') && has('DATAFORSEO_PASSWORD') },
    { key: 'render', configured: has('CLOUDFLARE_ACCOUNT_ID') && has('CLOUDFLARE_API_TOKEN') },
    { key: 'psi', configured: true },
    { key: 'publicCorpora', configured: true },
  ]
}
```

- [ ] **Step 4: 跑确认通过**

Run: `pnpm vitest run lib/settings/data-sources.test.ts`
Expected: PASS（原用例 + 新用例）。

- [ ] **Step 5: 写 credential-rows 失败测试** — `lib/settings/credential-rows.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildCredentialRows } from './credential-rows'

describe('buildCredentialRows 来源标注（不含值）', () => {
  it('DB 键标 db，env 键标 env，其余 none', () => {
    const rows = buildCredentialRows({ PERPLEXITY_API_KEY: 'x' }, ['OPENAI_API_KEY'])
    const by = (k: string) => rows.find((r) => r.key === k)!
    expect(by('OPENAI_API_KEY').source).toBe('db')      // DB 优先
    expect(by('PERPLEXITY_API_KEY').source).toBe('env')
    expect(by('GEMINI_API_KEY').source).toBe('none')
  })
  it('行不携带任何明文值字段', () => {
    const rows = buildCredentialRows({ OPENAI_API_KEY: 'sk-secret' }, [])
    expect(JSON.stringify(rows)).not.toContain('sk-secret')
  })
})
```

- [ ] **Step 6: 跑确认失败 → 实现** — `lib/settings/credential-rows.ts`

```ts
import { CREDENTIAL_KEYS, type CredentialProvider } from '@/lib/credentials/keys'

// 录入区行模型：只暴露「配没配 + 来源」，绝不把 env/DB 明文值下发给前端。
export interface CredentialRow {
  key: string
  provider: CredentialProvider
  testable: boolean
  source: 'db' | 'env' | 'none'
}

export function buildCredentialRows(env: Record<string, string | undefined>, dbKeys: string[]): CredentialRow[] {
  return CREDENTIAL_KEYS.map((c) => ({
    key: c.key,
    provider: c.provider,
    testable: c.testable,
    source: dbKeys.includes(c.key) ? 'db' : env[c.key] ? 'env' : 'none',
  }))
}
```

- [ ] **Step 7: 跑确认通过 + 提交**

Run: `pnpm vitest run lib/settings`
Expected: PASS。

```bash
git add lib/settings/data-sources.ts lib/settings/data-sources.test.ts lib/settings/credential-rows.ts lib/settings/credential-rows.test.ts
git commit -m "feat(settings): 矩阵认 DB 凭据 + 录入区行模型（不外泄值）"
```

---

### Task 8: 设置页录入 UI 接线（page + client + i18n）

**Files:**
- Modify: `app/[locale]/settings/page.tsx`
- Modify: `app/[locale]/settings/SettingsClient.tsx`
- Modify: `messages/zh.json`、`messages/en.json`

**Interfaces:**
- Consumes: `getConfiguredCredentialKeys`（Task 2）、`buildCredentialRows` / `CredentialRow`（Task 7）、`buildDataSourceStatuses`（Task 7）。

- [ ] **Step 1: page.tsx 传 DB 键 + 录入行**

`app/[locale]/settings/page.tsx`：import 增加，statuses 调用带 dbKeys，并算 credentialRows 传给 client。

```ts
import { getPrimaryProject, getProjectSettings, getConfiguredCredentialKeys } from '@/lib/repositories'
import { buildCredentialRows } from '@/lib/settings/credential-rows'
// …在 settings 读取之后：
const dbKeys = await getConfiguredCredentialKeys()
const statuses = buildDataSourceStatuses(process.env, {
  gscAppConfigured: isGscConfigured(),
  gscConnected: settings?.gscConnected ?? false,
  gscSiteUrl: settings?.gscSiteUrl ?? null,
}, dbKeys)
const credentialRows = buildCredentialRows(process.env, dbKeys)
// …传给 <SettingsClient … credentialRows={credentialRows} />
```

- [ ] **Step 2: SettingsClient 增录入区**

`app/[locale]/settings/SettingsClient.tsx`：props 增 `credentialRows: CredentialRow[]`；在矩阵下方渲染「API Key 录入」区。每行：key（mono）+ provider label + 当前来源徽章 + 密码框 + 可测则「测试连接」+「保存」+ 已 DB 配置则「清除」。逐行本地 state。

```tsx
import type { CredentialRow } from '@/lib/settings/credential-rows'
// props 追加 credentialRows: CredentialRow[]

function CredentialRowItem({ row, t }: { row: CredentialRow; t: ReturnType<typeof useTranslations> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const router = useRouter()

  async function test() {
    setBusy(true); setNote(null)
    const res = await fetch('/api/credentials/test', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key, value }),
    })
    const data = (await res.json()) as { ok: boolean; error?: string }
    setBusy(false)
    setNote(data.ok ? t('testOk') : `${t('testFail')}${data.error ?? ''}`)
  }
  async function save() {
    setBusy(true); setNote(null)
    const res = await fetch('/api/credentials', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key, value }),
    })
    setBusy(false)
    if (res.ok) { setNote(t('keySaved')); setValue(''); router.refresh() }
    else setNote(t('testFail') + ((await res.json()).error ?? ''))
  }
  async function clear() {
    setBusy(true); setNote(null)
    const res = await fetch('/api/credentials', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialKey: row.key }),
    })
    setBusy(false)
    if (res.ok) { setNote(t('keyCleared')); router.refresh() }
  }

  return (
    <tr>
      <td className="mono">{row.key}</td>
      <td>{t(`provider.${row.provider}`)}</td>
      <td>{t(`credSource.${row.source}`)}</td>
      <td>
        <input type="password" className="mono" value={value} placeholder={t('credKeyPlaceholder')}
          onChange={(e) => setValue(e.target.value)} />
        {row.testable && (
          <button type="button" className="ml-2" onClick={test} disabled={busy || !value.trim()}>{t('testConn')}</button>
        )}
        <button type="button" className="ml-2" onClick={save} disabled={busy || !value.trim()}>{t('saveKey')}</button>
        {row.source === 'db' && (
          <button type="button" className="ml-2" onClick={clear} disabled={busy}>{t('clearKey')}</button>
        )}
        {note && <span role="status" className="ml-2 text-xs">{note}</span>}
      </td>
    </tr>
  )
}
```

在 `SettingsClient` 主体、矩阵 `</div>` 之后插入录入区：

```tsx
      <h2 className="mt-6 text-sm font-medium">{t('apiKeysTitle')}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t('apiKeysHint')}</p>
      <div className="report-table-wrap mt-2">
        <table className="report-table">
          <thead>
            <tr><th>{t('credKeyCol')}</th><th>{t('provider.label')}</th><th>{t('col.status')}</th><th>{t('credActionCol')}</th></tr>
          </thead>
          <tbody>
            {credentialRows.map((row) => <CredentialRowItem key={row.key} row={row} t={t} />)}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 3: i18n 文案** — `messages/zh.json` 的 `settings` 增：

```json
"apiKeysTitle": "API Key 录入（BYOK）",
"apiKeysHint": "此处录入的 key 加密存储，优先于环境变量；清除后回退环境变量。",
"credKeyCol": "凭据键",
"credActionCol": "操作",
"credKeyPlaceholder": "粘贴 key…",
"testConn": "测试连接",
"saveKey": "保存",
"clearKey": "清除",
"testOk": "连接成功 ✓",
"testFail": "失败：",
"keySaved": "已保存 ✓",
"keyCleared": "已清除",
"credSource": { "db": "已配置·DB", "env": "已配置·环境变量", "none": "未配置" },
"provider": { "label": "服务", "openai": "OpenAI", "perplexity": "Perplexity", "gemini": "Gemini", "deepseek": "DeepSeek", "googleCse": "Google CSE", "dataforseo": "DataForSEO", "cloudflare": "Cloudflare" }
```

`messages/en.json` 的 `settings` 增对应英文：

```json
"apiKeysTitle": "API Key entry (BYOK)",
"apiKeysHint": "Keys entered here are stored encrypted and take priority over environment variables; clearing falls back to env.",
"credKeyCol": "Credential key",
"credActionCol": "Actions",
"credKeyPlaceholder": "Paste key…",
"testConn": "Test",
"saveKey": "Save",
"clearKey": "Clear",
"testOk": "Connected ✓",
"testFail": "Failed: ",
"keySaved": "Saved ✓",
"keyCleared": "Cleared",
"credSource": { "db": "Set · DB", "env": "Set · env", "none": "Not set" },
"provider": { "label": "Service", "openai": "OpenAI", "perplexity": "Perplexity", "gemini": "Gemini", "deepseek": "DeepSeek", "googleCse": "Google CSE", "dataforseo": "DataForSEO", "cloudflare": "Cloudflare" }
```

- [ ] **Step 4: 构建 + 全量测试**

Run: `pnpm build`
Expected: 编译通过（类型、i18n 键齐全）。
Run: `pnpm test`
Expected: 全绿。
Run: `pnpm lint`
Expected: 无新增告警。

- [ ] **Step 5: 提交**

```bash
git add "app/[locale]/settings" messages/zh.json messages/en.json
git commit -m "feat(settings): API Key 录入 UI（测连接/保存/清除，DB>env）"
```

---

## Self-Review

**1. Spec coverage:**
- 加密模块（spec §组件1）→ Task 1。
- `provider_credentials` 表（§2）→ Task 2。
- 仓库读写 + 解析层（§3）→ Task 2 + Task 3。
- 探针工厂改造 + 采集注入（§4）→ Task 4。
- 测连接（§5）→ Task 5 + Task 6（路由）。
- 保存/删除路由（§6）→ Task 6。
- 矩阵认 DB + 录入 UI（§7）→ Task 7 + Task 8。
- 验收「只录 OpenAI key → 出 AI 可见度真数据」由 Task 4（采集读 DB 凭据）+ Task 8（UI 录入）合成；DB 里是密文由 Task 2 测试锁定。

**2. Placeholder scan:** 无 TBD/TODO；每步给完整代码与命令。UI 组件是唯一无独立单测处——其逻辑已下沉到 `credential-rows.ts`/`test-connection`/路由（均单测），client 仅渲染，与既有无测的 `SettingsClient` 一致，由 `pnpm build` 兜类型/i18n。

**3. Type consistency:** `resolveCredentials(keys)` 签名 Task 3 定义、Task 4 消费一致；`buildProbeProviders(creds)` Task 4 定义、collect-evidence 消费一致；`CredentialRow.source` 枚举 `'db'|'env'|'none'` Task 7 定义、Task 8 `t(\`credSource.${row.source}\`)` 消费一致；`testCredentialConnection` 返回 `{ok,error?}` Task 5 定义、Task 6 路由透传、Task 8 client 读 `data.ok/data.error` 一致；错误码全 snake_case。

**4. 依赖顺序:** 1→2→3→4/5→6→7→8，无前向引用。Task 4 改 collect-evidence 默认 deps，单测注入 fake 不受影响（Step 6 回归验证）。
