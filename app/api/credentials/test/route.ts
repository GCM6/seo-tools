import { NextResponse } from 'next/server'
import { testCredentialConnection } from '@/lib/credentials/test-connection'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { credentialKey?: string; value?: string }
  if (!body.credentialKey) return NextResponse.json({ error: 'credential_key_required' }, { status: 422 })
  if (!body.value?.trim()) return NextResponse.json({ error: 'value_required' }, { status: 422 })
  return NextResponse.json(await testCredentialConnection(body.credentialKey, body.value.trim()))
}
