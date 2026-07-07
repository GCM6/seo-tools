import { migrateGscRefreshTokensToEncrypted } from '@/lib/repositories'

// 一次性存量迁移：将 project_settings.gsc_refresh_token 的明文行加密。幂等，可重复跑。
const { migrated } = await migrateGscRefreshTokensToEncrypted()
console.log(`gsc refresh_token migrated to ciphertext: ${migrated}`)
process.exit(0)
