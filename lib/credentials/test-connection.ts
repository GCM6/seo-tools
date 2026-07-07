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
