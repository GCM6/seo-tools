# SP-G1f · GSC refresh_token 加密存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans。步骤用 `- [ ]`。

**Goal:** `project_settings.gsc_refresh_token` 改 AES-256-GCM 密文存储（复用 SP-G1c 加密模块），含幂等存量迁移，GSC 采集仍正常。补齐 SP-G1f 另一半（消除明文凭据）。

**Architecture:** 写路径 `setGscConnection` 存前加密；读路径 collect-evidence 用 `readGscToken` 解密（`v1.` 前缀→解密，其余→legacy 明文透传，保证存量与既有测试兼容）；幂等迁移函数把非 `v1.` 存量行加密回写。

**Tech Stack:** `lib/crypto/secrets.ts`（SP-G1c 已落地）；libSQL+Drizzle；vitest；pnpm。

## Global Constraints

- 复用 `encryptSecret`/`decryptSecret`；主密钥 `CREDENTIALS_ENCRYPTION_KEY`（base64 32 字节）。
- 手写校验 + snake_case；DB 读写集中 repositories；测试同层。
- 读路径解密失败/legacy 明文不得使采集崩溃（降级：透传或 null 跳过）。

---

### Task 1: GSC token 加密辅助 `lib/gsc/token-crypto.ts`

**Files:** Create `lib/gsc/token-crypto.ts` + `lib/gsc/token-crypto.test.ts`

**Interfaces:**
- Produces: `encryptGscToken(plaintext: string): string`（= encryptSecret）；`readGscToken(stored: string | null | undefined): string | null`（`v1.`→解密；非 `v1.`→原样返回 legacy 明文；空/解密失败→null 或原值见下）。

- [ ] **Step 1: 失败测试** — `lib/gsc/token-crypto.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { encryptGscToken, readGscToken } from './token-crypto'

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64') })

describe('GSC token 加密辅助', () => {
  it('encrypt→read 往返还原', () => {
    expect(readGscToken(encryptGscToken('refresh_tok'))).toBe('refresh_tok')
  })
  it('密文带 v1. 前缀且不含明文', () => {
    const c = encryptGscToken('refresh_tok')
    expect(c.startsWith('v1.')).toBe(true)
    expect(c).not.toContain('refresh_tok')
  })
  it('legacy 明文（非 v1.）原样透传', () => {
    expect(readGscToken('plain-legacy')).toBe('plain-legacy')
  })
  it('null/空 → null', () => {
    expect(readGscToken(null)).toBeNull()
    expect(readGscToken('')).toBeNull()
  })
  it('v1. 但损坏 → null（不抛）', () => {
    expect(readGscToken('v1.bad.bad.bad')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑确认失败** — `pnpm vitest run lib/gsc/token-crypto.test.ts`（模块不存在）

- [ ] **Step 3: 实现** — `lib/gsc/token-crypto.ts`

```ts
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets'

// GSC refresh_token 存储加密（SP-G1f）。密文自带 v1. 前缀；存量明文行迁移前按 legacy 透传。
export function encryptGscToken(plaintext: string): string {
  return encryptSecret(plaintext)
}

export function readGscToken(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (stored.startsWith('v1.')) {
    try {
      return decryptSecret(stored)
    } catch {
      return null // 密钥轮换/损坏：跳过 GSC 采集，不崩链。
    }
  }
  return stored // legacy 明文（迁移前），透传兼容。
}
```

- [ ] **Step 4: 跑确认通过 + 提交**

```bash
pnpm vitest run lib/gsc/token-crypto.test.ts
git add lib/gsc/token-crypto.ts lib/gsc/token-crypto.test.ts
git commit -m "feat(gsc): refresh_token 加密辅助（复用 G1c 加密模块）"
```

---

### Task 2: 写加密 + 读解密 + 存量迁移

**Files:**
- Modify: `lib/repositories/index.ts`（`setGscConnection` 加密写 + 新增 `migrateGscRefreshTokensToEncrypted`）
- Modify: `lib/inngest/collect-evidence.ts`（读路径 `readGscToken`）
- Create: `db/migrate-gsc-tokens.ts`（迁移脚本）+ `package.json` script
- Test: `lib/repositories/gsc-token.repo.test.ts`

**Interfaces:**
- Consumes: `encryptGscToken`/`readGscToken`（Task 1）。
- Produces: `migrateGscRefreshTokensToEncrypted(): Promise<{ migrated: number }>`（幂等，仅转非 `v1.` 行）。

- [ ] **Step 1: 失败测试** — `lib/repositories/gsc-token.repo.test.ts`

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-gsctoken.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, projectSettings } = await import('@/db/schema')
const { readGscToken } = await import('@/lib/gsc/token-crypto')

async function seedProject() {
  await db.delete(projectSettings)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(projectSettings).values({ projectId: 'proj_1' })
}

describe('GSC refresh_token 加密存储', () => {
  beforeEach(seedProject)

  it('setGscConnection 存密文（v1. 前缀、≠明文），读回可解密', async () => {
    await repo.setGscConnection('proj_1', { gscConnected: true, gscRefreshToken: 'refresh_tok' })
    const s = await repo.getProjectSettings('proj_1')
    expect(s!.gscRefreshToken!.startsWith('v1.')).toBe(true)
    expect(s!.gscRefreshToken).not.toContain('refresh_tok')
    expect(readGscToken(s!.gscRefreshToken)).toBe('refresh_tok')
  })

  it('gscRefreshToken 省略时不动该列（如仅更新 siteUrl 场景）', async () => {
    await repo.setGscConnection('proj_1', { gscConnected: true, gscRefreshToken: 'tok1' })
    await repo.setGscConnection('proj_1', { gscConnected: true }) // 不带 token
    const s = await repo.getProjectSettings('proj_1')
    expect(readGscToken(s!.gscRefreshToken)).toBe('tok1')
  })

  it('迁移存量明文行 → 密文，且幂等', async () => {
    await db.update(projectSettings).set({ gscRefreshToken: 'legacy-plain' }).where(eq(projectSettings.projectId, 'proj_1'))
    const r1 = await repo.migrateGscRefreshTokensToEncrypted()
    expect(r1.migrated).toBe(1)
    const s = await repo.getProjectSettings('proj_1')
    expect(s!.gscRefreshToken!.startsWith('v1.')).toBe(true)
    expect(readGscToken(s!.gscRefreshToken)).toBe('legacy-plain')
    const r2 = await repo.migrateGscRefreshTokensToEncrypted()
    expect(r2.migrated).toBe(0) // 已 v1. 不重复加密
  })
})

// eq 从 drizzle 引入（测试内联用）
import { eq } from 'drizzle-orm'
```

