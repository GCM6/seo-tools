import { describe, it, expect } from 'vitest'
import { buildCredentialRows } from './credential-rows'

describe('buildCredentialRows 来源标注（不含值）', () => {
  it('DB 键标 db，env 键标 env，其余 none', () => {
    const rows = buildCredentialRows({ PERPLEXITY_API_KEY: 'x' }, ['OPENAI_API_KEY'])
    const by = (k: string) => rows.find((r) => r.key === k)!
    expect(by('OPENAI_API_KEY').source).toBe('db') // DB 优先
    expect(by('PERPLEXITY_API_KEY').source).toBe('env')
    expect(by('GEMINI_API_KEY').source).toBe('none')
  })
  it('行不携带任何明文值字段', () => {
    const rows = buildCredentialRows({ OPENAI_API_KEY: 'sk-secret' }, [])
    expect(JSON.stringify(rows)).not.toContain('sk-secret')
  })
})
