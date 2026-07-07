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
