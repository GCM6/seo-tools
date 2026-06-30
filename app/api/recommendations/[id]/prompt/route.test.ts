import { describe, it, expect } from 'vitest'
import { assertCanGeneratePrompt } from '@/lib/repositories/validators'
// 端点级集成测试在无 DB 环境下从 validators 层验证契约：
describe('POST /recommendations/:id/prompt contract', () => {
  it('rejects when recommendation not accepted/edited', () => {
    expect(() => assertCanGeneratePrompt('draft')).toThrow()
  })
})
