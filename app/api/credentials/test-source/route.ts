import { NextResponse } from 'next/server'
import { resolveCredential } from '@/lib/credentials/store'

type Result = { ok: boolean; error?: string; detail?: string }

// 按数据源维度校验一组凭据是否有效。
// CSE：用 API Key + CX 发起一次空搜索验证凭据有效。
// DataForSEO：用 login + password 请求账户状态。
// AI Probe：对已配置的 key 逐个调 test endpoint。

async function testCse(): Promise<Result> {
  const apiKey = await resolveCredential('GOOGLE_CSE_API_KEY')
  const cx = await resolveCredential('GOOGLE_CSE_CX')
  if (!apiKey || !cx) {
    const missing: string[] = []
    if (!apiKey) missing.push('API Key')
    if (!cx) missing.push('CX')
    return { ok: false, error: `缺少: ${missing.join(', ')}` }
  }
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=test&num=1`
    const res = await fetch(url)
    if (res.ok) return { ok: true, detail: 'CSE API 连接成功' }
    if (res.status === 403) return { ok: false, error: 'API Key 无权访问 Custom Search API（403）' }
    if (res.status === 400) return { ok: false, error: 'CX 无效或 API Key 格式错误（400）' }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: '网络连接失败' }
  }
}

async function testDataforseo(): Promise<Result> {
  const login = await resolveCredential('DATAFORSEO_LOGIN')
  const password = await resolveCredential('DATAFORSEO_PASSWORD')
  if (!login || !password) {
    return { ok: false, error: `缺少: ${!login ? 'Login' : ''}${!login && !password ? ', ' : ''}${!password ? 'Password' : ''}` }
  }
  try {
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { authorization: `Basic ${btoa(`${login}:${password}`)}` },
    })
    if (res.ok) return { ok: true, detail: 'DataForSEO 连接成功' }
    if (res.status === 401 || res.status === 403) return { ok: false, error: '认证失败（Login 或 Password 不正确）' }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: '网络连接失败' }
  }
}

async function testAiProbe(): Promise<Result> {
  const keys = ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'] as const
  const labels = ['OpenAI', 'Perplexity', 'Gemini', 'DeepSeek']
  const results: string[] = []
  let anyOk = false

  for (let i = 0; i < keys.length; i++) {
    const val = await resolveCredential(keys[i])
    if (!val) continue
    try {
      let res: Response
      switch (keys[i]) {
        case 'OPENAI_API_KEY':
          res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${val}` } })
          break
        case 'DEEPSEEK_API_KEY':
          res = await fetch('https://api.deepseek.com/models', { headers: { authorization: `Bearer ${val}` } })
          break
        case 'GEMINI_API_KEY':
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(val)}`)
          break
        case 'PERPLEXITY_API_KEY':
          res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { authorization: `Bearer ${val}`, 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'sonar', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          })
          break
        default:
          continue
      }
      if (res.ok) {
        results.push(`${labels[i]} ✓`)
        anyOk = true
      } else {
        results.push(`${labels[i]} ✗ (${res.status})`)
      }
    } catch {
      results.push(`${labels[i]} ✗ (网络错误)`)
    }
  }

  if (results.length === 0) return { ok: false, error: '没有配置任何 AI API Key' }
  return { ok: anyOk, detail: results.join('  ') }
}

async function testRender(): Promise<Result> {
  const cfId = await resolveCredential('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = await resolveCredential('CLOUDFLARE_API_TOKEN')
  const blToken = await resolveCredential('BROWSERLESS_API_TOKEN')

  if (cfId && cfToken) {
    return { ok: true, detail: 'Cloudflare 凭据已配置' }
  }
  if (blToken) {
    return { ok: true, detail: 'Browserless 凭据已配置' }
  }
  return { ok: false, error: '需要配置 Cloudflare 或 Browserless 任一渲染器' }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sourceKey?: string }
  if (!body.sourceKey) {
    return NextResponse.json({ ok: false, error: 'source_key_required' }, { status: 422 })
  }
  let result: Result
  switch (body.sourceKey) {
    case 'googleCse': result = await testCse(); break
    case 'dataforseo': result = await testDataforseo(); break
    case 'aiProbe': result = await testAiProbe(); break
    case 'render': result = await testRender(); break
    default:
      result = { ok: false, error: 'unknown_source' }
  }
  return NextResponse.json(result)
}
