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