- [ ] **Step 2: 跑确认失败** — `pnpm vitest run lib/repositories/gsc-token.repo.test.ts`（setGscConnection 未加密 / migrate 未定义）

- [ ] **Step 3a: setGscConnection 加密写** — `lib/repositories/index.ts`

顶部 import 增：`import { encryptGscToken, readGscToken } from '@/lib/gsc/token-crypto'`（readGscToken 供迁移判断复用 encrypt；实际迁移用 startsWith 判断）。改 `setGscConnection`：

```ts
// GSC OAuth 令牌存取（Phase B；SP-G1f：refresh_token 密文存储）。
export const setGscConnection = (
  projectId: string,
  data: { gscConnected: boolean; gscRefreshToken?: string | null; gscSiteUrl?: string | null },
) => {
  // token 提供时加密；省略则不动该列（部分更新语义不变）。null 显式清空保持 null。
  const patch: typeof data = { ...data }
  if (typeof data.gscRefreshToken === 'string') patch.gscRefreshToken = encryptGscToken(data.gscRefreshToken)
  return db.update(projectSettings).set(patch).where(eq(projectSettings.projectId, projectId))
}
```

- [ ] **Step 3b: 迁移函数** — 在 `setGscSiteUrl` 附近追加：

```ts
// 存量明文 refresh_token 迁移到密文（幂等：仅转非 v1. 前缀行）。部署后一次性跑（db:migrate-gsc）。
export const migrateGscRefreshTokensToEncrypted = async (): Promise<{ migrated: number }> => {
  const rows = await db
    .select({ projectId: projectSettings.projectId, token: projectSettings.gscRefreshToken })
    .from(projectSettings)
    .where(isNotNull(projectSettings.gscRefreshToken))
  let migrated = 0
  for (const r of rows) {
    if (r.token && !r.token.startsWith('v1.')) {
      await db.update(projectSettings).set({ gscRefreshToken: encryptGscToken(r.token) }).where(eq(projectSettings.projectId, r.projectId))
      migrated++
    }
  }
  return { migrated }
}
```

（`isNotNull` 已在 index.ts 顶部 import。）

- [ ] **Step 3c: 读路径解密** — `lib/inngest/collect-evidence.ts`

顶部 import 增 `import { readGscToken } from '@/lib/gsc/token-crypto'`。把 GSC 采集 guard（现 `lib/inngest/collect-evidence.ts:421-423`）改为先解密：

```ts
  const refreshToken = readGscToken(settings?.gscRefreshToken)
  if (settings?.gscConnected && refreshToken && settings.gscSiteUrl) {
    const siteUrl = settings.gscSiteUrl
    try {
```
（删除原 `const refreshToken = settings.gscRefreshToken` 行；下方 `deps.refreshGscAccessToken(refreshToken)` 不变。）

- [ ] **Step 4: 跑确认通过**

Run: `pnpm vitest run lib/repositories/gsc-token.repo.test.ts lib/inngest/collect-evidence.test.ts`
Expected: PASS（新集成 + collect-evidence 回归；测试用明文 token 经 readGscToken 透传，断言 `refreshGscAccessToken('refresh_tok')` 仍成立）。

- [ ] **Step 5: 迁移脚本 + package.json**

Create `db/migrate-gsc-tokens.ts`：

```ts
import { migrateGscRefreshTokensToEncrypted } from '@/lib/repositories'

// 一次性存量迁移：将 project_settings.gsc_refresh_token 的明文行加密。幂等，可重复跑。
const { migrated } = await migrateGscRefreshTokensToEncrypted()
console.log(`gsc refresh_token migrated to ciphertext: ${migrated}`)
process.exit(0)
```

`package.json` scripts 增：`"db:migrate-gsc": "tsx db/migrate-gsc-tokens.ts"`。

- [ ] **Step 6: 全量 + 提交**

Run: `pnpm test` → 全绿；`pnpm lint` → 无新增 error。

```bash
git add lib/repositories/index.ts lib/inngest/collect-evidence.ts lib/repositories/gsc-token.repo.test.ts db/migrate-gsc-tokens.ts package.json
git commit -m "feat(gsc): refresh_token 密文存储 + 存量迁移（SP-G1f 收口）"
```

---

## Self-Review

- Spec：SP-G1f「gsc_refresh_token 改加密存储 + 存量迁移」→ Task 1（helper）+ Task 2（写/读/迁移）。验收「DB 为密文且采集正常」→ Task 2 Step 1 集成测试 + collect-evidence 回归。
- 兼容：读路径对 legacy 明文透传，既有 collect-evidence 测试（明文 `refresh_tok`）不回归。
- 类型：`readGscToken` 返回 `string | null`，collect-evidence guard 用其真值；`setGscConnection` 部分更新语义（省略 token 不动列）保持。
- 安全：新写恒密文；迁移幂等；解密失败降级跳过 GSC，不崩采集。
